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

echo "== 7. 회의 기록 → 글(kk-meeting transcribe.py)"
TR="$S/kk-meeting/scripts/transcribe.py"
"$PY" - "$T" <<'EOF'
import os, sys, wave, zipfile
T = sys.argv[1]
with wave.open(os.path.join(T, "회의 260915_130200.wav"), "wb") as w:        # 90초 무음(파일 이름에 녹음 시각)
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000); w.writeframes(b"\0\0" * 16000 * 90)
with zipfile.ZipFile(os.path.join(T, "메모.docx"), "w") as z:
    z.writestr("word/document.xml", '<w:document><w:body><w:p><w:r><w:t>1. 촉매 결과</w:t><w:br/><w:t>담당 김키키</w:t></w:r></w:p></w:body></w:document>')
open(os.path.join(T, "m.vtt"), "w", encoding="utf-8").write("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v 이키키>시작하겠습니다.</v>\n")
open(os.path.join(T, "old.hwp"), "wb").write(b"\xd0\xcf")
EOF
$PY "$TR" check "$T/회의 260915_130200.wav" > "$T/t1" 2>&1
chk "check: 녹음 길이·파일 이름 시각·사용자 안내 한 줄·요약 줄" "grep -q '녹음 2분' '$T/t1' && grep -q '파일 이름 시각 2026-09-15 13:02' '$T/t1' && [ \$(grep -c '^\[사용자 안내\] ' '$T/t1') -eq 1 ] && grep -q '^\[요약\] 설치됨 ' '$T/t1'"
"$PY" - "$S/kk-meeting/scripts" > "$T/t2" 2>&1 <<'EOF'
import sys
sys.path.insert(0, sys.argv[1])
import transcribe as t
t.audio_info = lambda p: {"file": "x.m4a", "size_mb": 30, "duration": 62 * 60, "created": None, "how": "mp4", "mtime": "2026-09-15 14:05"}
inst = {"faster_whisper": None, "models": [], "gpu_libs": False}
t._installed = lambda: inst
def route(cores, ram, gpu, path=None):
    t._cpu = lambda: {"name": "", "logical": cores * 2, "physical": cores}
    t._ram_gb = lambda: ram
    t._gpu = lambda: gpu
    r = t.assess(path)
    return r["route"], r["alt"]
print("gpu", route(12, 64, {"name": "NVIDIA RTX", "mem_gb": 16}))
print("cpu8", route(8, 16, None))
print("cpu4_62min", route(4, 8, None, "x.m4a"))
print("cpu2", route(2, 16, None))
print("ram4", route(8, 4, None))
EOF
chk "check: 사양별 권장(그래픽카드·8코어·4코어 62분·2코어·메모리 4GB)" "grep -q \"gpu ('local-gpu', 'local-cpu')\" '$T/t2' && grep -q \"cpu8 ('local-cpu', 'phone')\" '$T/t2' && grep -q \"cpu4_62min ('phone', 'local-cpu')\" '$T/t2' && grep -q \"cpu2 ('phone', 'local-cpu')\" '$T/t2' && grep -q \"ram4 ('phone', 'local-cpu')\" '$T/t2'"
"$PY" - "$S/kk-meeting/scripts" > "$T/t2b" 2>&1 <<'EOF'
import sys, re
sys.path.insert(0, sys.argv[1])
import transcribe as t
t.audio_info = lambda p: {"file": "x.m4a", "size_mb": 30, "duration": 62 * 60, "created": None, "how": "mp4", "mtime": "2026-09-15 14:05"}
def msg(installed, cores, gpu):
    t._installed = lambda: {"faster_whisper": "1.2.1" if installed else None, "models": ["small", "turbo"] if installed else [], "gpu_libs": installed}
    t._cpu = lambda: {"name": "", "logical": cores * 2, "physical": cores}
    t._ram_gb = lambda: 16
    t._gpu = lambda: gpu
    return t.user_message(t.assess("x.m4a"))
G = {"name": "NVIDIA RTX", "mem_gb": 12}
m = {"설치됨·그래픽카드": msg(True, 12, G), "설치됨·CPU": msg(True, 4, None), "미설치·그래픽카드": msg(False, 12, G), "미설치·CPU": msg(False, 4, None)}
ok = ("바로 글로 바꾸겠습니다" in m["설치됨·그래픽카드"] and "설치할까요" not in m["설치됨·그래픽카드"]
      and "다른 일을 하셔도" in m["설치됨·CPU"] and "설치할까요" not in m["설치됨·CPU"]
      and "빠르지만" in m["미설치·그래픽카드"] and m["미설치·그래픽카드"].endswith("설치할까요?")
      and "그래픽카드가 없어 오래 걸립니다" in m["미설치·CPU"] and m["미설치·CPU"].endswith("설치할까요?")
      and not any(re.search(r"pip|faster|whisper|nvidia|cudnn|turbo|small|--", v, re.I) for v in m.values()))
print("MSG_OK" if ok else "MSG_BAD " + repr(m))
EOF
chk "check: 사용자 안내 네 가지(설치됨이면 묻지 않음·미설치면 설치할까요·CPU 는 오래 걸림·기술 용어 없음)" "grep -q '^MSG_OK' '$T/t2b'"
$PY "$TR" text "$T/메모.docx" > "$T/t3" 2>&1; $PY "$TR" text "$T/m.vtt" >> "$T/t3" 2>&1; $PY "$TR" text "$T/old.hwp" >> "$T/t3" 2>&1
chk "text: docx 줄바꿈·자막 화자·hwp 안내" "grep -q '담당 김키키' '$KIKI_ROOT/meeting/transcripts/메모_회의기록.txt' && grep -q '이키키: 시작하겠습니다.' '$KIKI_ROOT/meeting/transcripts/m_회의기록.txt' && grep -q 'hwpx 나 pdf 로 저장' '$T/t3'"
mkdir -p "$T/nofw/faster_whisper"; echo 'raise ImportError("selftest: 설치 안 된 PC 흉내")' > "$T/nofw/faster_whisper/__init__.py"   # 이 PC 에 설치돼 있어도 '없음' 경로를 시험
PYTHONPATH="$T/nofw" $PY "$TR" run "$T/회의 260915_130200.wav" > "$T/t4" 2>&1; rc=$?
chk "run: faster-whisper 없으면 종료 코드 2 + 동의 후 설치 안내" "[ $rc -eq 2 ] && grep -q '사용자 동의 후 설치' '$T/t4'"
FW="$T/fakefw/faster_whisper"; mkdir -p "$FW"
cat > "$FW/__init__.py" <<'EOF'
import os
class _S:
    def __init__(s, a, b, t, cr=1.2):
        s.start, s.end, s.text, s.compression_ratio, s.no_speech_prob, s.avg_logprob = a, b, t, cr, 0.01, -0.2
class _I:
    duration, duration_after_vad = 90.0, 80.0
class WhisperModel:
    def __init__(self, name, device="cpu", **kw):
        if device == "cuda":
            os.abort()                      # 그래픽카드 라이브러리 문제로 프로세스째 멈추는 경우 흉내
    def transcribe(self, path, **kw):
        segs = [_S(0, 5, " 오늘 회의는 촉매 합성 결과를 공유하는 자리입니다. 두 번째 촉매 선택도가 가장 높았습니다. 다음 주까지 장시간 시험을 진행하기로 했습니다."),
                _S(5, 7, " 시청해 주셔서 감사합니다."), _S(7, 9, " 음 음 음 음 음 음 음 음", cr=3.2),
                _S(10, 20, " 결정 사항은 두 가지입니다. 장시간 안정성 시험과 전극 열화 원인 분석입니다. 담당은 김키키 연구원과 이키키 연구원입니다.")]
        return iter(segs), _I()
EOF
PYTHONPATH="$T/fakefw" $PY "$TR" run "$T/회의 260915_130200.wav" --device cuda --hint "촉매 전극" > "$T/t5" 2>&1; rc=$?
chk "run: 그래픽카드 강제 종료 → CPU 자동 전환, 지어낸 문구 2개 제거, 요약 줄" "[ $rc -eq 0 ] && grep -q 'CPU 로 다시' '$T/t5' && grep -q '지어낸 문구 2개 뺌' '$T/t5' && grep -q '^\[요약\] 녹음 2분 → 글' '$T/t5' && ! grep -q '시청해' \"$KIKI_ROOT/meeting/transcripts/회의 260915_130200_녹취록.txt\""

echo
echo "[요약] $((n - fail))/$n PASS" $([ $fail -gt 0 ] && echo "— $fail FAIL")
exit $([ $fail -eq 0 ] && echo 0 || echo 1)
