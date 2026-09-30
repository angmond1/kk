# -*- coding: utf-8 -*-
"""kk-wiki 검색 — 로컬 스냅샷에서 키워드 AND 검색 + 발췌. Claude 가 후보를 넓게 뽑을 때 쓴다(최종 판단은 본문 Read).

검색 대상(계층): 1 현행 = 위키 본문 `pages/*.md` + 이미지 판독본 `ocr/*.md` + 포탈 공지 캡처 `notices/*.md`
                 2·3 첨부·구버전 = 첨부·문서 절 `attachments_text/**.md` (`wiki_extract.py run` 결과, tier 2 첨부 / 3 구버전)
기본은 현행만(--scope current). 현행에서 부족하면 첨부·구버전까지(--scope all) — 결과가 3건 미만이면 첨부 쪽 건수를 힌트로 보여준다.

사용:
  python wiki_search.py 재료비 이월                 # 모든 단어를 포함하는 페이지 (제목·경로·본문, 대소문자 무시)
  python wiki_search.py "회의비|식대" 한도            # '|' 로 동의어(OR) 묶음. 각 인자는 AND
  python wiki_search.py 출장 --path 재무팀            # 경로에 '재무팀' 이 든 페이지만
  python wiki_search.py 카드 --top 40 --snip 3       # 상위 40건, 발췌 3개씩
  python wiki_search.py 회의록 --scope all --kind procedure   # 첨부·구버전까지, 화면 절차(procedure) 절만
  python wiki_search.py 여비 --scope attach --tier 2          # 첨부 절만, tier 2(현행 첨부)까지
  python wiki_search.py --list 5.경영지원본부         # 검색 없이 경로 목록만 (--scope all 이면 첨부 절도)
옵션: --root <스냅샷 폴더> (기본 <kiki_root>/wiki) · --scope current|attach|all · --kind rule|procedure|case|table|reference · --tier N(이하만) · --old(대체된 절도 강등 없이)
출력: 순위 | [계층·종류·문서일] 경로 | 글자수·첨부 | url + 발췌(±60자). 첨부 절은 `← 대체: 위키 페이지`(그 페이지를 인용) 와 `⚠ 구값`(변경표의 옛 값이 든 절) 표시.
인용 전 위키 페이지는 `wiki_snapshot.py fresh <id>` 로 최신 확인. 첨부·구버전 값은 현행 값을 먼저 쓰고 옛 값은 뒤에 붙인다(`_shared/rule_changes.md`).
"""
from __future__ import annotations
import argparse, io, json, os, re, sys
# Windows 한국어(cp949) 콘솔·파이프에서도 한글·기호가 깨지거나 멈추지 않게 출력은 UTF-8 로 (모듈로 불러 써도 적용)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wiki_snapshot import snapshot_root  # noqa: E402


def load_index(root: str) -> list:
    p = os.path.join(root, "index.json")
    if not os.path.exists(p):
        raise SystemExit(f"[kk-wiki] 스냅샷이 없습니다: {root} — 먼저 wiki_snapshot.py crawl 또는 import")
    out = json.load(open(p, encoding="utf-8")).get("pages", [])
    for x in out:
        x["tier"] = 1
    return out


def _frontmatter(s: str) -> tuple:
    fm = {}
    m = re.match(r"---\n(.*?)\n---\n", s, re.S)
    if m:
        for line in m.group(1).splitlines():
            k, sep, v = line.partition(":")
            if sep:
                fm[k.strip()] = v.strip().strip('"')
    return fm, (s[m.end():] if m else s)


def load_md_folder(root: str, sub: str, tag: str, date_key: str) -> list:
    """`ocr/*.md`(이미지 표 판독본)·`notices/*.md`(포탈 공지 캡처) — frontmatter 의 title / source_url / 날짜를 목록에 쓴다. 둘 다 계층 1."""
    out = []
    d = os.path.join(root, sub)
    if not os.path.isdir(d):
        return out
    for fn in sorted(os.listdir(d)):
        if not fn.lower().endswith(".md"):
            continue
        fp = os.path.join(d, fn)
        try:
            s = io.open(fp, encoding="utf-8-sig").read()
        except Exception:
            continue
        fm, body = _frontmatter(s)
        out.append({"id": f"{tag}:{fn}", "title": fm.get("title", fn), "path": f"{sub}/{fn}", "rel": "", "file": fp, "tier": 1,
                    "url": fm.get("source_url", ""), "updatedAt": fm.get(date_key, "") or fm.get("dated", ""), "len": len(body), "files": [],
                    "label": "이미지 판독본" if tag == "ocr" else "포탈 공지"})
    return out


def load_sections(root: str) -> list:
    """`attachments_index.json`(wiki_extract.py) 의 절을 페이지처럼 — path 는 `위키 경로 / 문서 / 절`, updatedAt 은 문서 기준일."""
    p = os.path.join(root, "attachments_index.json")
    if not os.path.exists(p):
        return []
    out = []
    for s in json.load(open(p, encoding="utf-8")).get("sections", []):
        if s.get("status") != "ok":
            continue
        out.append({"id": s["id"], "title": s["title"], "path": f"{s['page_path']} / {s.get('doc_title') or s['file']} / {s['title']}", "rel": "",
                    "file": os.path.join(root, s["rel"].replace("/", os.sep)), "srel": s["rel"], "url": s.get("page_url", ""),
                    "updatedAt": s.get("doc_date", ""), "len": s.get("chars", 0), "files": [], "tier": int(s.get("tier") or 2),
                    "kind": s.get("section_kind", ""), "pages": s.get("pages", ""), "superseded_by": s.get("superseded_by", ""),
                    "superseded_title": s.get("superseded_title", ""), "stale": s.get("stale_values") or [], "doc_title": s.get("doc_title", ""),
                    "note": s.get("note", ""), "section": True})
    return out


def read_body(root: str, p: dict) -> str:
    try:
        fp = p.get("file") or os.path.join(root, "pages", p["rel"].replace("/", os.sep))
        s = io.open(fp, encoding="utf-8-sig").read()
    except Exception:
        return ""
    m = re.match(r"---\n.*?\n---\n", s, re.S)
    return s[m.end():] if m else s


def compile_terms(terms: list) -> list:
    out = []
    for t in terms:
        alts = [re.escape(x.strip()) for x in t.split("|") if x.strip()]
        if alts:
            out.append(re.compile("|".join(alts), re.I))
    return out


def snippets(body: str, pats: list, n: int, width: int = 60) -> list:
    out, used = [], []
    flat = re.sub(r"\s+", " ", body)
    for pat in pats:
        for m in pat.finditer(flat):
            a, b = max(0, m.start() - width), min(len(flat), m.end() + width)
            if any(abs(a - u) < width for u in used):
                continue
            used.append(a)
            out.append(("…" if a > 0 else "") + flat[a:b] + ("…" if b < len(flat) else ""))
            if len(out) >= n:
                return out
    return out


def score_of(p: dict, body: str, pats: list, old: bool):
    head = p["path"] + " " + p["title"]
    score = 0
    for pat in pats:
        th = len(pat.findall(head))
        bh = len(pat.findall(body))
        if th + bh == 0:
            return None
        score += th * 5 + min(bh, 20)
    if p.get("section") and p.get("superseded_by") and not old:
        score = score * 0.5      # 옮겨 적은 위키 페이지가 위로 오게
    elif not p.get("section"):
        score = score * 1.15     # 점수가 비슷하면 현행(계층 1)이 위로
    return score


def tag_of(p: dict) -> str:
    if p.get("section"):
        return f"[{p['tier']}·{p.get('kind', '')}·{(p.get('updatedAt') or '')[:7]}]"
    lab = p.get("label")
    return f"[1·{lab}·{(p.get('updatedAt') or '')[:10]}]" if lab else f"[1·위키·{(p.get('updatedAt') or '')[:10]}]"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("terms", nargs="*")
    ap.add_argument("--root")
    ap.add_argument("--path", help="경로 필터(부분 일치)")
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--snip", type=int, default=2)
    ap.add_argument("--list", metavar="PATHPART", help="검색 없이 경로 목록만")
    ap.add_argument("--scope", choices=["current", "attach", "all"], default="current", help="current 현행(위키 본문·판독본·공지) / attach 첨부·구버전 절만 / all 둘 다")
    ap.add_argument("--kind", choices=["rule", "procedure", "case", "table", "reference"], help="첨부 절의 종류 필터(위키 본문은 그대로)")
    ap.add_argument("--tier", type=int, default=3, help="이 계층까지만 (2 = 구버전 제외)")
    ap.add_argument("--old", action="store_true", help="대체된(superseded) 절도 점수 강등 없이")
    a = ap.parse_intermixed_args(argv)
    root = snapshot_root(a.root)
    current = load_index(root) + load_md_folder(root, "ocr", "ocr", "transcribed") + load_md_folder(root, "notices", "notice", "dated")
    # 첨부·구버전 절은 필요할 때만 읽는다 — 범위가 attach·all 이거나, current 결과가 3건 미만이라 '첨부에 N건 더' 힌트를 셀 때
    filt = lambda secs: [s for s in secs if s["tier"] <= a.tier and (not a.kind or s.get("kind") == a.kind)]
    secs_in = filt(load_sections(root)) if a.scope in ("attach", "all") else []
    pool = (current if a.scope in ("current", "all") else []) + (secs_in if a.scope in ("attach", "all") else [])
    if a.list is not None:
        for p in pool:
            if a.list.lower() in p["path"].lower():
                if p.get("section"):
                    sup = f"  ← 대체: {p['superseded_title']}" if p.get("superseded_by") else ""
                    print(f"{tag_of(p)} {p['path']} (p.{p['pages'] or '-'}, {p['len']}자){sup}  `{p['srel']}`")
                else:
                    print(f"[{(p.get('updatedAt') or '')[:10]}] {p['path']} ({p['len']}자{', 첨부 ' + str(len(p['files'])) if p.get('files') else ''})  `{p['id']}`")
        return
    if not a.terms:
        raise SystemExit("검색어를 주세요. 예: python wiki_search.py 재료비 이월")
    pats = compile_terms(a.terms)
    hits = []
    for p in pool:
        if a.path and a.path.lower() not in (p["path"] + " " + p.get("title", "")).lower():   # OCR 판독본·절은 제목으로도
            continue
        body = read_body(root, p)
        sc = score_of(p, body, pats, a.old)
        if sc is not None:
            hits.append((sc, p, body))
    hits.sort(key=lambda x: (-x[0], x[1].get("tier", 1), x[1].get("updatedAt", "")), reverse=False)
    hits.sort(key=lambda x: (-x[0], x[1].get("tier", 1)))
    n_sec = sum(1 for h in hits if h[1].get("section"))
    print(f"[kk-wiki] '{' AND '.join(a.terms)}' → {len(hits)}건 (상위 {min(a.top, len(hits))}건, 범위 {a.scope}, 스냅샷 {root})")
    if a.scope == "current" and len(hits) < 3 and (secs_in := filt(load_sections(root))):
        extra = 0
        for p in secs_in:
            if a.path and a.path.lower() not in p["path"].lower():
                continue
            if score_of(p, read_body(root, p), pats, a.old) is not None:
                extra += 1
        if extra:
            print(f"  ▶ 첨부·구버전 절에 {extra}건 더 있음 — `--scope all`(현행+첨부) 또는 `--scope attach`. 구버전 값은 현행 값을 먼저 확인(rule_changes.md).")
    for i, (score, p, body) in enumerate(hits[: a.top], 1):
        if p.get("section"):
            sup = f"\n   ← 대체: {p['superseded_title']} (그 위키 페이지를 인용)" if p.get("superseded_by") else ""
            st = ("\n   ⚠ 구값: " + " / ".join(p["stale"])) if p.get("stale") else ""
            note = f"\n   ※ {p['note'][:120]}" if p.get("note") else ""
            print(f"\n{i}. {tag_of(p)} {p['path']}  (p.{p['pages'] or '-'}, {p['len']}자, 점수 {score:g})\n   {p['url']}   {p['srel']}{sup}{st}{note}")
        else:
            att = f", 첨부 {len(p['files'])}" if p.get("files") else ""
            where = ("pages/" + p["rel"]) if p.get("rel") else p["path"] + f" ({p.get('label', '')})"
            print(f"\n{i}. {tag_of(p)} {p['path']}  ({p['len']}자{att}, 점수 {score:g})\n   {p['url']}   {where}")
        for s in snippets(body, pats, a.snip):
            print(f"   · {s}")
    if n_sec and a.scope != "current":
        print(f"\n(첨부·구버전 절 {n_sec}건 포함 — 현행 값은 계층 1 페이지가 우선, 구버전 값은 `_shared/rule_changes.md` 로 바꿔 읽는다)")


if __name__ == "__main__":
    main()
