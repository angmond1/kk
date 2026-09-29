#!/usr/bin/env bash
# kiki 설치 스크립트 (macOS / Linux / Windows Git Bash) — install.ps1 의 bash 등가.
#   - 선택한 skill + 공통(_shared) 을 ~/.claude/skills/ 로 복사 (Claude 가 skill 을 찾는 곳)
#   - 개인설정 폴더(~/.claude/kiki/) 준비 + kiki_root 기록
#   - kiki 작업 폴더(--root) 에 budget/ meeting/ inspect/ _tmp/ 와 token.txt 생성
#   - Python / Node.js 설치 여부만 확인해 안내 (자동 설치 X)
#   개인 config·토큰은 repo 밖(~/.claude/kiki/, <root>/token.txt) 에만 둔다. 기존 값은 덮어쓰지 않는다.
#
# 사용:
#   bash ./install.sh                         # 전체 skill, root = 이 스크립트가 있는 kiki 폴더
#   bash ./install.sh kk-mail kk-pay          # 일부 skill
#   bash ./install.sh --root ~/kiki           # 작업 폴더 지정 (기본 = 이 폴더, 권장 ~/kiki). 없으면 만든다.
set -euo pipefail

: "${HOME:?HOME 환경변수가 설정되어 있지 않습니다}"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$repo/skills"
dst="$HOME/.claude/skills"
cfg="$HOME/.claude/kiki"

# 인자 파싱: --root <path> 와 skill 이름들
root="$repo"
skills=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --root) root="$2"; shift 2 ;;
    --root=*) root="${1#--root=}"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) skills+=("$1"); shift ;;
  esac
done

# 0) root 확정 — 없으면 만들고(상위 폴더까지) 절대경로로. Windows Git Bash 는 C:/... 형식으로(파이썬이 읽는 config 용).
mkdir -p "$root" || { echo "[오류] kiki 폴더를 만들 수 없습니다: $root" >&2; exit 1; }
root="$(cd "$root" && pwd)"
if command -v cygpath >/dev/null 2>&1; then root="$(cygpath -m "$root")"; fi

# 설치할 skill 목록 (인자 없으면 전체 kk-*)
all=()
for d in "$src"/kk-*/; do [ -d "$d" ] && all+=("$(basename "$d")"); done
if [ "${#skills[@]}" -eq 0 ]; then skills=("${all[@]}"); fi

mkdir -p "$dst"

# 복사 헬퍼 — 임시 복사 후 교체(atomic). cp 실패 시 기존을 파괴하지 않는다.
copy_tree() {  # $1=src  $2=dst
  local tmp="$2.new.$$"
  rm -rf "$tmp"
  cp -R "$1" "$tmp"
  rm -rf "$2"
  mv "$tmp" "$2"
}

# 1) 공통 _shared (항상 복사 — 없으면 skill 이 동작하지 않음)
copy_tree "$src/_shared" "$dst/_shared"
echo "[복사] _shared (공통 문서·설정 템플릿)"

# 2) 선택 skill
unknown=0
installed=()
for s in "${skills[@]}"; do
  if [ ! -d "$src/$s" ]; then echo "[건너뜀] 알 수 없는 skill: $s"; unknown=1; continue; fi
  copy_tree "$src/$s" "$dst/$s"
  installed+=("$s")
  echo "[복사] $s"
done

# 개명된 skill 의 옛 이름 정리(폴더·설정·캐시·데이터)는 새 이름 skill 이 설치돼 있을 때만(이번에 복사했거나 전에 설치) —
# 다른 skill 만 설치하면 옛 skill 이 쓰던 설정·데이터를 그대로 둔다(2026-09-29 Codex 검토 H3)
has_meet=0; [ -f "$dst/kk-meet/SKILL.md" ] && has_meet=1
has_dry=0;  [ -f "$dst/kk-dry/SKILL.md" ] && has_dry=1

# 2-1) 개명된 skill 의 옛 폴더 정리 (2026-09-26 kk-dining → kk-meeting, 2026-09-29 kk-meeting → kk-meet) — kk-meet 이 설치돼 있을 때만
for old in kk-dining kk-meeting; do
  if [ -d "$dst/$old" ]; then
    if [ "$has_meet" -eq 1 ]; then rm -rf "$dst/$old"; echo "[정리] 옛 이름 $old 폴더 삭제 (지금은 kk-meet)";
    else echo "[안내] 옛 $old 폴더가 있습니다 — kk-meet 을 설치하면 정리됩니다: bash ./install.sh kk-meet"; fi
  fi
done

# 2-2) 개명된 skill 의 옛 폴더 정리 (2026-09-29 kk-dooray → kk-dry) — kk-dry 가 설치돼 있을 때만
if [ -d "$dst/kk-dooray" ]; then
  if [ "$has_dry" -eq 1 ]; then rm -rf "$dst/kk-dooray"; echo "[정리] 옛 이름 kk-dooray 폴더 삭제 (지금은 kk-dry)";
  else echo "[안내] 옛 kk-dooray 폴더가 있습니다 — kk-dry 를 설치하면 정리됩니다: bash ./install.sh kk-dry"; fi
fi

# 3) 개인설정 폴더 + 템플릿 (없을 때만 — 기존 값 보존) + kiki_root 확정·기록 (기존 값이 있으면 그것이 진짜 작업 폴더)
mkdir -p "$cfg"
if [ "$has_meet" -eq 1 ] && [ -f "$cfg/kk-meeting.config.json" ] && [ ! -f "$cfg/kk-meet.config.json" ]; then
  mv "$cfg/kk-meeting.config.json" "$cfg/kk-meet.config.json"; echo "[정리] kk-meeting.config.json → kk-meet.config.json (skill 개명)"
fi
if [ "$has_meet" -eq 1 ] && [ -f "$cfg/kk-dining.config.json" ] && [ ! -f "$cfg/kk-meet.config.json" ]; then
  mv "$cfg/kk-dining.config.json" "$cfg/kk-meet.config.json"
  # 옛 설정 안의 dining 경로도 meeting 으로
  sed -e 's#/dining/#/meeting/#g' -e 's#\\\\dining\\\\#\\\\meeting\\\\#g' "$cfg/kk-meet.config.json" > "$cfg/kk-meet.config.json.tmp" && mv "$cfg/kk-meet.config.json.tmp" "$cfg/kk-meet.config.json"
  echo "[정리] kk-dining.config.json → kk-meet.config.json (skill 개명, 안의 dining 경로도 meeting 으로)"
fi
if [ "$has_dry" -eq 1 ] && [ -f "$cfg/kk-dooray.cache.json" ] && [ ! -f "$cfg/kk-dry.cache.json" ]; then
  mv "$cfg/kk-dooray.cache.json" "$cfg/kk-dry.cache.json"; echo "[정리] kk-dooray.cache.json → kk-dry.cache.json (skill 개명)"
fi
if [ ! -f "$cfg/kiki.config.json" ]; then
  cp "$src/_shared/kiki.config.example.json" "$cfg/kiki.config.json"
  echo "[생성] $cfg/kiki.config.json  (본인 값은 첫 실행 때 Claude 가 채움)"
fi
cfgjson="$cfg/kiki.config.json"
if grep -qE '"kiki_root":[[:space:]]*""' "$cfgjson"; then
  # JSON 문자열로 안전하게 (역슬래시·따옴표·& 등 어떤 경로든) — awk 는 어디에나 있다
  esc=$(printf '%s' "$root" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
  R="$esc" awk '{ if (!d && match($0, /"kiki_root":[ \t]*""/)) { $0 = substr($0, 1, RSTART - 1) "\"kiki_root\": \"" ENVIRON["R"] "\"" substr($0, RSTART + RLENGTH); d = 1 } print }' "$cfgjson" > "$cfgjson.tmp" && mv "$cfgjson.tmp" "$cfgjson"
  echo "[기록] kiki_root = $root  ($cfgjson)"
elif grep -q '"kiki_root"' "$cfgjson"; then
  prev=$(sed -nE 's/.*"kiki_root":[[:space:]]*"((\\.|[^"\\])*)".*/\1/p' "$cfgjson" | head -1 | sed -e 's/\\\\/\\/g' -e 's/\\"/"/g')
  if [ -n "$prev" ] && [ "$prev" != "$root" ]; then
    echo "[주의] kiki_root 는 기존 값을 유지합니다: $prev  (이번 --root: $root). 바꾸려면 $cfgjson 의 kiki_root 를 고치세요."
    root="$prev"
  fi
else
  echo "[주의] 기존 kiki.config.json 에 kiki_root 항목이 없습니다. 첫 실행 때 Claude 가 추가합니다: $root"
fi

# 4) kiki 작업 폴더 (확정된 root) — 데이터 폴더 + token.txt
if [ "$has_meet" -eq 1 ] && [ -d "$root/dining" ]; then
  # 앞선 설치가 만들어 둔 빈 meeting/ 은 비어 있을 때만 치우고 옮긴다(내용이 있으면 손대지 않음)
  if [ -d "$root/meeting" ] && [ -z "$(ls -A "$root/meeting")" ]; then rmdir "$root/meeting"; fi
  if [ ! -d "$root/meeting" ]; then mv "$root/dining" "$root/meeting"; echo "[정리] 데이터 폴더 dining/ → meeting/ (skill 개명)";
  else echo "[안내] dining/ 과 meeting/ 이 둘 다 있습니다 — dining/ 의 내용을 meeting/ 으로 직접 합친 뒤 dining/ 을 지우세요: $root"; fi
fi
mkdir -p "$root" "$root/budget" "$root/inspect" "$root/_tmp"
[ -d "$root/dining" ] || mkdir -p "$root/meeting"   # 옛 dining/ 이 남아 있으면(kk-meet 미설치) 빈 meeting/ 을 만들지 않는다 — 나중 이동이 막히지 않게
tok="$root/token.txt"
if [ ! -f "$tok" ]; then
  cp "$src/_shared/token.txt.example" "$tok"
  echo "[생성] $tok  (Dooray 토큰은 이 파일의 'Dooray token:' 다음 줄에 — kk-pay 카드 RPA 업로드 때만 필요)"
fi

# 5) Python / Node.js 확인 (실제로 실행해 본다 — 이름만 있는 스텁은 제외; 설치는 안내만)
echo ""
if python3 -c 'import sys' >/dev/null 2>&1 || python -c 'import sys' >/dev/null 2>&1; then echo "[확인] Python  있음"
else echo "[주의] Python 이 없습니다 — kk-budget/kk-pay/kk-meet/kk-inspect/kk-wiki(와 kk-dry 받기·쓰기·올리기) 에 필요. macOS: brew install python  /  Linux: sudo apt install python3 python3-pip  /  https://www.python.org/downloads/"; fi
if node --version >/dev/null 2>&1 && npx --version >/dev/null 2>&1; then echo "[확인] Node.js 있음"
else echo "[주의] Node.js 가 없습니다 — 파일첨부(chrome-devtools-mcp) 에 필요. macOS: brew install node  /  Linux: sudo apt install nodejs npm  /  https://nodejs.org/ (LTS)"; fi

echo ""
echo "=^.^=  kiki 설치 완료"
echo "완료. ⚠️  Claude Code(또는 Claude Desktop)를 재시작한 뒤 'kk-<skill> 설정해줘' 로 첫 실행하세요."
echo "    (새 skill 은 재시작해야 인식됩니다. Desktop 은 Dock 아이콘 → Quit 으로 완전 종료 후 재실행)"
echo "kiki 작업 폴더: $root   (엑셀·회의록·검수 파일은 여기 하위 budget/ meeting/ inspect/ 에)"
echo "토큰 파일     : $tok    (채팅창에 토큰을 붙여넣지 말고 이 파일에 저장)"
echo "개인 config   : $cfg  (repo 에는 올라가지 않습니다)"
echo "※ macOS/Linux 제한: hwp→pdf 자동 변환(kk-pay 증빙)만 Windows+아래아한글 전용. 회의록 hwpx 생성은 모든 OS(열람은 HOP: brew install hop). 그 외 기능은 동일."
if [ "$unknown" -eq 1 ]; then echo "⚠️  일부 skill 이름을 찾지 못했습니다 — 철자를 확인하세요." >&2; exit 1; fi
