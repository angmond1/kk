# -*- coding: utf-8 -*-
"""kk-wiki 스냅샷 도구 — KIST Wiki 2.0(Dooray 위키)의 모든 페이지 본문을 로컬에 저장·갱신·최신 확인.

두 경로, 같은 결과 형식:
  A (권장, Dooray 토큰): 공식 API(https://api.gov-dooray.com, `Authorization: dooray-api <token>`)로 트리 walk + 본문.
     브라우저 불요, 출력 제한 없음, 증분 갱신·최신 확인까지 이 스크립트 하나로.
  B (토큰 없음): 브라우저 코어(kk_wiki_ops.js)가 로그인 세션으로 수집해 내보낸 export JSON 을 `import` 로 같은 형식으로 저장.

사용:
  python wiki_snapshot.py crawl                       # 전체 수집(토큰) → raw/ + pages/ + index.json + index.md + CHANGES_yymmdd.md
  python wiki_snapshot.py import <export.json>        # 브라우저 내보내기 JSON → raw/ + 같은 산출물
  python wiki_snapshot.py build                       # raw/ 에서 pages/·index 만 재생성(변경 리포트 포함)
  python wiki_snapshot.py fresh <pageId...> [--update] # 인용 전 최신 확인(토큰): 수정일·버전 비교, --update 면 바뀐 페이지만 재수집
  python wiki_snapshot.py attach [pageId...] [--max-mb 30]  # (토큰) 첨부 파일(hwp/pdf 규정 원문) → attachments/<pageId>/ (있는 건 건너뜀)
  python wiki_snapshot.py status                      # 스냅샷 요약(페이지 수·수집일·최근 수정)
공통 옵션: --root <폴더> (기본 <kiki_root>/wiki = C:\\kiki\\wiki / ~/kiki/wiki), --wiki <spaceId>, --home <homePageId>
스냅샷 안의 내용은 KIST 내부 자료 — 각자 PC 에만 두고 repo/채팅에 올리지 않는다.
"""
from __future__ import annotations
import argparse, hashlib, io, json, os, re, sys, time
# Windows 한국어(cp949) 콘솔·파이프에서도 한글·기호가 깨지거나 멈추지 않게 출력은 UTF-8 로 (모듈로 불러 써도 적용)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_WIKI = "3538560283559420253"   # KIST-Wiki-2.0 (URL 첫 번째 id)
DEFAULT_HOME = "3538560286709555986"   # Home 페이지
API = "https://api.gov-dooray.com"
WEB = "https://kist.gov-dooray.com"


# ---------- 경로·설정 ----------
def _kiki_root() -> str:
    r = os.environ.get("KIKI_ROOT", "").strip()
    if r:
        return os.path.expanduser(r)
    for cfg in ("~/.claude/kiki/kiki.config.json", "~/.codex/kiki/kiki.config.json"):
        p = os.path.expanduser(cfg)
        if os.path.exists(p):
            try:
                r = (json.load(open(p, encoding="utf-8-sig")).get("kiki_root") or "").strip()
            except Exception:
                r = ""
            if r:
                return os.path.expanduser(r)
    return "C:\\kiki" if os.name == "nt" else os.path.expanduser("~/kiki")


def _skill_config() -> dict:
    for cfg in ("~/.claude/kiki/kk-wiki.config.json", "~/.codex/kiki/kk-wiki.config.json"):
        p = os.path.expanduser(cfg)
        if os.path.exists(p):
            try:
                return json.load(open(p, encoding="utf-8-sig"))
            except Exception:
                return {}
    return {}


def snapshot_root(arg: str | None) -> str:
    if arg:
        return os.path.abspath(os.path.expanduser(arg))
    d = (_skill_config().get("snapshot_dir") or "{kiki_root}/wiki").replace("{kiki_root}", _kiki_root())
    return os.path.abspath(os.path.expanduser(d))


# ---------- 토큰 (kk-pay dooray_drive.py 와 동일 규칙) ----------
def _read_text(p: str) -> str:
    """메모장이 UTF-16 이나 ANSI 로 저장해도 읽히게 — BOM 우선, 그다음 UTF-8, 시스템 인코딩."""
    raw = open(p, "rb").read()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16", errors="ignore")
    for enc in ("utf-8-sig", "cp949"):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode("utf-8", errors="ignore")


def _token_from_file(p: str) -> str:
    try:
        lines = _read_text(p).splitlines()
    except Exception:
        return ""
    body = [ln.strip() for ln in lines if ln.strip() and not ln.lstrip().startswith("#")]
    for i, ln in enumerate(body):
        if ln.upper().startswith("DOORAY_TOKEN="):
            return ln.split("=", 1)[1].strip().strip('"').strip("'")
        if ln.lower().startswith("dooray token"):
            rest = ln.split(":", 1)[1].strip() if ":" in ln else ""
            if rest:
                return rest.strip('"').strip("'")
            return body[i + 1].strip('"').strip("'") if i + 1 < len(body) else ""
    return body[0].strip('"').strip("'") if body else ""


def load_token() -> str:
    t = os.environ.get("DOORAY_TOKEN", "").strip()
    if t:
        return t
    root = _kiki_root()
    cands = [os.path.join(root, "token.txt")] + [os.path.expanduser(x) for x in (
        "~/.claude/kiki/token.txt", "~/.codex/kiki/token.txt", "~/.claude/kiki/kiki.env", "~/.codex/kiki/kiki.env")]
    for p in cands:
        if os.path.exists(p):
            t = _token_from_file(p)
            if t and " " not in t:
                return t
    raise SystemExit(f"[kk-wiki] Dooray 토큰이 없습니다. {os.path.join(root, 'token.txt')} 의 'Dooray token:' 다음 줄에 토큰을 저장하거나, "
                     "토큰 없이 쓰려면 브라우저 코어(kk_wiki_ops.js)로 내보낸 JSON 을 `import` 하세요. (토큰을 채팅에 붙여넣지 말 것)")


# ---------- 공식 API ----------
_session = None


def api():
    global _session
    if _session is None:
        try:
            import requests, urllib3
        except ImportError:
            raise SystemExit("[kk-wiki] `requests` 패키지가 필요합니다: py -3 -m pip install requests  (macOS/Linux: python3 -m pip install requests)")
        s = requests.Session()
        s.headers.update({"Authorization": f"dooray-api {load_token()}", "Accept": "application/json", "User-Agent": "kiki-kk-wiki/0.1"})
        # TLS 는 기본 검증(토큰이 오간다). 사내 SSL 검사 프록시 때문에 실패하면 REQUESTS_CA_BUNDLE 로 사내 인증서를 지정하거나,
        # 정말 임시로만 KIKI_INSECURE_TLS=1 (경고 출력). 2026-09-27 KIST 사내망 실측: 검증 켠 채로 api.gov-dooray.com 정상.
        if os.environ.get("KIKI_INSECURE_TLS", "").strip() in ("1", "true", "yes"):
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            s.verify = False
            print("[kk-wiki] 경고: KIKI_INSECURE_TLS 로 TLS 검증을 껐습니다(토큰 노출 위험) — 임시로만 쓰세요.", file=sys.stderr)
        _session = s
    return _session


_FAILS: list = []   # 이번 실행에서 끝내 실패한 요청 경로 (crawl 이 삭제 단계를 건너뛰는 근거)


def api_get(path: str, params: dict | None = None) -> dict:
    for i in range(5):
        try:
            r = api().get(API + path, params=params, timeout=30)
            if r.status_code in (429, 500, 502, 503):
                time.sleep(2 + 2 * i); continue
            if r.status_code == 401:
                raise SystemExit("[kk-wiki] 401 — 토큰이 만료됐거나 잘못됐습니다. https://kist.gov-dooray.com/setting/api/token 에서 재발급 후 token.txt 갱신.")
            return r.json()
        except SystemExit:
            raise
        except Exception as e:
            if "SSL" in type(e).__name__ or "certificate" in str(e).lower():
                raise SystemExit("[kk-wiki] TLS 인증서 검증 실패 — 사내 SSL 검사 프록시라면 REQUESTS_CA_BUNDLE 에 사내 루트 인증서를 지정하세요. "
                                 "(임시 우회: 환경변수 KIKI_INSECURE_TLS=1 — 토큰 노출 위험)")
            print(f"  retry {i}: {str(e)[:100]}", flush=True); time.sleep(2 + 2 * i)
    _FAILS.append(path)
    return {}


def children(wiki: str, pid: str) -> list:
    out, page = [], 0
    while True:
        d = api_get(f"/wiki/v1/wikis/{wiki}/pages", {"parentPageId": pid, "size": 100, "page": page})
        time.sleep(0.22)
        res = d.get("result")
        if isinstance(res, dict):
            res = res.get("contents") or res.get("pages") or []
        res = res or []
        out.extend(res)
        if len(res) < 100:
            break
        page += 1
    return out


def get_page(wiki: str, pid: str) -> dict:
    d = api_get(f"/wiki/v1/wikis/{wiki}/pages/{pid}")
    time.sleep(0.22)
    return d.get("result") or {}


# ---------- 정규화 (API 원본 / 브라우저 export 공통) ----------
def normalize(raw: dict, wiki: str) -> dict:
    pid = str(raw.get("id") or raw.get("pageId") or "")
    lu = raw.get("lastUpdate") or {}
    cr = raw.get("create") or {}
    body = raw.get("body")
    if isinstance(body, dict):
        body = body.get("content") or ""
    body = body or ""
    files = []
    for f in raw.get("files") or []:
        if isinstance(f, dict):
            files.append({"id": str(f.get("id") or ""), "name": f.get("name") or f.get("fileName") or "", "size": f.get("size")})
    return {
        "id": pid,
        "title": raw.get("subject") or raw.get("title") or pid,
        "parent": str(raw.get("_parent") or raw.get("parent") or raw.get("parentPageId") or ""),
        "depth": raw.get("_depth", raw.get("depth", 0)),
        "path": raw.get("_path") or raw.get("path") or [raw.get("subject") or pid],
        "updatedAt": raw.get("updatedAt") or lu.get("dateTime") or "",
        "updatedBy": raw.get("updatedBy") or (lu.get("member") or {}).get("name") or (raw.get("lastUpdater") or {}).get("name") or "",
        "createdAt": raw.get("createdAt") or cr.get("dateTime") or "",
        "version": raw.get("version"),
        "body": body,
        "files": files,
        "images": raw.get("images") if isinstance(raw.get("images"), int) else len(raw.get("images") or []),
        "restricted": bool(raw.get("restricted")),
        "url": raw.get("url") or f"{WEB}/wiki/{wiki}/{pid}",
    }


# ---------- 파일 저장 ----------
_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe_seg(seg: str, n: int = 60) -> str:
    s = _BAD.sub("_", str(seg)).strip().rstrip(".")
    s = re.sub(r"\s+", " ", s)
    return (s[:n].rstrip() or "untitled")


def norm_text(t: str) -> str:
    return re.sub(r"\s+", " ", t or "").strip()


def sha(t: str) -> str:
    return hashlib.sha1(norm_text(t).encode("utf-8")).hexdigest()[:16]


def _fkey(p: str) -> str:
    """파일 경로 비교 키 — Windows·macOS 는 대소문자를 안 가리고 macOS 는 한글을 분해해 저장하므로 정규화해 비교."""
    import unicodedata
    return unicodedata.normalize("NFC", os.path.abspath(p)).casefold()


def yaml_str(s) -> str:
    return json.dumps(str(s if s is not None else ""), ensure_ascii=False)


def build(root: str, wiki: str, home: str, quiet: bool = False) -> dict:
    rawdir = os.path.join(root, "raw")
    if not os.path.isdir(rawdir):
        raise SystemExit(f"[kk-wiki] raw/ 가 없습니다: {rawdir} — 먼저 crawl 또는 import 를 하세요.")
    prev = {}
    pidx = os.path.join(root, "index.json")
    if os.path.exists(pidx):
        try:
            prev = {p["id"]: p for p in json.load(open(pidx, encoding="utf-8")).get("pages", [])}
        except Exception:
            prev = {}
    recs = []
    for fn in sorted(os.listdir(rawdir)):
        if not fn.endswith(".json"):
            continue
        try:
            raw = json.load(open(os.path.join(rawdir, fn), encoding="utf-8"))
        except Exception as e:
            print(f"  skip {fn}: {e}"); continue
        recs.append(normalize(raw, wiki))
    # 트리 순서: 원본 order(_order) 가 있으면 그것, 없으면 path 정렬
    recs.sort(key=lambda r: (r.get("_order", 0), [safe_seg(x) for x in r["path"]]))
    pagesdir = os.path.join(root, "pages")
    os.makedirs(pagesdir, exist_ok=True)
    # 기존 md 정리(삭제 페이지 잔재 방지): 이번 build 가 쓰는 파일만 남긴다
    written = set()
    used = set()
    index = []
    for r in recs:
        segs = [safe_seg(x) for x in r["path"]] or [safe_seg(r["title"])]
        rel = "/".join(segs) + ".md"
        if len(os.path.join(root, "pages", rel)) > 230:
            rel = f"_long/{r['id']}_{safe_seg(r['title'], 40)}.md"
        if rel.lower() in used:
            rel = rel[:-3] + f" ({r['id'][-6:]}).md"
        used.add(rel.lower())
        fp = os.path.join(pagesdir, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        fm = ["---",
              f"title: {yaml_str(r['title'])}",
              f"id: {yaml_str(r['id'])}",
              f"path: {yaml_str('/'.join(r['path']))}",
              f"url: {r['url']}",
              f"updated: {r['updatedAt']}",
              f"updated_by: {yaml_str(r['updatedBy'])}",
              f"created: {r['createdAt']}",
              f"version: {r['version'] if r['version'] is not None else ''}",
              f"files: {json.dumps([f['name'] for f in r['files']], ensure_ascii=False)}",
              "---", ""]
        with io.open(fp, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(fm) + (r["body"] or "").replace("\r\n", "\n") + "\n")
        written.add(_fkey(fp))
        index.append({"id": r["id"], "title": r["title"], "parent": r["parent"], "depth": r["depth"], "path": "/".join(r["path"]),
                      "rel": rel, "url": r["url"], "updatedAt": r["updatedAt"], "createdAt": r["createdAt"], "updatedBy": r["updatedBy"],
                      "version": r["version"], "len": len(r["body"] or ""), "sha": sha(r["body"]), "files": [f["name"] for f in r["files"]],
                      "restricted": r["restricted"]})
    # 잔재 md 삭제
    for dp, _, fns in os.walk(pagesdir):
        for fn in fns:
            ap = os.path.join(dp, fn)
            if fn.endswith(".md") and _fkey(ap) not in written:
                try:
                    os.remove(ap)
                except Exception:
                    pass
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    meta = {"space_id": wiki, "home_page_id": home, "built_at": now, "count": len(index), "pages": index}
    json.dump(meta, open(pidx, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # index.md (열람용)
    lines = [f"# KIST Wiki 2.0 스냅샷 — {now[:10]} · {len(index)} 페이지", "",
             "형식: `- [수정일] 경로 (글자수, 첨부 n) → pages/상대경로`. 검색은 `wiki_search.py`, 인용 전 최신 확인은 `wiki_snapshot.py fresh <id>`.", ""]
    for p in index:
        att = f", 첨부 {len(p['files'])}" if p["files"] else ""
        lines.append(f"- [{(p['updatedAt'] or '')[:10] or '----------'}] {p['path']} ({p['len']}자{att}) → pages/{p['rel']}  `{p['id']}`")
    io.open(os.path.join(root, "index.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    # 변경 리포트
    rep = changes_report(prev, {p["id"]: p for p in index})
    if rep:
        cp = os.path.join(root, f"CHANGES_{time.strftime('%y%m%d')}.md")
        io.open(cp, "w", encoding="utf-8", newline="\n").write(rep)
    if not quiet:
        print(f"[kk-wiki] build 완료: {len(index)} 페이지 → {pagesdir}")
        if rep:
            print(rep.splitlines()[1])
    return meta


def changes_report(prev: dict, cur: dict) -> str:
    if not prev:
        return ""
    added = [k for k in cur if k not in prev]
    removed = [k for k in prev if k not in cur]
    # sha 는 양쪽에 있을 때만 비교(구형 baseline 은 sha 없음) — 없으면 updatedAt 변화로 판정
    changed = [k for k in cur if k in prev and ((prev[k].get("sha") and cur[k].get("sha") != prev[k].get("sha"))
                                                or (cur[k].get("updatedAt") or "") != (prev[k].get("updatedAt") or ""))]
    srt = lambda ks: sorted(ks, key=lambda k: cur.get(k, prev.get(k, {})).get("updatedAt", ""), reverse=True)
    line = lambda k: f"- [{(cur[k].get('updatedAt') or '')[:10]}] {cur[k]['path']} ({cur[k]['len']}자) `{k}`"
    out = [f"# 변경 리포트 — {time.strftime('%Y-%m-%d %H:%M')}",
           f"- 현재 {len(cur)} / 이전 {len(prev)} / 신규 {len(added)} / 삭제 {len(removed)} / 변경 {len(changed)}", ""]
    out += [f"## 신규 ({len(added)})"] + [line(k) for k in srt(added)] + [""]
    out += [f"## 변경 ({len(changed)})"] + [line(k) for k in srt(changed)] + [""]
    out += [f"## 삭제 ({len(removed)})"] + [f"- {prev[k].get('path') or prev[k].get('title')} `{k}`" for k in removed] + [""]
    return "\n".join(out)


def _retire_raw(rawdir: str, keep: set, force: bool, label: str) -> None:
    """이번 수집에 없는 raw 는 '삭제된 페이지'로 보되 지우지 않고 raw/_old_<시각>/ 로 옮긴다.
    실패한 요청이 있었거나 새 수집이 기존의 절반도 안 되면(--force 없이) 옮기지도 않는다 — 스냅샷을 통째로 잃는 사고 방지(2026-09-27)."""
    old = [fn for fn in os.listdir(rawdir) if fn.endswith(".json")]
    gone = [fn for fn in old if fn not in keep]
    if not gone:
        return
    if _FAILS:
        print(f"[kk-wiki] ⚠ 요청 {len(_FAILS)}건이 실패해 기존 페이지 {len(gone)}건은 그대로 둡니다(삭제 판정 보류). 다시 {label} 하세요.", flush=True)
        return
    if len(keep) < max(1, len(old)) / 2 and not force:
        print(f"[kk-wiki] ⚠ 새로 받은 페이지({len(keep)})가 기존({len(old)})의 절반도 안 됩니다 — 기존 페이지를 그대로 둡니다. "
              f"정말 줄어든 게 맞으면 `--force` 로 다시 {label} 하세요.", flush=True)
        return
    old_dir = os.path.join(rawdir, "_old_" + time.strftime("%y%m%d_%H%M%S"))
    os.makedirs(old_dir, exist_ok=True)
    for fn in gone:
        os.replace(os.path.join(rawdir, fn), os.path.join(old_dir, fn))
    print(f"[kk-wiki] 위키에서 사라진 페이지 {len(gone)}건은 {old_dir} 에 보관(필요 없으면 지워도 됨)", flush=True)


# ---------- crawl (토큰) ----------
def crawl(root: str, wiki: str, home: str, force: bool = False) -> None:
    rawdir = os.path.join(root, "raw")
    os.makedirs(rawdir, exist_ok=True)
    _FAILS.clear()
    seen, order, t0 = set(), [0], time.time()
    print(f"[kk-wiki] 수집 시작 → {root}", flush=True)
    keep = set()

    def save(pid: str, page: dict, path: list, parent: str, depth: int):
        page["_path"] = path; page["_parent"] = parent; page["_depth"] = depth; page["_order"] = order[0]; page["_source"] = "api"
        order[0] += 1
        io.open(os.path.join(rawdir, f"{pid}.json"), "w", encoding="utf-8").write(json.dumps(page, ensure_ascii=False))
        keep.add(f"{pid}.json")

    def walk(pid: str, depth: int, path: list):
        if depth > 30:
            return
        for k in children(wiki, pid):
            cid = str(k.get("id") or k.get("pageId") or "")
            sub = k.get("subject") or k.get("title") or cid
            if not cid or cid in seen or re.match(r"^-{3,}", sub or ""):
                continue
            seen.add(cid)
            page = get_page(wiki, cid)
            if not page:
                print(f"  ! 본문 실패: {sub} ({cid})", flush=True); continue
            save(cid, page, path + [sub], pid, depth)
            print(f"  {'  ' * depth}+ {sub} [{(page.get('updatedAt') or '')[:10]}]", flush=True)
            walk(cid, depth + 1, path + [sub])

    hp = get_page(wiki, home)
    if not hp:
        raise SystemExit("[kk-wiki] Home 페이지를 가져오지 못했습니다 — 토큰·사내망(VPN)·space id 를 확인하세요. 기존 스냅샷은 손대지 않았습니다.")
    save(home, hp, [hp.get("subject") or "Home"], "", 0)
    seen.add(home)
    walk(home, 0, [])
    _retire_raw(rawdir, keep, force, "crawl")
    print(f"[kk-wiki] 수집 완료: {len(keep)} 페이지, {int(time.time() - t0)}초" + (f" (실패 {len(_FAILS)}건 — 다시 crawl 권장)" if _FAILS else ""), flush=True)
    build(root, wiki, home)
    cfg_note(root)


def cfg_note(root: str):
    print(f"[kk-wiki] 스냅샷: {root}  (index.md 로 목록 열람, wiki_search.py 로 검색)")


# ---------- import (브라우저 export) ----------
def import_export(root: str, wiki: str, home: str, path: str, force: bool = False) -> None:
    data = json.load(open(path, encoding="utf-8-sig"))
    pages = data.get("pages") if isinstance(data, dict) else data
    if not isinstance(pages, list):
        raise SystemExit("[kk-wiki] export JSON 형식이 아닙니다 (pages 배열 필요)")
    wiki = data.get("space_id") or wiki if isinstance(data, dict) else wiki
    rawdir = os.path.join(root, "raw")
    os.makedirs(rawdir, exist_ok=True)
    keep = set()
    n_err = 0
    _FAILS.clear()
    for i, p in enumerate(pages):
        pid = str(p.get("id") or "")
        if not pid:
            continue
        if p.get("error") and not (p.get("body") or ""):          # 브라우저에서 본문을 못 받은 페이지 — 기존 raw 를 덮지 않는다
            n_err += 1; _FAILS.append(pid); continue
        p = dict(p); p["_order"] = i; p["_source"] = "browser"
        p.setdefault("_path", p.get("path")); p.setdefault("_parent", p.get("parent")); p.setdefault("_depth", p.get("depth", 0))
        io.open(os.path.join(rawdir, f"{pid}.json"), "w", encoding="utf-8").write(json.dumps(p, ensure_ascii=False))
        keep.add(f"{pid}.json")
    _retire_raw(rawdir, keep, force, "import")
    print(f"[kk-wiki] import: {len(keep)} 페이지" + (f" (본문 없는 오류 항목 {n_err}건은 건너뜀)" if n_err else ""))
    build(root, wiki, home)
    cfg_note(root)


# ---------- fresh (토큰) ----------
def fresh(root: str, wiki: str, home: str, ids: list, update: bool) -> None:
    pidx = os.path.join(root, "index.json")
    idx = {p["id"]: p for p in json.load(open(pidx, encoding="utf-8")).get("pages", [])} if os.path.exists(pidx) else {}
    changed = []
    for pid in ids:
        page = get_page(wiki, pid)
        if not page:
            print(f"{pid}: 조회 실패(삭제됐거나 권한 없음)"); continue
        cur, old = page.get("updatedAt") or "", (idx.get(pid) or {}).get("updatedAt") or ""
        same = bool(old) and cur == old and page.get("version") == (idx.get(pid) or {}).get("version")
        print(f"{pid}: {'SAME' if same else 'CHANGED'} 로컬 {old[:19] or '-'} → 서버 {cur[:19] or '-'} (v{(idx.get(pid) or {}).get('version')}→v{page.get('version')})  {page.get('subject', '')}")
        if not same:
            changed.append((pid, page))
    if update and changed:
        rawdir = os.path.join(root, "raw")
        os.makedirs(rawdir, exist_ok=True)
        for pid, page in changed:
            old = idx.get(pid) or {}
            try:
                prev_raw = json.load(open(os.path.join(rawdir, f"{pid}.json"), encoding="utf-8"))
            except Exception:
                prev_raw = {}
            # 경로는 이전 raw 의 _path 를 그대로(제목에 '/' 가 있어도 안 쪼개짐), 없으면 index 의 path
            page["_path"] = prev_raw.get("_path") or (old.get("path", page.get("subject", pid)).split("/") if old else [page.get("subject", pid)])
            page["_parent"] = old.get("parent", ""); page["_depth"] = old.get("depth", 0); page["_source"] = "api"
            page["_order"] = prev_raw.get("_order", 0)
            io.open(os.path.join(rawdir, f"{pid}.json"), "w", encoding="utf-8").write(json.dumps(page, ensure_ascii=False))
        build(root, wiki, home, quiet=True)
        print(f"[kk-wiki] {len(changed)} 페이지 재수집·반영 완료")
    elif changed:
        print(f"[kk-wiki] {len(changed)} 페이지가 서버와 다릅니다 — `fresh ... --update` 로 재수집하세요.")


def attach(root: str, wiki: str, ids: list, max_mb: float) -> None:
    """첨부 파일 다운로드(토큰) → attachments/<pageId>/<파일명>. 공식 API 는 api.* → 307 → file-api.* 로 Authorization 을 직접 들고 가야 한다."""
    api()   # requests 없으면 여기서 설치 안내로 멈춤
    pidx = os.path.join(root, "index.json")
    pages = json.load(open(pidx, encoding="utf-8")).get("pages", []) if os.path.exists(pidx) else []
    targets = [p for p in pages if p.get("files") and (not ids or p["id"] in ids)]
    rawdir = os.path.join(root, "raw")
    n_ok = n_skip = n_err = 0
    for p in targets:
        try:
            raw = json.load(open(os.path.join(rawdir, f"{p['id']}.json"), encoding="utf-8"))
        except Exception:
            continue
        outdir = os.path.join(root, "attachments", p["id"])
        for f in raw.get("files") or []:
            fid, name = str(f.get("id") or ""), safe_seg(f.get("name") or fid, 120)
            if not fid:
                continue
            size = f.get("size") or 0
            dest = os.path.join(outdir, name)
            if os.path.exists(dest):
                n_skip += 1; continue
            if size and size > max_mb * 1024 * 1024:
                print(f"  skip(>{max_mb}MB) {p['path']} / {name}"); n_skip += 1; continue
            try:
                r0 = api().get(f"{API}/wiki/v1/wikis/{wiki}/pages/{p['id']}/files/{fid}", params={"media": "raw"}, allow_redirects=False, timeout=30)
                loc = r0.headers.get("Location") or ""
                if loc and not re.match(r"^https://[a-z0-9.-]+\.gov-dooray\.com/", loc):   # 토큰은 dooray 호스트에만
                    raise RuntimeError("리다이렉트 주소가 dooray 가 아님: " + loc[:60])
                r1 = api().get(loc, timeout=120) if loc else r0
                r1.raise_for_status()
                os.makedirs(outdir, exist_ok=True)
                open(dest, "wb").write(r1.content)
                n_ok += 1
                print(f"  + {p['path']} / {name} ({len(r1.content) // 1024} KB)", flush=True)
            except Exception as e:
                n_err += 1; print(f"  ! {p['path']} / {name}: {str(e)[:80]}", flush=True)
            time.sleep(0.3)
    print(f"[kk-wiki] 첨부: 받음 {n_ok}, 건너뜀 {n_skip}, 실패 {n_err} → {os.path.join(root, 'attachments')}")


def status(root: str) -> None:
    pidx = os.path.join(root, "index.json")
    if not os.path.exists(pidx):
        print(f"[kk-wiki] 스냅샷 없음: {root} — `crawl`(토큰) 또는 브라우저 export 후 `import`"); return
    m = json.load(open(pidx, encoding="utf-8"))
    pages = m.get("pages", [])
    latest = sorted(pages, key=lambda p: p.get("updatedAt", ""), reverse=True)[:5]
    print(f"[kk-wiki] {root}: {len(pages)} 페이지, build {m.get('built_at')}, 첨부 있는 페이지 {sum(1 for p in pages if p.get('files'))}")
    for p in latest:
        print(f"  최근 수정 [{(p.get('updatedAt') or '')[:10]}] {p['path']}")


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["crawl", "import", "build", "fresh", "attach", "status"])
    ap.add_argument("args", nargs="*")
    ap.add_argument("--root")
    ap.add_argument("--wiki", default=None)
    ap.add_argument("--home", default=None)
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--max-mb", type=float, default=30.0, help="attach: 이보다 큰 첨부는 건너뜀")
    ap.add_argument("--force", action="store_true", help="crawl/import: 새 수집이 기존의 절반 미만이어도 기존 페이지를 _old 로 보관")
    a = ap.parse_intermixed_args(argv)
    cfg = _skill_config()
    wiki = a.wiki or cfg.get("space_id") or DEFAULT_WIKI
    home = a.home or cfg.get("home_page_id") or DEFAULT_HOME
    root = snapshot_root(a.root)
    os.makedirs(root, exist_ok=True)
    if a.cmd == "crawl":
        crawl(root, wiki, home, a.force)
    elif a.cmd == "import":
        if not a.args:
            raise SystemExit("import <export.json>")
        import_export(root, wiki, home, a.args[0], a.force)
    elif a.cmd == "build":
        build(root, wiki, home)
    elif a.cmd == "fresh":
        if not a.args:
            raise SystemExit("fresh <pageId...> [--update]")
        fresh(root, wiki, home, a.args, a.update)
    elif a.cmd == "attach":
        attach(root, wiki, a.args, a.max_mb)
    elif a.cmd == "status":
        status(root)


if __name__ == "__main__":
    main()
