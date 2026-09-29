# -*- coding: utf-8 -*-
"""kk-dry 쓰기·파일 주고받기 — Dooray 공식 API(개인 토큰)로 업무 글·댓글·첨부, 드라이브 올리기·내려받기.

찾기(검색·본문·댓글 읽기)는 브라우저 코어(kk_dry_ops.js)가 세션으로 빠르게 하고, 글을 쓰거나 파일을 PC 와 주고받는 일은
이 스크립트가 한다. 업로드는 세션 쿠키로 되지 않고 토큰이 필요하다(kk-pay 실측) — kk-pay·kk-wiki 와 같은 token.txt 를 쓴다.

⚠️ 쓰기·내려받기 명령은 전부 기본이 '미리보기'다 — 무엇을 어디에 할지 보여주고 아무것도 하지 않는다.
   사용자가 확인하면 같은 명령 끝에 --yes 를 붙여 다시 부른다. 토큰 값은 어디에도 출력하지 않는다.

명령 (<업무> = 업무 링크 https://kist.gov-dooray.com/task/{프로젝트}/{업무} · <드라이브> = 드라이브 링크 또는 private):
  check                                          토큰·인증 확인(값 출력 없음)
  resolve <링크>                                  링크 → 프로젝트·업무·드라이브·폴더·파일 id
  projects [--q 글자] [--refresh]                  내 프로젝트(이름·id·드라이브 id) — 캐시(7일)
  members <이름> [--project <이름|링크|id>]         사람 → 멤버 id (여러 명이면 후보만)
  task-files <업무>                               업무 첨부 목록
  task-download <업무> [--file id…|--all] [--to 폴더] [--yes]
  task-attach <업무> 파일… [--yes]
  task-comment <업무> (--text 글 | --text-file 파일) [--yes]
  task-create --project <이름|링크|id> --subject 제목 [--text 글 | --text-file 파일] [--to 이름…] [--cc 이름…] [--attach 파일…] [--yes]
  drive-ls <드라이브> [--q 글자]
  drive-upload <드라이브 폴더> 파일… [--as-copy | --new-version] [--yes]
  drive-download <드라이브 파일…> [--to 폴더] [--yes]
출력 끝줄 [요약] 으로 결과를 확인한다. 종료 코드: 0 정상·미리보기 / 1 오류 / 2 사용자가 골라야 함(사람·프로젝트가 여럿 등).
TLS: 기본은 인증서 검증(사내 프록시로 실패할 때만 KIKI_INSECURE_TLS=1).
"""
from __future__ import annotations
import argparse, io, json, mimetypes, os, re, sys, time
from urllib.parse import urlsplit
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
try:
    import requests
except ImportError:
    sys.exit("[kiki] requests 패키지가 필요합니다: python -m pip install requests  (macOS/Linux: python3 -m pip install --user requests)")

API = os.environ.get("KIKI_DOORAY_API", "https://api.gov-dooray.com").rstrip("/")   # KIKI_DOORAY_API 는 오프라인 시험(가짜 서버)용
WEB = "https://kist.gov-dooray.com"
VERIFY_TLS = os.environ.get("KIKI_INSECURE_TLS", "").strip() not in ("1", "true", "yes")
if not VERIFY_TLS:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    print("[kiki] 경고: KIKI_INSECURE_TLS 가 켜져 있어 TLS 인증서를 검증하지 않습니다(토큰 노출 위험) — 사내 프록시 문제일 때만 임시로 쓰세요.", file=sys.stderr)
CACHE_DAYS = 7
CACHE_VER = 2
MEMBER_PAGES = 30   # 프로젝트 멤버는 100명씩 이 쪽 수까지(3,000명) — 넘으면 '멤버 아님'으로 단정하지 않고 멈춘다


class Stop(Exception):
    """사용자에게 그대로 보여줄 한 줄 오류(코드 1) — code 2 는 사용자가 골라야 하는 경우."""
    def __init__(self, msg: str, code: int = 1):
        super().__init__(msg)
        self.code = code


# ---------- 설정 폴더·토큰 (kk-pay dooray_drive.py 와 같은 규칙 — _shared 를 import 하지 않고 복제: Codex 설치본엔 _shared 가 없을 수 있다) ----------
def _default_root() -> str:
    return r"C:\kiki" if sys.platform.startswith("win") else os.path.expanduser("~/kiki")


def _kiki_homes() -> list:
    """개인 설정 폴더 후보(앞이 우선): KIKI_HOME > KIKI_AGENT=claude|codex > 설치 위치(~/.codex/skills/… 면 Codex) > 실행 환경 > Claude, Codex."""
    home = os.environ.get("KIKI_HOME", "").strip()
    if home:
        return [os.path.normpath(os.path.expanduser(home))]
    claude, codex = (os.path.normpath(os.path.expanduser(x)) for x in ("~/.claude/kiki", "~/.codex/kiki"))
    who = os.environ.get("KIKI_AGENT", "").strip().lower()
    if who not in ("claude", "codex"):
        parts = os.path.abspath(__file__).replace("\\", "/").lower().split("/")
        who = next((a[1:] for a, b in zip(parts, parts[1:]) if a in (".claude", ".codex") and b == "skills"), "")
    if not who:
        who = "claude" if os.environ.get("CLAUDECODE") else ("codex" if any(k.startswith("CODEX_") for k in os.environ) else "")
    return [codex, claude] if who == "codex" else [claude, codex]


def _kiki_root() -> str:
    r = os.environ.get("KIKI_ROOT", "").strip()
    if r:
        return os.path.expanduser(r)
    for p in [os.path.join(h, "kiki.config.json") for h in _kiki_homes()]:
        if os.path.exists(p):
            try:
                r = (json.load(open(p, encoding="utf-8-sig")).get("kiki_root") or "").strip()
            except Exception as e:
                print(f"[kiki] 경고: {p} 를 읽지 못했습니다({type(e).__name__}) — 기본 kiki 폴더를 씁니다.", file=sys.stderr)
                r = ""
            if r:
                return os.path.expanduser(r)
    return _default_root()


def _read_text(p: str) -> str:
    raw = open(p, "rb").read()
    for enc in ("utf-8-sig", "utf-16", "cp949"):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode("utf-8", errors="ignore")


def _token_from_file(p: str) -> str:
    """token.txt('Dooray token:' 다음 줄 또는 같은 줄) 또는 kiki.env(DOORAY_TOKEN=...) 에서 토큰. 없으면 ''."""
    try:
        lines = _read_text(p).splitlines()
    except Exception:
        return ""
    body = [ln.strip() for ln in lines if ln.strip() and not ln.lstrip().startswith("#")]

    def _tok(x: str) -> str:
        x = str(x or "").strip().strip('"').strip("'")
        return x if len(x) >= 20 and " " not in x and "://" not in x else ""
    for i, ln in enumerate(body):
        if ln.upper().startswith("DOORAY_TOKEN="):
            t = _tok(ln.split("=", 1)[1])
            if t:
                return t
        if ln.lower().startswith("dooray token"):
            t = _tok(ln.split(":", 1)[1] if ":" in ln else "") or (_tok(body[i + 1]) if i + 1 < len(body) else "")
            if t:
                return t
    for ln in body:
        t = _tok(ln)
        if t:
            return t
    return ""


def _token_candidates() -> list:
    root = _kiki_root()
    c = [os.path.join(root, "token.txt")] if root else []
    for h in _kiki_homes():
        c += [os.path.join(h, "token.txt"), os.path.join(h, "kiki.env")]
    return c


def _token_hint() -> str:
    where = os.path.join(_kiki_root(), "token.txt")
    return (f"dooray 토큰이 필요합니다(쓰기·파일 주고받기). {where} 의 'Dooray token:' 다음 줄에 토큰을 붙여넣고 저장하세요 "
            "(발급: https://kist.gov-dooray.com/setting/api/token). 채팅창에는 붙여넣지 마세요(노출 위험). 찾기·읽기는 토큰 없이 됩니다.")


def _find_token() -> tuple:
    t = os.environ.get("DOORAY_TOKEN", "").strip()
    if t:
        return t, "환경변수 DOORAY_TOKEN"
    for p in _token_candidates():
        if os.path.exists(p):
            t = _token_from_file(p)
            if t and " " not in t:
                return t, p
    return "", ""


def _downloads_dir() -> str:
    """kk-budget·kk-wiki 와 같은 규칙: KIKI_DOWNLOADS → (Windows) 레지스트리의 '다운로드' 폴더 → ~/Downloads."""
    d = os.environ.get("KIKI_DOWNLOADS", "").strip()
    if d:
        return os.path.expanduser(d)
    if os.name == "nt":
        try:
            import winreg
            k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders")
            v, _ = winreg.QueryValueEx(k, "{374DE290-123F-4565-9164-39C4925E467B}")
            return os.path.expandvars(v)
        except Exception:
            pass
    return os.path.join(os.path.expanduser("~"), "Downloads")


# ---------- 링크 → id (웹 주소의 번호가 곧 API id: 프로젝트·업무·폴더·파일. 드라이브 id 만 프로젝트 정보에서) ----------
def parse_task(x: str) -> tuple:
    s = str(x or "").strip()
    m = re.search(r"/task/(\d{6,})/(\d{6,})", s) or re.fullmatch(r"(\d{6,})[/:](\d{6,})", s)
    if m:
        return m.group(1), m.group(2)
    raise Stop("업무 링크가 아닙니다(https://kist.gov-dooray.com/task/{프로젝트}/{업무} 꼴): " + s[:80])


def parse_drive(x: str) -> dict:
    """{'private':True} | {'project':P, 'kind':'root'|'folder'|'view', 'id':…}. view = 파일 또는 폴더(찾기 결과 링크).
    파일 링크는 …/drive/{P}/{부모 폴더}/views/{파일}(파일이 선택된 채 열림, 2026-09-29) 또는 …/drive/{P}/views/{파일}[?query=…] — 둘 다 파일로 읽는다
    (앞 꼴을 폴더 링크로 잘못 읽으면 받기가 '폴더입니다'로 멈추고 올리기는 엉뚱한 폴더로 간다)."""
    s = str(x or "").strip()
    if s.lower().replace(" ", "") in ("private", "my", "mydrive", "내드라이브"):
        return {"private": True, "kind": "root", "id": ""}
    m = re.search(r"/drive/(\d{6,})/(?:(\d{6,})/)?views/(\d{6,})", s)
    if m:
        return {"project": m.group(1), "kind": "view", "id": m.group(3), "folder": m.group(2) or ""}
    m = re.search(r"/drive/(\d{6,})/(\d{6,})", s)
    if m:
        return {"project": m.group(1), "kind": "folder", "id": m.group(2)}
    m = re.search(r"/drive/(\d{6,})(?:[/?#]|$)", s)
    if m:
        return {"project": m.group(1), "kind": "root", "id": ""}
    raise Stop("드라이브 링크가 아닙니다(https://kist.gov-dooray.com/drive/{프로젝트}/… 또는 private): " + s[:80])


# ---------- 파일 이름·크기 ----------
_BAD = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def safe_name(name: str, limit: int = 150) -> str:
    n = _BAD.sub("_", str(name or "").strip()).rstrip(". ") or "file"
    if len(n) > limit:
        stem, ext = os.path.splitext(n)
        n = stem[: limit - len(ext)] + ext
    return n


def free_path(folder: str, name: str, taken: set | None = None) -> str:
    """같은 이름이 있으면 ' (2)'·' (3)' — 덮어쓰지 않는다."""
    stem, ext = os.path.splitext(name)
    p, k = os.path.join(folder, name), 2
    while os.path.exists(p) or (taken is not None and p.lower() in taken):
        p = os.path.join(folder, f"{stem} ({k}){ext}")
        k += 1
    if taken is not None:
        taken.add(p.lower())
    return p


def kb(n) -> str:
    n = int(n or 0)
    return f"{n / 1048576:.1f}MB" if n >= 1048576 else (f"{round(n / 1024)}KB" if n >= 1024 else f"{n}B")


def _head(text: str, n: int = 80) -> str:
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    return t[:n] + ("…" if len(t) > n else "")


# ---------- API ----------
_ORIGIN = "{0.scheme}://{0.netloc}".format(urlsplit(API))


def _redirect_ok(loc: str) -> bool:
    """토큰은 dooray 호스트(https://*.gov-dooray.com)로만 보낸다 — 파일 호스트 리다이렉트(307) 따라갈 때."""
    return bool(re.match(r"^https://[a-z0-9.-]+\.gov-dooray\.com/", loc or "")) or (bool(loc) and loc.startswith(_ORIGIN + "/"))


def _check(r, what: str) -> dict:
    if r.status_code in (401, 403):
        raise Stop(f"{what}: dooray 토큰이 만료됐거나 권한이 없습니다(HTTP {r.status_code}). 새 토큰을 발급해 token.txt 에 다시 저장하세요: https://kist.gov-dooray.com/setting/api/token")
    if r.status_code == 429:
        raise Stop(f"{what}: dooray API 속도 제한(429) — 잠시 뒤 다시.")
    try:
        d = r.json()
    except ValueError:
        raise Stop(f"{what}: dooray 응답이 JSON 이 아닙니다(HTTP {r.status_code}) — 사내망/VPN 을 확인하세요.")
    hdr = d.get("header") or {}
    if r.status_code >= 400 or hdr.get("isSuccessful") is False:
        raise Stop(f"{what} 실패(HTTP {r.status_code}): {hdr.get('resultMessage') or hdr.get('resultCode') or r.text[:120]}")
    return d


class Dooray:
    def __init__(self):
        tok, _ = _find_token()
        if not tok:
            raise Stop(_token_hint())
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"dooray-api {tok}", "Accept": "application/json"})
        self.cache_path = os.path.join(_kiki_homes()[0], "kk-dry.cache.json")
        old = os.path.join(_kiki_homes()[0], "kk-dooray.cache.json")   # skill 개명(kk-dooray → kk-dry, 2026-09-29) 전 캐시
        if not os.path.exists(self.cache_path) and os.path.exists(old):
            try:
                os.replace(old, self.cache_path)
            except OSError:
                pass
        self._cache = None

    def _req(self, method: str, url: str, *, params=None, json_body=None, files=None, stream=False, timeout=30):
        url = url if url.startswith("http") else API + url
        for k in range(4):
            r = self.s.request(method, url, params=params, json=json_body, files=files, allow_redirects=False,
                               verify=VERIFY_TLS, timeout=timeout, stream=stream)
            if r.status_code != 429 or k == 3:
                return r
            time.sleep(1.5 * (k + 1))

    def call(self, method: str, path: str, what: str, **kw) -> dict:
        return _check(self._req(method, path, **kw), what)

    def follow(self, method: str, path: str, what: str, *, params=None, files=None, stream=False, timeout=120):
        """파일 받기·올리기: api → 307 → file-api 로 토큰을 들고 한 번 더(kk-pay·kk-wiki 실측). 다른 호스트면 멈춘다.
        파일 호스트가 다시 넘기면(3xx) 같은 확인(dooray 호스트만)을 거쳐 모두 3번까지 따라가고, 그래도 끝나지 않으면 멈춘다(Codex 검토 M2)."""
        r = self._req(method, path, params=params, files=files, stream=stream, timeout=30)
        for _ in range(3):
            if r.status_code not in (301, 302, 303, 307, 308):
                return r
            loc = r.headers.get("Location") or ""
            if not _redirect_ok(loc):
                raise Stop(f"{what}: 파일 주소가 dooray 가 아닙니다 — 토큰을 보내지 않고 멈춥니다({loc[:60]})")
            if r.status_code not in (307, 308):
                method, files = "GET", None
            r = self._req(method, loc, files=files, stream=stream, timeout=timeout)
        if r.status_code in (301, 302, 303, 307, 308):
            raise Stop(f"{what}: 파일 주소 넘기기가 끝나지 않습니다(3번 넘음) — 받지 않고 멈춥니다")
        return r

    # ----- 캐시(내 프로젝트·드라이브 id) — 사람마다 다르므로 skill 이 아니라 설정 폴더에 -----
    # 2026-09-29 사용자 지적: 캐시에 본인 이름·개인 프로젝트 코드(@아이디)가 남았다 → 번호만 저장한다(v2).
    #   본인 = 멤버 id 만(이름은 필요할 때 조회하고 저장하지 않음), 개인 프로젝트 코드 = '(개인)'. v2 가 아닌 옛 캐시는 버리고 새로 받는다.
    def cache(self) -> dict:
        if self._cache is None:
            try:
                self._cache = json.load(open(self.cache_path, encoding="utf-8"))
            except Exception:
                self._cache = {}
            if self._cache.get("v") != CACHE_VER:
                self._cache = {"v": CACHE_VER}
        return self._cache

    def save_cache(self):
        try:
            os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
            tmp = self.cache_path + ".tmp"
            json.dump(self._cache or {}, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            os.replace(tmp, self.cache_path)
        except Exception as e:
            print(f"[kk-dry] 캐시 저장 실패(작업엔 지장 없음): {type(e).__name__}", file=sys.stderr)

    def me(self, with_name: bool = False) -> dict:
        """{'id'} (with_name 이면 이번 실행에서만 'name' 도 — 이름은 캐시에 저장하지 않는다)."""
        c = self.cache()
        if not c.get("me_id") or (with_name and not getattr(self, "_me_name", "")):
            r = self.call("GET", "/common/v1/members/me", "내 정보 조회").get("result") or {}
            c["me_id"], self._me_name = str(r.get("id") or ""), r.get("name") or ""
            self.save_cache()
        return {"id": c["me_id"], "name": getattr(self, "_me_name", "")}

    def projects(self, refresh: bool = False) -> dict:
        """{pid: {code, drive, state, type}} — 내 프로젝트(진행+보관) + 개인 프로젝트. 7일 캐시."""
        c = self.cache()
        fresh = c.get("projects") and time.time() - c.get("projects_at", 0) < CACHE_DAYS * 86400
        if fresh and not refresh:
            return c["projects"]
        out = {}
        for q in ({"member": "me", "state": "active"}, {"member": "me", "state": "archived"}, {"member": "me", "type": "private"}):
            page = 0
            while True:
                d = self.call("GET", "/project/v1/projects", "프로젝트 목록", params=dict(q, page=page, size=100))
                batch = d.get("result") or []
                for p in batch:
                    typ = p.get("type") or ("private" if q.get("type") == "private" else "")
                    out[str(p.get("id"))] = {"code": "(개인)" if typ == "private" else (p.get("code") or ""),   # 개인 프로젝트 코드 = @아이디 → 저장 안 함
                                             "drive": str((p.get("drive") or {}).get("id") or ""),
                                             "state": p.get("state") or q.get("state", ""), "type": typ}
                if len(batch) < 100:
                    break
                page += 1
        c["projects"], c["projects_at"] = out, time.time()
        self.save_cache()
        return out

    def project(self, pid: str) -> dict:
        ps = self.projects()
        if pid in ps and ps[pid].get("drive"):
            return ps[pid]
        r = self.call("GET", f"/project/v1/projects/{pid}", "프로젝트 조회").get("result") or {}   # 캐시에 없는 프로젝트(멤버 아님 등)
        return {"code": r.get("code") or "", "drive": str((r.get("drive") or {}).get("id") or ""), "state": r.get("state") or "", "type": r.get("type") or ""}

    def find_project(self, q: str) -> tuple:
        """이름(code)·링크·id → (pid, info). 여럿이면 Stop(code 2) 로 후보."""
        s = str(q or "").strip()
        m = re.search(r"/(?:task|drive)/(\d{6,})", s) or re.fullmatch(r"(\d{6,})", s)
        if m:
            return m.group(1), self.project(m.group(1))
        for refresh in (False, True):
            ps = self.projects(refresh=refresh)
            exact = [(k, v) for k, v in ps.items() if v["code"] == s]
            if exact:
                return exact[0]
            part = [(k, v) for k, v in ps.items() if s.lower() in v["code"].lower()]
            if len(part) == 1:
                return part[0]
            if len(part) > 1:
                raise Stop("프로젝트가 여럿입니다 — 하나를 골라 다시: " + " / ".join(v["code"] for _, v in part[:12]), 2)
        raise Stop(f"'{s}' 가 든 내 프로젝트가 없습니다(projects --refresh 로 목록 확인)")

    def _pages(self, path: str, what: str, params: dict, size: int, max_pages: int) -> tuple:
        """쪽을 넘겨 끝까지 읽는다 → (목록, 끝까지 읽었나). 한 쪽이 size 보다 적거나 totalCount 에 닿으면 끝."""
        out = []
        for page in range(max_pages):
            d = self.call("GET", path, what, params=dict(params, page=page, size=size))
            res = d.get("result") or []
            out.extend(res)
            total = d.get("totalCount")
            if len(res) < size or (isinstance(total, int) and len(out) >= total):
                return out, True
        return out, False

    def members(self, name: str, pid: str = "") -> tuple:
        """→ (사람 목록, 사람 찾기를 끝까지 읽었나). 같은 이름이 많을 수 있어 쪽을 넘긴다(최대 300명),
        프로젝트 멤버도 끝까지(최대 MEMBER_PAGES×100명 — Codex 검토 M5). 사람 찾기를 끝까지 못 읽으면 호출한 쪽이 단정하지 않는다(재검토 R2)."""
        people, complete = self._pages("/common/v1/members", "사람 찾기", {"name": name}, 100, 3)
        found = [{"id": str(x.get("id")), "name": x.get("name") or "", "email": x.get("externalEmailAddress") or ""} for x in people]
        if pid and found:
            mem, mcomplete = self._pages(f"/project/v1/projects/{pid}/members", "프로젝트 멤버", {}, 100, MEMBER_PAGES)
            ids = {str(x.get("organizationMemberId")) for x in mem}
            for f in found:
                f["inProject"] = True if f["id"] in ids else (False if mcomplete else None)   # None = 끝까지 못 읽어 모름
        return found, complete

    def member_ref(self, name: str, pid: str) -> dict:
        if name in ("나", "me"):
            return {"id": self.me()["id"], "name": "나"}
        found, complete = self.members(name, pid)
        if not complete:   # 같은 이름이 300명 넘게 나와 끝까지 못 봄 — '없음·멤버 아님·한 명'으로 단정하지 않는다(Codex 재검토 R2)
            raise Stop(f"'{name}' 이름으로 찾은 사람이 아주 많아(300명 넘음) 끝까지 확인하지 못했습니다 — Dooray 화면에서 담당·참조를 지정해 주세요", 2)
        inp = [f for f in found if f.get("inProject")]
        if len(inp) == 1:
            return inp[0]
        if not found:
            raise Stop(f"'{name}' 이름의 사람을 찾지 못했습니다 — 이름을 정확히(성+이름) 다시", 2)
        if not inp and any(f.get("inProject") is None for f in found):
            raise Stop(f"'{name}' 이 이 프로젝트 멤버인지 끝까지 확인하지 못했습니다(멤버가 아주 많음) — Dooray 화면에서 담당·참조를 지정해 주세요", 2)
        if not inp:
            raise Stop(f"'{name}' 은 이 프로젝트 멤버가 아닙니다 — 업무 담당·참조는 프로젝트 멤버만(프로젝트에 먼저 추가하거나 다른 사람으로)", 2)
        raise Stop(f"'{name}' 이 이 프로젝트에 여럿입니다 — 메일 주소로 골라 주세요: " + " / ".join(f["email"] or f["id"] for f in inp[:6]), 2)

    # ----- 드라이브 -----
    def drive_of(self, ref: dict) -> tuple:
        """parse_drive 결과 → (driveId, projectId)."""
        if ref.get("private"):
            ps = self.projects()
            pv = [(k, v) for k, v in ps.items() if v.get("type") == "private" and v.get("drive")]
            if not pv:
                pv = [(k, v) for k, v in self.projects(refresh=True).items() if v.get("type") == "private" and v.get("drive")]
            if not pv:
                raise Stop("내 드라이브(개인 프로젝트)를 찾지 못했습니다")
            return pv[0][1]["drive"], pv[0][0]
        info = self.project(ref["project"])
        if not info.get("drive"):
            raise Stop("이 프로젝트에는 드라이브가 없습니다")
        return info["drive"], ref["project"]

    def root_id(self, did: str) -> str:
        c = self.cache().setdefault("roots", {})
        if did not in c:
            res = self.call("GET", f"/drive/v1/drives/{did}/files", "드라이브 최상위 폴더", params={"type": "folder", "subTypes": "root"}).get("result") or []
            if not res:
                raise Stop("드라이브 최상위 폴더를 찾지 못했습니다")
            c[did] = str(res[0].get("id"))
            self.save_cache()
        return c[did]

    def meta(self, did: str, fid: str) -> dict:
        return self.call("GET", f"/drive/v1/drives/{did}/files/{fid}", "드라이브 파일 정보", params={"media": "meta"}).get("result") or {}

    def children(self, did: str, fid: str) -> list:
        out, page = [], 0
        while True:
            d = self.call("GET", f"/drive/v1/drives/{did}/files", "폴더 목록", params={"parentId": fid, "page": page, "size": 100})
            batch = d.get("result") or []
            out += batch
            total = d.get("totalCount")
            if len(batch) < 100 or (total is not None and len(out) >= total):
                return out
            page += 1

    def folder_of(self, x: str) -> tuple:
        """드라이브 링크(폴더·최상위·private, 또는 폴더를 가리키는 views 링크) → (driveId, projectId, folderId, 폴더 이름·경로)."""
        ref = parse_drive(x)
        did, pid = self.drive_of(ref)
        info = self.project(pid)
        where = "내 드라이브 " if ref.get("private") or info.get("type") == "private" else (info.get("code") or pid) + " "   # 어느 드라이브인지 늘 보이게
        if ref["kind"] == "root":
            return did, pid, self.root_id(did), where + "/"
        m = self.meta(did, ref["id"])
        if m.get("type") != "folder":
            raise Stop(f"폴더가 아니라 파일입니다({m.get('name', '')}) — 올릴 곳은 폴더 링크로")
        path = str((m.get("parentFile") or {}).get("path") or "").replace("root", "", 1)
        return did, pid, ref["id"], where + (path.rstrip("/") + "/" + (m.get("name") or "")).replace("//", "/")

    def download(self, path: str, dest: str, what: str) -> int:
        r = self.follow("GET", path, what, params={"media": "raw"}, stream=True)
        if r.status_code >= 400:
            _check(r, what)
        if not 200 <= r.status_code < 300:   # 2xx 가 아니면(3xx 등) 파일로 확정하지 않는다
            raise Stop(f"{what}: 파일 대신 HTTP {r.status_code} 응답 — 저장하지 않습니다")
        ctype = (r.headers.get("Content-Type") or "").lower()
        if "text/html" in ctype and not dest.lower().endswith((".html", ".htm")):   # 로그인·오류 웹 화면
            raise Stop(f"{what}: 파일 대신 웹 화면(HTML)이 왔습니다 — 로그인·권한을 확인하세요. 저장하지 않습니다")
        part, n = dest + ".part", 0
        with open(part, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                if chunk:
                    # 파일 대신 dooray 오류 봉투({"header":{…"isSuccessful":false…}})가 오면 저장하지 않는다(진짜 JSON 파일은 그대로 받는다)
                    if n == 0 and "json" in ctype and b'"header"' in chunk[:600] and b'"isSuccessful":false' in chunk[:600].replace(b" ", b""):
                        f.close(); os.remove(part)
                        raise Stop(f"{what}: 파일 대신 오류 응답이 왔습니다({chunk[:160].decode('utf-8', 'replace')})")
                    f.write(chunk); n += len(chunk)
        os.replace(part, dest)
        return n

    def upload(self, path: str, local: str, what: str, method: str = "POST", params=None, name: str | None = None) -> dict:
        fname = name or os.path.basename(local)
        mime = mimetypes.guess_type(fname)[0] or "application/octet-stream"
        with open(local, "rb") as f:
            content = f.read()
        r = self.follow(method, path, what, params=params, files={"file": (fname, content, mime)})
        return _check(r, what)


# ---------- 명령 ----------
def _say_preview(n_desc: str):
    print(f"[요약] 미리보기 — {n_desc}. 실행하지 않았습니다. 사용자가 확인하면 같은 명령 끝에 --yes")


def _local_files(paths: list) -> list:
    out = []
    for p in paths:
        ap = os.path.abspath(os.path.expanduser(p))
        if not os.path.isfile(ap):
            raise Stop("파일이 없습니다: " + p)
        out.append(ap)
    return out


def cmd_check(a):
    tok, src = _find_token()
    if not tok:
        raise Stop(_token_hint())
    me = Dooray().me(with_name=True)   # 이름은 이번 실행에서만(저장 안 함)
    print(f"[요약] 인증 OK — {me['name']} (토큰 길이 {len(tok)}, 출처 {src})")


def cmd_resolve(a):
    s, D = a.link, Dooray()
    if "/task/" in s or re.fullmatch(r"\d{6,}[/:]\d{6,}", s.strip()):
        pid, tid = parse_task(s)
        t = D.call("GET", f"/project/v1/projects/{pid}/posts/{tid}", "업무 조회").get("result") or {}
        print(f"[요약] 업무 — 프로젝트 {D.project(pid).get('code')}({pid}) · 업무 {tid} #{t.get('number')} {_head(t.get('subject'), 60)}")
        return
    ref = parse_drive(s)
    did, pid = D.drive_of(ref)
    if ref["kind"] == "root":
        print(f"[요약] 드라이브 최상위 — 프로젝트 {pid} · 드라이브 {did} · 폴더 {D.root_id(did)}")
        return
    m = D.meta(did, ref["id"])
    kind = "폴더" if m.get("type") == "folder" else "파일"
    print(f"[요약] 드라이브 {kind} — {m.get('name')} ({kb(m.get('size'))}) · 프로젝트 {pid} · 드라이브 {did} · id {ref['id']}")


def cmd_projects(a):
    ps = Dooray().projects(refresh=a.refresh)
    rows = [(k, v) for k, v in ps.items() if not a.q or a.q.lower() in v["code"].lower()]
    for k, v in sorted(rows, key=lambda kv: kv[1]["code"]):
        print(f"  {v['code']} | 프로젝트 {k} | 드라이브 {v['drive'] or '-'}" + (" | 보관" if v.get("state") == "archived" else "") + (" | 개인" if v.get("type") == "private" else ""))
    print(f"[요약] 프로젝트 {len(rows)}개" + (f" ('{a.q}' 포함)" if a.q else "") + " — 캐시 7일(--refresh 로 새로)")


def cmd_members(a):
    D = Dooray()
    pid = D.find_project(a.project)[0] if a.project else ""
    found, complete = D.members(a.name, pid)
    for f in found:
        where = "" if not pid else {True: " | 프로젝트 멤버", False: " | 프로젝트 멤버 아님"}.get(f.get("inProject"), " | 프로젝트 멤버인지 모름(멤버가 아주 많음)")
        print(f"  {f['name']} | {f['email'] or '-'} | 멤버 id {f['id']}" + where)
    print(f"[요약] '{a.name}' {len(found)}명" + ("" if complete else " — 같은 이름이 아주 많아 앞 300명만(끝까지 못 읽음)"))


def _task_files(D, pid, tid) -> list:
    return D.call("GET", f"/project/v1/projects/{pid}/posts/{tid}/files", "업무 첨부 목록").get("result") or []


def cmd_task_files(a):
    D = Dooray()
    pid, tid = parse_task(a.task)
    fs = _task_files(D, pid, tid)
    for i, f in enumerate(fs):
        print(f"  {i} | {f.get('name')} | {kb(f.get('size'))} | {str(f.get('createdAt', ''))[:10]} | id {f.get('id')}")
    print(f"[요약] 첨부 {len(fs)}개 {kb(sum(int(f.get('size') or 0) for f in fs))}")


def cmd_task_download(a):
    D = Dooray()
    pid, tid = parse_task(a.task)
    fs = _task_files(D, pid, tid)
    if a.file:
        want = {x.strip() for x in a.file}
        pick = [f for f in fs if str(f.get("id")) in want or f.get("name") in want]
        miss = want - {str(f.get("id")) for f in pick} - {f.get("name") for f in pick}
        if miss:
            raise Stop("업무에 없는 첨부: " + ", ".join(sorted(miss)))
    elif a.all:
        pick = fs
    else:
        raise Stop("받을 첨부를 --file <id|이름> 또는 --all 로 지정하세요(목록은 task-files)", 2)
    if not pick:
        raise Stop("받을 첨부가 없습니다")
    to = os.path.abspath(os.path.expanduser(a.to or _downloads_dir()))
    taken, plan = set(), []
    for f in pick:
        plan.append((f, free_path(to, safe_name(f.get("name")), taken)))
    total = sum(int(f.get("size") or 0) for f, _ in plan)
    print(f"[{'받기' if a.yes else '미리보기'}] 업무 첨부 {len(plan)}개 {kb(total)} → {to}")
    for f, p in plan:
        print(f"  {f.get('name')} ({kb(f.get('size'))}) → {os.path.basename(p)}")
    if not a.yes:
        return _say_preview(f"{len(plan)}개 {kb(total)} 내려받기")
    os.makedirs(to, exist_ok=True)
    ok = bad = 0
    for f, p in plan:
        try:
            n = D.download(f"/project/v1/projects/{pid}/posts/{tid}/files/{f.get('id')}", p, "첨부 받기")
            ok += 1; print(f"  + {os.path.basename(p)} ({kb(n)})")
        except Stop as e:
            bad += 1; print(f"  ! {f.get('name')}: {e}")
        time.sleep(0.2)
    print(f"[요약] 받음 {ok} / 실패 {bad} → {to}")
    return 0 if not bad else 1


def cmd_task_attach(a):
    D = Dooray()
    pid, tid = parse_task(a.task)
    files = _local_files(a.files)
    t = D.call("GET", f"/project/v1/projects/{pid}/posts/{tid}", "업무 조회").get("result") or {}
    print(f"[{'올리기' if a.yes else '미리보기'}] 업무 첨부 올리기 — #{t.get('number')} {_head(t.get('subject'), 60)}")
    for p in files:
        print(f"  {os.path.basename(p)} ({kb(os.path.getsize(p))})")
    if not a.yes:
        return _say_preview(f"첨부 {len(files)}개 올리기")
    ok = bad = 0
    for p in files:
        try:
            D.upload(f"/project/v1/projects/{pid}/posts/{tid}/files", p, "첨부 올리기")
            ok += 1; print(f"  + {os.path.basename(p)}")
        except Stop as e:
            bad += 1; print(f"  ! {os.path.basename(p)}: {e}")
        time.sleep(0.2)
    print(f"[요약] 첨부 올림 {ok} / 실패 {bad} → {WEB}/task/{pid}/{tid}")
    return 0 if not bad else 1


def _text_of(a) -> str:
    if getattr(a, "text_file", None):
        return _read_text(a.text_file).replace("\r\n", "\n").strip()
    return (getattr(a, "text", None) or "").replace("\\n", "\n").strip()


def cmd_task_comment(a):
    D = Dooray()
    pid, tid = parse_task(a.task)
    body = _text_of(a)
    if not body:
        raise Stop("댓글 내용이 없습니다(--text 또는 --text-file)")
    t = D.call("GET", f"/project/v1/projects/{pid}/posts/{tid}", "업무 조회").get("result") or {}
    print(f"[{'쓰기' if a.yes else '미리보기'}] 댓글 — #{t.get('number')} {_head(t.get('subject'), 60)}")
    print(f"  내용 {len(body)}자: {_head(body, 120)}")
    if not a.yes:
        return _say_preview("댓글 1개 쓰기")
    r = D.call("POST", f"/project/v1/projects/{pid}/posts/{tid}/logs", "댓글 쓰기",
               json_body={"body": {"mimeType": "text/x-markdown", "content": body}}).get("result") or {}
    print(f"[요약] 댓글 1개 씀(id {r.get('id', '?')}) → {WEB}/task/{pid}/{tid}")


def cmd_task_create(a):
    D = Dooray()
    pid, info = D.find_project(a.project)
    subject = (a.subject or "").strip()
    if not subject:
        raise Stop("제목이 없습니다(--subject)")
    body = _text_of(a)
    files = _local_files(a.attach or [])
    to = [D.member_ref(n, pid) for n in (a.to or ["나"])]
    cc = [D.member_ref(n, pid) for n in (a.cc or [])]
    print(f"[{'만들기' if a.yes else '미리보기'}] 업무 만들기 — 프로젝트 {info.get('code')}")
    print(f"  제목: {subject}")
    print(f"  담당: {', '.join(m['name'] for m in to)}" + (f" · 참조: {', '.join(m['name'] for m in cc)}" if cc else ""))
    print(f"  본문 {len(body)}자: {_head(body, 120) or '(없음)'}")
    if files:
        print("  첨부: " + ", ".join(f"{os.path.basename(p)} ({kb(os.path.getsize(p))})" for p in files))
    if not a.yes:
        return _say_preview("업무 1건 만들기" + (f" + 첨부 {len(files)}개" if files else ""))
    ref = lambda m: {"type": "member", "member": {"organizationMemberId": m["id"]}}
    payload = {"users": {"to": [ref(m) for m in to], "cc": [ref(m) for m in cc]}, "subject": subject,
               "body": {"mimeType": "text/x-markdown", "content": body}}
    r = D.call("POST", f"/project/v1/projects/{pid}/posts", "업무 만들기", json_body=payload).get("result") or {}
    tid = str(r.get("id") or "")
    if not tid:
        raise Stop("업무 만들기 응답에 id 가 없습니다 — Dooray 에서 만들어졌는지 확인하세요")
    print(f"  + 업무 만듦 → {WEB}/task/{pid}/{tid}")
    bad = 0
    for p in files:
        try:
            D.upload(f"/project/v1/projects/{pid}/posts/{tid}/files", p, "첨부 올리기")
            print(f"  + 첨부 {os.path.basename(p)}")
        except Stop as e:
            bad += 1; print(f"  ! 첨부 {os.path.basename(p)}: {e}")
    print(f"[요약] 업무 1건 만듦" + (f" · 첨부 {len(files) - bad}/{len(files)}" if files else "") + f" → {WEB}/task/{pid}/{tid}")
    return 0 if not bad else 1


def cmd_drive_ls(a):
    D = Dooray()
    did, pid, fid, path = D.folder_of(a.folder)
    items = D.children(did, fid)
    items = [x for x in items if not a.q or a.q.lower() in str(x.get("name", "")).lower()]
    items.sort(key=lambda x: (x.get("type") != "folder", str(x.get("name", ""))))
    for i, x in enumerate(items[: a.max]):
        folder = x.get("type") == "folder"   # 링크: 폴더는 그 폴더를, 파일은 이 폴더가 열리고 그 파일이 선택된 화면을(…/views/{파일}만 주면 최상위가 열림)
        link = f"{WEB}/drive/{pid}/{x.get('id')}" if folder else f"{WEB}/drive/{pid}/{fid}/views/{x.get('id')}"
        print(f"  {i} | {'폴더' if folder else '파일'} | {x.get('name')} | {kb(x.get('size')) if not folder else '-'} | {str(x.get('updatedAt', ''))[:10]} | {link}")
    print(f"[요약] {path} — {len(items)}개" + (f" ('{a.q}' 포함)" if a.q else "") + (f", 앞 {a.max}개만" if len(items) > a.max else "") + f" · 폴더 링크 {WEB}/drive/{pid}/{fid}")


def cmd_drive_upload(a):
    D = Dooray()
    did, pid, fid, path = D.folder_of(a.folder)
    files = _local_files(a.files)
    exist = {str(x.get("name")): x for x in D.children(did, fid) if x.get("type") != "folder"}
    names = {x.lower() for x in exist}
    plan, dup = [], []
    for p in files:
        n = os.path.basename(p)
        if n in exist:
            if a.new_version:
                plan.append((p, n, "new-version", str(exist[n].get("id"))))
            elif a.as_copy:
                stem, ext = os.path.splitext(n)
                k = 2
                while f"{stem} ({k}){ext}".lower() in names:
                    k += 1
                names.add(f"{stem} ({k}){ext}".lower())
                plan.append((p, f"{stem} ({k}){ext}", "copy", ""))
            else:
                dup.append(n)
        else:
            names.add(n.lower())
            plan.append((p, n, "new", ""))
    print(f"[{'올리기' if a.yes else '미리보기'}] 드라이브 올리기 → {path}")
    for p, n, how, _ in plan:
        print(f"  {os.path.basename(p)} ({kb(os.path.getsize(p))})" + {"new": "", "copy": f" → 이름 바꿔 '{n}'", "new-version": " → 같은 이름 파일의 새 버전"}[how])
    if dup:
        raise Stop("폴더에 같은 이름이 이미 있습니다: " + ", ".join(dup) + " — 사용자에게 물어 --as-copy(이름 뒤 (2)) 또는 --new-version(새 버전) 을 붙여 다시", 2)
    if not a.yes:
        return _say_preview(f"{len(plan)}개 올리기")
    ok = bad = 0
    for p, n, how, xid in plan:
        try:
            if how == "new-version":
                r = D.upload(f"/drive/v1/drives/{did}/files/{xid}", p, "새 버전 올리기", method="PUT", params={"media": "raw"})
            else:
                r = D.upload(f"/drive/v1/drives/{did}/files", p, "드라이브 올리기", params={"parentId": fid}, name=n)
            nid = str((r.get("result") or {}).get("id") or xid or "")
            ok += 1; print(f"  + {n}" + (f" → {WEB}/drive/{pid}/{fid}/views/{nid}" if nid else ""))
        except Stop as e:
            bad += 1; print(f"  ! {n}: {e}")
        time.sleep(0.2)
    print(f"[요약] 올림 {ok} / 실패 {bad} → {path} ({WEB}/drive/{pid}/{fid})")
    return 0 if not bad else 1


def cmd_drive_download(a):
    D = Dooray()
    to = os.path.abspath(os.path.expanduser(a.to or _downloads_dir()))
    taken, plan = set(), []
    for x in a.files:
        ref = parse_drive(x)
        if ref["kind"] == "root" or ref.get("private"):
            raise Stop("파일 링크가 아닙니다(…/drive/{프로젝트}/views/{파일}): " + x[:80])
        did, pid = D.drive_of(ref)
        m = D.meta(did, ref["id"])
        if m.get("type") == "folder":
            raise Stop(f"'{m.get('name')}' 은 폴더입니다 — 폴더째 받기는 하지 않습니다(drive-ls 로 파일을 골라서)")
        plan.append((did, ref["id"], m, free_path(to, safe_name(m.get("name")), taken)))
    total = sum(int(m.get("size") or 0) for _, _, m, _ in plan)
    print(f"[{'받기' if a.yes else '미리보기'}] 드라이브 파일 {len(plan)}개 {kb(total)} → {to}")
    for _, _, m, p in plan:
        print(f"  {m.get('name')} ({kb(m.get('size'))}) → {os.path.basename(p)}")
    if not a.yes:
        return _say_preview(f"{len(plan)}개 {kb(total)} 내려받기")
    os.makedirs(to, exist_ok=True)
    ok = bad = 0
    for did, fid, m, p in plan:
        try:
            n = D.download(f"/drive/v1/drives/{did}/files/{fid}", p, "드라이브 받기")
            ok += 1; print(f"  + {os.path.basename(p)} ({kb(n)})")
        except Stop as e:
            bad += 1; print(f"  ! {m.get('name')}: {e}")
        time.sleep(0.2)
    print(f"[요약] 받음 {ok} / 실패 {bad} → {to}")
    return 0 if not bad else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="dooray_io.py", description="kk-dry 쓰기·파일 주고받기(공식 API, 토큰)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    p = sub.add_parser("resolve"); p.add_argument("link")
    p = sub.add_parser("projects"); p.add_argument("--q", default=""); p.add_argument("--refresh", action="store_true")
    p = sub.add_parser("members"); p.add_argument("name"); p.add_argument("--project", default="")
    p = sub.add_parser("task-files"); p.add_argument("task")
    p = sub.add_parser("task-download"); p.add_argument("task"); p.add_argument("--file", nargs="+"); p.add_argument("--all", action="store_true"); p.add_argument("--to", default=""); p.add_argument("--yes", action="store_true")
    p = sub.add_parser("task-attach"); p.add_argument("task"); p.add_argument("files", nargs="+"); p.add_argument("--yes", action="store_true")
    p = sub.add_parser("task-comment"); p.add_argument("task"); p.add_argument("--text", default=""); p.add_argument("--text-file", default=""); p.add_argument("--yes", action="store_true")
    p = sub.add_parser("task-create"); p.add_argument("--project", required=True); p.add_argument("--subject", required=True)
    p.add_argument("--text", default=""); p.add_argument("--text-file", default=""); p.add_argument("--to", nargs="+"); p.add_argument("--cc", nargs="+")
    p.add_argument("--attach", nargs="+"); p.add_argument("--yes", action="store_true")
    p = sub.add_parser("drive-ls"); p.add_argument("folder"); p.add_argument("--q", default=""); p.add_argument("--max", type=int, default=40)
    p = sub.add_parser("drive-upload"); p.add_argument("folder"); p.add_argument("files", nargs="+")
    g = p.add_mutually_exclusive_group(); g.add_argument("--as-copy", action="store_true"); g.add_argument("--new-version", action="store_true")
    p.add_argument("--yes", action="store_true")
    p = sub.add_parser("drive-download"); p.add_argument("files", nargs="+"); p.add_argument("--to", default=""); p.add_argument("--yes", action="store_true")
    a = ap.parse_args(argv)
    fn = {"check": cmd_check, "resolve": cmd_resolve, "projects": cmd_projects, "members": cmd_members,
          "task-files": cmd_task_files, "task-download": cmd_task_download, "task-attach": cmd_task_attach,
          "task-comment": cmd_task_comment, "task-create": cmd_task_create, "drive-ls": cmd_drive_ls,
          "drive-upload": cmd_drive_upload, "drive-download": cmd_drive_download}[a.cmd]
    try:
        return fn(a) or 0
    except Stop as e:
        print(f"[kk-dry] {e}")
        print(f"[요약] {'사용자 선택 필요' if e.code == 2 else '실패'} — {str(e)[:100]}")
        return e.code
    except requests.RequestException as e:
        print(f"[kk-dry] 연결 실패: {type(e).__name__} — 사내망/VPN 을 확인하세요")
        print("[요약] 실패 — 연결")
        return 1


if __name__ == "__main__":
    sys.exit(main())
