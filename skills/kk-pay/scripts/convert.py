# -*- coding: utf-8 -*-
"""kk-pay 코어 (3) — 증빙 파일 형식 변환 (Windows / macOS / Linux).

지급신청 가능 형식은 jpg·pdf 뿐. 그 외는 자동 변환 후 사용자에게 알림.
  - 이미지 png/jpeg/bmp/tiff/webp/gif → jpg  (Pillow — 모든 OS; 여러 장짜리 tif 는 pdf 로)
  - 문서 docx/doc/xlsx/xls → pdf   (① Windows: MS Office COM  ② 어느 OS 든: LibreOffice `soffice --headless`)
  - 문서 hwp/hwpx → pdf            (Windows + 아래아한글 COM 만. 없으면 수동 — HOP(무료 오픈소스, github.com/golbin/hop)으로 열어 PDF 내보내기)
엔진이 없거나 실패하면 → {'ok': False, 'manual': ...} 반환 (멈추지 않고 "직접 pdf 저장 후 재전달" 안내).

규칙(2026-09-27): 원본은 손대지 않고 새 파일을 만든다(원본 정리는 사용자 confirm 후 `--trash`) / 같은 이름의 결과가 이미 있으면
덮어쓰지 않고 '_변환' 을 붙인다 / 휴대폰 사진 회전(EXIF) 반영 / 투명 png 는 흰 바탕 / .jpeg 는 다시 압축하지 않고 .jpg 로 복사 /
Office·한글은 **새 프로세스**로 띄워 쓰고 그것만 닫는다(사용자가 열어 둔 Word·Excel·한글을 건드리지 않음).

명령줄:
  python convert.py --check              → {"hwp": bool, "office": bool, "libreoffice": bool, "pillow": bool, "pywin32": bool, "os": ...}
  python convert.py <파일>               → {"ok": true, "path": 새파일, "converted": true, "from": "png", "to": "jpg"} 또는 {"ok": false, "manual": 안내}
  python convert.py --trash <파일...>    → 휴지통으로(복구 가능; 안 되면 같은 폴더 _trash/). 사용자 confirm 후에만.
종료 코드: 0 정상 / 1 실패(ok:false 포함).
"""
from __future__ import annotations
import os, sys, subprocess, shutil, tempfile
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
# Windows 한국어(cp949) 콘솔·파이프에서도 한글·기호가 깨지거나 멈추지 않게 출력은 UTF-8 로 (모듈로 불러 써도 적용)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"

OK_EXT = ("jpg", "pdf")
IMG_EXT = ("png", "jpeg", "bmp", "tif", "tiff", "webp", "gif")
HWP_EXT = ("hwp", "hwpx")
OFFICE_EXT = ("docx", "doc", "xlsx", "xls")


def _ext(path: str) -> str:
    return path.lower().rsplit(".", 1)[-1] if "." in os.path.basename(path) else ""


def _unique(path: str, tag: str = "_변환") -> str:
    """path 가 이미 있으면 <이름>_변환.<확장자>, _변환2 … 로 — 절대 덮어쓰지 않는다."""
    if not os.path.exists(path):
        return path
    stem, ext = os.path.splitext(path)
    k = 1
    while True:
        cand = f"{stem}{tag}{'' if k == 1 else k}{ext}"
        if not os.path.exists(cand):
            return cand
        k += 1


# ---------- 휴지통 (OS 별, 영구삭제 X) ----------
def _recycle(path: str) -> str:
    """원본을 휴지통으로. 어느 방법도 안 되면 같은 폴더의 _trash/ 로 이동(복구 가능). 반환 '휴지통'|'_trash'.
    경로는 인자·환경변수로만 넘긴다(파일명이 명령으로 실행되지 않게)."""
    path = os.path.abspath(path)
    try:
        if IS_WIN:
            ps = ("Add-Type -AssemblyName Microsoft.VisualBasic; "
                  "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile("
                  "$env:KK_TRASH_PATH,'OnlyErrorDialogs','SendToRecycleBin')")
            r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                               check=False, capture_output=True, env=dict(os.environ, KK_TRASH_PATH=path), timeout=60)
            if r.returncode == 0 and not os.path.exists(path):
                return "휴지통"
        elif IS_MAC:
            r = subprocess.run(["osascript", "-e", "on run argv",
                                "-e", 'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)',
                                "-e", "end run", path], check=False, capture_output=True, timeout=60)
            if r.returncode == 0 and not os.path.exists(path):
                return "휴지통"
        elif shutil.which("gio"):
            r = subprocess.run(["gio", "trash", "--", path], check=False, capture_output=True, timeout=60)
            if r.returncode == 0 and not os.path.exists(path):
                return "휴지통"
    except Exception:
        pass
    trash = os.path.join(os.path.dirname(path), "_trash")
    os.makedirs(trash, exist_ok=True)
    shutil.move(path, _unique(os.path.join(trash, os.path.basename(path)), " (복사)"))
    return "_trash"


# ---------- 엔진 탐지 ----------
def _soffice() -> str | None:
    """LibreOffice 실행 파일 (모든 OS)."""
    p = shutil.which("soffice") or shutil.which("libreoffice")
    if p:
        return p
    for c in (r"C:\Program Files\LibreOffice\program\soffice.exe",
              r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
              "/Applications/LibreOffice.app/Contents/MacOS/soffice",
              "/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice", "/snap/bin/libreoffice"):
        if os.path.exists(c):
            return c
    return None


def _com_available(progid: str) -> bool:
    if not IS_WIN:
        return False
    try:
        import winreg
        winreg.CloseKey(winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, progid))
        return True
    except Exception:
        return False


def _has(mod: str) -> bool:
    try:
        __import__(mod)
        return True
    except Exception:
        return False


def check_engines() -> dict:
    return {
        "os": sys.platform,
        "hwp": _com_available("HWPFrame.HwpObject"),          # 아래아한글 (Windows)
        "office": _com_available("Word.Application"),         # MS Office (Windows)
        "libreoffice": _soffice() is not None,                # LibreOffice (모든 OS)
        "pillow": _has("PIL"), "pywin32": IS_WIN and _has("win32com"),
    }


# ---------- 변환 ----------
def _flatten(im):
    """투명 배경은 흰 바탕에 얹고 RGB 로."""
    from PIL import Image
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel("A"))
        return bg
    return im.convert("RGB")


def to_jpg(path: str) -> str:
    """이미지 → jpg (여러 장짜리 tif 는 pdf 한 파일로). 원본은 그대로. 반환 새 파일 경로."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        raise RuntimeError("Pillow 가 없습니다: python -m pip install Pillow")
    if _ext(path) == "jpeg":                                    # 이미 jpg — 재압축 없이 확장자만 .jpg 로 복사
        out = _unique(os.path.splitext(path)[0] + ".jpg")
        shutil.copy2(path, out)
        return out
    with Image.open(path) as im:
        n = getattr(im, "n_frames", 1) or 1
        if n > 1:                                               # 여러 쪽 스캔 → pdf (pdf 도 업로드 가능 형식)
            frames = []
            for i in range(n):
                im.seek(i)
                frames.append(_flatten(im.copy()))
            out = _unique(os.path.splitext(path)[0] + ".pdf")
            frames[0].save(out, "PDF", resolution=200.0, save_all=True, append_images=frames[1:])
            return out
        frame = _flatten(ImageOps.exif_transpose(im))
        out = _unique(os.path.splitext(path)[0] + ".jpg")
        frame.save(out, "JPEG", quality=95)
        return out


def _soffice_to_pdf(path: str) -> str:
    exe = _soffice()
    if not exe:
        raise RuntimeError("LibreOffice(soffice) 없음")
    ap = os.path.abspath(path)
    with tempfile.TemporaryDirectory(prefix="kiki_conv_") as tmp:    # 임시 폴더에 만들고 겹치지 않는 이름으로 옮긴다
        subprocess.run([exe, "--headless", "--convert-to", "pdf", "--outdir", tmp, ap],
                       check=True, capture_output=True, timeout=180)
        made = os.path.join(tmp, os.path.splitext(os.path.basename(ap))[0] + ".pdf")
        if not os.path.exists(made):
            raise RuntimeError("LibreOffice 변환 결과 파일이 없음")
        out = _unique(os.path.splitext(ap)[0] + ".pdf")
        shutil.move(made, out)
    return out


def hwp_to_pdf(path: str) -> str:
    if not IS_WIN:
        raise RuntimeError("hwp→pdf 자동 변환은 Windows+아래아한글 전용입니다. "
                           "HOP(무료 오픈소스 한글 편집기, https://github.com/golbin/hop) 으로 열어 PDF 로 내보낸 뒤 다시 주세요.")
    try:
        import win32com.client as win32
    except ImportError:
        raise RuntimeError("pywin32 가 없습니다: python -m pip install pywin32")
    out = _unique(os.path.splitext(os.path.abspath(path))[0] + ".pdf")
    hwp = win32.DispatchEx("HWPFrame.HwpObject")               # 새 프로세스 — 사용자가 열어 둔 한글은 건드리지 않음
    try:
        # 보안 모듈 등록 — 파일 접근 보안 프롬프트 회피 (한글 자동화 표준)
        try:
            hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        except Exception:
            pass
        hwp.Open(os.path.abspath(path), "", "forceopen:true")
        hwp.SaveAs(out, "PDF")
    finally:
        try:
            hwp.Quit()
        except Exception:
            pass
    return out


def office_to_pdf(path: str) -> str:
    """MS Office COM(Windows, 새 프로세스) → 안 되면 LibreOffice(모든 OS)."""
    ext = _ext(path)
    if IS_WIN and _com_available("Word.Application"):
        try:
            import win32com.client as win32
        except ImportError:
            if not _soffice():
                raise RuntimeError("MS Office 자동화에 pywin32 가 필요합니다: python -m pip install pywin32")
            win32 = None
        if win32 is not None:
            try:
                ap = os.path.abspath(path)
                ao = _unique(os.path.splitext(ap)[0] + ".pdf")
                if ext in ("docx", "doc"):
                    app = win32.DispatchEx("Word.Application")       # 항상 새 인스턴스 (열려 있는 Word 는 무관)
                    try:
                        app.Visible = False
                        app.DisplayAlerts = 0
                        doc = app.Documents.Open(ap, ReadOnly=True)
                        doc.SaveAs2(ao, FileFormat=17)              # 17=PDF
                        doc.Close(False)
                    finally:
                        app.Quit()
                else:  # xlsx/xls
                    app = win32.DispatchEx("Excel.Application")
                    try:
                        app.Visible = False
                        app.DisplayAlerts = False
                        wb = app.Workbooks.Open(ap, ReadOnly=True)
                        wb.ExportAsFixedFormat(0, ao)               # 0=PDF
                        wb.Close(False)
                    finally:
                        app.Quit()
                return ao
            except Exception:
                if not _soffice():
                    raise
    return _soffice_to_pdf(path)


def ensure_uploadable(path: str) -> dict:
    """업로드 가능한 형식으로 보장. 반환:
       {ok:True, path, converted:bool, from?, to?, original?}  (원본은 그대로 남는다 — 정리는 confirm 후 --trash)
       {ok:False, manual:'...'} (변환 불가/실패 → 사용자 수동 안내)"""
    if not os.path.isfile(path):
        return {"ok": False, "manual": f"파일이 없습니다: {path}"}
    ext = _ext(path)
    if ext in OK_EXT:
        return {"ok": True, "path": path, "converted": False}
    try:
        if ext in IMG_EXT:
            out = to_jpg(path)
            return {"ok": True, "path": out, "converted": True, "from": ext, "to": _ext(out), "original": path}
        if ext in HWP_EXT:
            out = hwp_to_pdf(path)
            return {"ok": True, "path": out, "converted": True, "from": ext, "to": "pdf", "original": path}
        if ext in OFFICE_EXT:
            out = office_to_pdf(path)
            return {"ok": True, "path": out, "converted": True, "from": ext, "to": "pdf", "original": path}
        if ext in ("heic", "heif"):
            return {"ok": False, "manual": "HEIC(아이폰 사진)는 휴대폰에서 jpg 로 내보내거나 pillow-heif 를 설치(python -m pip install pillow-heif)한 뒤 다시 주세요."}
        return {"ok": False, "manual": f"'{ext or '(확장자 없음)'}'는 지원하지 않는 형식입니다. jpg 또는 pdf 로 직접 저장해 다시 주세요."}
    except Exception as e:
        hint = ""
        if ext in HWP_EXT and not _com_available("HWPFrame.HwpObject"):
            hint = " (아래아한글이 없으면 무료 HOP(https://github.com/golbin/hop)으로 열어 PDF 로 내보낸 파일을 주세요)"
        if ext in OFFICE_EXT and not _soffice():
            hint = (" (pywin32 가 없으면 python -m pip install pywin32" if IS_WIN and _com_available("Word.Application") and not _has("win32com")
                    else " (MS Office 가 없으면 무료 LibreOffice 를 설치하면 자동 변환됩니다: https://www.libreoffice.org/download/") + ")"
        return {"ok": False, "manual": f"자동 변환 실패({ext}→{'jpg' if ext in IMG_EXT else 'pdf'}): {e}. "
                f"해당 파일을 직접 jpg/pdf 로 저장한 뒤 다시 주세요.{hint}"}


def main(argv: list) -> int:
    import json
    if len(argv) >= 2 and argv[1] == "--check":
        print(json.dumps(check_engines(), ensure_ascii=False))
        return 0
    if len(argv) >= 3 and argv[1] == "--trash":
        bad = 0
        for p in argv[2:]:
            if not os.path.exists(p):
                print("ERR 파일이 없습니다:", p)
                bad = 1
                continue
            where = _recycle(p)
            print(where + ":", os.path.basename(p) + ("" if where == "휴지통" else "  (휴지통 이동이 안 돼 같은 폴더 _trash/ 로 옮김)"))
        return bad
    if len(argv) >= 2 and not argv[1].startswith("--"):
        r = ensure_uploadable(argv[1])
        print(json.dumps(r, ensure_ascii=False))
        return 0 if r.get("ok") else 1
    print("usage: python convert.py <file>   |   python convert.py --check   |   python convert.py --trash <file...>")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
