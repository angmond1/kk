# -*- coding: utf-8 -*-
"""보안서약서(hwp/hwpx)의 서명 날짜(`2026 년    9 월   18 일` 꼴)를 오늘(또는 지정일)로 바꾼다 — 한글(아래아한글) COM, Windows 전용.

  python update_pledge_date.py "<보안서약서.hwp>"                     # 오늘 날짜로 바꾸고 저장
  python update_pledge_date.py "<보안서약서.hwp>" --date 2026-10-20    # 지정일
  python update_pledge_date.py "<보안서약서.hwp>" --pdf "<확인용.pdf>"  # 바꾼 뒤 PDF 로도 내보내기(눈으로 확인용)
  python update_pledge_date.py "<보안서약서.hwp>" --dry                # 찾기만(바꾸지 않음)

- 바꾸기 전 원본을 같은 폴더 `_history/<이름>_YYMMDD_HHMM.<확장자>` 로 복사한다.
- 문서 속 `YYYY 년 M 월 D 일` 중 **마지막 것**(서명란 날짜)만 바꾼다. 생년월일(`1983.10.03.` 꼴)은 형식이 달라 건드리지 않는다.
- 숫자 앞 공백 폭을 원래대로 맞춰 정렬이 흐트러지지 않게 한다.
- 새 한글 인스턴스(DispatchEx)를 띄우고 그것만 닫는다 — 사용자가 열어 둔 한글 문서는 건드리지 않는다.
결과 한 줄: `OK 2026 년    9 월   18 일 -> 2026 년   10 월   20 일 | backup=… | pdf=…` / 실패는 `ERR …` (종료 코드 1).
"""
import argparse, datetime, os, re, shutil, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

PAT = re.compile(r"(\d{4})(\s*년)(\s*)(\d{1,2})(\s*월)(\s*)(\d{1,2})(\s*일)")


def new_text(m, d):
    y, g2, s3, mo, g5, s6, da, g8 = m.groups()
    def fit(sp, old, new):  # 공백+숫자 전체 폭 유지(최소 공백 1칸)
        w = len(sp) + len(old)
        return str(new).rjust(max(w, len(str(new)) + 1))
    return f"{d.year}{g2}{fit(s3, mo, d.month)}{g5}{fit(s6, da, d.day)}{g8}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--date")
    ap.add_argument("--pdf")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    src = os.path.abspath(a.path)
    if not os.path.isfile(src):
        print(f"ERR 파일 없음: {src}"); return 1
    d = datetime.date.fromisoformat(a.date) if a.date else datetime.date.today()
    ext = os.path.splitext(src)[1].lower()
    fmt = {".hwp": "HWP", ".hwpx": "HWPX"}.get(ext)
    if not fmt:
        print("ERR hwp/hwpx 만 지원"); return 1
    try:
        import win32com.client as w
    except ImportError:
        print("ERR pywin32 필요 — pip install pywin32 (한글이 설치된 Windows)"); return 1

    h = None
    try:
        h = w.DispatchEx("HWPFrame.HwpObject")
        h.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        h.XHwpWindows.Item(0).Visible = False
        h.Open(src, fmt, "forceopen:true")
        text = h.GetTextFile("UNICODE", "")
        found = list(PAT.finditer(text))
        if not found:
            print("ERR 'YYYY 년 M 월 D 일' 꼴 날짜를 못 찾음 — 서약서 양식을 확인"); return 1
        m = found[-1]
        old, new = m.group(0), new_text(m, d)
        if a.dry or old == new:
            print(f"OK {'(dry) ' if a.dry else '(같음) '}{old} -> {new}"); return 0
        hist = os.path.join(os.path.dirname(src), "_history")
        os.makedirs(hist, exist_ok=True)
        stem = os.path.splitext(os.path.basename(src))[0]
        bak = os.path.join(hist, f"{stem}_{datetime.datetime.now():%y%m%d_%H%M}{ext}")
        shutil.copy2(src, bak)
        p = h.HParameterSet.HFindReplace
        h.HAction.GetDefault("AllReplace", p.HSet)
        p.FindString, p.ReplaceString, p.IgnoreMessage, p.Direction = old, new, 1, 2
        h.HAction.Execute("AllReplace", p.HSet)
        after = h.GetTextFile("UNICODE", "")
        if new not in after:
            print("ERR 바꾸기 실패(문서 변경 없음) — 원본 그대로"); return 1
        h.SaveAs(src, fmt, "")          # Save() 는 이 환경에서 인자 오류 — SaveAs 로 덮어쓴다
        pdf = ""
        if a.pdf:
            h.SaveAs(os.path.abspath(a.pdf), "PDF", "")
            pdf = os.path.abspath(a.pdf)
        print(f"OK {old} -> {new} | backup={bak}" + (f" | pdf={pdf}" if pdf else ""))
        return 0
    except Exception as e:
        print(f"ERR {e}"); return 1
    finally:
        if h is not None:
            try:
                h.Clear(1); h.Quit()
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
