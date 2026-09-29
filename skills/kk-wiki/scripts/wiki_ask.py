# -*- coding: utf-8 -*-
"""kk-wiki 한 번에 답 재료 모으기 — 검색 + 관련 절 발췌 + 최신 확인 + 담당자를 **한 번의 실행**으로.

간단한 규정 질문("리버모어 출장 숙박비 하루 얼마?")은 이 출력 하나로 답을 쓴다(도구 왕복 1번).
느렸던 이유는 스크립트가 아니라 검색 → 본문 Read → fresh → 담당자 를 따로 부르던 왕복 4번이었다(2026-09-30 실측: 스크립트 합계 3초, 왕복이 대부분).

사용:
  python wiki_ask.py 숙박비 "국외|해외" "등급|급지" --staff 출장
  python wiki_ask.py "회의비|식대" 한도 --scope all --staff 회의비
  python wiki_ask.py 인수인계 --pages 2 --chars 5000 --no-fresh
검색어 문법은 wiki_search.py 와 같다(인자끼리 AND, `|` 는 OR).
옵션:
  --scope current|attach|all  (기본 current = 위키 본문·판독본·공지. 결과가 적으면 자동으로 첨부까지 넓힘)
  --pages N     발췌할 상위 문서 수(기본 3) · --chars N  전체 발췌 글자 상한(기본 7000)
  --staff 단어  담당자표 검색어(`|` OR, 여러 개면 AND). 안 주면 첫 검색어로.  --no-staff 로 끔
  --no-fresh    최신 확인(API, 토큰) 건너뜀 — 토큰이 없으면 자동으로 건너뛰고 표시
출력: ① 후보 목록(계층·기준일·링크) ② 문서별로 **검색어가 든 절만**(마크다운 머리글 단위, 표는 통째) ③ 최신 확인 SAME/CHANGED ④ 담당자 표 줄.
"""
from __future__ import annotations
import argparse, io, json, os, re, sys, threading

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wiki_search as ws  # noqa: E402
from wiki_snapshot import snapshot_root  # noqa: E402

HEAD = re.compile(r"^(#{1,6}\s|\*\*\s*[\d①-⑳(가-힣]{1,4}[.)]\s|[□■○◎▶]\s)")


def blocks(body: str) -> list:
    """본문을 머리글 단위 덩어리로. 표(| 로 시작하는 줄 묶음)는 앞 덩어리에 붙는다."""
    out, cur = [], []
    for ln in body.splitlines():
        if HEAD.match(ln) and cur and not ln.startswith("|"):
            out.append("\n".join(cur)); cur = []
        cur.append(ln)
    if cur:
        out.append("\n".join(cur))
    return [b for b in out if b.strip()]


def clean(t: str) -> str:
    t = re.sub(r"<br\s*/?>", " / ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)                  # 위키 본문의 span·strong 태그
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "[그림]", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def is_toc(b: str) -> bool:
    """목차 덩어리 — 코드 울타리 안이나 `(n) …?` 질문 줄·점선 쪽수 줄이 대부분."""
    lines = [l for l in b.splitlines() if l.strip() and not l.strip().startswith("```")]
    if len(lines) < 4:
        return False
    q = sum(1 for l in lines if re.match(r"^\s*(\(\d+\)|\d+\.|[가-하]\.)\s.*(\?|요|[·…]{3,}\s*\d*)\s*$", l.strip()))
    return q / len(lines) >= 0.6 or (b.lstrip().startswith("```") and q / len(lines) >= 0.4)


def pick_blocks(body: str, pats: list, limit: int) -> str:
    """검색어가 든 덩어리만, 많이 걸린 순 → 원래 순서로 되돌려 limit 글자까지. 목차 덩어리는 뺀다. 같은 덩어리 안 표는 자르지 않는다."""
    bl = blocks(body)
    scored = []
    for i, b in enumerate(bl):
        if is_toc(b):
            continue
        n_all = sum(1 for p in pats if p.search(b))
        if n_all:
            head = b.splitlines()[0]
            scored.append((n_all + (1 if any(p.search(head) for p in pats) else 0), sum(len(p.findall(b)) for p in pats), i, b, n_all))
    if scored:   # 가장 많이 걸린 덩어리보다 검색어가 2개 이상 모자라면 뺀다(페이지 제목 낱말만 걸린 덩어리 제외)
        need = max(1, max(x[4] for x in scored) - (1 if len(pats) >= 3 else 0))
        scored = [x[:4] for x in scored if x[4] >= need]
    scored.sort(key=lambda x: (-x[0], -x[1]))
    keep, used = [], 0
    for _, _, i, b in scored:
        c = clean(b)
        if used + len(c) > limit and keep:
            continue
        if len(c) > limit:
            c = c[:limit] + " …(줄임)"
        keep.append((i, c)); used += len(c)
        if used >= limit:
            break
    keep.sort()
    return "\n\n".join(c for _, c in keep)


def fresh_check(root: str, ids: list, out: dict) -> None:
    try:
        import wiki_snapshot as sn
        sn.load_token()   # 토큰 없으면 SystemExit
    except SystemExit:
        out["err"] = "토큰 없음 — 최신 확인 못 함(브라우저 checkFresh 로)"; return
    except Exception as e:
        out["err"] = str(e)[:80]; return
    cfg = sn._skill_config()
    wiki = cfg.get("space_id") or sn.DEFAULT_WIKI
    idx = {p["id"]: p for p in json.load(open(os.path.join(root, "index.json"), encoding="utf-8")).get("pages", [])}
    res = {}

    def one(pid):
        try:
            d = sn.api_get(f"/wiki/v1/wikis/{wiki}/pages/{pid}")
            pg = d.get("result") or {}
            old = idx.get(pid) or {}
            if not pg:
                res[pid] = "조회 실패"; return
            same = pg.get("updatedAt") == old.get("updatedAt") and pg.get("version") == old.get("version")
            res[pid] = "SAME" if same else f"CHANGED 서버 {str(pg.get('updatedAt'))[:10]} v{pg.get('version')} (로컬 v{old.get('version')}) → wiki_snapshot.py fresh {pid} --update"
        except SystemExit as e:
            res[pid] = f"실패 {str(e)[:60]}"
        except Exception as e:
            res[pid] = f"실패 {str(e)[:60]}"
    th = [threading.Thread(target=one, args=(p,)) for p in ids]
    for t in th:
        t.start()
    for t in th:
        t.join(20)
    out["res"] = res


def staff_lines(root: str, terms: list, top: int = 4) -> list:
    try:
        import wiki_staff as st
        data = st.load(root)
    except SystemExit:
        return ["(담당자표 없음 — 기능 3 으로 수집)"]
    except Exception as e:
        return [f"(담당자표 읽기 실패 {str(e)[:60]})"]
    pats = [re.compile("|".join(re.escape(x) for x in t.split("|") if x), re.I) for t in terms if t]
    hits = []
    for t in data.get("teams", []):
        for r in t.get("rows", []):
            hay = f"{r.get('role', '')} {r.get('duties', '')}"
            if pats and all(p.search(hay) for p in pats):
                sc = sum(len(p.findall(hay)) for p in pats) + (3 if any(p.search(r.get("role", "")) for p in pats) else 0)
                hits.append((bool(t.get("old")), -sc, t, r))
    hits.sort(key=lambda x: (x[0], x[1]))
    out = [f"담당자 '{' AND '.join(terms)}' → {len(hits)}건 (담당자표 수집 {str(data.get('imported_at', ''))[:10]})"]
    for _, _, t, r in hits[:top]:
        old = " ⚠오래됨" if t.get("old") else ""
        out.append(f"| {t['team']} | {r.get('role', '')} | {r.get('staff', '')} | {t.get('asof') or t.get('date', '')}{old} | {t.get('url', '')} |  업무: {r.get('duties', '')[:80]}")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("terms", nargs="+")
    ap.add_argument("--root")
    ap.add_argument("--scope", choices=["current", "attach", "all"], default="current")
    ap.add_argument("--pages", type=int, default=3)
    ap.add_argument("--chars", type=int, default=7000)
    ap.add_argument("--staff", nargs="*", default=None)
    ap.add_argument("--no-staff", action="store_true")
    ap.add_argument("--no-fresh", action="store_true")
    a = ap.parse_intermixed_args(argv)
    root = snapshot_root(a.root)
    pats = ws.compile_terms(a.terms)

    def search(scope):
        pool = []
        if scope in ("current", "all"):
            pool += ws.load_index(root) + ws.load_md_folder(root, "ocr", "ocr", "transcribed") + ws.load_md_folder(root, "notices", "notice", "dated")
        if scope in ("attach", "all"):
            pool += ws.load_sections(root)
        hits = []
        for p in pool:
            body = ws.read_body(root, p)
            sc = ws.score_of(p, body, pats, False)
            if sc is not None:
                hits.append((sc, p, body))
        hits.sort(key=lambda x: (-x[0], x[1].get("tier", 1)))
        return hits

    hits = search(a.scope)
    widened = ""
    if a.scope == "current" and len(hits) < 2:
        hits = search("all"); widened = " (현행 결과가 적어 첨부·구버전까지 넓힘)"
    print(f"[kk-wiki ask] '{' AND '.join(a.terms)}' → {len(hits)}건{widened}")
    top = hits[: a.pages]
    # 최신 확인은 위키 본문 페이지만(판독본·공지는 원 페이지 id, 첨부 절은 원 페이지 id)
    ids = []
    for _, p, _ in top:
        pid = p["id"]
        if p.get("section"):
            pid = p["srel"].split("/")[1] if p.get("srel") else ""
        elif pid.startswith(("ocr:", "notice:")):
            m = re.search(r"/(\d{15,})$", p.get("url", ""))
            pid = m.group(1) if m else ""
        if pid and pid.isdigit() and pid not in ids:
            ids.append(pid)
    fr = {}
    th = None
    if not a.no_fresh and ids:
        th = threading.Thread(target=fresh_check, args=(root, ids, fr)); th.start()

    print("\n## 후보")
    for i, (sc, p, _) in enumerate(hits[: max(a.pages, 6)], 1):
        mark = " ← 발췌" if i <= a.pages else ""
        extra = ""
        if p.get("section"):
            extra = f" p.{p.get('pages') or '-'}" + (f" ← 대체: {p['superseded_title']}" if p.get("superseded_by") else "") + (" ⚠구값" if p.get("stale") else "")
        print(f"{i}. {ws.tag_of(p)} {p['path']}{extra}  {p.get('url', '')}{mark}")

    print("\n## 발췌 (검색어가 든 절만)")
    best = top[0][0] if top else 1
    top = [h for h in top if h[0] >= best * 0.3]     # 1위의 30% 미만 점수 문서는 후보 목록에만
    tot = sum(h[0] for h in top) or 1
    for i, (sc, p, body) in enumerate(top, 1):
        per = max(1200, int(a.chars * sc / tot))       # 점수에 비례해 글자 배분
        print(f"\n### [{i}] {ws.tag_of(p)} {p['path']}")
        if p.get("section"):
            if p.get("stale"):
                print("⚠ 구값: " + " / ".join(p["stale"]))
            if p.get("note"):
                print("※ " + p["note"][:160])
        print(pick_blocks(body, pats, per) or "(발췌 없음 — 제목·경로에만 걸림)")

    if th:
        th.join(25)
    print("\n## 최신 확인")
    if a.no_fresh:
        print("(건너뜀 --no-fresh)")
    elif fr.get("err"):
        print("⚠ " + fr["err"])
    elif not ids:
        print("(위키 페이지 없음)")
    else:
        for pid in ids:
            print(f"{pid}: {fr.get('res', {}).get(pid, '응답 없음(시간 초과)')}")

    if not a.no_staff:
        st_terms = a.staff if a.staff else [a.terms[0]]
        print("\n## 담당자 (팀 | 직무 | 담당 | 기준일 | 게시글)")
        for ln in staff_lines(root, st_terms):
            print(ln)


if __name__ == "__main__":
    main()
