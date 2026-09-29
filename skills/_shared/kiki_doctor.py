# -*- coding: utf-8 -*-
"""kiki 환경 점검 한 번에 — Claude 가 매번 여러 명령으로 확인하던 것을 한 줄로 (값·토큰은 출력하지 않는다).

  python <skills>/_shared/kiki_doctor.py            # 전체
  python <skills>/_shared/kiki_doctor.py --json     # JSON 한 덩어리 (Claude 가 판단용으로 읽기)

점검: Python 버전·패키지(openpyxl requests Pillow pywin32 pymupdf) / Node·npx / 설치된 skill 과 코어 버전 / 개인 설정 파일 유무와
채워진 공통 항목(값은 안 보임) / 토큰 파일 유무·길이 / kiki_root 와 하위 폴더 / 다운로드 폴더 / 변환 엔진(한글·Office·LibreOffice) /
kk-wiki 스냅샷·담당자표 상태. 종료 코드 0 = 치명 문제 없음, 1 = 설치 필요 항목 있음(메시지 참조).
"""
import io, json, os, re, subprocess, sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS = os.path.dirname(HERE)
IS_WIN = sys.platform.startswith("win")


def _has(mod):
    try:
        __import__(mod)
        return True
    except Exception:
        return False


def _cmd_ok(args):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=20, shell=IS_WIN and args[0] in ("npx", "npm"))
        return r.returncode == 0, (r.stdout or r.stderr).strip().splitlines()[0][:40] if (r.stdout or r.stderr).strip() else ""
    except Exception:
        return False, ""


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


def _cfg_dirs():
    """개인 설정 폴더 — 지금 실행 중인 쪽(Claude/Codex)이 앞(다른 skill 스크립트와 같은 규칙)."""
    return _kiki_homes()


def _load_json(p):
    try:
        return json.load(open(p, encoding="utf-8-sig"))
    except Exception:
        return None


def _json_err(p):
    try:
        json.load(open(p, encoding="utf-8-sig"))
        return ""
    except Exception as e:
        return f"{type(e).__name__}: {str(e)[:80]}"


def kiki_root():
    r = os.environ.get("KIKI_ROOT", "").strip()
    if r:
        return os.path.expanduser(r), "환경변수"
    for d in _cfg_dirs():
        c = _load_json(os.path.join(d, "kiki.config.json"))
        if c and (c.get("kiki_root") or "").strip():
            return os.path.expanduser(c["kiki_root"].strip()), os.path.join(d, "kiki.config.json")
    return (r"C:\kiki" if IS_WIN else os.path.expanduser("~/kiki")), "기본값"


def downloads_dir():
    d = os.environ.get("KIKI_DOWNLOADS", "").strip()      # make_report.py·wiki_snapshot.py 와 같은 규칙(환경변수 → 레지스트리 → ~/Downloads)
    if d:
        return os.path.expanduser(d)
    if IS_WIN:
        try:
            import winreg
            k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders")
            v, _ = winreg.QueryValueEx(k, "{374DE290-123F-4565-9164-39C4925E467B}")
            return os.path.expandvars(v)
        except Exception:
            pass
    return os.path.join(os.path.expanduser("~"), "Downloads")


def core_versions():
    out = {}
    for skill in sorted(os.listdir(SKILLS)):
        d = os.path.join(SKILLS, skill, "scripts")
        if not skill.startswith("kk-") or not os.path.isdir(d):
            continue
        vs = []
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".js") and not fn.endswith(".min.js"):
                m = re.search(r"_version:\s*'([^']+)'", io.open(os.path.join(d, fn), encoding="utf-8").read())
                if m:
                    vs.append(m.group(1) + (" (+min)" if os.path.exists(os.path.join(d, fn[:-3] + ".min.js")) else ""))
        out[skill] = vs
    return out


def run():
    rep = {"ok": True, "install": [], "notes": [], "broken": []}
    rep["python"] = sys.version.split()[0]
    rep["python_exe"] = sys.executable
    rep["config_home"] = _cfg_dirs()[0]
    pk = {m: _has(mod) for m, mod in (("openpyxl", "openpyxl"), ("requests", "requests"), ("Pillow", "PIL"), ("pywin32", "win32com"), ("pymupdf", "fitz"))}
    if not IS_WIN:
        pk.pop("pywin32")
    rep["packages"] = pk
    try:                                                   # 선택: kk-meet 녹음 → 글(필요할 때 동의 후 설치). import 하지 않고 있는지만 본다(무거움)
        import importlib.util
        rep["optional"] = {"faster-whisper": importlib.util.find_spec("faster_whisper") is not None}
    except Exception:
        rep["optional"] = {"faster-whisper": False}
    need = [m for m, ok in pk.items() if not ok and m in ("openpyxl", "requests", "Pillow")]
    if need:
        rep["install"].append(f'"{sys.executable}" -m pip install ' + " ".join(need) + "  (필요한 skill 을 쓸 때 — kiki 스크립트를 돌리는 이 파이썬으로)")
    if IS_WIN:                                             # 2026-09-27 Codex 점검: python 과 py -3 이 서로 다른 파이썬이면 패키지가 한쪽에만 있다
        try:
            r = subprocess.run(["py", "-3", "-c", "import sys;print(sys.executable)"], capture_output=True, text=True, timeout=15)
            other = r.stdout.strip()
            if r.returncode == 0 and other and os.path.normcase(os.path.abspath(other)) != os.path.normcase(os.path.abspath(sys.executable)):
                rep["notes"].append(f"py -3 은 다른 파이썬({other})을 가리킵니다 — kiki 스크립트와 pip 는 이 파이썬({sys.executable})으로 실행")
        except Exception:
            pass
    node_ok, node_v = _cmd_ok(["node", "--version"]); npx_ok, _ = _cmd_ok(["npx", "--version"])
    rep["node"] = {"node": node_ok, "npx": npx_ok, "version": node_v}
    if not (node_ok and npx_ok):
        rep["notes"].append("Node.js 없음 — 파일첨부(chrome-devtools-mcp) skill 에만 필요")
    rep["skills"] = core_versions()
    root, src = kiki_root()
    rep["kiki_root"] = {"path": root, "from": src, "exists": os.path.isdir(root),
                        "subdirs": {d: os.path.isdir(os.path.join(root, d)) for d in ("budget", "meeting", "inspect", "_tmp", "wiki")}}
    if not os.path.isdir(root):
        rep["install"].append(f"kiki 작업 폴더가 없음: {root} — 설치 스크립트(install.ps1/.sh) 를 다시 실행")
    cfgs = {}
    for d in _cfg_dirs():
        for old in ("kk-meeting.config.json", "kk-dining.config.json"):   # skill 개명 전 설정 — 설치 스크립트로 kk-meet 을 설치하면 kk-meet.config.json 으로 옮겨진다
            if os.path.exists(os.path.join(d, old)) and not os.path.exists(os.path.join(d, "kk-meet.config.json")):
                rep["install"].append(f"옛 이름 설정 파일 {old} — 설치 스크립트로 kk-meet 을 설치하면(install.ps1 kk-meet / install.sh kk-meet) kk-meet.config.json 으로 옮겨집니다")
        for fn in ("kiki.config.json", "kk-pay.config.json", "kk-meet.config.json", "kk-budget.config.json", "kk-inspect.config.json", "kk-mail.config.json", "kk-wiki.config.json"):
            p = os.path.join(d, fn)
            if os.path.exists(p):
                c = _load_json(p)
                cfgs[p] = "invalid JSON" if c is None else "ok"
                if c is None:                              # 2026-09-27 Codex 점검: 깨진 설정을 '문제 없음'으로 넘기지 않는다
                    rep["broken"].append(f"{p} — {_json_err(p)}")
                if fn == "kiki.config.json" and c is not None:
                    filled = {}
                    for k in ("user", "card_holder", "payment_admin", "location"):
                        v = c.get(k)
                        filled[k] = bool(v) and any(bool(x) for x in (v.values() if isinstance(v, dict) else [v]))
                    filled["projects"] = bool(c.get("projects"))
                    rep["common_filled"] = filled
    rep["configs"] = cfgs or "없음 (첫 실행 때 Claude 가 만든다)"
    tok = None
    try:                                                   # 업로드 스크립트와 같은 판정(값은 읽기만, 출력 안 함)
        sys.path.insert(0, os.path.join(SKILLS, "kk-pay", "scripts"))
        import dooray_drive as _dd
        t, src = _dd._find_token()
        tok = {"file": os.path.normpath(src) if src and os.path.exists(src) else (src or os.path.join(root, "token.txt")), "has_token": bool(t), "length": len(t)}
    except BaseException:                                  # requests 가 없으면 dooray_drive 가 SystemExit — 아래 간이 판정으로
        tok = None
    for p in ([] if tok else [os.path.join(root, "token.txt")] + [os.path.join(d, x) for d in _cfg_dirs() for x in ("token.txt", "kiki.env")]):
        if os.path.exists(p):
            txt = io.open(p, encoding="utf-8-sig", errors="ignore").read()
            body = [l.strip() for l in txt.splitlines() if l.strip() and not l.lstrip().startswith("#")]
            cand = [l for l in body if not l.lower().startswith("dooray token") and " " not in l and len(l) >= 20]
            tok = {"file": os.path.normpath(p), "has_token": bool(cand), "length": len(cand[0].split("=", 1)[-1]) if cand else 0}
            if cand:
                break
    rep["token"] = tok or {"file": os.path.join(root, "token.txt"), "has_token": False, "length": 0}
    rep["downloads_dir"] = downloads_dir()
    rep["downloads_exists"] = os.path.isdir(rep["downloads_dir"])
    if not rep["downloads_exists"]:
        rep["notes"].append(f"다운로드 폴더가 없음: {rep['downloads_dir']} — Chrome 이 다른 폴더에 저장하면 환경변수 KIKI_DOWNLOADS 로 지정(kk-budget·kk-wiki 브라우저 경로)")
    conv = os.path.join(SKILLS, "kk-pay", "scripts", "convert.py")
    if os.path.exists(conv):
        try:
            r = subprocess.run([sys.executable, conv, "--check"], capture_output=True, text=True, encoding="utf-8", timeout=30)
            rep["convert_engines"] = json.loads(r.stdout.strip().splitlines()[0])
        except Exception as e:
            rep["convert_engines"] = f"확인 실패: {type(e).__name__}"
    wiki = os.path.join(root, "wiki")
    if os.path.isdir(wiki):
        idx = _load_json(os.path.join(wiki, "index.json")) or {}
        st = _load_json(os.path.join(wiki, "staff", "staff.json")) or {}
        rep["wiki"] = {"pages": len(idx.get("pages", [])), "built_at": idx.get("built_at", ""),
                       "staff_teams": len(st.get("teams", [])), "staff_imported": st.get("imported_at", ""),
                       "ocr_files": len([f for f in os.listdir(os.path.join(wiki, "ocr"))]) if os.path.isdir(os.path.join(wiki, "ocr")) else 0}
    else:
        rep["wiki"] = "스냅샷 없음 (kk-wiki 첫 실행 때 수집)"
    if rep["install"] or rep["broken"]:
        rep["ok"] = False
    return rep


def text(rep):
    L = [f"[kiki doctor] Python {rep['python']} ({rep.get('python_exe', '')}) | 패키지 " + ", ".join(f"{k}{'✓' if v else '✗'}" for k, v in rep["packages"].items())
         + f" | Node {'✓' if rep['node']['node'] and rep['node']['npx'] else '✗'} {rep['node']['version']}"]
    L.append("선택: " + ", ".join(f"{k}{'✓' if v else '✗'}" for k, v in rep.get("optional", {}).items()) + " (kk-meet 회의 녹음 → 글. 기본은 휴대폰·클로바노트로 바꾼 글, 사용자가 원할 때만 설치)")
    L.append("skills: " + "; ".join(f"{k} {' '.join(v) if v else '(코어 없음)'}" for k, v in rep["skills"].items()))
    kr = rep["kiki_root"]
    L.append(f"kiki_root: {kr['path']} ({kr['from']}, {'있음' if kr['exists'] else '없음'}) 하위 " + " ".join(f"{d}{'✓' if ok else '✗'}" for d, ok in kr["subdirs"].items()))
    L.append(f"설정 폴더(우선): {rep.get('config_home', '')}")
    L.append("config: " + (rep["configs"] if isinstance(rep["configs"], str) else "; ".join(f"{os.path.basename(p)} {v}" for p, v in rep["configs"].items())))
    if rep.get("common_filled"):
        L.append("공통 항목 채움: " + " ".join(f"{k}{'✓' if v else '✗'}" for k, v in rep["common_filled"].items()))
    t = rep["token"]
    L.append(f"token: {'있음(길이 ' + str(t['length']) + ')' if t['has_token'] else '없음'} — {t['file']}")
    L.append(f"다운로드 폴더: {rep['downloads_dir']} ({'있음' if rep.get('downloads_exists') else '없음'})")
    if "convert_engines" in rep:
        L.append("변환 엔진: " + (json.dumps(rep["convert_engines"], ensure_ascii=False) if not isinstance(rep["convert_engines"], str) else rep["convert_engines"]))
    w = rep["wiki"]
    L.append("kk-wiki: " + (w if isinstance(w, str) else f"스냅샷 {w['pages']}쪽 ({w['built_at'][:10]}), 담당자표 {w['staff_teams']}팀 ({w['staff_imported'][:10]}), OCR {w['ocr_files']}"))
    for n in rep["notes"]:
        L.append("참고: " + n)
    for i in rep["install"]:
        L.append("설치 필요: " + i)
    for b in rep.get("broken", []):
        L.append("설정 파일 깨짐: " + b + " — JSON 형식을 고치거나, 옮겨 두고 해당 skill 설정을 다시")
    parts = ([f"설정 깨짐 {len(rep['broken'])}"] if rep.get("broken") else []) + ([f"설치 필요 {len(rep['install'])}"] if rep["install"] else []) \
        + ([f"참고 {len(rep['notes'])}"] if rep["notes"] else [])
    L.append(f"[요약] {', '.join(parts) if parts else '문제 없음'}"
             + f" | token {'있음' if rep['token']['has_token'] else '없음'} | 스냅샷 {rep['wiki']['pages'] if isinstance(rep['wiki'], dict) else 0}쪽")
    return "\n".join(L)


if __name__ == "__main__":
    rep = run()
    print(json.dumps(rep, ensure_ascii=False, indent=1) if "--json" in sys.argv else text(rep))
    sys.exit(0 if rep["ok"] else 1)
