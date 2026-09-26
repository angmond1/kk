# -*- coding: utf-8 -*-
"""kk-pay 증빙 파일명 규칙·정리 — 매번 셸 명령을 짜지 않고 규칙대로(확정된 값만 넣으면) 이름을 만들고 옮긴다.

  python kk_pay_files.py plan  <items.json>                 # 이름 계획표 출력(파일은 안 건드림) — 사용자 confirm 용
  python kk_pay_files.py apply <items.json>                 # 계획대로 같은 폴더에서 이름 변경(덮어쓰기 금지)
  python kk_pay_files.py archive <items.json> --base <월 폴더> [--dry]   # 신청완료/{카드구분|세금계산서}/{과제}/ 로 파일 단위 이동

items.json = [{ "file": "경로", "acccd": "2E11111", "item": "15", "bimok": "330", "apprno": "12345678",
                "holder": "김키키", "desc": "○○ 시약 외 6건 구입", "kind": "card" | "tax", "group": "임의 묶음키",
                "bankbook": false }, ...]
  - 이름: 카드 = {acccd}_{item}_{bimok}_{apprno}_{holder}]{desc} / 세금계산서 = {acccd}_{item}_{bimok}_{holder}]{desc} (승인번호 없음)
  - 같은 group(=같은 지급 건)에 파일이 여럿이면 끝에 ' (1)', ' (2)' … / bankbook=true 면 desc 뒤에 '_통장사본'
  - 확장자는 원본 그대로(jpg/pdf 만 업로드 가능 — 다른 형식은 convert.py 로 먼저 변환)
  - archive: card → {base}/신청완료/{card_kind}/{acccd}/, tax → {base}/신청완료/세금계산서/{acccd}/ (card_kind 는 item 의 "card_kind": "법인"|"연구비")
    GoogleDrive 동기 폴더에서도 안전하게 파일 단위로 옮기고, 같은 이름이 있으면 ' (2)' 를 붙인다. 원본 폴더의 다른 파일은 손대지 않는다.
종료 코드 0 정상 / 1 규칙 위반·오류(메시지).
"""
from __future__ import annotations
import io, json, os, re, shutil, sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BAD = '\\/:*?"<>|'
OK_EXT = (".jpg", ".pdf")


def _clean(s: str) -> str:
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return "".join("-" if c in BAD else c for c in s)


def build_names(items: list) -> list:
    """items → [{**item, name(확장자 포함), problems:[…]}]. 규칙 위반은 problems 에 적고 이름은 그래도 만든다."""
    out, counts = [], {}
    for it in items:
        problems = []
        f = str(it.get("file") or "")
        ext = os.path.splitext(f)[1].lower()
        if not os.path.isfile(f):
            problems.append("파일 없음")
        if ext not in OK_EXT:
            problems.append(f"업로드 불가 형식 {ext or '(없음)'} — convert.py 로 jpg/pdf 변환 먼저")
        acccd, item, bimok, holder = (str(it.get(k) or "").strip() for k in ("acccd", "item", "bimok", "holder"))
        kind = (it.get("kind") or "card").lower()
        apprno = str(it.get("apprno") or "").strip()
        if not re.fullmatch(r"[0-9][A-Za-z][0-9]{5}|[0-9]{2}[A-Za-z][0-9]{4}", acccd):   # 2E11111 / 26N1111 두 형식 모두(실제 계정번호는 둘 다 있음)
            problems.append(f"계정번호 형식 이상: {acccd or '(없음)'}")
        if not re.fullmatch(r"\d{2}", item) or not re.fullmatch(r"\d{3}", bimok):
            problems.append(f"항목/비목 코드 형식 이상: {item or '?'}-{bimok or '?'} (항목 2자리, 비목 3자리)")
        if not holder:
            problems.append("카드책임자(또는 신청자) 이름 없음")
        if kind == "card" and not re.fullmatch(r"\d{6,10}", apprno):
            problems.append(f"카드 승인번호 이상: {apprno or '(없음)'} — fam_0711 조회값")
        desc = _clean(it.get("desc"))
        if not desc:
            problems.append("내용(적요) 없음")
        if "_" in desc:
            problems.append("내용에 '_' 가 있음 — RPA 가 구분자로 오해할 수 있어 공백으로 바꾸는 편이 안전")
        head = "_".join([acccd, item, bimok] + ([apprno] if kind == "card" else []) + [holder])
        base = f"{head}]{desc}" + ("_통장사본" if it.get("bankbook") else "")
        out.append({**it, "kind": kind, "ext": ext, "base": base, "problems": problems})
        g = it.get("group") or base
        counts[g] = counts.get(g, 0) + 1
    seq = {}
    for o in out:
        g = o.get("group") or o["base"]
        if counts[g] > 1:
            seq[g] = seq.get(g, 0) + 1
            o["name"] = f"{o['base']} ({seq[g]}){o['ext']}"
        else:
            o["name"] = o["base"] + o["ext"]
    names = [o["name"].lower() for o in out]
    for o in out:
        if names.count(o["name"].lower()) > 1:
            o["problems"].append("같은 이름이 둘 이상 — group 으로 묶거나 내용을 다르게")
    return out


def cmd_plan(items):
    rows = build_names(items)
    bad = 0
    print("| # | 원본 | → 새 이름 | 점검 |")
    for i, r in enumerate(rows, 1):
        p = "; ".join(r["problems"]) or "OK"
        bad += bool(r["problems"])
        print(f"| {i} | {os.path.basename(str(r.get('file') or ''))} | {r['name']} | {p} |")
    return 1 if bad else 0


def cmd_apply(items):
    rows = build_names(items)
    if any(r["problems"] for r in rows):
        print("ERR 계획에 점검 항목이 있어 실행하지 않습니다 — plan 으로 확인:")
        return cmd_plan(items) or 1
    done = []
    for r in rows:
        src = r["file"]; dst = os.path.join(os.path.dirname(os.path.abspath(src)), r["name"])
        if os.path.abspath(src) == os.path.abspath(dst):
            print("그대로:", r["name"]); continue
        if os.path.exists(dst):
            print("ERR 같은 이름이 이미 있어 건너뜀:", r["name"]); return 1
        os.replace(src, dst)
        done.append(dst)
        print("이름 변경:", os.path.basename(src), "→", r["name"])
    print(f"완료 {len(done)}건")
    return 0


def _unique(p):
    if not os.path.exists(p):
        return p
    stem, ext = os.path.splitext(p); k = 2
    while os.path.exists(f"{stem} ({k}){ext}"):
        k += 1
    return f"{stem} ({k}){ext}"


def cmd_archive(items, base, dry):
    if not base or not os.path.isdir(base):
        print("ERR --base <월 폴더> 가 필요합니다(영수증 폴더의 그 달 폴더)"); return 1
    moved = 0
    for it in items:
        f = str(it.get("file") or "")
        if not os.path.isfile(f):
            print("ERR 파일 없음:", f); return 1
        kind = (it.get("kind") or "card").lower()
        sub = "세금계산서" if kind == "tax" else str(it.get("card_kind") or "법인")
        acccd = str(it.get("acccd") or "").strip() or "미분류"
        dest_dir = os.path.join(base, "신청완료", sub, acccd)
        dest = _unique(os.path.join(dest_dir, os.path.basename(f)))
        print(("[dry] " if dry else "") + "이동:", os.path.basename(f), "→", os.path.relpath(dest, base))
        if not dry:
            os.makedirs(dest_dir, exist_ok=True)
            shutil.move(f, dest)            # 파일 단위 이동(폴더 통째 Move 금지 — GoogleDrive 동기 폴더 충돌 방지)
            moved += 1
    print(f"{'계획' if dry else '완료'} {moved if not dry else len(items)}건 → {os.path.join(base, '신청완료')}")
    return 0


def main(argv):
    if len(argv) < 2 or argv[0] not in ("plan", "apply", "archive"):
        print(__doc__); return 1
    try:
        items = json.load(io.open(argv[1], encoding="utf-8-sig"))
    except Exception as e:
        print("ERR items.json 을 읽지 못함:", e); return 1
    if not isinstance(items, list) or not items:
        print("ERR items.json 은 비어 있지 않은 배열이어야 합니다"); return 1
    if argv[0] == "plan":
        return cmd_plan(items)
    if argv[0] == "apply":
        return cmd_apply(items)
    base = argv[argv.index("--base") + 1] if "--base" in argv and argv.index("--base") + 1 < len(argv) else ""
    return cmd_archive(items, base, "--dry" in argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
