# kiki on Codex — Codex 사용자 가이드

> kiki 의 skill 본문은 **Claude (Claude Code / Claude in Chrome)** 기준으로 쓰여 있다. 이 문서는 **Codex Desktop / Codex CLI** 의 도구 이름·설치 경로·환경 차이만 정리하는 **Codex 어댑터**다.
> 정본은 [CLAUDE.md](CLAUDE.md)·[INSTALL.md](INSTALL.md)·[README](README.md)·[환경 점검](skills/_shared/environment_setup.md)과 각 skill 의 `SKILL.md`다. 상세 절차는 정본을 따르고, 여기서는 Codex 차이만 적용한다.
> 문서 동기화: **2026-09-30, v0.7.11** ([변경 이력](docs/HISTORY.md)) — 코어 kk-dry 2.12·kk-mail 1.13 기준(아래 Codex 실측 기록은 그 날짜·버전 그대로). 통합정보·메일의 Codex 브라우저 실측은 2026-09-27, kk-dry의 큰 결과 반환 실측은 2026-09-29 격리된 합성 페이지 기준이다. kk-dry 2.3은 2026-09-30 Dooray 실계정에서 검색·본문/첨부·슬라이드/문서 읽기와 공식 API 파일 스트림(메모리)·미리보기를 확인했다(2.4는 quick 요약의 파일 수 표시만 다름). `--yes` 저장·게시·업로드는 검증하지 않았다. 버전·연결 방식에 따른 차이는 따로 표시한다.

## 1. 설치 구조 (Codex)
**설치 폴더부터 묻는다**: 기본 `C:\kiki`(Windows) / `~/kiki`(macOS/Linux) 또는 사용자 지정 경로. 선택한 `kiki_root`에 패키지를 확보하고 그 폴더에서 진행한다(git 불요: ZIP/동료 폴더 가능). 원본 `skills/`를 아래 Codex 경로에 복사한다. 배포본 `install.ps1`·`install.sh`는 Claude 경로용이므로 Codex 설치에는 아래 복사 예를 쓴다.

- **설치 때 에이전트가 Python 3·Node.js 유무를 확인하고, 없으면 한 줄 안내 후 바로 설치를 시작한다**. 정본 [CLAUDE.md Step 0](CLAUDE.md)의 범위: 전체 설치 = 둘 다 / kk-mail만 = 둘 다 불필요 / kk-budget·kk-wiki = Python / kk-pay·kk-meet·kk-inspect = Python + Node.js. kk-dry의 브라우저 조회는 Python·토큰 없이 가능하고, 공식 API를 쓰는 받기·쓰기는 Python·개인 토큰이 필요하다. 브라우저 MCP를 새로 등록할 때 필요한 Node.js와 스킬 자체의 의존성은 구분한다. Python 패키지는 각 skill에서 필요할 때 확인·설치한다.
- Windows: `python --version`·`node --version`·`npx --version` 확인. `python`이 없어도 `py -3 --version`이 되면 재설치하지 않고 그 인터프리터를 쓴다. **스크립트와 `-m pip`는 같은 Python으로 실행**한다. `python`과 `py -3`는 서로 다른 설치본일 수 있으므로 `python -c "import sys; print(sys.executable)"` 또는 `kiki_doctor.py` 첫 줄로 확인한다. Store 실행 별칭·설치 직후 PATH 미반영을 구분하고, 미설치 시 winget 및 UAC/수동 설치 안내는 Step 0을 따른다.
- macOS/Linux 절차도 [CLAUDE.md Step 0](CLAUDE.md)·[INSTALL.md §6](INSTALL.md)을 따른다(실기기 미검증). macOS는 Python 미설치 시 Xcode 명령줄 도구, Node.js는 기존 Homebrew 또는 `.pkg`; Linux는 `python3` 확인 후 sudo가 필요한 명령은 사용자에게 안내하고, sudo 불가 시 사용자 경로 설치를 따른다. OS별 설치 절차를 이 문서에 중복 관리하지 않는다.

| 구분 | Codex 설치 경로 | 비고 |
|---|---|---|
| skill 본체 | `~/.codex/skills/kk-budget`, `kk-pay`, `kk-meet`, `kk-inspect`, `kk-mail`, `kk-wiki`, `kk-dry` | repo 의 `skills/kk-*` 그대로. 개명 이력: `kk-dining` → `kk-meeting`(2026-09-26) → `kk-meet`(2026-09-29), `kk-dooray` → `kk-dry`(2026-09-29). **새 이름 `SKILL.md`가 설치 폴더에 있을 때만** 옛 폴더를 지우고, 개인 설정 `kk-dining.config.json` 은 `kk-meet.config.json` 으로 이름 변경(`kk-meeting.config.json` 은 kk-meet 이 그대로 읽는다) |
| 공통 문서 | `~/.codex/skills/_shared` | repo 의 `skills/_shared` 그대로 |
| 개인 설정 | `~/.codex/kiki/` | **repo 밖** (아래 §3) |
| 토큰 | `<kiki_root>/token.txt` (또는 `~/.codex/kiki/token.txt`) | kiki 폴더(기본 `C:\kiki` / `~/kiki`)에 `token.txt.example` 복사 |

신규 설치(복사) 예 — 선택한 `kiki_root`의 패키지 폴더 안에서. 기존 개인설정·`token.txt`가 있으면 템플릿으로 덮어쓰지 않는다:
```bash
# macOS / Linux
mkdir -p ~/.codex/skills ~/.codex/kiki
for s in _shared kk-mail; do rm -rf ~/.codex/skills/$s; cp -R skills/$s ~/.codex/skills/$s; done   # 원하는 kk-* 나열(또는 skills/kk-* 전체). 재설치 때 겹치지 않게 지우고 복사
# 옛 이름(2026-09-26·09-29 개명) 정리 — 새 이름 skill 이 설치돼 있을 때만(다른 skill 만 복사했으면 옛 skill·데이터를 그대로 둔다)
if [ -f ~/.codex/skills/kk-meet/SKILL.md ]; then rm -rf ~/.codex/skills/kk-dining ~/.codex/skills/kk-meeting; [ -d dining ] && [ ! -d meeting ] && mv dining meeting; fi
if [ -f ~/.codex/skills/kk-dry/SKILL.md ]; then rm -rf ~/.codex/skills/kk-dooray; fi
[ -f ~/.codex/kiki/kiki.config.json ] || cp skills/_shared/kiki.config.example.json ~/.codex/kiki/kiki.config.json   # 기존 설정 유지
[ -f ./token.txt ] || cp skills/_shared/token.txt.example ./token.txt          # kiki 폴더(기본 ~/kiki)에 토큰 파일
mkdir -p budget inspect _tmp; [ -d dining ] || mkdir -p meeting   # 옛 dining/ 이 남아 있으면 빈 meeting/ 을 만들지 않는다(나중 이동이 막히지 않게)
```
```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills","$env:USERPROFILE\.codex\kiki" | Out-Null
foreach ($s in @("_shared", "kk-mail")) {                      # 원하는 kk-* 나열. 재설치 때 겹치지 않게 지우고 복사
  if (Test-Path "$env:USERPROFILE\.codex\skills\$s") { Remove-Item -Recurse -Force "$env:USERPROFILE\.codex\skills\$s" }
  Copy-Item -Recurse "skills\$s" "$env:USERPROFILE\.codex\skills\$s"
}
# 옛 이름(2026-09-26·09-29 개명) 정리 — 새 이름 skill 이 설치돼 있을 때만(다른 skill 만 복사했으면 옛 skill·데이터를 그대로 둔다)
$cs = "$env:USERPROFILE\.codex\skills"
if (Test-Path "$cs\kk-meet\SKILL.md") {
  foreach ($o in @("kk-dining", "kk-meeting")) { if (Test-Path "$cs\$o") { Remove-Item -Recurse -Force "$cs\$o" } }
  if ((Test-Path dining) -and -not (Test-Path meeting)) { Move-Item dining meeting }
}
if ((Test-Path "$cs\kk-dry\SKILL.md") -and (Test-Path "$cs\kk-dooray")) { Remove-Item -Recurse -Force "$cs\kk-dooray" }
if (-not (Test-Path "$env:USERPROFILE\.codex\kiki\kiki.config.json")) { Copy-Item "skills\_shared\kiki.config.example.json" "$env:USERPROFILE\.codex\kiki\kiki.config.json" }   # 기존 설정 유지
if (-not (Test-Path ".\token.txt")) { Copy-Item "skills\_shared\token.txt.example" ".\token.txt" }   # kiki 폴더(기본 C:\kiki)에 토큰 파일
New-Item -ItemType Directory -Force budget,inspect,_tmp | Out-Null
if (-not (Test-Path dining)) { New-Item -ItemType Directory -Force meeting | Out-Null }   # 옛 dining\ 이 남아 있으면 빈 meeting\ 을 만들지 않는다
```

- Codex Desktop 은 시작 시 skill 목록을 로드 → **새 skill 설치 후 Codex 재시작**으로 인식 확인.
- `~/.codex/kiki/kiki.config.json`의 `kiki_root`에 선택한 폴더의 절대경로를 기록한다. `token.txt`·기본 저장 폴더(`budget/ meeting/ inspect/ _tmp/`)는 이 경로를 기준으로 찾는다. 토큰 입력은 §3과 [CLAUDE.md Step 4](CLAUDE.md)를 따른다.
- Codex의 브라우저 작업은 **chrome-devtools-mcp가 연결한 Chrome**에서 한다. 기본 실행은 새 창·별도 프로필이라 그 창에서 포탈 `e.kist.re.kr`·Dooray에 로그인한다. **`--autoConnect` 또는 `--browserUrl`은 기존 Chrome에 연결**하므로 해당 프로필의 로그인 세션을 사용한다. 2026-09-27 Codex 재시험은 `--autoConnect`로 평소 Chrome에 연결해 성공했다. 연결 방식·`list_pages` 결과를 확인하고, 필요한 경우 사용자가 Chrome의 원격 디버깅 허용을 승인한다. KIST 사내망/VPN과 정오 세션 리셋에 유의한다.
- 브라우저 도구가 이미 준비돼 있으면 **kk-mail은 Dooray 로그인 세션만으로 동작하며 토큰·추가 설치가 없다**. `npx`로 MCP를 새로 등록할 때 필요한 Node.js는 메일 코어의 의존성과 구분한다. Codex의 MCP는 `~/.codex/config.toml`의 `[mcp_servers.<등록명>]` 또는 `codex mcp add`로 등록한다([공식 MCP 안내](https://developers.openai.com/codex/mcp)). 기존 연결을 중복 등록하지 않는다.
- **권장 모델은 [README 「구성」](README.md#구성)을 참조**한다. 표의 Claude 모델을 Codex 모델에 임의 대응시키거나 Codex 권장 모델명을 추정하지 않는다.
- (Claude 는 `~/.claude/skills/` + `~/.claude/kiki/`. 경로만 다르고 내용 동일.)

## 2. 도구 이름 어댑터 (핵심)
skill 본문의 "Claude in Chrome" 도구를 Codex의 Chrome DevTools 도구로 치환해 읽는다. **도구는 짧은 이름으로 표기**하며, 실제 서버 접두어는 세션의 도구 목록에서 확인한다. 등록명·버전·설치 방식에 따른 차이는 [환경 점검](skills/_shared/environment_setup.md)의 "도구 이름 표기 규칙"을 따른다.

| skill 본문(Claude) 의도 | Codex 도구 |
|---|---|
| 브라우저 탭 확인 | `list_pages` |
| 대상 탭 선택 | `list_pages`의 ID를 각 호출의 `pageId`에 지정. `select_page`는 필요한 경우 화면 전환 |
| 새 탭 / 이동 | `new_page` / `navigate_page` |
| 페이지 JS 실행 (`javascript_tool`) | `evaluate_script` |
| 화면/DOM 확인 (`screenshot`/`read_page`/`find`) | `take_snapshot` (필요시 `take_screenshot`) |
| 클릭/입력/업로드 fallback | `click` / `fill` / `press_key` / `upload_file` |

- **현재 스키마에서는 `evaluate_script`·`navigate_page`·`take_snapshot`·`upload_file` 등에 `pageId`가 필수**다. `select_page`만 호출한 뒤 대상 인자를 생략하지 않는다. 별도 팝업은 `list_pages`로 새 ID를 확인한다. 다른 버전에서는 인자 이름이 달라질 수 있으므로 세션에 노출된 스키마가 우선이다.
- **JS 코어 주입·호출은 `evaluate_script`**: 각 skill의 `scripts/*.min.js`를 읽어 대상 탭에 주입 → `window.kkPay.*` / `window.kkBudget.*` / `window.kkmeet.*` / `window.kkMail.*` / `window.kkWiki.*` / `window.kkDry.*` 함수 호출(environment_setup.md §1의 "Claude in Chrome 미연결이면 중단"은 Codex에서는 `list_pages`로 연결 확인으로 읽는다). 원본 `.js`는 검토용이며, 메일은 [kk_mail_ops.js](skills/kk-mail/scripts/kk_mail_ops.js)의 코어 **1.12**와 같은 내용의 `.min.js`를 쓴다.
- `evaluate_script`의 `function`에는 함수 선언 문자열을 넘긴다. **`async () => ...`의 resolve 결과를 직접 받을 수 있다**(2026-09-27 실측). 데이터 조회만 할 때는 현재 스키마의 `waitForStableDom:false`를 사용할 수 있다. 오래 걸리는 수집은 시작/상태 확인으로 나누고 실패도 저장한다. `dialogAction`의 기본값은 `accept`이므로 저장·상신 호출의 사용자 확인을 대신하지 않는다.
  예: `evaluate_script({pageId: <대상 ID>, function: "async () => ({count: (await kkPay.queryProjects()).length})", waitForStableDom: false})`. 객체·배열은 JSON으로 반환하고 토큰·사번·카드번호는 포함하지 않는다.
- ⚠️ **페이지 새로고침 시 주입한 `window.*` 객체가 사라진다 → 재주입** 필요.

## 3. 인증·개인설정 분리 (repo 밖)
| 파일 | 내용 |
|---|---|
| `~/.codex/kiki/kiki.config.json` | `kiki_root`·이름·사번·카드책임자·담당 행정원·참여과제 등 공통 |
| `<kiki_root>/token.txt` (또는 `~/.codex/kiki/token.txt`, 구형 `~/.codex/kiki/kiki.env`) | Dooray 토큰 — `Dooray token:` 다음 줄. **채팅에 붙여넣지 말 것**(노출 위험 상시 경고) |
| `~/.codex/kiki/kk-<skill>.config.json` | skill 별 고유 설정 |

- 이미 공통 config 에 있는 값은 재질문 안 함.
- **v0.4.9의 설정 폴더 선택**: `KIKI_HOME`(폴더 직접 지정) → `KIKI_AGENT=claude|codex` → 스크립트 설치 위치 → 실행 환경(`CLAUDECODE`, `CODEX_`로 시작하는 변수) → 기본 Claude·Codex 순이다. **`~/.codex/skills/` 설치본은 Codex 설정을 우선**한다. 저장소의 스크립트를 직접 실행하며 호스트를 명시하려면 PowerShell에서 `$env:KIKI_AGENT='codex'`를 지정한다. 다른 쪽 설정·토큰으로의 fallback이 있으므로 별도 폴더만 사용하려면 `KIKI_HOME`을 지정한다. 작업 데이터 루트의 `KIKI_ROOT`와 설정 폴더의 `KIKI_HOME`은 구분한다.
- 토큰은 `DOORAY_TOKEN` → `<kiki_root>/token.txt` → 선택된 설정 폴더의 `token.txt`·`kiki.env` → 다음 후보 폴더 순으로 찾는다. `kiki_doctor.py`의 **설정 폴더(우선)·토큰 출처**를 확인하며 값은 출력하지 않는다. `--save-snapshot`의 기본 위치도 선택된 설정 폴더 아래 `kk-budget/data`다.
- **토큰·카드번호·사번·실제 폴더 ID 는 skill 본문에 저장 금지.**
- 통합정보(포탈 `e.kist.re.kr` 로그인 / 업무화면 `p.kist.re.kr:8081`, 2026-07 변경 — 구 ekist.re.kr)는 **SSO 세션 + `window.application.authTk`** 로 동작 → 별도 API 토큰 불요.
- Dooray 메일 = 브라우저 세션 쿠키 wapi(토큰 불요). Dooray Drive API는 개인 토큰을 사용한다. kk-wiki는 개인 토큰 경로와 브라우저 세션 경로 중 선택할 수 있다.

## 4. 통합정보 fetch 우선 원리 (공통)
- 통합정보 NEXACRO 화면 1개가 열려 있으면 `authTk` + 세션쿠키로 backend `.do` endpoint 직접 호출.
- 새 세션·오래 미사용·정오 이후에는 **먼저 `https://e.kist.re.kr`에서 포탈 메인 진입 확인 → 업무화면 이동 → `ready()` 확인** 순서다. 업무화면 딥링크부터 열어 만료 alert를 반복하지 않는다.
- 요청 = `POST`, `Content-Type: text/xml; charset=UTF-8`, NEXACRO Dataset XML body. 응답 `<Dataset><Rows><Row><Col id=…>` 파싱.
- `authTk`·쿠키·세션값은 **출력 금지**, 핵심 필드만 반환.
- 대표 endpoint: 카드내역 `/mis/fam/fam0711/getList.do` · 과제목록 `/mis/rdm/rdm2011/doSearchMain.do` · 예실대비표 `bdg_2030`(`getBdgInfo`/`getMainList`) · 직원검색 `/popup/common/getRqstNoMgt/chkPopupValueSetting.do`.
- fetch 불가 화면은 즉시 실패 말고 **화면 캡처/DOM fallback** — 단 **고정 좌표 금지**, 매번 화면 상태를 읽어 위치 확인.

## 5. NEXACRO 파일첨부 (Codex)
파일첨부 해결법은 [공통 가이드](skills/_shared/nexacro_file_upload.md)(A/B/C 3 패턴)를 따른다. Codex에서는 패턴 C로 파일 선택과 데이터셋 반영을 확인했다:
- **파일은 브라우저가 실행 중인 PC의 OS 임시폴더에 staging**한다(Windows `%TEMP%\kiki_upload\<건>\`, 다른 OS는 임시폴더 경로 확인). 현재 작업 폴더(cwd) 안이어도 MCP workspace roots 검사에 거부될 수 있다. 2026-09-27 Codex 실측에서 cwd는 거부됐고 OS temp는 성공했다. 원본을 이동하지 말고 필요한 증빙만 복사한다.
- `<컴포넌트>.extUp._input_node`(숨겨진 HTML input)를 대상 팝업 DOM에 노출 → **`take_snapshot({pageId})`에서 최신 `uid` 확인 → `upload_file({pageId, uid, filePaths:[<임시 복사본 절대경로>]})`**. `uid`에 CSS 선택자를 넣지 않는다. 입력 요소가 재생성되면 snapshot부터 갱신한다.
- **도구의 “File uploaded” 응답만으로 서버 저장 성공이라 하지 않는다.** 마지막 선택 후 `ds_files`의 파일명·건수·크기를 확인한다. `tmHeader="I"`, `PROG=0`은 선택 단계다. 검수 `mcs_0003_pop2`는 신청 시 전송되므로 선택 직후 `gfn_upload`를 일괄 호출하지 않는다. 화면별 서버 저장 절차와 사용자 확인은 해당 skill을 따른다. 임시 복사본은 필요한 서버 전송·검증이 끝났거나 테스트 창을 저장 없이 닫은 뒤 정리한다.
- 회의비 회의록 팝업: `fileDiv1`(서명록)/`fileDiv2`(증빙)/`fileDiv3`(사전결재), `RQST_NO = CONFERENCENO + "-" + ds_param.CARDUSEMGRNO`, `FLE_TP="02"`(증빙).
- 저장 확인: `ds_files` 의 `tmHeader="S"` · `FLE_TP` · `FLE_PATH`(예 `/YYYY/MMDD/pop_fam_0703_02`) · `NEW_FLE_NM`.

### 5-1. 첨부/저장 후 화면 클릭 막힘 (tool 무관 — Claude 도 해당)
첨부·저장 후 **빈 NEXACRO modal layer 가 화면 전체를 덮어 클릭이 안 먹는** 경우가 있다.
- 진단: `document.elementFromPoint(500,300)` → 반환이 `..._form_modalPopDiv` / `...modalPopDivScrollableInnerContainerElement(_inner)` 류면 그 레이어가 가로채는 것.
- 실제 확인창·입력 팝업이 열려 있으면 먼저 해당 창을 정상 처리한다. **빈 레이어만 남은 것을 확인한 경우** 해당 레이어들에 `pointer-events:none !important` CSS를 주입한다. 살아 있는 모달의 입력·확인 절차를 건너뛰는 용도로 쓰지 않는다.
```js
let s = document.getElementById("kk-clickfix-style") || document.head.appendChild(Object.assign(document.createElement("style"),{id:"kk-clickfix-style"}));
s.textContent = `[id*="_form_modalPopDiv"], [id*="modalPopDivScrollableInnerContainerElement"] { pointer-events:none !important; }`;
```
(이 fix 는 `_shared/nexacro_file_upload.md` 에도 공통 기록.)

## 6. skill 별 Codex 실전 노트 (요약)
세부 절차·함정은 각 skill 본문이 1차. 아래는 Codex 이식 시 확인된 보강점.

- **kk-budget**: 예실대비표 `bdg_2030` 좌표 없이 fetch 조회 → JSON 스냅샷 → `scripts/make_report.py` 엑셀. **조회 전용**(저장/제출/결재 안 함). 로그인 세션만 있으면 토큰 불요.
- **kk-pay**: 카드 승인번호·과제·금액 fetch 조회 + 파일명 규칙 변환 + Dooray Drive 업로드(`DOORAY_TOKEN`). 세금계산서 직접작성의 계좌검증·첨부·상신 절차는 [fam_0702 안내](skills/kk-pay/references/tax_invoice_payment.md)에 정리돼 있다. 과거의 공휴일·주말 미가동 추정은 적용하지 않는다. **정본의 전체 흐름 실증과 Codex 이번 재시험 범위는 구분**한다: 이번에는 조회·검수 첨부 선택까지이며 계좌검증·저장·상신 전체는 재시험하지 않았다. `archive`는 사전검사·실패 시 되돌림의 요약을 확인하고 `실패`·`되돌리지 못함`이 있으면 완료로 보고하지 않는다.
- **kk-inspect**: `mcs_0003` 필드맵·팝업 제어. 검수신청구분은 보통 **비자산** 선택 후 조회. **첨부는 건별 행 선택 후 해당 세금계산서·거래명세서 1개씩** (여러 건 한꺼번에 4개 X — 행 바꿔가며 해당 증빙만). 숨은 input 패턴으로 첨부 가능.
- **kk-meet**: [SKILL](skills/kk-meet/SKILL.md) 기준으로 **회의 메모·녹취록·회의 자료 등 글을 먼저 한 번에 요청**한다. 녹음만 있으면 휴대폰 녹음 앱·클로바노트로 바꾼 글을 받는 흐름을 따르고, 외부 전송 여부는 정본 안내대로 확인한다. 녹음 파일을 그대로 주거나 그 방법이 어려울 때만 `transcribe.py check`의 **`[사용자 안내]` 한 줄**로 이 PC 음성 인식을 안내한다. 설치·실행은 [녹음 처리 안내](skills/kk-meet/references/meeting_transcribe.md)를 따른다. 글·녹음이 없으면 주제를 묻고 먼저 내용을 직접 적어 달라고 한다. 직접 적지 않는 경우에만 제안서·보고서를 근거로 채워도 되는지 확인한다. 이미 완성된 회의록은 그대로, 기록 요약·보완 초안은 사용자 확인 뒤 입력한다. 사전결재·시간·참석자 판단은 SKILL을 따른다. Codex도 `evaluate_script`로 제어하며, 계정/비목은 **`doDecision()` 콜백**, 통장표기는 **`common_onkillfocus` 동기화**를 사용한다.
  회의록 엑셀은 임시저장 직후 `{kiki_root}/meeting/meeting_log/{yymm}_회의록.xlsx`에 자동 기록한다(처리 연월별 1파일, 연월 하위폴더 없음). 회의록 파일은 **hwpx로 통일**하고 요청 시에만 [make_meetinglog_hwpx.py](skills/kk-meet/scripts/make_meetinglog_hwpx.py)로 같은 폴더에 `{yymmdd}_{과제번호}_{과제이름 간략}_회의록.hwpx`를 만든다(건당 1파일). 생성은 표준 라이브러리로 모든 OS에서 **아래아한글 없이** 가능하고, 열람은 한글 또는 HOP을 쓴다. 세부 저장·중복 검사 규칙은 [회의록 엑셀 안내](skills/kk-meet/references/meeting_log_excel.md)를 따른다.
- **kk-mail**: [SKILL](skills/kk-mail/SKILL.md)의 기능 번호는 **1 자연어로 메일 찾기(가장 많이 쓰는 기능) · 2 폴더 분류 · 3 자동분류 규칙 · 4 스팸 처리 · 5 메일 쓰기·보내기 · 6 답장**(미리보기 → 사용자 확인 → 보내기 → 보낸 메일함 확인, 답장 초안은 설정 `replyDrafts` — 기본 대화창 + 임시 보관함, 코어 1.12). 로그인 세션 쿠키로 동작하며 토큰·추가 설치는 불필요하다(§1의 Codex 브라우저 도구 준비 전제).
  기능 1은 코어(1.12)의 **`searchMails`/`searchMany` → Dooray 검색 API `POST /v2/wapi/mails/search`** 경로가 기본이고, 검색어를 정하기 어려우면 **`listMails`로 목록 훑기** 경로를 쓴다. `end`(all/period/cap/error)·`truncated`·`error`를 확인하고, `searchMany`의 `truncatedGroups`나 `fmtList`의 잘림 경고를 전체 검색 완료로 바꾸어 보고하지 않는다. `getMail`은 조회 거절·안 읽음 복원 실패를 예외로 알리며, 복원 실패 시 `e.mail`에 본문이 남는다. `getMails`의 `restoreError`도 확인하고 읽음 상태 보존 성공으로 보고하지 않는다. 상세는 [SKILL](skills/kk-mail/SKILL.md)·[wapi 참조](skills/kk-mail/references/wapi_reference.md)를 따른다.
  첫 실행(`kk-mail 설정해줘`)은 **환경 점검 → 기존 폴더·규칙 파악 → 6가지 기능 안내로 종료**한다. 폴더 분류·권장 규칙 설정은 사용자가 원할 때만 진행한다. 기능 3의 기본 조건은 **발신 주소만**이며, 제목 조건은 사용자가 명시할 때만 추가한다.
  **도구별 검증 범위**: SKILL의 "출력 약 1,000자 잘림·`a=b` 필터"는 **Claude in Chrome의 `javascript_tool` 실측값**이다. 2026-09-27 이 Codex 세션의 `evaluate_script`에서는 가상 문자열 **19,210자**, `a=b`·URL·20자리 숫자를 온전히 반환했고 비동기 resolve 결과도 직접 받았다. 이를 출력 무제한이나 다른 도구·버전의 보장으로 해석하지 않는다. 실제 결과가 클 때는 필요한 필드만 반환하거나 분할하며, Claude용 필터 우회를 Codex 필수 조건으로 두지 않는다.
- **kk-wiki**: [SKILL](skills/kk-wiki/SKILL.md). 위키 본문 스냅샷을 `{kiki_root}/wiki`에 두고 로컬 검색(`wiki_search.py`) → 인용 페이지만 `wiki_snapshot.py fresh`로 최신 확인. **토큰이 있으면 Python만으로**(브라우저 불요) 수집·최신 확인·첨부. 토큰이 없으면 chrome-devtools 창의 Dooray 탭에 코어 `kk_wiki_ops.js`를 주입 → `crawlAll()`(탭을 앞에 둘 것) → export JSON 다운로드 → `import`. 스냅샷은 KIST 내부 자료 — repo 밖에만.

### kk-dry (구 kk-dooray): Codex 브라우저 경로

[SKILL](skills/kk-dry/SKILL.md)의 `browser_batch`·`javascript_tool`·`get_page_text`를 현재 세션에서는 `list_pages`/`new_page`·`evaluate_script`·`evaluate_script`의 DOM 읽기로 옮긴다. 아래 `pageId`는 `list_pages`나 `new_page`가 반환한 실제 숫자로 바꾼다. 브라우저 조회는 로그인된 Dooray와 같은 origin의 `https://kist.gov-dooray.com/robots.txt` 작업 탭에서 한다. 기존 작업 탭이 있으면 재사용하고, 없으면 `new_page({url:"https://kist.gov-dooray.com/robots.txt", background:true})`로 만든다. `take_snapshot({pageId})`으로 탭 URL과 본문이 나타난 것을 확인한 뒤 코어를 주입한다. `isolatedContext`를 지정하면 기존 로그인 세션과 분리되므로 이 용도로 쓰지 않는다. 결과 그림을 띄우지 않았다면 작업 뒤 만든 탭을 닫고, 그림을 띄웠다면 사용자가 보도록 남긴다.

코어는 선택한 설치본의 [kk_dry_ops.min.js](skills/kk-dry/scripts/kk_dry_ops.min.js) **2.4**를 사용한다. 먼저 `evaluate_script`로 저장된 코어의 버전을 확인하고, 없거나 다르면 파일 입력을 만든다. `function` 인자 예:

```js
() => {
  const c = localStorage.getItem('kk.dry.core') || '';
  if (c.includes('kk-dry-ops/2.12')) return (0, eval)(c);
  document.body.innerHTML = '';
  const i = document.createElement('input');
  i.type = 'file'; i.id = 'kkcore'; i.setAttribute('aria-label', 'kk core file');
  document.body.appendChild(i);
  return 'NEED_UPLOAD';
}
```

`NEED_UPLOAD`이면 `take_snapshot({pageId})`에서 **최신** 파일 입력의 `uid`를 얻어 `upload_file({pageId, uid, filePaths:["<설치본>/scripts/kk_dry_ops.min.js의 절대경로"]})`를 호출한다. 이어서 아래 함수를 `evaluate_script({pageId, function:"async () => { ... }"})`로 실행하고 `kk-dry-ops/2.12 =^.^=` 반환을 확인한다. 파일 경로가 도구의 workspace 검사에서 거부되면 §5처럼 **코어 파일만** OS 임시폴더에 복사해 업로드한다. 새로고침 뒤에는 저장된 코어의 버전을 확인해 다시 주입한다. 전역은 `window.kkDry`이며 `window.kkDooray`는 구 이름 별칭이다.

```js
async () => {
  const f = document.getElementById('kkcore')?.files?.[0];
  if (!f) return 'ERR 코어 파일 없음';
  const c = await f.text();
  if (!c.includes('kk-dry-ops/2.12')) return 'ERR 코어 버전 다름';
  localStorage.setItem('kk.dry.core', c);
  return (0, eval)(c);
}
```

업무·드라이브 찾기는 `evaluate_script({pageId, function:"() => { ... }", waitForStableDom:false})`에 아래 함수를 넘겨 **시작과 확인을 분리**한다. 완료·실패는 반드시 저장한다.

```js
() => {
  window.__rep = null;
  window.kkDry.report([['찾을 말'], ['다른 표현']], {since:'YYYY-MM-DD'})
    .then(r => window.__rep = r, e => window.__rep = {error:String(e)});
  return 'started';
}
```

다음 `evaluate_script`에서는 `({ready:window.__rep!==null, error:window.__rep?.error||null, length:document.body.innerText.length, text:document.body.innerText.slice(0,10000)})`를 반환한다. `ready:false` 또는 화면의 진행 표시가 남아 있으면 잠시 뒤 재확인한다. 본문·댓글·첨부·경로가 필요한 경우 `report`, 파일 속 슬라이드·문단·표는 `quick({find:[…],q:/…/})`를 같은 시작/확인 패턴으로 호출한다(`window.__q`에 성공·실패 저장). 슬라이드 그림은 `take_screenshot({pageId})`로 실제 화면을 확인한다. 결과 화면의 링크·오류·잘림·미조회 건수도 함께 읽고, `ERR`를 0건으로 해석하지 않는다.

큰 결과는 `evaluate_script`로 `({length:document.body.innerText.length, text:document.body.innerText.slice(10000,20000)})`처럼 **서로 다른 offset의 1만 자 구간**을 끝까지 읽는다. `take_snapshot`은 요소 `uid` 확인에 유용하지만 접근성 트리가 화면 글을 모두 담는다는 보장은 없다. 2026-09-29 격리된 `about:blank` 합성 페이지에서는 `evaluate_script`가 45,000자 문자열을 온전히 반환하고 `take_snapshot`도 45,000자 `<pre>`를 포함했다. 이는 실제 Dooray·다른 도구 버전의 출력 한도 보장이 아니다. SKILL의 `javascript_tool` 약 1,000자·`get_page_text` 5만 자 한도는 **Claude 실측**이며 Codex 한도로 옮겨 적지 않는다. 코어 자체가 `report` 화면을 4.5만 자 안팎으로 줄이므로 잘림 경고가 있으면 `showFiles`·`getTask` 등으로 해당 부분을 더 읽는다. 특히 `detail.textCut` 또는 댓글 `cut`이 있으면 `only({text:…})`의 0건은 뒷부분까지 확인한 결론이 아니다.

받기·댓글·글쓰기·올리기는 [dooray_io.py](skills/kk-dry/scripts/dooray_io.py)의 개인 토큰·대상 미리보기·사용자 확인 절차를 따른다. 위 브라우저 읽기 경로와 쓰기 경로를 혼동하지 않는다. 이 절의 Codex 도구 대응과 합성 출력 시험에 더해 **2026-09-30 kk-dry 2.3을 Dooray 실계정에서 검색·본문/첨부·슬라이드/문서 읽기, 공식 API 파일 스트림(메모리)과 다운로드·댓글·새 업무 미리보기까지 확인했다. `--yes` 저장·게시·업로드는 검증하지 않았다.**

## 7. 안전 경계 (Claude·Codex 공통)
- 조회·로컬 파일 작성 = 자동 가능.
- **업로드·rename·이동·포털 저장·임시저장·신청·결재상신 = 사용자 확인 후.**
- 결재상신 = 실제 결재 제출 → 최종 확인 전 금지. 결재선 확정은 별도 gw 전자결재 창 → 사용자 직접.
- 스팸 신고·메일 이동·규칙 생성도 사용자 확인 후.
- 토큰·세션쿠키·`authTk`·카드번호는 출력 금지.

## 8. 실행 체크리스트
1. `kiki_root`·선택 skill에 필요한 런타임(§1)과 Codex skill 목록의 `kk-*` 인식 확인(없으면 Codex 재시작).
2. MCP 연결 방식과 `pageId`를 확인하고, 필요한 통합정보·Dooray 로그인 세션을 확인한다(KIST 사내망/VPN, 통합정보는 포탈 먼저). kk-mail은 Dooray 로그인만 필요.
3. `kiki_doctor.py`로 실제 Python·설정 폴더·토큰 출처를 확인한다. Codex 공통 설정을 재사용하며, 위키 토큰 경로·Dooray Drive 작업 등 필요한 경우에만 토큰 유효성을 확인한다(값 출력·채팅 붙여넣기 금지). 깨진 설정이나 비정상 종료를 무시하지 않는다.
4. 통합정보 조회는 **fetch 먼저**, 실패 시 화면 fallback (고정좌표 금지).
5. 증빙을 OS 임시폴더에 복사하고 **`extUp._input_node`**(또는 별도 page의 실제 버튼)를 최신 snapshot의 `uid`로 지정한다 — `_shared/nexacro_file_upload.md`.
6. 선택 뒤 `ds_files` 건수·파일명, 승인된 서버 저장 뒤 `tmHeader`/`FLE_TP`/`FLE_PATH`/`NEW_FLE_NM`를 확인한다. 선택 성공과 서버 반영을 구분하고 필요가 끝난 임시 복사본을 정리한다.
7. 클릭 막히면 `elementFromPoint` 로 빈 modal layer 확인 → pointer-events 통과 CSS (§5-1).
8. 실제 제출/상신/업로드는 **사용자 확인 후**.
