# -*- coding: utf-8 -*-
"""kiki 공용 — dooray drive 폴더 검색·구조파악·업로드·처리완료 아카이브 (kk-pay/kk-meeting 공유).

인증: dooray 개인 토큰 (업로드는 세션쿠키로 안 됨 → 토큰 필요).
  토큰 로드 우선순위: 환경변수 DOORAY_TOKEN → <kiki_root>/token.txt → 지금 쓰는 쪽(Claude/Codex) 설정 폴더의 token.txt·(구형) kiki.env → 다른 쪽
  발급: https://kist.gov-dooray.com/setting/api/token  (토큰은 repo·skill 에 저장 금지, 로컬 파일만)

전사 공통(개인정보 아님, 내장 OK):
  PROJECT 3311002956353796322 / DRIVE 3311002957555545393 = RPA-지급신청자동화 (전 본부·행정원 공유)

명령줄 (Claude 가 Bash 로 부른다 — 토큰 값은 어디에도 출력하지 않는다):
  python dooray_drive.py check                                  # 토큰 파일 확인 → 'OK (길이 N, 파일 경로)' 또는 안내
  python dooray_drive.py find <행정원이름> [본부약어]             # 행정원 RPA 폴더 검색 (본부 없으면 전체, 최대 5분)
  python dooray_drive.py structure <폴더id|폴더링크>             # 행정원 폴더의 세금계산서/회의비 하위 폴더 유무
  python dooray_drive.py upload <폴더id|폴더링크> <파일...>       # 업로드 (사용자 confirm 후에만 부른다)
TLS: 기본은 인증서 검증(전사 프록시 등으로 실패하면 환경변수 KIKI_INSECURE_TLS=1 로만 끈다 — 토큰이 오가므로 평소엔 켜 둔다).
"""
from __future__ import annotations
import os, re, time, sys, json
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
# Windows 한국어(cp949) 콘솔·파이프에서도 한글·기호가 깨지거나 멈추지 않게 출력은 UTF-8 로 (모듈로 불러 써도 적용)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
try:
    import requests
except ImportError:
    sys.exit("[kiki] requests 패키지가 필요합니다: python -m pip install requests  (macOS/Linux: python3 -m pip install --user requests)")

API = "https://api.gov-dooray.com"
PROJECT = "3311002956353796322"   # 웹 URL용 projectId (전사 공통)
DRIVE = "3311002957555545393"     # API용 driveId (전사 공통)
VERIFY_TLS = os.environ.get("KIKI_INSECURE_TLS", "").strip() not in ("1", "true", "yes")
if not VERIFY_TLS:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    print("[kiki] 경고: KIKI_INSECURE_TLS 가 켜져 있어 TLS 인증서를 검증하지 않습니다(토큰 노출 위험) — 사내 프록시 문제일 때만 임시로 쓰세요.", file=sys.stderr)

# 본부 정식명 ↔ 관용 약어 (사용자 제공 2026-06-04). drive 본부 폴더는 'NN 정식명' 형식.
DEPT_ALIAS = {
    "뇌과학": "뇌과학연구소", "차반연": "차세대반도체연구소",
    "AI": "AI로봇", "로봇": "AI로봇", "기후": "기후환경연구소",
    "바이오": "바이오메디컬", "메디컬": "바이오메디컬",
    "첨소": "첨단소재", "첨단": "첨단소재",
    "청정": "청정신기술", "청신기": "청정신기술",
    "미래본": "지속가능미래", "지속가능": "지속가능미래",
}
# 정식 RPA 폴더 식별 키워드 (하위폴더에 이게 있으면 정식)
_RPA_MARK = ("세금계산서", "회의비", "지급신청 매뉴얼")


def _default_root() -> str:
    return r"C:\kiki" if sys.platform.startswith("win") else os.path.expanduser("~/kiki")


def _kiki_homes() -> list:
    """개인 설정 폴더 후보(앞이 우선) — 지금 실행 중인 쪽(Claude Code·Codex)의 설정·토큰을 먼저 쓴다(2026-09-27 Codex 점검:
    Codex 에서도 ~/.claude 쪽을 먼저 집던 문제). KIKI_HOME(폴더 직접 지정) > KIKI_AGENT=claude|codex >
    이 스크립트가 설치된 곳(~/.codex/skills/… 면 Codex) > 실행 환경(CLAUDECODE·CODEX_…) > Claude, Codex 순."""
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
    """kiki 작업 폴더 — 환경변수 KIKI_ROOT → kiki.config.json(claude/codex) 의 kiki_root → 기본값(C:\\kiki / ~/kiki)."""
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
    """토큰 파일을 UTF-8(BOM)·UTF-16·시스템 인코딩 순으로 읽는다(메모장이 다른 인코딩으로 저장해도)."""
    raw = open(p, "rb").read()
    for enc in ("utf-8-sig", "utf-16", "cp949"):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode("utf-8", errors="ignore")


def _token_from_file(p: str) -> str:
    """token.txt('Dooray token:' 다음 줄 또는 같은 줄) 또는 kiki.env(DOORAY_TOKEN=...) 에서 토큰 추출. 없으면 ''.
    머리글 아래가 비었거나 머리글 위에 붙여넣은 경우도 찾는다: 공백·'://' 없는 20자 이상 한 줄(Dooray 토큰은 'xxxx:yyyy' 꼴이라 ':' 는 허용)."""
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
    for ln in body:                      # 머리글 없이 토큰만 있거나, 머리글 위에 붙여넣은 경우
        t = _tok(ln)
        if t:
            return t
    return ""


def _token_candidates() -> list:
    """우선순위: <kiki_root>/token.txt → 지금 쓰는 쪽 설정 폴더의 token.txt·(구형) kiki.env → 다른 쪽."""
    root = _kiki_root()
    c = [os.path.join(root, "token.txt")] if root else []
    for h in _kiki_homes():
        c += [os.path.join(h, "token.txt"), os.path.join(h, "kiki.env")]
    return c


def _token_hint() -> str:
    where = os.path.join(_kiki_root(), "token.txt")
    return (f"dooray 토큰이 필요합니다. {where} 의 'Dooray token:' 다음 줄에 토큰을 붙여넣고 저장하세요 "
            "(발급: https://kist.gov-dooray.com/setting/api/token). 채팅창에는 붙여넣지 마세요(노출 위험).")


def _find_token() -> tuple:
    """(토큰, 출처) — 없으면 ('', '')."""
    t = os.environ.get("DOORAY_TOKEN", "").strip()
    if t:
        return t, "환경변수 DOORAY_TOKEN"
    for p in _token_candidates():
        if os.path.exists(p):
            t = _token_from_file(p)
            if t and " " not in t:
                return t, p
    return "", ""


def _load_token() -> str:
    t, _ = _find_token()
    if t:
        return t
    raise RuntimeError(_token_hint())


def check_token() -> str:
    """토큰 값은 절대 출력하지 않고 유무·길이·파일 위치만 돌려준다 (명령 `check`)."""
    t, src = _find_token()
    if not t:
        return "토큰 없음 — " + _token_hint()
    return f"OK (길이 {len(t)}, 출처 {src})"


def folder_id_of(x: str) -> str:
    """폴더 id 또는 드라이브 웹 링크(https://kist.gov-dooray.com/drive/<project>/<folderId>) → 폴더 id."""
    s = str(x or "").strip()
    m = re.search(r"/drive/\d+/(\d+)", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"\d{6,}", s):
        return s
    raise ValueError("폴더 id 나 드라이브 폴더 링크가 아닙니다: " + s)


class DoorayDrive:
    def __init__(self, token: str | None = None, timeout: int = 30):
        self.token = token or _load_token()
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers.update({"Authorization": f"dooray-api {self.token}", "Accept": "application/json"})

    def probe(self, folder: str | None = None) -> str:
        """토큰이 실제로 통하는지(드라이브 목록 1건 읽기) + 폴더를 주면 그 폴더 접근까지. 쓰기 없음."""
        params = {"page": 0, "size": 1}
        if folder:
            params["parentId"] = folder_id_of(folder)
        r = self.s.get(f"{API}/drive/v1/drives/{DRIVE}/files", params=params, verify=VERIFY_TLS, timeout=self.timeout)
        self._check(r, "토큰 확인" if not folder else "폴더 접근 확인")
        return "인증 OK" + (" · 폴더 접근 OK" if folder else "")

    def web_url(self, folder_id: str) -> str:
        return f"https://kist.gov-dooray.com/drive/{PROJECT}/{folder_id}"

    @staticmethod
    def _check(r, what: str) -> dict:
        """응답 점검 — 401/403 은 토큰, 429 는 속도제한, 그 외 실패는 resultMessage 를 붙여 RuntimeError."""
        if r.status_code in (401, 403):
            raise RuntimeError(f"dooray 토큰이 만료됐거나 잘못됐습니다({r.status_code}). 새 토큰을 발급해 token.txt 에 다시 저장하세요: https://kist.gov-dooray.com/setting/api/token")
        if r.status_code == 429:
            raise RuntimeError("dooray API 속도 제한(429) — 잠시 뒤 다시 시도하세요.")
        try:
            d = r.json()
        except ValueError:
            raise RuntimeError(f"{what}: dooray 응답이 JSON 이 아닙니다(HTTP {r.status_code}) — 사내망/VPN·로그인 상태를 확인하세요.")
        hdr = d.get("header") or {}
        if r.status_code >= 400 or (hdr and hdr.get("isSuccessful") is False):
            raise RuntimeError(f"{what} 실패(HTTP {r.status_code}): {hdr.get('resultMessage') or hdr.get('resultCode') or r.text[:120]}")
        return d

    # ---------- 목록 ----------
    def list_files(self, parent_id: str | None = None, size: int = 100) -> list[dict]:
        out, page = [], 0
        while True:
            params = {"page": page, "size": size}
            if parent_id:
                params["parentId"] = parent_id
            r = self.s.get(f"{API}/drive/v1/drives/{DRIVE}/files", params=params, verify=VERIFY_TLS, timeout=self.timeout)
            d = self._check(r, "폴더 목록 조회")
            batch = d.get("result") or []
            out += batch
            total = d.get("totalCount", len(out))
            if len(batch) < size or len(out) >= total:
                break
            page += 1
            time.sleep(0.15)  # rate limit (5/s)
        return out

    @staticmethod
    def _is_dept(name: str) -> bool:
        return bool(re.match(r"^\d{2}\s", name)) or ("연구소" in name) or ("연구본부" in name)

    def _subdir_names(self, folder_id: str) -> list[str]:
        return [f.get("name", "") for f in self.list_files(folder_id) if f.get("type") == "folder"]

    def _is_rpa_folder(self, folder_id: str) -> bool:
        subs = self._subdir_names(folder_id)
        return any(any(k in s for k in _RPA_MARK) for s in subs)

    # ---------- 행정원 폴더 검색 ----------
    # 반환: [{name, id, web, isRPA, path}]  (isRPA=정식 RPA 폴더 여부)
    # 본부 폴더를 찾으려면 root 전체(8천여 항목, 약 90회 호출 ≈ 3분)를 한 번은 읽어야 한다 — dept_hint 가 있으면 그 본부 안만
    # 훑어 그 뒤가 빠르고, 없으면 root 항목 + 모든 본부를 재귀(최대 ~5분). root 목록은 한 번만 읽어 재사용한다.
    # progress: 진행 표시 콜백 (예 print). 호출측이 "검색 중…" 표시에 사용. Bash 에서 부를 땐 timeout 을 10분으로.
    def find_admin_folder(self, name: str, dept_hint: str | None = None, progress=None):
        def emit(msg):
            if progress:
                progress(msg)
        hits, seen = [], set()

        def scan(parent, path):
            for f in self.list_files(parent):
                if f.get("type") != "folder":
                    continue
                nm, fid = f.get("name", ""), f.get("id")
                if name in nm and fid not in seen:
                    seen.add(fid)
                    hits.append({"name": nm, "id": fid, "web": self.web_url(fid),
                                 "isRPA": self._is_rpa_folder(fid), "path": path})

        emit("[검색 중] drive 최상위 목록 읽는 중… (8천여 항목, 2~3분 — 멈춘 게 아닙니다)")
        root = self.list_files(None)
        if dept_hint:
            full = DEPT_ALIAS.get(dept_hint, dept_hint)
            emit(f"[검색 중] 본부 '{dept_hint}'({full}) 폴더 탐색…")
            depts = [f for f in root if f.get("type") == "folder" and full in f.get("name", "")]
            for d in depts:
                emit(f"[검색 중] {d.get('name')} 안에서 '{name}' 찾는 중…")
                scan(d.get("id"), d.get("name"))
            if hits:
                return hits
            emit("[검색 중] 본부에서 못 찾음 → 전체 검색으로 전환(최대 5분)…")

        # 전수: root + 본부 재귀 (root 목록 재사용)
        for f in root:
            if f.get("type") != "folder":
                continue
            nm, fid = f.get("name", ""), f.get("id")
            if name in nm and fid not in seen:
                seen.add(fid)
                hits.append({"name": nm, "id": fid, "web": self.web_url(fid),
                             "isRPA": self._is_rpa_folder(fid), "path": "(root)"})
        for f in root:
            if f.get("type") == "folder" and self._is_dept(f.get("name", "")):
                emit(f"[검색 중] {f.get('name')} …")
                scan(f.get("id"), f.get("name"))
        return hits

    # 행정원 폴더의 업로드 위치 구조: 카드(root) / 세금계산서 / 회의비 하위 폴더 id
    def folder_structure(self, admin_folder_id: str) -> dict:
        admin_folder_id = folder_id_of(admin_folder_id)
        subs = [f for f in self.list_files(admin_folder_id) if f.get("type") == "folder"]
        def find(kw):
            for f in subs:
                if kw in f.get("name", ""):
                    return {"id": f.get("id"), "name": f.get("name")}
            return None
        return {
            "card": {"id": admin_folder_id, "name": "(행정원 폴더 root = 카드 직접)"},
            "taxInvoice": find("세금계산서"),
            "meeting": find("회의비"),
            "hasSeparate": bool(find("세금계산서") or find("회의비")),
        }

    # ---------- 업로드 (api → 307 → file-api, 토큰만 들고 manual follow) ----------
    def upload(self, folder_id: str, file_path: str, mime: str = "application/octet-stream") -> dict:
        folder_id = folder_id_of(folder_id)
        fname = os.path.basename(file_path)
        with open(file_path, "rb") as f:
            content = f.read()
        first = f"{API}/drive/v1/drives/{DRIVE}/files"
        r0 = self.s.post(first, params={"parentId": folder_id},
                         files={"file": (fname, content, mime)},
                         verify=VERIFY_TLS, allow_redirects=False, timeout=self.timeout)
        if r0.status_code != 307:
            return self._check(r0, "업로드")
        loc = r0.headers["Location"]
        r1 = self.s.post(loc, files={"file": (fname, content, mime)}, verify=VERIFY_TLS, timeout=120)
        return self._check(r1, "업로드")


# ---------- 처리완료 로컬 아카이브 (이동/복사) ----------
def archive_local(file_path: str, acccd: str, mode: str = "move", base: str | None = None) -> str:
    """업로드 완료 파일을 <base>/지급신청완료/{과제번호}/ 로 이동(move)·복사(copy). keep=그대로.
    같은 이름이 이미 있으면 ' (2)' 를 붙여 덮어쓰지 않는다. (SKILL 의 월별 신청완료 정리는 Claude 가 직접 — 이 함수는 보조)"""
    import shutil
    if mode == "keep":
        return file_path
    base = base or os.path.dirname(file_path)
    dest_dir = os.path.join(base, "지급신청완료", acccd)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, os.path.basename(file_path))
    stem, ext = os.path.splitext(dest)
    k = 2
    while os.path.exists(dest):
        dest = f"{stem} ({k}){ext}"
        k += 1
    if mode == "copy":
        shutil.copy2(file_path, dest)
    else:
        shutil.move(file_path, dest)
    return dest


USAGE = ("usage: python dooray_drive.py check [--live [폴더id|폴더링크]]   (--live: 토큰이 실제로 통하는지·폴더 접근까지, 읽기 1회)\n"
         "       python dooray_drive.py find <행정원이름> [본부약어]\n"
         "       python dooray_drive.py structure <폴더id|폴더링크>\n"
         "       python dooray_drive.py upload <폴더id|폴더링크> <파일...> [--any-name]   (사용자 confirm 후, RPA 파일명 규칙 검사)")


def rpa_name_problem(name: str) -> str:
    """RPA 증빙 파일명 규칙 위반 사유('' = 통과). 계정_항목_비목_(승인번호_)이름]내용, 80자 이내(확장자 제외), jpg/pdf."""
    stem, ext = os.path.splitext(name)
    if ext.lower() not in (".jpg", ".pdf"):
        return f"jpg/pdf 만 업로드 가능({ext or '확장자 없음'})"
    if not re.match(r"^(?:[0-9][A-Za-z][0-9]{5}|[0-9]{2}[A-Za-z][0-9]{4})_\d{2}_\d{3}_", stem):
        return "RPA 파일명 규칙(계정_항목_비목_…)이 아님"
    if len(stem) > 80:
        return f"{len(stem)}자 — 80자 이내(확장자 제외)"
    return ""


def main(argv: list) -> int:
    cmd = argv[1] if len(argv) >= 2 else ""
    if cmd in ("", "-h", "--help", "help"):
        print(USAGE)
        return 0 if cmd else 1
    if cmd == "check":
        msg = check_token()
        print(msg)
        if not msg.startswith("OK"):
            return 1
        if "--live" in argv:
            try:
                folder = next((x for x in argv[2:] if not x.startswith("--")), None)
                print(DoorayDrive().probe(folder))
            except (RuntimeError, ValueError) as e:
                print("ERR", e)
                return 1
        return 0
    if cmd == "find" and len(argv) >= 3:
        try:
            c = DoorayDrive()
            dept = argv[3] if len(argv) >= 4 else None
            hits = c.find_admin_folder(argv[2], dept, progress=lambda m: print(m, file=sys.stderr))
        except RuntimeError as e:
            print("ERR", e)
            return 1
        if not hits:
            print("(없음) 이름을 다시 확인하거나 폴더 링크를 직접 알려 주세요.")
        for h in hits:
            print(f"{'[정식]' if h['isRPA'] else '[비정식]'} {h['path']}/{h['name']}  {h['web']}")
        return 0
    if cmd == "structure" and len(argv) >= 3:
        try:
            print(json.dumps(DoorayDrive().folder_structure(argv[2]), ensure_ascii=False))
        except (RuntimeError, ValueError) as e:
            print("ERR", e)
            return 1
        return 0
    if cmd == "upload" and len(argv) >= 4:
        files = [p for p in argv[3:] if p != "--any-name"]
        # 올리기 전에 전부 검사 — 업로드 = RPA 자동 기안이라, 규칙에 어긋난 이름 하나가 실패 기안·반려 메일이 된다(하나라도 걸리면 아무것도 안 올림)
        probs = []
        for p in files:
            if not os.path.isfile(p):
                probs.append("파일 없음: " + p)
            elif "--any-name" not in argv:
                why = rpa_name_problem(os.path.basename(p))
                if why:
                    probs.append(f"{os.path.basename(p)}: {why}")
        if probs:
            print("ERR 올리지 않았습니다 —", " / ".join(probs))
            print("  (파일명은 kk_pay_files.py plan/apply 로 만들고, 규칙과 다른 이름을 일부러 올릴 때만 --any-name)")
            print(f"[요약] 업로드 0 / 점검 {len(probs)}")
            return 1
        ok = 0
        try:
            c = DoorayDrive()
            for p in files:
                d = c.upload(argv[2], p)
                rid = (d.get("result") or {}).get("id") if isinstance(d.get("result"), dict) else ""
                print("업로드 완료:", os.path.basename(p), ("id " + str(rid)) if rid else "")
                ok += 1
        except (RuntimeError, ValueError) as e:
            print("ERR", e)
            print(f"[요약] 업로드 {ok} / 실패 1 / 남음 {len(files) - ok - 1} — 올라간 {ok}건은 드라이브 웹에서 확인")
            return 1
        print(f"[요약] 업로드 {ok}건 — 드라이브 웹에서 파일명을 눈으로 확인(7단계)")
        return 0
    print(USAGE)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
