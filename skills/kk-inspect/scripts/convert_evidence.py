# -*- coding: utf-8 -*-
"""증빙 이미지 변환 — png/jpeg/bmp/tiff/webp/gif -> jpg (검수창 첨부용 jpg 통일).
pdf 는 그대로 둔다 (첨부 가능). 필요 시 --pdf2jpg 로 pdf 첫 페이지를 jpg 로.

사용:
  python convert_evidence.py <폴더 또는 파일 경로...>
  python convert_evidence.py --pdf2jpg <pdf경로>

의존: Pillow (이미지), PyMuPDF (pdf, --pdf2jpg 시) — 없으면 설치 명령을 알려주고 멈춘다.
규칙(2026-09-27): 원본은 손대지 않고 새 jpg 를 만든다 / 같은 이름의 jpg 가 이미 있으면 덮어쓰지 않고 '_conv' 를 붙인다 /
휴대폰 사진의 회전 정보(EXIF)를 반영한다 / 투명 배경(png)은 흰 바탕으로 깐다(검정으로 뭉개지지 않게) /
여러 장짜리 tif 는 장마다 jpg 로(_p2, _p3 …) / .jpeg 는 다시 압축하지 않고 .jpg 로 복사한다.
종료 코드: 0 전부 정상, 1 하나라도 실패(메시지 출력).
"""
import sys, os, shutil
# Windows 한국어(cp949) 콘솔·파이프에서도 한글·기호가 깨지거나 멈추지 않게 출력은 UTF-8 로 (모듈로 불러 써도 적용)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

IMG_EXT = ('.png', '.jpeg', '.bmp', '.tif', '.tiff', '.webp', '.gif')
SKIP_HINT = {'.heic': 'HEIC(아이폰)는 pillow-heif 가 있어야 합니다: python -m pip install pillow-heif — 또는 휴대폰에서 jpg 로 내보내 주세요',
             '.heif': 'HEIF 는 pillow-heif 가 있어야 합니다: python -m pip install pillow-heif'}


def out_path(path, suffix=''):
    """<이름>{suffix}.jpg — 이미 있으면 _conv, _conv2 … 를 붙여 절대 덮어쓰지 않는다."""
    base = os.path.splitext(path)[0] + suffix
    out = base + '.jpg'
    k = 1
    while os.path.exists(out):
        out = base + '_conv' + ('' if k == 1 else str(k)) + '.jpg'
        k += 1
    return out


def _flatten(im):
    """투명 배경은 흰 바탕에 얹고 RGB 로."""
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        im = im.convert('RGBA')
        from PIL import Image
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel('A'))
        return bg
    return im.convert('RGB')


def img_to_jpg(path):
    """이미지 1개 → jpg 경로 목록(여러 장 tif 면 여러 개)."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        raise RuntimeError('Pillow 가 없습니다: python -m pip install Pillow')
    ext = os.path.splitext(path)[1].lower()
    if ext == '.jpeg':                              # 이미 jpg — 다시 압축하지 않고 확장자만 .jpg 로 복사
        out = out_path(path)
        shutil.copy2(path, out)
        return [out]
    outs = []
    with Image.open(path) as im:
        n = getattr(im, 'n_frames', 1) or 1
        for i in range(n):
            if n > 1:
                im.seek(i)
            frame = ImageOps.exif_transpose(im) if i == 0 else im
            frame = _flatten(frame)
            out = out_path(path, '' if i == 0 else '_p' + str(i + 1))
            frame.save(out, 'JPEG', quality=95)
            outs.append(out)
    return outs


def pdf_to_jpg(path, dpi=200):
    """pdf 첫 페이지 → jpg 경로."""
    try:
        import fitz
    except ImportError:
        raise RuntimeError('PyMuPDF 가 없습니다: python -m pip install pymupdf')
    out = out_path(path)
    with fitz.open(path) as doc:
        if doc.page_count == 0:
            raise RuntimeError('빈 pdf')
        doc[0].get_pixmap(dpi=dpi).save(out)
        if doc.page_count > 1:
            print('  (pdf', doc.page_count, '쪽 중 첫 쪽만 jpg 로 만들었습니다 — pdf 원본을 그대로 첨부해도 됩니다)')
    return out


def collect(args):
    """폴더는 안의 파일만(하위 폴더 제외), 글자 그대로의 경로로(대괄호 등 특수문자 폴더명 OK)."""
    targets = []
    for a in args:
        if os.path.isdir(a):
            for name in sorted(os.listdir(a)):
                p = os.path.join(a, name)
                if os.path.isfile(p):
                    targets.append(p)
        else:
            targets.append(a)
    return targets


def main():
    pdf2jpg = '--pdf2jpg' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    targets = collect(args)
    if not targets:
        print('대상 없음. 사용: python convert_evidence.py <폴더/파일>  |  --pdf2jpg <pdf>')
        return 1
    bad = 0
    n_ok = n_skip = n_err = 0
    for t in targets:
        if not os.path.exists(t):
            print('ERR 파일이 없습니다:', t)
            bad = 1; n_err += 1
            continue
        ext = os.path.splitext(t)[1].lower()
        try:
            if ext in IMG_EXT:
                for o in img_to_jpg(t):
                    print('img->jpg :', o)
                n_ok += 1
            elif ext == '.pdf' and pdf2jpg:
                print('pdf->jpg :', pdf_to_jpg(t))
                n_ok += 1
            elif ext in SKIP_HINT:
                print('건너뜀  :', os.path.basename(t), '—', SKIP_HINT[ext])
                bad = 1; n_err += 1
            else:
                n_skip += 1
        except RuntimeError as e:                   # 패키지 없음 등 — 한 번 알리고 멈춘다
            print('ERR', e)
            return 1
        except Exception as e:
            print('ERR', os.path.basename(t), '->', e)
            bad = 1; n_err += 1
    print(f'[요약] 변환 {n_ok} / 그대로(pdf·jpg 등) {n_skip} / 실패 {n_err}')
    return bad


if __name__ == '__main__':
    sys.exit(main())
