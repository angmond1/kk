"""kk skill 의 SKILL.md 머리(name·description) 점검 — 부르는 말(키키야·김키키)·설명 길이·공용 호출 문서 연결.

설명은 Agent Skills 규격(Claude Code·Codex 공통) 1024자 이하 — Codex 는 목록에서 1,024자 넘는 설명을 자르고(글자 수 기준),
스킬이 많으면 전체 예산에 맞춰 설명 뒷부분부터 줄인다(Codex 원본 render.rs 확인, 2026-09-30). 그래서 부르는 말은 설명 앞쪽에 둔다.
사용: python tools/check_skill_meta.py   (실패가 있으면 종료 코드 1)
"""
import io, os, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
try:
    import yaml
except ImportError:
    yaml = None

SK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "skills")
n = fails = 0


def chk(label, cond, detail=""):
    global n, fails
    n += 1
    if cond:
        print(f"PASS {label}")
    else:
        fails += 1
        print(f"FAIL {label}" + (f" — {detail}" if detail else ""))


def front(text):
    m = re.match(r"---\r?\n(.*?)\r?\n---\r?\n", text, re.S)
    if not m:
        return None, text
    body = text[m.end():]
    if yaml:
        return yaml.safe_load(m.group(1)) or {}, body
    fm, key, block = {}, None, None          # PyYAML 이 없을 때: name/description 만 읽는 간이 파서
    for ln in m.group(1).splitlines():
        if block is not None and (ln.startswith(" ") or not ln.strip()):
            block.append(ln.strip()); continue
        if block is not None:
            fm[key] = "\n".join(block).strip(); block = None
        mm = re.match(r"([A-Za-z_-]+):\s*(.*)$", ln)
        if mm:
            key, val = mm.group(1), mm.group(2)
            if val in ("|", ">", "|-", ">-"):
                block = []
            else:
                fm[key] = val.strip().strip('"')
    if block is not None:
        fm[key] = "\n".join(block).strip()
    return fm, body


CALLS = ["키키", "키키야", "키키씨", "김키키", "김키키씨", "김키키야", "네코짱", "네코쨩", "야옹이", "고양이", "냥이", "냥냥이"]
names = sorted(d for d in os.listdir(SK) if d.startswith("kk-") and os.path.isfile(os.path.join(SK, d, "SKILL.md")))
chk("kk skill 폴더를 찾음", len(names) >= 7, str(names))
for name in names:
    text = io.open(os.path.join(SK, name, "SKILL.md"), encoding="utf-8").read()
    fm, body = front(text)
    if fm is None:
        chk(f"{name}: SKILL.md 머리(---)", False); continue
    d = str(fm.get("description") or "")
    chk(f"{name}: name 이 폴더 이름과 같음", fm.get("name") == name, str(fm.get("name")))
    chk(f"{name}: 설명 1~1024자", 0 < len(d) <= 1024, f"{len(d)}자")
    chk(f"{name}: 설명 앞쪽에 부르는 말(키키야·김키키씨·네코짱·냥냥이 등)", 0 <= d.find("키키야") < 80 and all(w in d for w in CALLS), d[:80])
    chk(f"{name}: 본문이 공용 호출 문서를 가리킴", "_shared/kiki_call.md" in body)
call = os.path.join(SK, "_shared", "kiki_call.md")
ct = io.open(call, encoding="utf-8").read() if os.path.exists(call) else ""
chk("공용 호출 문서 _shared/kiki_call.md 가 모든 kk skill 을 표에 둠", bool(ct) and all(f"**{x}**" in ct for x in names),
    str([x for x in names if f"**{x}**" not in ct]))
print(f"[요약] {n - fails}/{n} PASS" + (f" — {fails} FAIL" if fails else ""))
sys.exit(1 if fails else 0)
