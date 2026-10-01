# -*- coding: utf-8 -*-
"""kk-pay 증빙 파일명 규칙·정리 — 매번 셸 명령을 짜지 않고 규칙대로(확정된 값만 넣으면) 이름을 만들고 옮긴다.

  python kk_pay_files.py plan  <items.json>                 # 이름 계획표 출력(파일은 안 건드림) — 사용자 confirm 용
  python kk_pay_files.py apply <items.json>                 # 계획대로 같은 폴더에서 이름 변경(덮어쓰기 금지, 하나라도 막히면 아무것도 안 바꿈)
  python kk_pay_files.py archive <items.json> --base <월 폴더> [--dry]   # 신청완료/{법인카드|연구비카드|세금계산서}/{과제}/ 로 파일 단위 이동

items.json = [{ "file": "경로", "acccd": "2E11111", "item": "15", "bimok": "330", "apprno": "12345678",
                "holder": "김키키", "desc": "○○ 시약 외 6건 구입", "kind": "card" | "tax", "group": "임의 묶음키",
                "bankbook": false, "card_kind": "법인" | "연구비" }, ...]
  - 이름: 카드 = {acccd}_{item}_{bimok}_{apprno}_{holder}]{desc} / 세금계산서 = {acccd}_{item}_{bimok}_{holder}]{desc} (승인번호 없음)
  - 같은 group(=같은 지급 건)에 파일이 여럿이면 끝에 ' (1)', ' (2)' … / bankbook=true 면 desc 뒤에 '_통장사본'
  - 80자 이내(확장자 제외, RPA 규칙) · 금지 문자 \\ / : * ? " < > | 는 '-' 로 · 확장자는 원본 그대로(jpg/pdf 만 업로드 가능 — 다른 형식은 convert.py 로 먼저 변환)
  - 경로는 C:/… 또는 C:\\… 로. Git Bash 꼴(/c/…)도 받는다.
  - archive: card → {base}/신청완료/{card_kind}카드/{acccd}/ (법인카드·연구비카드), tax → {base}/신청완료/세금계산서/{acccd}/
    옮기기 전에 전부 검사한다(파일 · 과제번호 형식 · card_kind 는 법인|연구비 · 목적지가 신청완료 폴더 안 · 같은 파일 두 번) — 하나라도 걸리면
    아무것도 옮기지 않고, 옮기다 실패하면 이미 옮긴 것을 원래 자리로 되돌린다(2026-09-27 Codex 점검 반영).
    apply 로 이름을 바꾼 뒤에도 같은 items.json 을 그대로 쓰면 된다(원래 경로에 없으면 규칙상의 새 이름을 찾아 옮긴다).
    GoogleDrive 동기 폴더에서도 안전하게 파일 단위로 옮기고, 같은 이름이 있으면 ' (2)' 를 붙인다. 원본 폴더의 다른 파일은 손대지 않는다.
종료 코드 0 정상 / 1 규칙 위반·오류(메시지). 마지막 줄은 항상 요약('[요약] …').
"""
from __future__ import annotations
import io, json, os, re, shutil, sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BAD = '\\/:*?"<>|'
ACC_RE = r"[0-9][A-Za-z][0-9]{5}|[0-9]{2}[A-Za-z][0-9]{4}"   # 계정번호 2E11111 / 26N1111 두 형식(실제 계정번호는 둘 다 있음)
CARD_KINDS = ("법인", "연구비")                                # card_kind 허용값 — 이 둘만(경로 조각이 되므로 허용값으로 막는다)
CARD_DIRS = {"법인": "법인카드", "연구비": "연구비카드"}           # archive 폴더 이름(2026-10-01 사용자: 신청완료\법인카드·연구비카드 — 2026.06 부터 실제 폴더 이름)
OK_EXT = (".jpg", ".pdf")
MAX_NAME = 80                      # RPA 파일명 규칙: 80자 이내(확장자 제외로 센다)


def _clean(s: str) -> str:
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return "".join("-" if c in BAD else c for c in s)


def _path(p) -> str:
    """items.json 경로 정리 — Git Bash 꼴 /c/Users/… 를 Windows 에서 C:/Users/… 로(JSON 안 경로는 셸이 바꿔 주지 않는다)."""
    p = str(p or "").strip()
    if os.name == "nt" and p.startswith("/"):
        m = re.match(r"^/([a-zA-Z])(/.*)?$", p)
        if m:
            return m.group(1).upper() + ":" + (m.group(2) or "/")
        try:                                   # /tmp/… 같은 Git Bash 마운트 경로는 cygpath 로(있을 때만)
            import subprocess
            r = subprocess.run(["cygpath", "-m", p], capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip()
        except Exception:
            pass
    return p


def build_names(items: list) -> list:
    """items → [{**item, name(확장자 포함), problems:[…]}]. 규칙 위반은 problems 에 적고 이름은 그래도 만든다."""
    out, counts = [], {}
    for it in items:
        problems = []
        f = _path(it.get("file"))
        ext = os.path.splitext(f)[1].lower()
        if not os.path.isfile(f):
            problems.append("파일 없음")
        if ext not in OK_EXT:
            problems.append(f"업로드 불가 형식 {ext or '(없음)'} — convert.py 로 jpg/pdf 변환 먼저")
        acccd, item, bimok, holder = (str(it.get(k) or "").strip() for k in ("acccd", "item", "bimok", "holder"))
        kind = (it.get("kind") or "card").lower()
        apprno = str(it.get("apprno") or "").strip()
        if kind not in ("card", "tax"):
            problems.append(f"kind 는 card 또는 tax: {kind}")
        if not re.fullmatch(ACC_RE, acccd):
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
        out.append({**it, "file": f, "kind": kind, "ext": ext, "base": base, "problems": problems})
        g = it.get("group") or base
        counts[g] = counts.get(g, 0) + 1
    seq = {}
    for o in out:
        g = o.get("group") or o["base"]
        if counts[g] > 1:
            seq[g] = seq.get(g, 0) + 1
            o["stem"] = f"{o['base']} ({seq[g]})"
        else:
            o["stem"] = o["base"]
        o["name"] = o["stem"] + o["ext"]
        if len(o["stem"]) > MAX_NAME:
            o["problems"].append(f"이름 {len(o['stem'])}자 — RPA 규칙 {MAX_NAME}자 이내(확장자 제외)로 내용을 줄일 것")
    names = [o["name"].lower() for o in out]
    for o in out:
        if names.count(o["name"].lower()) > 1:
            o["problems"].append("같은 이름이 둘 이상 — group 으로 묶거나 내용을 다르게")
    return out


def _target(r) -> str:
    return os.path.join(os.path.dirname(os.path.abspath(r["file"])), r["name"])


def cmd_plan(items):
    rows = build_names(items)
    bad = 0
    print("| # | 원본 | → 새 이름 | 점검 |")
    for i, r in enumerate(rows, 1):
        probs = list(r["problems"])
        # apply 를 이미 했으면(원래 파일은 없고 새 이름 파일이 있음) '적용됨' 으로 보인다
        if probs == ["파일 없음"] and os.path.isfile(_target(r)):
            probs = []; note = "적용됨(새 이름 있음)"
        else:
            note = "; ".join(probs) or "OK"
        bad += bool(probs)
        print(f"| {i} | {os.path.basename(str(r.get('file') or ''))} | {r['name']} | {note} |")
    print(f"[요약] {len(rows)}건 중 OK {len(rows) - bad} / 점검 필요 {bad}")
    return 1 if bad else 0


def cmd_apply(items):
    rows = build_names(items)
    applied = [r for r in rows if r["problems"] == ["파일 없음"] and os.path.isfile(_target(r))]   # 이미 새 이름으로 바뀐 건(다시 실행해도 안전)
    if any(r["problems"] for r in rows if not any(r is a for a in applied)):
        print("ERR 계획에 점검 항목이 있어 아무것도 바꾸지 않았습니다 — plan 으로 확인:")
        cmd_plan(items)
        return 1
    rows = [r for r in rows if not any(r is a for a in applied)]
    if applied:
        print(f"이미 적용됨 {len(applied)}건(새 이름 파일이 있음) — 건너뜀")
    # 1단계: 모든 대상 이름을 먼저 확인(하나라도 막히면 아무것도 바꾸지 않는다 — 일부만 바뀐 채 멈추지 않게)
    plan, clash = [], []
    for r in rows:
        src, dst = os.path.abspath(r["file"]), _target(r)
        if os.path.normcase(src) == os.path.normcase(dst):
            continue
        if os.path.exists(dst):
            clash.append(r["name"])
        plan.append((src, dst))
    if clash:
        print("ERR 같은 이름의 파일이 이미 있어 아무것도 바꾸지 않았습니다:", ", ".join(clash))
        print(f"[요약] 이름 변경 0 / 충돌 {len(clash)}")
        return 1
    # 2단계: 바꾸고, 중간에 실패하면 이미 바꾼 것을 되돌린다
    done = []
    try:
        for src, dst in plan:
            os.rename(src, dst)
            done.append((src, dst))
            print("이름 변경:", os.path.basename(src), "→", os.path.basename(dst))
    except OSError as e:
        for src, dst in reversed(done):
            try:
                os.rename(dst, src)
            except OSError:
                print("  ⚠ 되돌리지 못함:", os.path.basename(dst), "→", os.path.basename(src))
        print(f"ERR 이름 변경 중 실패({type(e).__name__}: {e}) — 바꾼 {len(done)}건을 되돌렸습니다(파일이 다른 프로그램에서 열려 있는지 확인)")
        print(f"[요약] 이름 변경 0 / 실패 1")
        return 1
    print(f"[요약] 이름 변경 {len(done)}건 (그대로 {len(rows) - len(done)}) — 정리(archive) 때도 같은 items.json 을 쓰면 새 이름을 찾아 옮긴다")
    return 0


def _unique(p, taken=()):
    """같은 이름이 있으면 ' (2)' … — taken 은 이번에 옮기기로 이미 정한 목적지(서로 겹치지 않게)."""
    stem, ext = os.path.splitext(p); k = 2
    while os.path.exists(p) or os.path.normcase(p) in taken:
        p = f"{stem} ({k}){ext}"; k += 1
    return p


def cmd_archive(items, base, dry):
    base = _path(base)
    if not base or not os.path.isdir(base):
        print("ERR --base <월 폴더> 가 필요합니다(영수증 폴더의 그 달 폴더)"); return 1
    root = os.path.realpath(os.path.join(base, "신청완료"))
    rows = build_names(items)
    # 1단계: 옮기기 전에 전부 검사 — 파일(원래 경로 → 없으면 apply 로 바뀐 새 이름) · 과제번호 · 카드 구분 · 목적지 · 같은 파일 두 번.
    #   이름 규칙(적요·승인번호 등)은 보지 않는다 — 세금계산서처럼 원본 이름 그대로 정리하는 경우가 있다. 하나라도 걸리면 아무것도 옮기지 않는다.
    moves, problems, seen = [], [], {}
    for i, r in enumerate(rows, 1):
        tag = f"{i}번 {os.path.basename(r['file'])}"
        f = r["file"] if os.path.isfile(r["file"]) else (_target(r) if os.path.isfile(_target(r)) else "")
        if not f:
            problems.append(f"{tag}: 파일 없음(새 이름 {r['name']} 도 없음)"); continue
        acccd = str(r.get("acccd") or "").strip()
        if r["kind"] not in ("card", "tax"):
            problems.append(f"{tag}: kind 는 card 또는 tax"); continue
        if not re.fullmatch(ACC_RE, acccd):
            problems.append(f"{tag}: 계정번호 형식 이상 {acccd or '(없음)'}"); continue
        sub = "세금계산서" if r["kind"] == "tax" else str(r.get("card_kind") or "법인").strip()
        if r["kind"] == "card" and sub not in CARD_KINDS:
            problems.append(f"{tag}: card_kind 는 법인 또는 연구비({sub})"); continue
        if r["kind"] == "card":
            sub = CARD_DIRS[sub]
        dest_dir = os.path.realpath(os.path.join(root, sub, acccd))
        if dest_dir == root or os.path.commonpath([root, dest_dir]) != root:
            problems.append(f"{tag}: 목적지가 신청완료 폴더 밖"); continue
        key = os.path.normcase(os.path.realpath(f))
        if key in seen:
            problems.append(f"{tag}: {seen[key]} 와 같은 파일"); continue
        seen[key] = tag
        moves.append((f, dest_dir))
    if problems:
        print("ERR 옮기기 전 검사에서 걸려 아무것도 옮기지 않았습니다:", "; ".join(problems))
        print(f"[요약] 이동 0 / 문제 {len(problems)}")
        return 1
    plan, taken = [], set()
    for f, dest_dir in moves:                  # 목적지 이름도 미리 정한다(이번에 옮길 파일끼리 같은 이름이어도 ' (2)')
        dest = _unique(os.path.join(dest_dir, os.path.basename(f)), taken)
        taken.add(os.path.normcase(dest))
        plan.append((f, dest_dir, dest))
    # 2단계: 옮기고, 중간에 실패하면 이미 옮긴 것을 원래 자리로 되돌린다
    done = []
    try:
        for f, dest_dir, dest in plan:
            print(("[dry] " if dry else "") + "이동:", os.path.basename(f), "→", os.path.relpath(dest, base))
            if not dry:
                os.makedirs(dest_dir, exist_ok=True)
                shutil.move(f, dest)            # 파일 단위 이동(폴더 통째 Move 금지 — GoogleDrive 동기 폴더 충돌 방지)
                done.append((f, dest))
    except OSError as e:
        back = 0
        for f, dest in reversed(done):
            try:
                shutil.move(dest, f); back += 1
            except OSError:
                print("  ⚠ 되돌리지 못함:", os.path.basename(dest), "→", f)
        print(f"ERR 이동 중 실패({type(e).__name__}: {e}) — 옮긴 {len(done)}건 중 {back}건을 원래 자리로 되돌렸습니다(파일이 열려 있는지 확인)")
        print(f"[요약] 이동 0 / 실패 1 / 되돌림 {back}/{len(done)}")
        return 1
    print(f"[요약] {'이동 계획' if dry else '이동'} {len(plan)}건 → {root}")
    return 0


def main(argv):
    if len(argv) < 2 or argv[0] not in ("plan", "apply", "archive"):
        print(__doc__); return 1
    try:
        items = json.load(io.open(_path(argv[1]), encoding="utf-8-sig"))
    except Exception as e:
        print("ERR items.json 을 읽지 못함:", e); return 1
    if not isinstance(items, list) or not items or not all(isinstance(x, dict) for x in items):
        print("ERR items.json 은 비어 있지 않은 객체 배열이어야 합니다"); return 1
    if argv[0] == "plan":
        return cmd_plan(items)
    if argv[0] == "apply":
        return cmd_apply(items)
    base = argv[argv.index("--base") + 1] if "--base" in argv and argv.index("--base") + 1 < len(argv) else ""
    return cmd_archive(items, base, "--dry" in argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
