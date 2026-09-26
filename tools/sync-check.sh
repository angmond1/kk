#!/usr/bin/env bash
# kiki sync-check — 설치본(~/.claude/skills/kk-*)을 쓰며 고친 로직을 본진(D:/repo/kiki/skills)으로
#   취합("방식 다")하기 전 점검 리포트. ⚠️ READ-ONLY — diff·개인정보 스캔만 출력, 자동 반영하지 않는다.
#   (실제 반영은 사람/Claude 가 1)의 차이 중 '로직·문서 개선'만 골라 수동으로.)
#
#   개인 config·학습은 ~/.claude/kiki/ 에 격리돼 skill 폴더엔 원래 안 섞이지만, 이중 안전으로 스캔한다.
#
# 사용: bash tools/sync-check.sh
set -uo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
installed="$HOME/.claude/skills"
src="$repo/skills"

echo "================ kiki sync-check ================"
echo "설치본: $installed"
echo "본진  : $src"
echo ""
echo "=== 1) 설치본 ↔ 본진 차이 (config.json·env 제외 = 순수 로직/문서) ==="
found=0
for d in "$src"/kk-* "$src/_shared"; do
  name="$(basename "$d")"
  if [ -d "$installed/$name" ]; then
    out=$(diff -rq "$installed/$name" "$d" 2>/dev/null | grep -viE "\.config\.json|kiki\.env")
    if [ -n "$out" ]; then echo "[$name]"; echo "$out" | sed 's/^/  /'; found=1; fi
  else
    echo "  (설치 안됨: $name)"
  fi
done
[ "$found" -eq 0 ] && echo "  (차이 없음 — 설치본과 본진이 동일)"
echo ""
echo "  상세 diff:  diff -ru \"$installed/<skill>\" \"$src/<skill>\""
echo ""
echo ""
echo "=== 0) 브라우저 코어 .min.js 최신 여부 (원본 .js 를 고쳤으면 python tools/build_min.py) ==="
python "$(dirname "$0")/build_min.py" --check || true

echo "=== 2) 설치본 skill 폴더 개인정보 스캔 (본진 반영 전 0건이어야) ==="
# 진짜 위험 신호만: 실명·메인테이너 ID·개인 이메일 도메인·토큰 실제값·실제 개인 home 경로.
#   (기관 공용 메일 @kist.re.kr·@nrf.re.kr, 6자리 코드/날짜/금액/hex 는 skill 본문에 정상적으로 많아 제외.)
hit=$(grep -rInE "이동기|\bdnklee\b|@(gmail|naver|daum|hanmail|outlook|nate)\.|(DOORAY[_A-Za-z]*|[Tt]oken)['\"]?[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9]{12,}|[A-Za-z]:\\\\Users\\\\[A-Za-z0-9가-힣._-]+\\\\" \
        "$installed"/kk-* "$installed/_shared" 2>/dev/null \
      | grep -viE "\.config\.json|\.example|dnklee@kist\.re\.kr" )
if [ -n "$hit" ]; then
  echo "$hit" | head -30 | sed 's/^/  [확인필요] /'
  echo "  ↑ 위 항목은 본진에 반영하면 안 됨 (개인정보일 수 있음). config 로 빼거나 익명화."
else
  echo "  (개인정보 패턴 없음 — config 는 ~/.claude/kiki 라 애초에 분리됨)"
fi
echo ""
echo "다음: 1) 차이 중 '로직·문서 개선'만 본진에 수동 반영 → tools/fresh-test.sh 로 재검증 → 배포 전 보안 grep → commit/push."
echo "================================================="
