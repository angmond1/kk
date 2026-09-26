# -*- coding: utf-8 -*-
"""브라우저 코어(.js)의 주석 제거본(.min.js) 생성 — LLM 이 javascript_tool 로 주입할 때 보내는 글자 수를 줄인다(≈30~40%).

  python tools/build_min.py          # skills/*/scripts/*.js → 같은 폴더 <이름>.min.js (이미 min 인 파일·생성물은 건너뜀)
  python tools/build_min.py --check  # 생성물이 최신인지 검사만 (다르면 종료 코드 1) — sync-check.sh 가 부른다

규칙: 줄 전체가 // 주석인 줄과 빈 줄만 제거한다(코드 뒤 주석은 그대로 — 문자열 안의 // 를 건드리지 않기 위해). 동작은 원본과 같다.
원본(.js)이 정본이고 .min.js 는 생성물 — 직접 고치지 말 것.
"""
import io, os, re, sys, glob

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
HEADER = "// generated from {src} by tools/build_min.py — 편집 금지(원본 .js 를 고치고 다시 빌드). 동작 동일, 주석만 제거.\n"


def minify(src_text: str, src_name: str) -> str:
    out = [HEADER.format(src=src_name)]
    for line in src_text.replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if not s or s.startswith("//"):
            continue
        out.append(line.rstrip() + "\n")
    return "".join(out)


def targets():
    for p in sorted(glob.glob(os.path.join(ROOT, "skills", "*", "scripts", "*.js"))):
        if p.endswith(".min.js"):
            continue
        yield p, p[:-3] + ".min.js"


def main(argv):
    check = "--check" in argv
    stale, built = [], []
    for src, dst in targets():
        text = minify(io.open(src, encoding="utf-8").read(), os.path.basename(src))
        cur = io.open(dst, encoding="utf-8").read() if os.path.exists(dst) else None
        if cur == text:
            continue
        if check:
            stale.append(os.path.relpath(dst, ROOT))
        else:
            io.open(dst, "w", encoding="utf-8", newline="\n").write(text)
            built.append(f"{os.path.relpath(dst, ROOT)} ({len(text)//1024} KB ← {os.path.getsize(src)//1024} KB)")
    if check:
        if stale:
            print("[build_min] 생성물이 오래됨(원본이 바뀜) → python tools/build_min.py 실행:\n  " + "\n  ".join(stale))
            return 1
        print("[build_min] .min.js 모두 최신")
        return 0
    print("[build_min] " + (("\n  ".join([""] + built)) if built else "변경 없음"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
