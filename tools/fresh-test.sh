#!/usr/bin/env bash
# kiki fresh-install 검증 harness (메인테이너 전용 — 일반 사용자/배포 동작엔 영향 없음).
#
# 목적: "다른 컴퓨터에서 kiki 를 처음 설치" 를 이 머신에서 재현해 zeroshot 여부를 검증한다.
#   격리 3종을 모두 만족시키는 게 핵심:
#     (1) 환경 격리   — 빈 가짜 HOME (실제 ~/.claude 와 분리. 이 머신에 kiki 가 실제 설치돼 있어도 무관)
#     (2) 배포본만    — git checkout-index 로 추적 파일만 추출 (CLAUDE.local.md 등 본진 전용물 자동 제외)
#     (3) 맥락 격리   — Claude 가 general-purpose sub-agent 를 spawn, repo 원본·기억 참조 금지
#                       (※ 같은 세션/같은 Claude 가 직접 설치 테스트하면 이미 kiki 를 알아서 fresh 가 아니다)
#
# 사용:
#   bash tools/fresh-test.sh [run-id]
# 출력:
#   <repo>/_tmp/fresh_eval/dist        = 실제 git clone 과 동일한 배포 파일셋 (추적 파일만, LF 정리)
#   <repo>/_tmp/fresh_eval/<run>/home  = 빈 가짜 HOME (= 새 컴퓨터의 ~)
# 이후 Claude 가:
#   - general-purpose sub-agent spawn
#   - tools/evaluator_prompt.md 의 {{DIST}}/{{RUN_HOME}} 를 위 경로로 치환해 주입
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run="${1:-run-$(date +%Y%m%d-%H%M%S)}"
eval_dir="$repo/_tmp/fresh_eval"
dist="$eval_dir/dist"
home="$eval_dir/$run/home"

# 1) 배포본 추출 — HEAD 에 커밋된 파일만(= 실제 clone). 작업 트리의 미추적·gitignore 파일(wiki/ 등 개인 데이터)은 절대 섞이지 않는다.
rm -rf "$dist"; mkdir -p "$dist"
git -C "$repo" archive HEAD | tar -x -C "$dist"

# 2) LF 정리 — 이 Windows 환경의 autocrlf 가 입히는 CRLF 를 제거해 실제 mac/linux clone(LF) 을 재현.
#    (실제 배포는 .gitattributes eol=lf 로 LF 보장. 여기선 git archive/checkout-index 의 로컬 autocrlf 보정.)
find "$dist" -type f \( -name '*.sh' -o -name '*.py' -o -name '*.js' -o -name '*.md' -o -name '*.json' -o -name '*.yml' -o -name '*.yaml' \) \
  -exec bash -c 'tr -d "\015" < "$1" > "$1.lf" && mv "$1.lf" "$1"' _ {} \;

# 3) 빈 가짜 HOME
rm -rf "$home"; mkdir -p "$home"

echo "[fresh-test] 준비 완료"
echo "  DIST     = $dist"
echo "  RUN_HOME = $home"
echo ""
echo "다음(Claude): general-purpose sub-agent 를 spawn 하고 tools/evaluator_prompt.md 를 주입."
echo "  치환  {{DIST}} -> $dist"
echo "        {{RUN_HOME}} -> $home"
echo "  sub-agent 에 'repo 원본(D:/repo/kiki)·기억 참조 금지' 를 강제해야 진짜 fresh."
