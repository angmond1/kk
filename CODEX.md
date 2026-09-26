# kiki on Codex — Codex 사용자 가이드

> kiki 의 skill 본문은 **Claude (Claude Code / Claude in Chrome)** 기준으로 쓰여 있다. 이 문서는 **Codex Desktop / Codex CLI** 의 도구 이름·설치 경로·환경 차이만 정리하는 **Codex 어댑터**다.
> 정본은 [CLAUDE.md](CLAUDE.md)·[INSTALL.md](INSTALL.md)·[README](README.md)·[환경 점검](skills/_shared/environment_setup.md)과 각 skill 의 `SKILL.md`다. 상세 절차는 정본을 따르고, 여기서는 Codex 차이만 적용한다.
> 문서 동기화: **2026-09-27** (v0.4.1, [변경 이력](docs/HISTORY.md)). 기존 Codex 이식 실증(2026-06-07)과 이후 정본 변경을 구분하며, 미확인 동작은 따로 표시한다.

## 1. 설치 구조 (Codex)
**설치 폴더부터 묻는다**: 기본 `C:\kiki`(Windows) / `~/kiki`(macOS/Linux) 또는 사용자 지정 경로. 선택한 `kiki_root`에 패키지를 확보하고 그 폴더에서 진행한다(git 불요: ZIP/동료 폴더 가능). 원본 `skills/`를 아래 Codex 경로에 복사한다. 배포본 `install.ps1`·`install.sh`는 Claude 경로용이므로 Codex 설치에는 아래 복사 예를 쓴다.

- **설치 때 에이전트가 Python 3·Node.js 유무를 확인하고, 없으면 한 줄 안내 후 바로 설치를 시작한다**. 정본 [CLAUDE.md Step 0](CLAUDE.md)의 범위: 전체 설치 = 둘 다 / kk-mail만 = 둘 다 불필요 / kk-budget·kk-wiki = Python / kk-budget = Python / kk-pay·kk-meeting·kk-inspect = Python + Node.js. Python 패키지는 각 skill에서 필요할 때 확인·설치한다.
- Windows: `python --version`·`node --version`·`npx --version` 확인. `python`이 없어도 `py -3 --version`이 되면 재설치하지 않고 이후 실행·pip에 `py -3`·`py -3 -m pip`를 쓴다. Store 실행 별칭·설치 직후 PATH 미반영을 구분하고, 미설치 시 winget 및 UAC/수동 설치 안내는 Step 0을 따른다.
- macOS/Linux 절차도 [CLAUDE.md Step 0](CLAUDE.md)·[INSTALL.md §6](INSTALL.md)을 따른다(실기기 미검증). macOS는 Python 미설치 시 Xcode 명령줄 도구, Node.js는 기존 Homebrew 또는 `.pkg`; Linux는 `python3` 확인 후 sudo가 필요한 명령은 사용자에게 안내하고, sudo 불가 시 사용자 경로 설치를 따른다. OS별 설치 절차를 이 문서에 중복 관리하지 않는다.

| 구분 | Codex 설치 경로 | 비고 |
|---|---|---|
| skill 본체 | `~/.codex/skills/kk-budget`, `kk-pay`, `kk-meeting`, `kk-inspect`, `kk-mail`, `kk-wiki` | repo 의 `skills/kk-*` 그대로. 2026-09-26 `kk-dining` → `kk-meeting` 개명: 옛 `kk-dining` 폴더가 남아 있으면 삭제, 개인 설정 `kk-dining.config.json` 은 `kk-meeting.config.json` 으로 이름 변경 |
| 공통 문서 | `~/.codex/skills/_shared` | repo 의 `skills/_shared` 그대로 |
| 개인 설정 | `~/.codex/kiki/` | **repo 밖** (아래 §3) |
| 토큰 | `<kiki_root>/token.txt` (또는 `~/.codex/kiki/token.txt`) | kiki 폴더(기본 `C:\kiki` / `~/kiki`)에 `token.txt.example` 복사 |

신규 설치(복사) 예 — 선택한 `kiki_root`의 패키지 폴더 안에서. 기존 개인설정·`token.txt`가 있으면 템플릿으로 덮어쓰지 않는다:
```bash
# macOS / Linux
mkdir -p ~/.codex/skills ~/.codex/kiki
for s in _shared kk-mail; do rm -rf ~/.codex/skills/$s; cp -R skills/$s ~/.codex/skills/$s; done   # 원하는 kk-* 나열(또는 skills/kk-* 전체). 재설치 때 겹치지 않게 지우고 복사
rm -rf ~/.codex/skills/kk-dining; [ -d dining ] && [ ! -d meeting ] && mv dining meeting        # 옛 이름(2026-09-26 개명) 정리
[ -f ~/.codex/kiki/kiki.config.json ] || cp skills/_shared/kiki.config.example.json ~/.codex/kiki/kiki.config.json   # 기존 설정 유지
[ -f ./token.txt ] || cp skills/_shared/token.txt.example ./token.txt          # kiki 폴더(기본 ~/kiki)에 토큰 파일
mkdir -p budget meeting inspect _tmp
```
```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills","$env:USERPROFILE\.codex\kiki" | Out-Null
foreach ($s in @("_shared", "kk-mail")) {                      # 원하는 kk-* 나열. 재설치 때 겹치지 않게 지우고 복사
  if (Test-Path "$env:USERPROFILE\.codex\skills\$s") { Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\skills\$s" }
  Copy-Item -Recurse "skills\$s" "$env:USERPROFILE\.codex\skills\$s"
}
if (Test-Path "$env:USERPROFILE\.codex\skills\kk-dining") { Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\skills\kk-dining" }   # 옛 이름 정리
if ((Test-Path dining) -and -not (Test-Path meeting)) { Move-Item dining meeting }
if (-not (Test-Path "$env:USERPROFILE\.codex\kiki\kiki.config.json")) { Copy-Item "skills\_shared\kiki.config.example.json" "$env:USERPROFILE\.codex\kiki\kiki.config.json" }   # 기존 설정 유지
if (-not (Test-Path ".\token.txt")) { Copy-Item "skills\_shared\token.txt.example" ".\token.txt" }   # kiki 폴더(기본 C:\kiki)에 토큰 파일
New-Item -ItemType Directory -Force budget,meeting,inspect,_tmp | Out-Null
```

- Codex Desktop 은 시작 시 skill 목록을 로드 → **새 skill 설치 후 Codex 재시작**으로 인식 확인.
- `~/.codex/kiki/kiki.config.json`의 `kiki_root`에 선택한 폴더의 절대경로를 기록한다. `token.txt`·기본 저장 폴더(`budget/ meeting/ inspect/ _tmp/`)는 이 경로를 기준으로 찾는다. 토큰 입력은 §3과 [CLAUDE.md Step 4](CLAUDE.md)를 따른다.
- Codex의 브라우저 작업은 **chrome-devtools 창**에서 한다. 그 창에서 필요한 시스템(포탈 `e.kist.re.kr`·Dooray)에 로그인한다(평소 Chrome과 로그인 공유 안 됨; KIST 사내망/VPN, 포탈은 매일 정오 세션 리셋). 브라우저 도구가 준비돼 있으면 **kk-mail은 Dooray 로그인 세션만으로 동작하며 토큰·추가 설치가 없다**. 도구 자체가 없어서 `npx`로 chrome-devtools-mcp를 새로 등록할 때 필요한 Node.js는 메일 코어의 의존성과 구분한다. 등록은 [INSTALL.md](INSTALL.md)의 Codex 안내를 따른다.
- **권장 모델은 [README 「구성」](README.md#구성)을 참조**한다. 표의 Claude 모델을 Codex 모델에 임의 대응시키거나 Codex 권장 모델명을 추정하지 않는다.
- (Claude 는 `~/.claude/skills/` + `~/.claude/kiki/`. 경로만 다르고 내용 동일.)

## 2. 도구 이름 어댑터 (핵심)
skill 본문의 "Claude in Chrome" 도구를 Codex의 Chrome DevTools 도구로 치환해 읽는다. **도구는 짧은 이름으로 표기**하며, 실제 서버 접두어는 세션의 도구 목록에서 확인한다. 등록명·버전·설치 방식에 따른 차이는 [환경 점검](skills/_shared/environment_setup.md)의 "도구 이름 표기 규칙"을 따른다.

| skill 본문(Claude) 의도 | Codex 도구 |
|---|---|
| 브라우저 탭 확인 | `list_pages` |
| 대상 탭 선택 | `select_page` |
| 새 탭 / 이동 | `new_page` / `navigate_page` |
| 페이지 JS 실행 (`javascript_tool`) | `evaluate_script` |
| 화면/DOM 확인 (`screenshot`/`read_page`/`find`) | `take_snapshot` (필요시 `take_screenshot`) |
| 클릭/입력/업로드 fallback | `click` / `fill` / `press_key` / `upload_file` |

- **JS 코어 주입·호출은 `evaluate_script`**: 각 skill의 `scripts/*.js`를 읽어 대상 탭에 주입 → `window.kkPay.*` / `window.kkBudget.*` / `window.kkmeeting.*` / `window.kkMail.*` / `window.kkWiki.*` 함수 호출(environment_setup.md §1 의 "Claude in Chrome 미연결이면 중단" 은 Codex 에선 `list_pages` 로 창 확인으로 읽는다). kk-mail도 chrome-devtools의 Dooray 탭에서 [코어 `kk_mail_ops.js` 1.3](skills/kk-mail/scripts/kk_mail_ops.js)을 주입·호출한다.
- ⚠️ **페이지 새로고침 시 주입한 `window.*` 객체가 사라진다 → 재주입** 필요.

## 3. 인증·개인설정 분리 (repo 밖)
| 파일 | 내용 |
|---|---|
| `~/.codex/kiki/kiki.config.json` | `kiki_root`·이름·사번·카드책임자·담당 행정원·참여과제 등 공통 |
| `<kiki_root>/token.txt` (또는 `~/.codex/kiki/token.txt`, 구형 `~/.codex/kiki/kiki.env`) | Dooray 토큰 — `Dooray token:` 다음 줄. **채팅에 붙여넣지 말 것**(노출 위험 상시 경고) |
| `~/.codex/kiki/kk-<skill>.config.json` | skill 별 고유 설정 |

- 이미 공통 config 에 있는 값은 재질문 안 함.
- **토큰·카드번호·사번·실제 폴더 ID 는 skill 본문에 저장 금지.**
- 통합정보(포탈 `e.kist.re.kr` 로그인 / 업무화면 `p.kist.re.kr:8081`, 2026-07 변경 — 구 ekist.re.kr)는 **SSO 세션 + `window.application.authTk`** 로 동작 → 별도 API 토큰 불요.
- Dooray 메일 = 브라우저 세션 쿠키 wapi (토큰 불요). Dooray Drive 업로드만 `DOORAY_TOKEN` 필요.

## 4. 통합정보 fetch 우선 원리 (공통)
- 통합정보 NEXACRO 화면 1개가 열려 있으면 `authTk` + 세션쿠키로 backend `.do` endpoint 직접 호출.
- 요청 = `POST`, `Content-Type: text/xml; charset=UTF-8`, NEXACRO Dataset XML body. 응답 `<Dataset><Rows><Row><Col id=…>` 파싱.
- `authTk`·쿠키·세션값은 **출력 금지**, 핵심 필드만 반환.
- 대표 endpoint: 카드내역 `/mis/fam/fam0711/getList.do` · 과제목록 `/mis/rdm/rdm2011/doSearchMain.do` · 예실대비표 `bdg_2030`(`getBdgInfo`/`getMainList`) · 직원검색 `/popup/common/getRqstNoMgt/chkPopupValueSetting.do`.
- fetch 불가 화면은 즉시 실패 말고 **화면 캡처/DOM fallback** — 단 **고정 좌표 금지**, 매번 화면 상태를 읽어 위치 확인.

## 5. NEXACRO 파일첨부 (Codex)
파일첨부 해결법은 **`skills/_shared/nexacro_file_upload.md`** (A/B/C 3 패턴) 와 동일. Codex 에서는 패턴 C 가 가장 안정적이었다:
- `<컴포넌트>.extUp._input_node` (숨겨진 HTML input) 을 DOM 에 노출 → Codex `upload_file` / Playwright `setInputFiles` 로 `#<노출한 id>` 에 파일 주입 → `gfn_upload(...)` 로 서버 저장.
- 회의비 회의록 팝업: `fileDiv1`(서명록)/`fileDiv2`(증빙)/`fileDiv3`(사전결재), `RQST_NO = CONFERENCENO + "-" + ds_param.CARDUSEMGRNO`, `FLE_TP="02"`(증빙).
- 저장 확인: `ds_files` 의 `tmHeader="S"` · `FLE_TP` · `FLE_PATH`(예 `/YYYY/MMDD/pop_fam_0703_02`) · `NEW_FLE_NM`.

### 5-1. 첨부/저장 후 화면 클릭 막힘 (tool 무관 — Claude 도 해당)
첨부·저장 후 **빈 NEXACRO modal layer 가 화면 전체를 덮어 클릭이 안 먹는** 경우가 있다.
- 진단: `document.elementFromPoint(500,300)` → 반환이 `..._form_modalPopDiv` / `...modalPopDivScrollableInnerContainerElement(_inner)` 류면 그 레이어가 가로채는 것.
- 해결: 해당 레이어들에 `pointer-events:none !important` CSS 주입 → 실제 입력칸/그리드가 다시 잡힘.
```js
let s = document.getElementById("kk-clickfix-style") || document.head.appendChild(Object.assign(document.createElement("style"),{id:"kk-clickfix-style"}));
s.textContent = `[id*="_form_modalPopDiv"], [id*="modalPopDivScrollableInnerContainerElement"] { pointer-events:none !important; }`;
```
(이 fix 는 `_shared/nexacro_file_upload.md` 에도 공통 기록.)

## 6. skill 별 Codex 실전 노트 (요약)
세부 절차·함정은 각 skill 본문이 1차. 아래는 Codex 이식 시 확인된 보강점.

- **kk-budget**: 예실대비표 `bdg_2030` 좌표 없이 fetch 조회 → JSON 스냅샷 → `scripts/make_report.py` 엑셀. **조회 전용**(저장/제출/결재 안 함). 로그인 세션만 있으면 토큰 불요.
- **kk-pay**: 카드 승인번호·과제·금액 fetch 조회 + 파일명 규칙 변환 + Dooray Drive 업로드(`DOORAY_TOKEN`). 세금계산서 직접작성 경로는 **첨부는 Codex 에서도 됨**, 단 **계좌 실명검증**은 통과법 확정 후 end-to-end 활성(공휴일·주말 미가동 추정).
- **kk-inspect**: `mcs_0003` 필드맵·팝업 제어. 검수신청구분은 보통 **비자산** 선택 후 조회. **첨부는 건별 행 선택 후 해당 세금계산서·거래명세서 1개씩** (여러 건 한꺼번에 4개 X — 행 바꿔가며 해당 증빙만). 숨은 input 패턴으로 첨부 가능.
- **kk-meeting**: [SKILL](skills/kk-meeting/SKILL.md) 기준으로 **회의 주제를 먼저 묻고, 회의내용은 사용자가 작성을 부탁할 때만** 근거자료로 채운다(직접 준 내용은 그대로 기록). 사전결재 적용 시점·회의시간·참석자 판단은 SKILL을 따른다. Codex도 chrome-devtools에서 `evaluate_script`로 제어하며, 계정/비목은 **`doDecision()` 콜백**, 통장표기는 **`common_onkillfocus` 동기화**를 사용한다.
  회의록 엑셀은 임시저장 직후 `{kiki_root}/meeting/meeting_log/{yymm}_회의록.xlsx`에 자동 기록한다(처리 연월별 1파일, 연월 하위폴더 없음). 회의록 파일은 **hwpx로 통일**하고 요청 시에만 [make_meetinglog_hwpx.py](skills/kk-meeting/scripts/make_meetinglog_hwpx.py)로 같은 폴더에 `{yymmdd}_{과제번호}_{과제이름 간략}_회의록.hwpx`를 만든다(건당 1파일). 생성은 표준 라이브러리로 모든 OS에서 **아래아한글 없이** 가능하고, 열람은 한글 또는 HOP을 쓴다. 세부 저장·중복 검사 규칙은 [회의록 엑셀 안내](skills/kk-meeting/references/meeting_log_excel.md)를 따른다.
- **kk-mail**: [SKILL](skills/kk-mail/SKILL.md)의 기능 번호는 **1 자연어로 메일 찾기(가장 많이 쓰는 기능) · 2 폴더 분류 · 3 자동분류 규칙 · 4 스팸 처리**. 로그인 세션 쿠키로 동작하며 토큰·추가 설치는 불필요하다(§1의 Codex 브라우저 도구 준비 전제).
  기능 1은 코어(1.6)의 **`searchMails`/`searchMany` → Dooray 검색 API `POST /v2/wapi/mails/search`** 경로가 기본이고, 검색어를 정하기 어려우면 **`listMails`로 목록 훑기** 경로를 쓴다. 검색·읽음 상태 보존의 상세는 [SKILL](skills/kk-mail/SKILL.md)·[wapi 참조](skills/kk-mail/references/wapi_reference.md)를 따른다.
  첫 실행(`kk-mail 설정해줘`)은 **환경 점검 → 기존 폴더·규칙 파악 → 4가지 기능 안내로 종료**한다. 폴더 분류·권장 규칙 설정은 사용자가 원할 때만 진행한다. 기능 3의 기본 조건은 **발신 주소만**이며, 제목 조건은 사용자가 명시할 때만 추가한다.
  **도구별 검증 범위**: SKILL의 "출력 약 1,000자 잘림·`a=b` 필터"는 **Claude in Chrome의 `javascript_tool`에서 실측**한 제약이다. Codex의 **`evaluate_script`에서는 미확인**이며 동일하게 적용된다고 단정하지 않는다. 결과 분할 등의 우회는 실제 증상이 있을 때만 정본을 참고한다.
- **kk-wiki**: [SKILL](skills/kk-wiki/SKILL.md). 위키 본문 스냅샷을 `{kiki_root}/wiki`에 두고 로컬 검색(`wiki_search.py`) → 인용 페이지만 `wiki_snapshot.py fresh`로 최신 확인. **토큰이 있으면 Python만으로**(브라우저 불요) 수집·최신 확인·첨부. 토큰이 없으면 chrome-devtools 창의 Dooray 탭에 코어 `kk_wiki_ops.js`를 주입 → `crawlAll()`(탭을 앞에 둘 것) → export JSON 다운로드 → `import`. 스냅샷은 KIST 내부 자료 — repo 밖에만.

## 7. 안전 경계 (Claude·Codex 공통)
- 조회·로컬 파일 작성 = 자동 가능.
- **업로드·rename·이동·포털 저장·임시저장·신청·결재상신 = 사용자 확인 후.**
- 결재상신 = 실제 결재 제출 → 최종 확인 전 금지. 결재선 확정은 별도 gw 전자결재 창 → 사용자 직접.
- 스팸 신고·메일 이동·규칙 생성도 사용자 확인 후.
- 토큰·세션쿠키·`authTk`·카드번호는 출력 금지.

## 8. 실행 체크리스트
1. `kiki_root`·선택 skill에 필요한 런타임(§1)과 Codex skill 목록의 `kk-*` 인식 확인(없으면 Codex 재시작).
2. 작업에 필요한 통합정보·Dooray 로그인 세션 확인(chrome-devtools 창에서; KIST 사내망/VPN). kk-mail은 Dooray 로그인만 필요.
3. `~/.codex/kiki/kiki.config.json`의 기존 값을 재사용하고, `token.txt`는 Dooray Drive 업로드 때만 확인(값 출력·채팅 붙여넣기 금지).
4. 통합정보 조회는 **fetch 먼저**, 실패 시 화면 fallback (고정좌표 금지).
5. NEXACRO 파일첨부는 visible 버튼이 아니라 **`extUp._input_node`** (또는 별도 page 의 실제 버튼) 사용 — `_shared/nexacro_file_upload.md`.
6. 첨부 저장 후 `tmHeader`/`FLE_TP`/`FLE_PATH`/`NEW_FLE_NM` 로 서버 반영 확인.
7. 클릭 막히면 `elementFromPoint` 로 빈 modal layer 확인 → pointer-events 통과 CSS (§5-1).
8. 실제 제출/상신/업로드는 **사용자 확인 후**.
