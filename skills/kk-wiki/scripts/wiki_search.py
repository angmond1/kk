# -*- coding: utf-8 -*-
"""kk-wiki 검색 — 로컬 스냅샷(pages/*.md + ocr/*.md 이미지 판독본)에서 키워드 AND 검색 + 발췌. Claude 가 후보를 넓게 뽑을 때 쓴다(최종 판단은 본문 Read).

사용:
  python wiki_search.py 재료비 이월                 # 모든 단어를 포함하는 페이지 (제목·경로·본문, 대소문자 무시)
  python wiki_search.py "회의비|식대" 한도            # '|' 로 동의어(OR) 묶음. 각 인자는 AND
  python wiki_search.py 출장 --path 재무팀            # 경로에 '재무팀' 이 든 페이지만
  python wiki_search.py 카드 --top 40 --snip 3       # 상위 40건, 발췌 3개씩
  python wiki_search.py --list 5.경영지원본부         # 검색 없이 경로 목록만
옵션: --root <스냅샷 폴더> (기본 <kiki_root>/wiki)
출력: 순위 | 수정일 | 경로 | 글자수·첨부 | url  + 발췌(±60자). 인용 전 `wiki_snapshot.py fresh <id>` 로 최신 확인.
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
    return json.load(open(p, encoding="utf-8")).get("pages", [])


def load_ocr(root: str) -> list:
    """`ocr/*.md` — 위키 페이지의 이미지 표(등급표 등)를 판독해 저장한 파일도 검색 대상에 넣는다.
    frontmatter 의 title / source_url / transcribed 를 목록에 쓴다(형식은 SKILL 기능 1 의 '이미지 표 판독' 참고)."""
    out = []
    d = os.path.join(root, "ocr")
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
        fm = {}
        m = re.match(r"---\n(.*?)\n---\n", s, re.S)
        if m:
            for line in m.group(1).splitlines():
                k, sep, v = line.partition(":")
                if sep:
                    fm[k.strip()] = v.strip().strip('"')
        body = s[m.end():] if m else s
        out.append({"id": "ocr:" + fn, "title": fm.get("title", fn), "path": "ocr/" + fn, "rel": "", "file": fp,
                    "url": fm.get("source_url", ""), "updatedAt": fm.get("transcribed", ""), "len": len(body), "files": []})
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


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("terms", nargs="*")
    ap.add_argument("--root")
    ap.add_argument("--path", help="경로 필터(부분 일치)")
    ap.add_argument("--top", type=int, default=25)
    ap.add_argument("--snip", type=int, default=2)
    ap.add_argument("--list", metavar="PATHPART", help="검색 없이 경로 목록만")
    a = ap.parse_intermixed_args(argv)
    root = snapshot_root(a.root)
    pages = load_index(root) + load_ocr(root)
    if a.list is not None:
        for p in pages:
            if a.list.lower() in p["path"].lower():
                print(f"[{(p.get('updatedAt') or '')[:10]}] {p['path']} ({p['len']}자{', 첨부 ' + str(len(p['files'])) if p.get('files') else ''})  `{p['id']}`")
        return
    if not a.terms:
        raise SystemExit("검색어를 주세요. 예: python wiki_search.py 재료비 이월")
    pats = compile_terms(a.terms)
    hits = []
    for p in pages:
        if a.path and a.path.lower() not in (p["path"] + " " + p.get("title", "")).lower():   # OCR 판독본은 제목으로도
            continue
        body = read_body(root, p)
        head = p["path"] + " " + p["title"]
        score, ok = 0, True
        for pat in pats:
            th = len(pat.findall(head))
            bh = len(pat.findall(body))
            if th + bh == 0:
                ok = False
                break
            score += th * 5 + min(bh, 20)
        if ok:
            hits.append((score, p, body))
    hits.sort(key=lambda x: (-x[0], x[1].get("updatedAt", "")))
    print(f"[kk-wiki] '{' AND '.join(a.terms)}' → {len(hits)}건 (상위 {min(a.top, len(hits))}건, 스냅샷 {root})")
    for i, (score, p, body) in enumerate(hits[: a.top], 1):
        att = f", 첨부 {len(p['files'])}" if p.get("files") else ""
        print(f"\n{i}. [{(p.get('updatedAt') or '')[:10]}] {p['path']}  ({p['len']}자{att}, 점수 {score})\n   {p['url']}   {('pages/' + p['rel']) if p.get('rel') else p['path'] + ' (이미지 판독본)'}")
        for s in snippets(body, pats, a.snip):
            print(f"   · {s}")


if __name__ == "__main__":
    main()
