---
name: kk-budget
description: KIST 과제 예산 수집·리포트 자동화 skill (kiki 패키지). 통합정보 예실대비표(bdg_2030)를 좌표 없이 fetch 직접조회해 과제별 카테고리 예산총액/집행/잔액을 수집, 로컬 엑셀 리포트 + 세션 채팅 표로 출력한다. 공동과제는 본인 지분만 집계(optional). 사용자가 "예산 수집", "예산 조회/정리해줘", "과제 예산 현황", "예실대비표", "예산 리포트", "kk-budget", "내 과제 예산 정리", "예산 잔액" 등을 요청할 때 사용. 조회·로컬 저장 전용(포털 제출/변경 없음).
---

# kk-budget — KIST 과제 예산 수집·리포트

통합정보 예실대비표를 **fetch 직접조회**(좌표·해상도·모니터 무관)로 수집해 엑셀 + 채팅 표로 낸다. **조회 전용**(쓰기 없음).

## 정보 5분류 (개인정보 격리)
- **내장(A)**: fetch 코어·컬럼 매핑·검산·엑셀 렌더러·표 양식·직접비 합산·개인지분 로직 → skill.
- **런타임조회(B)**: 본인 과제·예산·집행내역·`authTk` → 실행 때.
- **환경준비(C)**: §1.
- **config(D)**: 본인 이름·추적 과제/카테고리·개인집계·출력폴더 → `~/.claude/kiki/kk-budget.config.json`.
- **격리(E)**: 특정인 이름·사번·계정번호·할당액·개인경로 → skill 텍스트에 0.

## 1. 전제 (환경)
- **환경 점검은 [`../_shared/environment_setup.md`](../_shared/environment_setup.md) 0단계를 따른다** — **평소 쓰는 Chrome 창**(Claude in Chrome 확장, 새 창·chrome-devtools 불필요) + **통합정보 SSO 로그인**(포탈 `e.kist.re.kr` 로그인 → 업무화면 `p.kist.re.kr:8081`; 과제별관리 `rdm_2011` 한 번 열어 `authTk` 활성) + KIST 사내망(밖이면 VPN). python `openpyxl` 은 **엑셀 저장 직전에** 확인·설치. **조회 전용 → 토큰 불요.**
- 공통 개인정보(이름·참여과제)는 `~/.claude/kiki/kiki.config.json` 에서 읽는다(`user.name` 과책 판별, `projects`) → `../_shared/personal_config.md`. 안 되면 "로그인/연결 안내"로 친절 실패(크래시 X).

## 2. 실행 준비 (매 작업/설정 시작)
0. 🔴 **브라우저는 Claude in Chrome(`mcp__claude-in-chrome__*`) 만** — Desktop 앱의 내장 브라우저(`mcp__Claude_Browser__*`, browser pane)는 사용자 Chrome 과 로그인이 공유되지 않는다. `browser_batch` 도 **claude-in-chrome 쪽 것**을 로드해 쓸 것(내장 쪽을 부르면 빈 창이 열리고 `Preview not found` 로 실패, 2026-09-24).
1. `tabs_context_mcp` → 통합정보 탭 확인, 없으면 새 탭 + navigate `http://p.kist.re.kr:8081/nxui/kistis/indexQ.jsp?target=mis.rdm::rdm_2011.xfdl&menuParam=sysCd%3DCUS`.
2. `document.title==="과제별관리"` + `window.application.authTk` 존재 확인. (없으면 로그인 요청)
   - ⚠️ `location.href`/쿠키 반환은 Chrome MCP 보안에 막힘 → 그 필드 빼고 반환.
   - ⚠️ 반환 객체의 **키 이름**에 `authTk`/`token`/`cookie` 가 들어가면 값이 아니어도(길이조차) `[BLOCKED: Sensitive key]` → `ready:true` 불리언만 반환.
3. `scripts/portal_ops.min.js` Read → `javascript_tool` 로 inject (`window.kkBudget`, 반환 `kk-budget-portal/1.5 =^.^=`; (주입은 주석을 뺀 `portal_ops.min.js` 를 쓴다 — 내용 동일, 글자 수 30~40% 적음. 원본 `portal_ops.js` 는 읽을 필요 없다)).

## 3. 부트스트랩 (`kk-budget 설정해줘`, 첫 1회) — 순차 질문

> 🐱 **키키 인사(정체성)**: 첫 실행의 첫 줄은 *"안녕하세요 🐱 kk-budget 를 준비할게요."* 한 줄, 그 다음부터는 평소 문체. 작업 보고의 첫 줄은 상황별 머리표: `😸 완료 — kk-budget`(정상) / `😻 완료`(확인할 것 없음) / `😼 완료`(사용자가 할 일 남음: 결재 상신·확인) / `😺 완료`(조회만 한 가벼운 작업) / `🙀 중단`(막혀서 멈춤, 상황 보고) / `😿 부분 완료`(일부만 처리). 제출 문서·적요·파일명·오류 문구에는 넣지 않는다.

- **0. 환경 점검** — `../_shared/environment_setup.md` 0단계.
- **공통 식별정보(이름·참여과제)는 `~/.claude/kiki/kiki.config.json` 에서 읽는다**(없으면 1회 수집·저장, 다른 skill 재사용). kk-budget 고유(추적 과제·카테고리·개인집계)만 `kk-budget.config.json`.
- **(자동)** 준비(§2) → `kkBudget.queryProjects()` 로 본인 참여 과제 전체 조회(→ kiki.config `projects`). 본인 이름은 kiki.config `user.name`.
- **Q1 — 수집 과제 선택**: `과제번호 + 과제명`(+ PI·역할) 목록 출력 → "앞으로 예산 추적할 과제만 고르세요"(참여 전부 아님). 본인이 PI 아닌 과제(`pi != user.name`)엔 **`ⓘ 과책 아님 — 인건비성 항목 세부내역 조회 불가(계정책임자·지정 계정관리자만)`** 라벨.
- **Q2 — 개인집계 여부**: "공동과제에서 본인 사용분만 따로 집계할 과제가 있나요?(없으면 건너뜀)" — 물을 때 한 줄로 먼저 알린다: *"인건비는 개인별로 나눌 수 없습니다(학생인건비는 풀링제, 인건비성 항목의 세부내역은 계정책임자·지정 계정관리자만 조회). 인건비를 뺀 비목으로 집계합니다."*
  - Q2a 과제 → Q2b **적요 이름목록**("본인 사용분을 적요의 어떤 이름으로? 연구자명(복수)/행정원명/혼합 가능") → Q2c 할당 기준액 → **Q2d "활동비2를 활동비1에 합산? 따로?"**(`merge_act2_into_act1`).
- **Q3 — 추적 카테고리**: 기본 6개[재료비·시설장비비·활동비1·활동비2·내부인건비2·학생인건비], 가감. 인건비 금액(예산·집행·잔액)은 과책이 아니어도 표에 나온다 — 세부내역(누구에게 지급됐는지)만 계정책임자·지정 계정관리자 전용.
- **Q4 — 저장**: "엑셀을 로컬 폴더에 저장합니다. 기본 `{kiki_root}\budget\`(예 `C:\kiki\budget\`, macOS/Linux `~/kiki/budget/`) 에 `yymmdd.xlsx`. 이대로/다른 폴더·파일명?"
- **(저장)** `~/.claude/kiki/kk-budget.config.json`.
- **(첫 시험 수집)** "설정 완료. 오늘 날짜 기준으로 1회 시험 수집합니다" → 아래 작업 1회 실행(엑셀 + 채팅 표)으로 동작 확인.

## 4. 작업 (`예산 수집해줘` / `kk-budget`)
1. 준비(§2) + portal_ops inject. 🔴 새 브라우저·새 날·정오 이후엔 먼저 `navigate('https://e.kist.re.kr')` 로 로그인을 확인한 뒤 업무화면 딥링크(코어는 세션이 없으면 `PORTAL:` 오류를 던진다 → 로그인 후 탭 새로고침·재주입).
2. 대상 = `kk-budget.config.json` 의 `track_projects`(비어 있거나 파일이 없으면 `kiki.config.json` `projects` 전체; 사용자 지정 일부도 가능).
   - 사용자가 과제를 **별칭**(과제명 일부·주제어)으로 부르면 `projects[].name` **부분일치**로 과제번호를 해석한다 — 되묻지 말고, 보고 첫 줄에 `과제번호 + 정식 과제명` 을 밝혀 확인 가능하게.
3. **과제별 fetch — 한 번에**: `window.__r=null; window.kkBudget.collectAll({acccds:[…], userName:'<user.name>'}).then(r=>window.__r=r, e=>window.__r={error:String(e)}); 'started'`(acccds 를 비우면 참여 과제 전부) → 2~3초 뒤 `window.kkBudget.collectStatus()` — 끝이 **`| OK`** 면(= `done N/N`, 경고 0, 목록에 없는 과제 0) → **`window.kkBudget.fmtBudget()`**(채팅용 표, 백만원; 인자 없이 — 코어가 이번 실행 결과를 기준으로 보여 준다) 로 결과를 보고, **`window.kkBudget.downloadSnapshot()`** 로 스냅샷 JSON 을 다운로드 폴더에 저장한다(LLM 이 숫자를 옮겨 적지 않는다 — 전사 오류 0). 반환 문자열 끝의 명령(`… --expect <run>`)을 그대로 5단계에 쓴다. 검산(`A == D + exec + pendingDone + pendingProg`)·조회 실패·목록에 없는 과제는 `warnings`/`not_found` 로 나오므로 보고에 그대로 옮긴다. 진행 중이면 `fmtBudget`·`downloadSnapshot` 이 `수집 중 k/N` 을, 실패면 `ERR …` 를 돌려준다(옛 결과를 보이지 않는다).
   - 코어가 `PORTAL:` 오류를 던지면 세션 만료 — `e.kist.re.kr` 로그인 → 탭 새로고침 → 재주입.
   - **과책 아닌 과제**: 인건비를 포함한 모든 카테고리의 금액(A·집행·계류·D)이 조회된다(2026-09-28 실측). 막히는 것은 **인건비성 항목의 세부내역**(집행내역 팝업)뿐 → 개인집계에서 인건비는 '개인별 파악 불가' 로 밝힌다(아래 '인건비 조회 한계').
4. **개인집계**(config `personal_share` 과제, optional): 집행내역 **적요+신청인**에 `filter_names` 포함 건 합산(완료+계류). 팝업은 **좌표 클릭 말고 `scripts/exec_detail.js` 주입 후 `kkExe.init()/cats()/open(dsRow,'exec')/parse(names)/close()`** (셀클릭 핸들러 직접 호출 — 해상도·행위치 무관, 🔴 닫기는 `kkExe.close()` 로만). `merge_act2_into_act1` 적용. → `references/budget_fetch_spec.md` 의 집행내역 경로.
   - **인건비는 합산하지 않는다**: `kkExe.cats()` 의 `personnel:true` 항목(외부·내부인건비·학생인건비·연구수당)은 열지 않는다. 학생인건비(`학생인건비 풀링제 흡수` 1건)·내부인건비1(월별 흡수)은 개인명이 없고, 인건비성 세부내역은 계정책임자·지정 계정관리자만 열린다 → 결과에 **'개인별 파악 불가'** 로 적는다(0 으로 쓰지 않는다). 권한 없이 열면 포털이 알림창을 띄우는데, 코어 1.3 `open()` 은 이를 가로채 `DENIED …` 를 돌려준다(알림창이 뜨면 탭 전체가 멈춰 명령이 45초 시간초과로 끝난다 — 사용자가 '확인'을 눌러야 풀림).
   - **진입**: `bdg_2030` navigate(9초) 하면 **수행중 계정 목록 grid** 가 먼저 뜬다 — 여기엔 **본인이 계정책임자·관리자인 계정만** 있고 참여만 한 과제는 없다(2026-09-28 실측). 목록에 있으면 `find('<과제번호>')` ref 클릭(4초 대기), 없으면 **계정칸을 클릭하고 과제번호를 입력**하면 바로 그 과제 예실대비표가 뜬다(Enter·조회 불필요). 그다음 `kkExe.init()`.
   - `cats()` 는 카테고리(`cd` 있는 행)만 준다 — 소계/합계행은 팝업 대상 아님.
   - **재수집(증분)**: 직전 `yymmdd_{과제번호}_person.json` 이 있으면 `cats()` 의 exec/pd/pp 를 비목별로 먼저 대조 → **변동 비목 + 새로 생긴 계류(pd/pp 0→값)** 만 팝업 재오픈(개인귀속 비목은 변동 없어도 1회 확인 권장), 동일 비목은 이전 값 재사용하고 JSON·보고에 **'재사용' 명시**(총액이 같은 상쇄거래는 못 잡는다는 caveat 포함).
   - 이전 대비 **건수·금액 diff 는 두 스냅샷 JSON 값으로 계산해서** 적는다(기억·암산으로 쓰면 틀린다).
5. **스냅샷 보관 + 엑셀 — 한 명령**: `python scripts/make_report.py --from-downloads --expect <run> --save-snapshot`(`downloadSnapshot()` 이 알려 준 run 의 `kiki_budget_*.json` 만 쓴다 — 다운로드가 늦으면 20초까지 기다리고, 끝내 없으면 **같은 날 이전 실행분을 쓰지 않고** 오류로 멈춘다. → 엑셀 `{kiki_root}/budget/yymmdd.xlsx` 를 만든 뒤 설정 폴더(Claude `~/.claude/kiki`, Codex `~/.codex/kiki`)의 `kk-budget/data/yymmdd.json` 에 보관; 다른 위치는 `--out <xlsx>`). 다운로드 폴더가 다르면 환경변수 `KIKI_DOWNLOADS`. 과제 0건 스냅샷은 엑셀·보관 모두 거부한다(그날 정상본을 덮지 않게). 개인집계(4)를 한 경우엔 `yymmdd_{과제번호}_person.json` 을 따로 적는다(비목별 총집행·건수·인물별 합·비고·caveats·diff).
   - 검증(openpyxl 으로 열어 셀 확인). Excel 이 그 파일을 열고 있으면 `PermissionError` → 닫아달라 안내 후 재시도.
   - 일부 과제·비목만 뽑을 땐 `collectAll({acccds:[…], categories:[…]})` 로 좁힌다(없는 비목은 `-` 로 표시).
   - Windows Bash: 경로를 `"C:\...\"` 처럼 **역슬래시로 끝내 따옴표로 감싸면 `unexpected EOF`** → `/c/kiki/budget/` 형식.
6. (5 에 포함)

### ⚠️ 인건비 조회 한계 — 사용자에게 먼저 알리고, Claude 도 늘 염두에 둔다 (2026-09-28 사용자 지시, 같은 날 실측으로 보정)
- **학생인건비**: 학생인건비 풀링제라 과제 집행내역에는 `학생인건비 풀링제 흡수(과제번호)` 1건만 남고 개인명이 없다 → **특정 과제에서 개인별 사용금액은 파악할 수 없다.** 과제 전체의 학생인건비 예산·잔액은 표에 나온다.
- **인건비성 항목의 세부내역**(외부인건비·내부인건비1·2·학생인건비·연구수당): 금액(예산·집행·잔액)은 누구에게나 보이지만, **집행내역 팝업은 계정책임자와 계정책임자가 지정한 계정관리자만** 열 수 있다(연구수당은 계정책임자만). 그 밖의 사람이 누르면 포털이 *"인건비성 항목이 포함된 상세내역은 계정책임자및 계정책임자가 지정한 계정관리자에 한해서만 조회가능합니다"* 알림을 띄운다. **포스닥 인건비는 내부인건비2 에 기재**되므로 계정책임자·지정 계정관리자가 아니면 누구에게 얼마가 나갔는지 파악할 수 없다.
  - 계정책임자·지정 계정관리자면 내부인건비2 적요에 개인명(`…별정직급여 … 성명`)이 있어 사람별로 볼 수 있다. 내부인건비1 은 월별 흡수 한 줄이라 누구든 개인별 불가.
- 개인별 사용금액·인건비를 물으면 **답 첫머리에 이 한계를 한 줄로** 밝히고 인건비를 뺀 비목으로 답한다. 인건비 개인별 확인은 인사·급여·참여율 화면이나 과제책임자·담당 행정원에게 문의하도록 안내한다.
7. **보고 — 엑셀 + 채팅 표(항상)**: `references/budget_report_format.md` 양식.
   - 채팅 표 = **카테고리 잔액만 + 맨 우측 직접비(잔액/총액)** (백만원 약식).
   - 엑셀 = 카테고리 총액/잔액 + 한 칸 띄움 + 직접비(잔액/총액).
   - + 직전 스냅샷 대비 diff(예산 재분류·집행 진행) + 과책아님 과제 표기. **엑셀만 저장하고 침묵 금지.**

## 5. ⚠️ DOM fallback UX (fetch 실패 시 — 침묵 금지)
순수 fetch가 표준(2026-06-02 실증). 만약 fetch가 빈 응답/실패하면 화면(DOM) 우회 — 해상도가 사람마다 달라 느릴 수 있으므로:
- 우회 진입 시 **즉시 안내**: "⚠️ 이 PC에서는 직접조회(fetch)가 안 돼 화면(DOM) 방식으로 우회합니다. 해상도와 무관하게 동작하도록 화면을 읽는 중이니 잠시(약 30초~1분) 기다려 주세요 — 멈춘 게 아닙니다."
- 진행 중 단계 메시지("예실대비표 여는 중…", "3/6 과제 수집 중…"). 좌표 고정값 금지(`zoom` 위치탐색). 완료·실패 모두 보고.

## 결과 점검 (스크립트·코어 결과를 쓰기 전)
공통 3줄은 `../_shared/environment_setup.md` '결과 점검' 절(요약 줄만 대조 → 어긋나면 원인 고쳐 1회 재실행 → 그래도 안 되면 수동 경로 + 사용자에게 알림). 이 skill 의 기대치:
- `collectStatus()` 끝이 `| OK` 여야 한다(`done N/N`, N = 대상 과제 수, 경고 0, 목록에 없음 0). `error …| ERR …` 면 원인대로: `PORTAL:` = 세션 만료(로그인 → 탭 새로고침 → 재주입 후 1회), `목록에 없음` = 과제번호 확인. 경고만 있으면 `fmtBudget()` 의 ⚠ 줄을 그대로 보고에 싣는다.
- `make_report.py` 요약 줄 `[OK] 저장: … (과제 N, …, run <run>)` 의 run 이 `collectStatus()` 의 run 과 같아야 한다(`--expect` 를 쓰면 스크립트가 보장). `방금 내려받은 파일(run …)이 … 없습니다` 면 Chrome 의 저장 창·'여러 파일 다운로드 허용' 을 사용자에게 눌러 달라고 한 뒤 같은 명령 1회.

## 6. 안전 규칙
- **조회·로컬 엑셀쓰기 전용** — 포털 제출/변경/결재 없음 → 자동. 토큰 불필요(SSO 세션).
- 이름·사번·계정번호·할당액은 **로컬 config 에만**. 출력/로그에 authTk·쿠키 섞이면 핵심 필드만.
- git push 등은 사용자 요청 시에만.

## config (`~/.claude/kiki/kk-budget.config.json`)
`kk-budget.config.example.json` 참고. 키: `track_projects`(추적 과제 acccd 목록, 비우면 kiki.config `projects` 전체) / `track_categories` / `personal_share`(과제+filter_names+allocations+merge_act2_into_act1) / `output_dir` / `filename_pattern`. 본인 이름(과책 판별)·참여과제는 공통 `kiki.config.json` 의 `user.name`·`projects`.

## 참고
- `scripts/portal_ops.js`(주입은 `.min.js`) — `queryProjects`·`queryBudgetTable`·**`collectAll`·`collectStatus`·`downloadSnapshot`·`fmtBudget`**(한 번에 수집·표·다운로드, run id 로 짝짓기). `scripts/make_report.py --from-downloads --expect <run>` 가 그 JSON 을 엑셀로.
- [scripts/exec_detail.js](scripts/exec_detail.js)(주입은 `.min.js`) — 집행/계류 내역 팝업 헬퍼(`window.kkExe`): 셀클릭 핸들러 직접 호출·금액컬럼 자동판별·합계행 제외·이름 경계검증.
- [references/budget_fetch_spec.md](references/budget_fetch_spec.md) — bdg_2030 fetch endpoint·컬럼 1:1 매핑·예산항목 코드·함정.
- [references/budget_report_format.md](references/budget_report_format.md) — 채팅 표/엑셀 양식·직접비·개인집계·검산.
- [_shared/kist_portal.md](../_shared/kist_portal.md) — 통합정보 fetch 공통(authTk·parseRows·좌표 fallback).
- [_shared/security_policy.md](../_shared/security_policy.md) — C1~C5.
