# kiki 실행 환경 점검 (형제 skill 공유)

> **모든 kk-* skill 은 첫 실행(부트스트랩)과 매 작업 시작 때 아래를 동일하게 확인/안내한 뒤 진행한다.**
> **먼저 `python <skills>/_shared/kiki_doctor.py` 한 번** — Python·패키지·Node·설치된 skill 과 코어 버전·개인 설정 유무(값은 안 보임)·토큰 유무·kiki_root·다운로드 폴더·변환 엔진·kk-wiki 상태를 한 번에 출력한다(`--json` 도 됨). 아래 개별 점검은 doctor 가 문제를 보일 때만.
> 무자격 환경(미연결·미로그인)이면 **크래시 대신 친절한 안내로 멈춘다**. 설치 자체(패키지·Python·Node.js·MCP 등록)는 `CLAUDE.md`/`INSTALL.md` 가 담당 — 여기는 *실행 직전* 점검.
> 권장 모델: 첫 설정·첫 1~2회 = Opus 5(high), 이후 kk-budget 은 Sonnet 5, kk-mail 은 Opus 5(분류, 스팸처리 Sonnet 5), kk-meeting·세금계산서 직접작성은 Opus 5 유지(README 표).

## 0단계 — 환경 점검 (모든 skill 공통, 부트스트랩 맨 앞)

### 1. 어느 창에서 일하나 — 브라우저 도구 확인
kiki 는 Chrome 창 두 종류를 쓴다. **skill 마다 쓰는 창이 정해져 있고, 사용자에게 어느 창에 로그인해야 하는지 먼저 알려준다.**

| skill / 작업 | 창 | 도구 | 로그인 |
|--------------|----|------|--------|
| kk-mail | **평소 쓰는 Chrome** | Claude in Chrome 확장 (`javascript_tool` 등) | Dooray `kist.gov-dooray.com` 로그인 상태면 끝 |
| kk-budget | 평소 쓰는 Chrome | Claude in Chrome 확장 | 포탈 `e.kist.re.kr` 로그인 상태면 끝 |
| kk-pay — 카드결제건 RPA 업로드 | 평소 쓰는 Chrome + `token.txt` | Claude in Chrome 확장 + `dooray_drive.py` | 포탈 + Dooray(업로드 확인 페이지). **새 창 없음** |
| kk-pay — 세금계산서 직접작성 | **Claude 전용 새 Chrome 창** | chrome-devtools-mcp (`evaluate_script`·`upload_file` …) | 그 창에서 포탈 로그인 **한 번 더** |
| kk-meeting | **Claude 전용 새 Chrome 창** (첨부 때문) | chrome-devtools-mcp | 그 창에서 포탈 로그인 한 번 더 |
| kk-inspect | **Claude 전용 새 Chrome 창** | chrome-devtools-mcp | 그 창에서 포탈 로그인 한 번 더 |
| kk-wiki | 토큰 있으면 **브라우저 불요**(Python) / 없으면 평소 쓰는 Chrome | `wiki_snapshot.py` 또는 Claude in Chrome 확장(`kk_wiki_ops.js`) | 토큰 또는 Dooray 로그인 상태면 끝 |

- **"Claude in Chrome" 확장** — `list_connected_browsers` 로 연결 확인. 안 되면: *"이 skill 은 Chrome 의 'Claude in Chrome' 확장으로 동작합니다. 확장 설치(https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)·연결(Desktop: 좌하단 이니셜 → 설정 → 좌측 탭 'Claude in Chrome 설정' → 'Claude in Chrome 사용설정' 켜기 / Code: `claude --chrome`) 후 다시 해주세요."* 후 중단. 연결됐으면 `select_browser` / `tabs_context_mcp` 로 작업 탭 확보.
- 🔴 **내장 브라우저 ≠ Claude in Chrome** — Claude Desktop 앱에는 별도의 내장 브라우저(`mcp__Claude_Browser__*`, 'browser pane')가 있고 세션 기본값으로 잡혀 있을 수 있다. 여기엔 **사용자 Chrome 의 포탈 로그인이 없다** → kiki skill 은 항상 `mcp__claude-in-chrome__*` 도구(ToolSearch 로 로드)를 쓴다. 내장 쪽 `browser_batch` 를 부르면 빈 창이 열리고 `Preview not found` 로 실패한다.
- **chrome-devtools-mcp** *(kk-inspect · kk-meeting · kk-pay 세금계산서 직접작성 필수)* — 도구 목록에 `upload_file`·`evaluate_script`·`select_page` 가 없으면 미등록: *"파일첨부 자동화에는 chrome-devtools-mcp 등록이 필요합니다: `claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest` (Node.js 필요) 후 Claude 재시작."* 미등록이면 입력까지만 자동·**첨부는 사용자 수동**으로 진행 여부를 묻는다.
- ⭐ **첨부가 있는 작업은 *처음부터* chrome-devtools 창에서 시작한다** (2026-07-07 실측 교훈): Claude in Chrome 으로 작성·저장까지 해놓고 첨부 단계에서 갈아타면 **로그인·작성을 처음부터 다시** 하게 된다(Claude in Chrome `file_upload` 는 채팅에 첨부한 파일만 올릴 수 있어 로컬 증빙 첨부 불가). 첨부 없는 단순 조회만 Claude in Chrome 무방. chrome-devtools 는 자체 Chrome(별도 프로필)을 띄우며 도구 매핑·workspace root 제약은 [`nexacro_file_upload.md`](nexacro_file_upload.md) §4-6.
- **새 창 안내 문구(첨부 작업 시작 전 반드시)**: *"파일첨부를 위해 Claude 전용 Chrome 창을 하나 띄웁니다. 평소 Chrome 과 로그인이 공유되지 않아 그 창에서 포탈(e.kist.re.kr)에 한 번 더 로그인해 주세요. 한 번 하면 그 창은 기억합니다(정오 리셋 제외)."*
- **도구 이름 표기 규칙 (2026-09 기준)**: kiki 문서는 도구를 **짧은 이름**(`javascript_tool`·`tabs_context_mcp`·`file_upload` / chrome-devtools 의 `evaluate_script`·`upload_file`·`select_page`·`handle_dialog` …)으로 적는다. 실제 전체 이름은 `mcp__<서버명>__<도구명>` 이고 **서버명은 앱 버전·설치 방식에 따라 바뀐다** — Claude in Chrome: `mcp__Claude_in_Chrome__…`(2026-06) → `mcp__claude-in-chrome__…`(2026-09 현재) / chrome-devtools-mcp: `claude mcp add chrome-devtools …` 로 등록하면 `mcp__chrome-devtools__…`, plugin 설치면 `mcp__plugin_chrome-devtools-mcp_chrome-devtools__…` / Codex 는 `mcp__chrome_devtools.<도구명>`. **서버명이 달라도 도구명이 같으면 같은 도구**다. 세션 시작 시 도구 목록(ToolSearch `select:` 또는 deferred 목록)으로 실제 이름을 확인해 호출하고, deferred 상태면 ToolSearch 로 먼저 로드한다. 안 되면 모델 탓보다 **도구명·MCP 버전**을 먼저 의심.

### 2. 로그인 세션 확인 (사용자 본인이 로그인 — Claude 가 대신 하지 않는다)
- **KIST 사내망**에서만 동작. 밖(재택·출장)이면 *"KIST VPN 에 접속한 뒤 다시 해주세요"*.
- 로그인 페이지가 뜨면(세션 만료) *"{어느 창}에서 {시스템}에 로그인해 주세요"* 안내 후 중단.
- **포탈 주소 (2026-07 변경)**: 로그인/포탈 = **`https://e.kist.re.kr`**(구 `ekist.re.kr`), 통합정보 NEXACRO 업무화면(검수·지급·회의비·예산)은 여전히 **`http://p.kist.re.kr:8081/nxui/kistis/…`** (`e.kist.re.kr/nxui/…` 는 404).
- **⚠️ 업무화면 전 포탈 로그인부터 확인 (표준 절차)**: 작업 시작 시(특히 새 세션·새 창·오래 미사용·**정오 이후**) 업무화면(`indexQ.jsp` 등)으로 바로 navigate 하지 말 것 — 세션 만료면 `Your session has expired` alert 가 **반복**되고 진행 불가. 먼저 `e.kist.re.kr` 포탈 메인으로 가 로그인 상태 확인(로그인돼 있으면 eKIST 메인에 본인 이름) → 그 뒤 업무화면 navigate. SSO 쿠키가 살아 있으면 `e.kist.re.kr → nsso → login.do → eKIST 메인` 이 **자동 로그인**되는 경우도 많다.
- **KIST 포탈은 매일 정오(12:00) 전체 세션 리셋** — 오전에 시작한 작업은 정오 전에 저장까지 끝내고, 오후엔 재로그인 후 재오픈.

### 3. 토큰 (`token.txt`) *(kk-pay 카드 RPA 업로드 · kk-meeting RPA 업로드 옵션만)*
- 위치: **`<kiki_root>/token.txt`**(설치 스크립트가 생성, 예 `C:\kiki\token.txt`). `kiki_root` 는 `~/.claude/kiki/kiki.config.json` 에 기록돼 있다. (구형 `~/.claude/kiki/kiki.env` 도 계속 읽힌다.)
- 토큰이 비어 있으면 **절대경로를 보여주며** 안내: *"https://kist.gov-dooray.com/setting/api/token 에서 개인 인증 토큰을 만들어 `<kiki_root>\token.txt`(예 `C:\kiki\token.txt`) 의 `Dooray token:` 다음 줄에 붙여넣고 저장한 뒤 '두레이 토큰 저장했다' 라고 알려주세요. ⚠️ 채팅창에 토큰을 붙여넣지 마세요(대화 기록 노출)."* 원하면 파일을 열어준다(`notepad`/`open -e`).
- 사용자가 넣었다고 하면 `python <skill>/scripts/dooray_drive.py check --live`(kk-pay·kk-meeting 에 있음) 로 **값은 출력하지 않고** 길이·파일 위치 + 실제 인증(읽기 1회)만 확인(파일을 Read 하면 값이 대화에 남는다). 토큰이 없으면 종료 코드 1, 만료·오타면 `ERR … 401`. 안내 줄 위나 머리글 없이 붙여넣어도 읽힌다. 채팅에 값이 붙여넣어졌으면 즉시 파일로 옮기고 노출 위험을 알린다. 상세 `personal_config.md`.
- 조회 전용(kk-budget·kk-inspect)·세션쿠키(kk-mail)·세금계산서 직접작성은 토큰 불요.

### 4. Python 패키지 — **필요한 시점에, 그때그때** (부트스트랩에서 일괄 설치 X)
- 선택: `faster-whisper`(kk-meeting 회의 녹음 → 글, 로컬 음성 인식). 기본은 휴대폰 녹음 앱·클로바노트로 바꾼 글을 받는다. 사용자가 녹음 파일을 그대로 주고 이 PC 에서 바꾸길 원할 때만 `kk-meeting/scripts/transcribe.py check <녹음>` 의 `[사용자 안내]` 한 줄로 묻고 동의받아 설치(그래픽카드가 없으면 오래 걸린다) → `kk-meeting/references/meeting_transcribe.md`.
`python -c "import X"` 로 확인 → 없으면 *"`pip install X` 가 필요합니다(용도). 설치할까요?"* → confirm 후 설치. 크래시 X.
- **OS 별 설치 명령**(에이전트가 셸에서 실행): Windows `python -m pip install X`(`python` 이 PATH 에 없으면 `py -3 -m pip install X`, 스크립트 실행도 `py -3 …`) / macOS·Linux `python3 -m pip install --user X`. Python 본체가 아예 없으면 4단계가 아니라 설치(`CLAUDE.md` Step 0 — Windows `winget install -e --id Python.Python.3.12 …`)부터 안내.
  - macOS(Homebrew Python)·최신 Ubuntu 는 `externally-managed-environment` 오류로 막힐 수 있다 → `python3 -m pip install --user --break-system-packages X` (여기 쓰는 패키지는 순수 라이브러리라 시스템에 영향 없음). 그래도 안 되면 `python3 -m venv ~/.claude/kiki/venv` 후 그 venv 의 python 으로 skill 스크립트 실행.
  - `pywin32` 는 Windows 전용(macOS·Linux 는 건너뜀). `Pillow`·`PyMuPDF`·`openpyxl`·`requests` 는 세 OS 모두 wheel 로 설치된다.

| skill | 패키지 | 필요한 시점 |
|-------|--------|------------|
| kk-budget | `openpyxl` | 엑셀 리포트 저장 직전 |
| kk-meeting | `openpyxl` (hwpx 회의록 옵션은 추가 패키지 없음) | 회의록 엑셀 작성 직전 |
| kk-pay | `Pillow`(이미지→jpg) · `requests`(Dooray 업로드) · Windows 문서 변환 시 `pywin32` | 증빙 변환 직전 / 업로드 직전 |
| kk-inspect | `Pillow` (+ pdf→jpg 시 `PyMuPDF`) | 증빙 변환 직전 |
| kk-mail | — | — |
| kk-wiki | `requests` (토큰 경로) | 스냅샷 수집·최신 확인 직전 |

### 5. 아래아한글 · MS Office — 있으면 자동, 없으면 **물어본다**
- 필요한 경우만: kk-pay 증빙이 hwp/docx/xlsx 라 pdf 변환이 필요할 때. (kk-meeting 의 hwpx 회의록은 **한글 없이 생성**되므로 해당 없음 — 열람만 한글/HOP) 대부분의 KIST PC 엔 둘 다 있다 — `python convert.py --check`(kk-pay) 로 유무 확인.
- **없을 때** 단정하지 말고 묻는다: docx/xlsx → *"MS Office 가 없어 무료 LibreOffice(https://www.libreoffice.org/download/)를 설치하면 자동 변환됩니다. 설치할까요?"* / hwp → *"아래아한글이 없습니다. 무료 오픈소스 한글 편집기 HOP(Open HWP, Windows/macOS/Linux, https://github.com/golbin/hop)을 설치하면 hwp 를 열어 편집하고 PDF 로 내보낼 수 있습니다(자동 변환은 안 됨 — 내보낸 PDF 를 주시면 됩니다). 설치할까요?"* (Windows `.msi` / macOS `brew install hop` / Linux `.deb`·`.rpm`·`.AppImage`; rhwp 엔진 기반, MIT) 설치는 사용자 confirm 후. 거절하면 "직접 pdf 로 저장해 주세요" 로 진행.
- kk-meeting **hwpx 회의록 생성은 한글 불요·모든 OS**(`scripts/make_meetinglog_hwpx.py`, 표준 라이브러리 — 양식 hwpx 의 값 셀 XML 치환). 한글이 없는 PC 에서 열어보려면 무료 HOP(https://github.com/golbin/hop) 안내(**작성엔 불필요**; HOP 0.4.4 에서 hwpx 표시 확인 2026-09-24). hwp(구형)는 더 이상 만들지 않는다.

## OS 차이 (실행 중 에이전트가 알아야 할 것 — macOS/Linux 는 미실측, 알려진 차이)
- 명령: Python 은 Windows `python` / macOS·Linux `python3`(첫 실행 때 Xcode 명령줄 도구 설치 창이 뜰 수 있음 — 사용자에게 설치하라고 안내). pip 는 4단계 표기대로.
- 경로: `~` 는 Windows `C:\Users\<이름>`, macOS `/Users/<이름>`. config JSON 의 Windows 경로는 `\\`, macOS 는 `/`. `{kiki_root}` 기본 `C:\kiki` / `~/kiki`.
- 파일 열어주기: Windows `notepad <경로>` / macOS `open -e <경로>` / Linux `xdg-open <경로>`.
- 휴지통: `convert.py`·`rename_evidence.py` 가 OS 별로 처리(Windows PowerShell / macOS Finder — **첫 실행 때 "Finder 제어" 권한 창**, 거부되면 `_trash/` 폴더로 / Linux `gio trash`). 권한 창이 뜨면 사용자에게 허용을 안내.
- 변환 엔진: hwp→pdf 는 **Windows+아래아한글에서만 자동**. macOS/Linux 에서 hwp 증빙이 오면 "HOP 으로 열어 PDF 내보내기" 안내. docx/xlsx→pdf 는 MS Office(Windows) 또는 LibreOffice(모든 OS, `convert.py --check` 로 확인).
- `pywin32`·`pyhwpx`·`pywinauto`(구형 hwp COM) 는 Windows 전용 — macOS/Linux 에서 설치 시도하지 말 것. hwpx 회의록 생성은 표준 라이브러리라 모든 OS.
- 엑셀 잠금: Windows 는 열려 있으면 `PermissionError` → 닫아달라 안내. macOS 는 오류 없이 저장되지만 Excel 이 덮어쓸 수 있으니 작업 전 닫아달라 안내.
- 재시작 안내 문구: Windows "트레이 아이콘 → Quit" / macOS "Dock 아이콘 → Quit(⌘Q), 창 닫기는 종료 아님". Linux 는 Claude Desktop 이 없으므로 CLI 세션 재시작.
- 콘솔 한글: Windows PowerShell 5.1 은 BOM 없는 스크립트의 한국어를 깨뜨린다(`install.ps1` 은 BOM 포함). Python 출력은 `PYTHONIOENCODING=utf-8` 이 설정돼 있어 깨져 보여도 파일 내용은 정상.
- Windows Git Bash: `"C:\kiki\budget\"` 처럼 **역슬래시로 끝나는 경로를 큰따옴표로 감싸면** 닫는 따옴표가 이스케이프돼 `unexpected EOF` → `/c/kiki/budget/` 형식을 쓴다.
- Windows 콘솔 cp949: python 이 `—`(em dash) 등 cp949 밖 문자를 print 하면 `UnicodeEncodeError` 로 **죽는다**(PYTHONIOENCODING 미설정 셸) → 스크립트 첫머리 `sys.stdout.reconfigure(encoding='utf-8')`, 한 줄 검증도 동일.
- 상세 비교표 → repo 의 `INSTALL.md` §6(설치본에는 없음).

## 안내 문구 표준
- 멈춰야 할 때: 무엇이/왜 안 됐는지 + 사용자가 할 일 한 문장으로. (조용히 실패 금지)
- KIST 사내망/계정 권한이 필요한 접속은 그 사실을 함께 안내.

## 막혔을 때 (처음부터 안내하지 말고, 증상이 나올 때만)
- **포탈 팝업 창(검수창·지급신청 별도창·회의록 팝업)이 안 뜸** → Chrome 팝업 차단. 설정 → 개인정보 보호 및 보안 → 사이트 설정 → 팝업 및 리디렉션 → "팝업 전송 및 리디렉션 허용" 에 `https://p.kist.re.kr` 추가. **Claude 전용 새 창(chrome-devtools 프로필)도 별도 설정** 필요(팝업이 안 뜨면 이것부터 의심). 근거: wiki 데이터정보팀 「1-7 HTTPS 적용에 따른 브라우저 설정 안내」(2026-06-26). 평소 포탈을 쓰던 PC 는 대개 이미 돼 있다.
- **`upload_file` 이 "not within any configured workspace roots"** → chrome-devtools 는 Claude 를 연 폴더(cwd) 하위 파일만 올린다 → 증빙을 `<cwd>/_tmp/`(Claude 를 연 폴더 아래, gitignore 됨) 로 복사해 그 경로로 올린다(`nexacro_file_upload.md` §4-6).
- **HTTPS 접속이 안 됨** → 캐시·쿠키 삭제 후 브라우저 재시작(위 wiki 안내 ③).
- **엑셀 저장 `PermissionError`** → 파일이 열려 있음. 닫아달라 안내 후 재시도.

## 결과 점검 (스크립트·코어 결과를 쓰거나 보여주기 전 — 2026-09-27 사용자 확정)
1. **요약 줄만 읽고 기대치와 대조한다** — 스크립트·코어는 마지막에 건수·경고·실패·기준일을 한 줄로 찍는다. 전체 결과를 다시 읽거나 숫자를 다시 계산하지 않는다(그러면 절약이 사라지고 LLM 산술이 더 틀린다).
2. **어긋나면 원인 줄을 보고 입력·상태를 바로잡아 딱 한 번 다시 돌린다** — 세션 만료면 로그인, 파일 없음이면 경로, 기간·사번이 빠졌으면 채워서. 무한 재시도 금지.
3. **그래도 안 되면 문서의 수동 경로로 가고, 사용자에게 "스크립트가 X 때문에 실패해 수동으로 했다" 고 알린다** — 조용히 대신 하지 않는다(원인을 고칠 기회가 사라진다). 결과와 기대치가 다른데 원인을 모르면 그대로 사용자에게 보인다.

**브라우저 코어 2-스텝의 약속(2026-09-27 전체 흐름 검수)** — 실패가 '0건'·'없음'으로 보이지 않게:
- 저장은 항상 오류까지: `window.__x=null; <코어 호출>.then(r=>window.__x=r, e=>window.__x={error:String(e)}); 'started'`. 오류 처리를 빼면 세션 만료가 영원히 `null` 로 남아 원인이 안 보인다.
- 반환은 **1,000자에서 잘린다**(실측) — 목록 포매터는 줄 수가 아니라 글자 수로 끊고 머리줄에 `▶ 다음 조각 K` 를 적는다 → 같은 포매터를 from=K 로 다시 부른다(`[TRUNCATED]` 가 보이면 포매터를 거치지 않은 것).
- 포매터(`fmtList`·`fmtExternal`·`fmtOverview`·`fmtCards`·`fmtMeeting`·`fmtBudget`·`fmtFresh`)는 그 변수를 그대로 받는다: `(결과 없음 …)` = 아직(2~3초 뒤 다시; 두 번 넘게 이어지면 오류 처리 누락) / `ERR …` = 실패(`PORTAL:` 통합정보 세션, `DOORAY:` 두레이 로그인 → 로그인·탭 새로고침·재주입 후 1회) / `[… of N]` = 결과(N=0 은 정말 0건).
- 브라우저에서 내려받은 파일을 파이썬이 쓸 때는 코어가 돌려준 명령의 `--expect <run>` 을 그대로 붙인다 — 그 실행의 파일만 쓰고, 없으면(Chrome 저장 창·'여러 파일 다운로드 허용' 대기) 20초 기다린 뒤 **옛 파일을 쓰지 않고** 멈춘다.
- 쓰기 스크립트(`kk_pay_files.py apply/archive`, `dooray_drive.py upload`, `wiki_staff.py import`, `meeting_log_xlsx.py append`)는 먼저 전부 검사하고 하나라도 걸리면 **아무것도 바꾸지 않는다** — 일부만 바뀐 채 멈추지 않는다. 마지막 줄 `[요약]`·`[OK]` 를 본다.
