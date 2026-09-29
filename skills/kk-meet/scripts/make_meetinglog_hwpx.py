# -*- coding: utf-8 -*-
"""kk-meet 코어 (2) — 회의비 회의록(별지1호) .hwpx 생성.
아래아한글 **불요**, Windows/macOS/Linux 공통, Python 표준 라이브러리만 사용(추가 pip 없음).

원리: hwpx = zip 안의 OWPML XML. 양식(assets/minutes_template.hwpx)의 Contents/section0.xml 에서
7x7 표의 '값 셀' 텍스트만 치환하고 라벨·서식·병합·테두리는 그대로 둔다 → 양식 100% 보존.
결과 파일은 아래아한글(2014+)·HOP(무료 오픈소스, github.com/golbin/hop)·한컴오피스 뷰어에서 열린다.
(구형: make_meetinglog.py = 한글 COM 으로 .hwp 생성 — Windows+한글 전용. 2026-09-23 부터 이 파일이 표준.)

사용:
  from make_meetinglog_hwpx import make, make_batch
  make(data, out_path)                          # 1건 → 저장 경로 반환
  make_batch([{'data': d, 'hwpx': path}, ...])  # 여러 건 → 경로 리스트
  CLI:
    python make_meetinglog_hwpx.py <data.json> <out.hwpx>
    python make_meetinglog_hwpx.py --batch <items.json>     # [{"data": {...}, "hwpx": "..."}, ...]
    python make_meetinglog_hwpx.py --demo <out.hwpx>        # 중립 예시값으로 생성(동작 확인용)
    python make_meetinglog_hwpx.py --dump <file.hwpx>       # 표 셀 인덱스·텍스트 덤프(디버그)

data 키(전부 문자열): account 계정번호 / pi_ins '김키키 (인)' / amount 'NN,NNN 원' / place 회의장소 /
  date '2026. 5. 21.' / purpose 회의목적(=회의록 제목) / time '11:00 ~ 13:00' / content 회의내용(여러 줄 '\\n') /
  ext_cnt '1명' / ext_mem '(○○대학교) 최키키' / int_cnt '3명' / int_mem '김키키, 이키키, 박키키'
"""
from __future__ import annotations
import html, io, json, os, re, sys, zipfile
# Windows 한국어(cp949) 콘솔·파이프에서도 한글·기호가 깨지거나 멈추지 않게 출력은 UTF-8 로 (모듈로 불러 써도 적용)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.normpath(os.path.join(HERE, "..", "assets", "minutes_template.hwpx"))
SECTION = "Contents/section0.xml"
PREVIEW = "Preview/PrvText.txt"

# 별지1호 7x7 표의 '값 셀' 인덱스(표 안 <hp:tc> 문서 순서 = 한글 TableRightCell 순회 순서와 동일).
# 라벨 셀(0,2,4,6,8,10,12,14,16,17,20)은 건드리지 않는다.
CELL_MAP = {
    1: "account", 3: "pi_ins", 5: "amount", 7: "place", 9: "date",
    11: "purpose", 13: "time", 15: "content",
    18: "ext_cnt", 19: "ext_mem", 21: "int_cnt", 22: "int_mem",
}
LABELS = {
    "account": "계정번호", "pi_ins": "연구책임자", "amount": "금액", "place": "회의 장소", "date": "회의 일자",
    "purpose": "회의 목적", "time": "회의시간", "content": "회의내용",
    "ext_cnt": "외부 인원", "ext_mem": "외부 명단", "int_cnt": "내부 인원", "int_mem": "내부 명단",
}
DEMO_DATA = {
    "account": "2E11111", "pi_ins": "김키키 (인)", "amount": "NN,NNN 원",
    "place": "한국과학기술연구원 ○○동 회의실", "date": "2026. 5. 21.",
    "purpose": "○○ 과제 연구 진행 논의", "time": "11:00 ~ 13:00",
    "content": "1. ○○ 실험 결과 검토\n- 조건별 결과 비교 및 원인 분석\n\n2. 향후 계획\n- 다음 단계 실험 설계 및 일정 협의",
    "ext_cnt": "1명", "ext_mem": "(○○대학교) 최키키", "int_cnt": "3명", "int_mem": "김키키, 이키키, 박키키",
}

_TBL = re.compile(r"<hp:tbl\b.*?</hp:tbl>", re.S)
_TC = re.compile(r"<hp:tc\b.*?</hp:tc>", re.S)
_P = re.compile(r"<hp:p\b.*?</hp:p>", re.S)
_RUN = re.compile(r"<hp:run\b[^>]*?(?:/>|>.*?</hp:run>)", re.S)
_RUN_OPEN = re.compile(r"<hp:run\b([^>]*?)/?>")
_LINESEG = re.compile(r"<hp:linesegarray>.*?</hp:linesegarray>", re.S)
_T = re.compile(r"<hp:t\b[^>]*>(.*?)</hp:t>", re.S)


_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _esc(s) -> str:
    return html.escape(_CTRL.sub(" ", str(s)), quote=False)   # & < > 만 (따옴표는 본문에 그대로); XML 에 못 들어가는 제어문자는 공백


def _para_with_text(proto: str, text: str, first: bool,
                    para_pr: str | None = None, char_pr: str | None = None) -> str:
    """단락 XML(proto)을 복제해 텍스트만 text 로. 첫 run 의 글자모양(charPrIDRef)은 유지, 나머지 run 은 제거.
    para_pr/char_pr 를 주면 문단모양·글자모양 ID 를 그 값으로 바꾼다(양식 힌트 문구의 빨간색·가운데정렬 등을 피할 때).
    ⚠️ 템플릿의 <hp:linesegarray>(줄 배치 캐시)는 반드시 제거 — 남겨두면 한글이 그 줄 폭에 맞춰 **자간을 눌러 한 줄에 우겨 넣고**
    줄바꿈을 하지 않는다(2026-09-24 실측). 없으면 한글이 열 때 다시 계산한다."""
    runs = list(_RUN.finditer(proto))
    if runs:
        attrs = _RUN_OPEN.match(runs[0].group(0)).group(1)
        head, tail = proto[: runs[0].start()], proto[runs[0].end():]
        tail = _RUN.sub("", tail)                      # 템플릿 샘플값이 남지 않도록
    else:                                              # run 이 없는 빈 단락: linesegarray 앞에 삽입
        m = _LINESEG.search(proto)
        cut = m.start() if m else proto.rfind("</hp:p>")
        head, tail, attrs = proto[:cut], proto[cut:], ""
    if char_pr is not None:
        attrs = re.sub(r'charPrIDRef="\d+"', f'charPrIDRef="{char_pr}"', attrs) if "charPrIDRef" in attrs \
            else attrs + f' charPrIDRef="{char_pr}"'
    run = f"<hp:run{attrs}><hp:t>{_esc(text)}</hp:t></hp:run>" if text != "" else f"<hp:run{attrs}/>"
    p = head + run + tail
    p = _LINESEG.sub("", p)                            # 줄 배치 캐시 제거 → 한글이 재계산(줄바꿈 정상)
    if para_pr is not None:
        p = re.sub(r'(<hp:p\b[^>]*\bparaPrIDRef=")\d+(")', rf"\g<1>{para_pr}\2", p, count=1)
    if not first:                                      # 첫 단락 외에는 id=0 (한글 저장본과 동일 관례)
        p = re.sub(r'(<hp:p\b[^>]*\bid=")[^"]*(")', r"\g<1>0\2", p, count=1)
    return p


def _fill_cell(cell: str, text, para_pr: str | None = None, char_pr: str | None = None) -> str:
    """셀의 단락 전체를 text(여러 줄은 '\\n')로 교체. 첫 단락을 원형으로 복제(줄 배치 캐시는 제거)."""
    paras = list(_P.finditer(cell))
    if not paras:
        return cell
    proto = paras[0].group(0)
    lines = str(text if text is not None else "").replace("\r\n", "\n").split("\n")
    new = "".join(_para_with_text(proto, ln, i == 0, para_pr, char_pr) for i, ln in enumerate(lines))
    return cell[: paras[0].start()] + new + cell[paras[-1].end():]


def fill_section(xml: str, data: dict) -> str:
    """section XML 의 첫 표(별지1호)에 data 를 채운다. 누락 키는 빈 칸."""
    m = _TBL.search(xml)
    if not m:
        raise ValueError("양식에서 표(<hp:tbl>)를 찾지 못했습니다")
    tbl = m.group(0)
    cells = list(_TC.finditer(tbl))
    if len(cells) < 23:
        raise ValueError(f"표 셀 수 {len(cells)} — 별지1호 양식(23셀)이 아닙니다")
    out, pos = [], 0
    for i, c in enumerate(cells):
        out.append(tbl[pos: c.start()])
        key = CELL_MAP.get(i)
        out.append(_fill_cell(c.group(0), data.get(key, "")) if key else c.group(0))
        pos = c.end()
    out.append(tbl[pos:])
    return xml[: m.start()] + "".join(out) + xml[m.end():]


def _preview(data: dict) -> str:
    return "\n".join(f"{LABELS[k]}: {data.get(k, '')}" for k in CELL_MAP.values()) + "\n"


def safe_name(s: str, n: int = 40) -> str:
    """과제이름 등을 파일명 조각으로 — 폴더 구분자·금지 문자·제어문자는 '_', 앞뒤 공백·점 제거, n 자로 자름."""
    s = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", str(s or "")).strip(" ._")
    return re.sub(r"\s+", " ", s)[:n].rstrip(" ._") or "회의록"


def make(data: dict, out_path: str, template: str | None = None) -> str:
    """양식 hwpx 에 data 를 채워 out_path(.hwpx) 로 저장. 저장 경로 반환."""
    template = template or TEMPLATE
    if not os.path.exists(template):
        raise FileNotFoundError(f"양식 없음: {template}")
    d = os.path.dirname(os.path.abspath(out_path))
    base = os.path.splitext(os.path.basename(out_path))[0]
    base = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", base).strip(" .") or "회의록"   # 과제명에 '/' ':' 가 있어도 파일명이 깨지지 않게
    os.makedirs(d, exist_ok=True)
    out_path = os.path.join(d, base + ".hwpx")
    k = 2
    while os.path.exists(out_path):                              # 같은 날 같은 과제 2건 — 덮어쓰지 않고 _2, _3
        out_path = os.path.join(d, f"{base}_{k}.hwpx"); k += 1
    with zipfile.ZipFile(template) as zin:
        names = zin.namelist()
        section = fill_section(zin.read(SECTION).decode("utf-8"), data)
        with zipfile.ZipFile(out_path, "w") as zout:
            if "mimetype" in names:                    # OWPML 관례: mimetype 은 맨 앞 + 무압축
                zout.writestr(zipfile.ZipInfo("mimetype"), zin.read("mimetype"), compress_type=zipfile.ZIP_STORED)
            for n in names:
                if n == "mimetype":
                    continue
                if n == SECTION:
                    buf = section.encode("utf-8")
                elif n == PREVIEW:
                    buf = _preview(data).encode("utf-8")
                else:
                    buf = zin.read(n)
                stored = zin.getinfo(n).compress_type == zipfile.ZIP_STORED
                zout.writestr(n, buf, compress_type=zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED)
    return out_path


def make_batch(items: list, template: str | None = None) -> list:
    """items: [{'data': dict, 'hwpx': 출력경로}, ...] ('hwp' 키도 허용 — 확장자는 .hwpx 로 저장)."""
    out = []
    for it in items:
        if not it.get("hwpx") and not it.get("hwp"):
            raise ValueError("항목에 'hwpx'(출력 경로)가 없습니다")
        out.append(make(it["data"], it.get("hwpx") or it.get("hwp"), template))
    return out


def dump(path: str) -> list:
    """디버그: 표 셀 인덱스·텍스트 목록."""
    with zipfile.ZipFile(path) as z:
        xml = z.read(SECTION).decode("utf-8")
    tbl = _TBL.search(xml).group(0)
    rows = []
    for i, c in enumerate(_TC.finditer(tbl)):
        texts = ["".join(_T.findall(p)) for p in _P.findall(c.group(0))]
        rows.append((i, CELL_MAP.get(i, ""), html.unescape("\n".join(texts))))
    return rows


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == "--demo":
        print(make(DEMO_DATA, a[1]))
    elif len(a) == 2 and a[0] == "--batch":
        items = json.load(io.open(a[1], encoding="utf-8-sig"))
        for p in make_batch(items):
            print(p)
    elif len(a) == 2 and a[0] == "--dump":
        for i, k, t in dump(a[1]):
            print(f"{i:2d} {k:8s} {t!r}")
    elif len(a) == 2:
        print(make(json.load(io.open(a[0], encoding="utf-8-sig")), a[1]))
    else:
        print(__doc__)
