#!/usr/bin/env bash
# kiki 오프라인 결함 주입 시험 — 네트워크·로그인·실데이터 없이, 격리된 임시 폴더에서만 돈다.
#   bash tools/selftest.sh          (Git Bash / macOS / Linux, python·node 필요)
# 확인하는 것(2026-09-27 전체 흐름 검수): 실패가 '0건·없음'으로 보이지 않는가 / 옛 다운로드를 조용히 쓰지 않는가 /
#   쓰기 스크립트가 일부만 바꾼 채 멈추지 않는가 / 담당자표(중대 자산)를 가져오기가 줄이지 않는가.
# ⚠️ HOME·USERPROFILE·KIKI_ROOT·KIKI_DOWNLOADS 를 모두 임시 폴더로 바꿔 돌린다 — 실제 ~/.claude/kiki·C:\kiki 는 건드리지 않는다.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
S="$REPO/skills"
win() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
T="$(win "$(mktemp -d)")"
export HOME="$T/h" USERPROFILE="$T/h" KIKI_ROOT="$T/kiki" KIKI_DOWNLOADS="$T/dl" PYTHONIOENCODING=utf-8 DOORAY_TOKEN=""
mkdir -p "$HOME" "$KIKI_ROOT" "$KIKI_DOWNLOADS"
PY=python; command -v python >/dev/null 2>&1 || PY=python3
fail=0; n=0
chk() { n=$((n+1)); if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fail=$((fail+1)); fi; }
trap 'rm -rf "$T"' EXIT

echo "== 1. 브라우저 코어(.min.js) 결함 주입"
if command -v node >/dev/null 2>&1; then
  node "$REPO/tools/selftest_cores.js" > "$T/cores.txt" 2>&1; rc=$?
  grep -E "^FAIL" "$T/cores.txt"; tail -1 "$T/cores.txt"
  chk "코어 시험 전부 통과" "[ $rc -eq 0 ]"
else
  echo "SKIP node 없음"
fi

echo "== 2. 담당자표 가져오기 보호(wiki_staff.py)"
W="$PY $S/kk-wiki/scripts/wiki_staff.py"
team() { printf '## 팀: %s | 글번호 %s | 게시일 2026-08-18 | 게시자 김키키 | 제목 %s 업무분장 | id A%s | url u%s\n%s\n\n' "$1" "$2" "$1" "$2" "$2" "$3"; }
TBL=$'| 직무구분 | 직무 내용 | 담당 |\n| 팀장 | 총괄 | 김키키 (NNNN) |\n| 출장 | 여비 정산 | 이키키 (NNNN) |'
{ echo "=== KKWIKI-STAFF v1 | exported 2026-09-27T00:00:00Z | board FC_BBS224 | teams 3 | run aaaa ==="; team 재무팀 100 "$TBL"; team 구매팀 101 "$TBL"; team 총무팀 102 "$TBL"; echo "=== END ==="; } > "$T/d1.txt"
$W import "$T/d1.txt" > "$T/o1" 2>&1; chk "첫 가져오기 3팀" "grep -q '3팀 (표 있음 3' '$T/o1'"
{ echo "=== KKWIKI-STAFF v1 | exported 2026-09-27T01:00:00Z | board FC_BBS224 | teams 1 | run bbbb ==="; team 재무팀 100 "(표 없음 — 수집 오류: timeout)"; echo "=== END ==="; } > "$T/d2.txt"
$W import --keep "$T/d2.txt" > "$T/o2" 2>&1
chk "수집 오류 팀은 기존 표 유지(--keep)" "$W team 재무팀 | grep -q '여비 정산' && grep -q '이전 표 유지 1' '$T/o2'"
$W import "$T/d2.txt" > "$T/o3" 2>&1
chk "--keep 없이 팀이 빠지면 저장 거부" "grep -q '저장하지 않았습니다' '$T/o3' && $W status | grep -q '3팀'"
{ echo "=== KKWIKI-STAFF v1 | exported 2026-09-27T02:00:00Z | board FC_BBS224 | teams 3 | run cccc ==="; team 재무팀 100 "$TBL"; team 구매팀 101 "(표 없음 — 이미지 게시글, 이미지 1개: 링크에서 직접 확인)"; team 총무팀 999 "(표 없음 — 이미지 게시글, 이미지 1개: 링크에서 직접 확인)"; echo "=== END ==="; } > "$T/d3.txt"
$W import "$T/d3.txt" > "$T/o4" 2>&1
chk "같은 글번호 이미지 게시글은 판독본 유지" "$W team 구매팀 | grep -q '여비 정산'"
chk "새 이미지 게시글은 OCR 필요 알림" "grep -q '판독(OCR) 필요: 총무팀' '$T/o4'"
{ echo "=== KKWIKI-STAFF v1 | exported 2026-09-27T03:00:00Z | board FC_BBS224 | teams 3 | run dddd ==="; team 재무팀 100 "$TBL"; team 구매팀 101 "$TBL"; } > "$T/d4.txt"
$W import --keep "$T/d4.txt" > "$T/o5" 2>&1; chk "잘린 덤프 저장 거부" "grep -q '잘렸을 수 있음' '$T/o5'"
cp "$T/d1.txt" "$T/dl/kiki_staff_dump_260927_aaaa.txt"
$W import --from-downloads --expect nope > "$T/o6" 2>&1 & P=$!
sleep 2; sed 's/run aaaa/run nope/' "$T/d1.txt" > "$T/dl/kiki_staff_dump_260927_nope.txt"; wait $P
chk "--expect: 기다리다 도착한 그 실행의 덤프만 사용" "grep -q '덤프 복사' '$T/o6' && grep -q '_nope' '$T/o6'"
$W import --from-downloads --expect zzzz > "$T/o7" 2>&1; chk "--expect: 없는 실행이면 옛 파일을 쓰지 않음" "grep -q '이전 실행분이라 쓰지 않습니다' '$T/o7'"

echo "== 2b. 위키 스냅샷 브라우저 가져오기 보호(wiki_snapshot.py import)"
WS="$PY $S/kk-wiki/scripts/wiki_snapshot.py"
"$PY" - "$T" <<'EOF'
import json, os, sys
T = sys.argv[1]
pg = lambda i: {"id": str(i), "subject": "쪽" + str(i), "body": "본문 " + str(i), "path": ["Home", "쪽" + str(i)], "depth": 1, "parent": "1", "updatedAt": "2026-09-01T10:00:00+09:00", "version": 1}
full = {"run_id": "w001", "space_id": "S", "home_page_id": "1", "pages": [pg(1), pg(2), pg(3), pg(4), pg(5)]}
part = {"run_id": "w002", "space_id": "S", "home_page_id": "1", "walk_errors": [{"pid": "3", "path": "Home", "error": "DOORAY: denied"}],
        "pages": [pg(1), pg(2), {"id": "4", "subject": "쪽4", "error": "DOORAY: 페이지 응답에 content 없음", "body": ""}]}
json.dump(full, open(os.path.join(T, "full.json"), "w", encoding="utf-8"), ensure_ascii=False)
json.dump(part, open(os.path.join(T, "part.json"), "w", encoding="utf-8"), ensure_ascii=False)
EOF
$WS import "$T/full.json" > "$T/w1" 2>&1; chk "위키 5쪽 가져오기" "$WS status | grep -q ': 5 페이지'"
$WS import "$T/part.json" > "$T/w2" 2>&1
chk "가지 실패·오류 페이지가 있으면 기존 페이지를 지우거나 덮지 않음" "grep -q '하위 목록을 못 받은 가지 1곳' '$T/w2' && $WS status | grep -q ': 5 페이지' && grep -q '본문 4' '$KIKI_ROOT/wiki/raw/4.json'"

echo "== 3. 예산 엑셀(make_report.py)"
M="$PY $S/kk-budget/scripts/make_report.py"
"$PY" - "$T/dl" <<'EOF'
import json, os, sys
d = sys.argv[1]
s = {"run_id": "r001", "collected_at": "2026-09-27 10:00", "snapshot_date": "2026-09-27", "track_categories": ["재료비"], "user_name": "김키키",
     "projects": [{"acccd": "2E11111", "name": "○○", "pi": "김키키", "role": "주관", "totBudg": 1, "direct": {"A": 100, "D": 50},
                   "categories": {"재료비": {"A": 100, "D": 50, "exec": 50, "pendingDone": 0, "pendingProg": 0}}}], "not_found": [], "warnings": ["2E22222 조회 실패: PORTAL: x"]}
json.dump(s, open(os.path.join(d, "kiki_budget_2026-09-27_r001.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
s["run_id"] = "r000"; s["projects"] = []
json.dump(s, open(os.path.join(d, "kiki_budget_2026-09-27_r000.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
EOF
$M --from-downloads --expect r001 --out "$T/o.xlsx" --save-snapshot "$T/snap" > "$T/b1" 2>&1
chk "run 짝짓기 + 경고 표시 + 보관" "grep -q 'run r001, 경고 1' '$T/b1' && [ -f '$T/o.xlsx' ] && [ -f '$T/snap/260927.json' ]"
$M --from-downloads --expect r000 --out "$T/o0.xlsx" --save-snapshot "$T/snap0" > "$T/b2" 2>&1
chk "과제 0건 스냅샷은 엑셀·보관 모두 거부" "grep -q '과제가 0건' '$T/b2' && [ ! -f '$T/o0.xlsx' ] && [ ! -d '$T/snap0' ]"

echo "== 4. 지급신청 파일(kk_pay_files.py) · 업로드 파일명(dooray_drive.py)"
K="$PY $S/kk-pay/scripts/kk_pay_files.py"
mkdir -p "$T/r"; printf x > "$T/r/a.jpg"; printf y > "$T/r/b.pdf"
cat > "$T/items.json" <<J
[{"file":"$T/r/a.jpg","acccd":"2E11111","item":"15","bimok":"330","apprno":"12345678","holder":"김키키","desc":"○○ 시약 구입","kind":"card","card_kind":"법인"},
 {"file":"$T/r/b.pdf","acccd":"26N1111","item":"15","bimok":"330","holder":"김키키","desc":"○○ 장비 수리","kind":"tax"}]
J
$K apply "$T/items.json" > "$T/p1" 2>&1; chk "apply 2건" "grep -q '이름 변경 2건' '$T/p1'"
$K apply "$T/items.json" > "$T/p2" 2>&1; chk "apply 다시 돌려도 안전" "grep -q '이미 적용됨 2건' '$T/p2'"
$K archive "$T/items.json" --base "$T/r" > "$T/p3" 2>&1; chk "같은 items.json 으로 archive(바뀐 이름 추적)" "grep -q '이동 2건' '$T/p3' && ls '$T/r/신청완료/세금계산서/26N1111' | grep -q '장비 수리'"
printf p > "$T/r/p1.jpg"; printf q > "$T/r/p2.jpg"; printf e > "$T/r/2E11111_15_330_87654321_김키키]둘째.jpg"
cat > "$T/items3.json" <<J
[{"file":"$T/r/p1.jpg","acccd":"2E11111","item":"15","bimok":"330","apprno":"11112222","holder":"김키키","desc":"첫째","kind":"card"},
 {"file":"$T/r/p2.jpg","acccd":"2E11111","item":"15","bimok":"330","apprno":"87654321","holder":"김키키","desc":"둘째","kind":"card"}]
J
$K apply "$T/items3.json" > "$T/p4" 2>&1; chk "충돌이 하나라도 있으면 아무것도 안 바꿈" "grep -q '아무것도 바꾸지 않았습니다' '$T/p4' && [ -f '$T/r/p1.jpg' ]"
printf z > "$T/r/c.jpg"
cat > "$T/items4.json" <<J
[{"file":"$T/r/c.jpg","acccd":"2E11111","item":"15","bimok":"330","apprno":"12345678","holder":"김키키","desc":"아주 긴 적요가 계속 이어지는 경우 ○○ 시약 외 여러 건 구입 및 장비 부품 교체 비용 정산 추가 설명 문구","kind":"card"}]
J
$K plan "$T/items4.json" > "$T/p5" 2>&1; chk "80자 초과 이름을 점검 필요로" "grep -q 'RPA 규칙 80자' '$T/p5'"
D="$PY $S/kk-pay/scripts/dooray_drive.py"
$D upload 1234567890 "$T/r/c.jpg" > "$T/u1" 2>&1; rc=$?
chk "규칙 밖 파일명은 업로드 전에 거부(토큰 없어도 검사 먼저)" "[ $rc -eq 1 ] && grep -q '올리지 않았습니다' '$T/u1'"
$D check > "$T/u2" 2>&1; rc=$?; chk "토큰 없으면 check 종료 코드 1" "[ $rc -eq 1 ] && grep -q '토큰 없음' '$T/u2'"
FAKE="FAKETOKENabcdefghijk:lmnopqrstuvwxyz01234"
printf '%s\nDooray token:\n' "$FAKE" > "$KIKI_ROOT/token.txt"; $D check > "$T/u3" 2>&1
chk "안내 줄 위에 붙인 토큰(':' 포함)도 읽음" "grep -q 'OK (길이 41' '$T/u3' && ! grep -q FAKETOKEN '$T/u3'"
rm -f "$KIKI_ROOT/token.txt"

echo "== 5. 회의록 엑셀(meeting_log_xlsx.py)"
L="$PY $S/kk-meeting/scripts/meeting_log_xlsx.py"
cat > "$T/row.json" <<'J'
{"date_text":"9월 15일 12:00~13:30","amount":"130,000","place":"○○식당","acccd":"2E11111","int_members":"김키키","ext_members":"이키키","ext_org":"○○대학교","title":"○○ 연구 진행 점검","content":"1. 진행 공유"}
J
$L append "$T/row.json" --yymm 2609 > "$T/m1" 2>&1; chk "append 순번 1" "grep -q '순번 1' '$T/m1'"
$L append "$T/row.json" --yymm 2609 > "$T/m2" 2>&1; chk "같은 회의 두 번 기록 거부" "grep -q '이미 순번 1' '$T/m2'"
echo '{"date_text":"","amount":0,"place":"○○카페","acccd":"2E11111","title":""}' > "$T/bad.json"
$L append "$T/bad.json" --yymm 2609 > "$T/m3" 2>&1; chk "필수 항목 빈 행 거부" "grep -q '필수 항목이 비어' '$T/m3'"
printf 'broken' > "$KIKI_ROOT/meeting/meeting_log/2608_회의록.xlsx"
$L titles > "$T/m4" 2>&1; chk "titles 한 줄씩 + 읽지 못한 파일 경고" "grep -q '○○ 연구 진행 점검' '$T/m4' && grep -q '읽지 못한 회의록 파일' '$T/m4'"

echo "== 6. 환경 점검(kiki_doctor.py) — 빈 환경"
$PY "$S/_shared/kiki_doctor.py" > "$T/k1" 2>&1
chk "doctor 요약 줄 + KIKI_DOWNLOADS 반영" "grep -q '^\[요약\]' '$T/k1' && grep -q \"$(basename "$KIKI_DOWNLOADS")\" '$T/k1'"

echo
echo "[요약] $((n - fail))/$n PASS" $([ $fail -gt 0 ] && echo "— $fail FAIL")
exit $([ $fail -eq 0 ] && echo 0 || echo 1)
