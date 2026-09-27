# kiki on Claude — 설치·실행 지침 (Claude 에이전트용)

> 이 문서는 **Claude (Claude Code CLI / Claude Desktop 앱)** 가 kiki 를 설치·실행할 때 따르는 기준이다.
> **에이전트(Claude)에게**: 사용자가 "kiki 설치해줘" / "이거 설치해줘" 라고 하면, 추측하지 말고 **아래 1번 절차를 순서대로** 수행하라. 패키지 폴더를 확보한 **직후, 진행 전에 이 `CLAUDE.md` 와 `README.md` 를 먼저 Read 하라**(자동 주입이 안 될 수 있으니 능동적으로 읽는다). 각 skill 사용법은 설치 후 각 `skills/kk-*/SKILL.md` 가 1차 기준.
> (Codex 사용자는 [CODEX.md](CODEX.md). `docs/`·`tools/` 는 메인테이너용 참고 자료라 사용자는 읽지 않아도 된다. 메인테이너 개인 노트 `CLAUDE.local.md` 는 배포본에 없다.)

## 0. kiki 가 무엇인가 (한 줄)
KIST 행정 자동화 skill 6종(`kk-mail`·`kk-wiki`·`kk-pay`·`kk-meeting`·`kk-budget`·`kk-inspect`). **로그인된 Chrome 을 "Claude in Chrome" 확장 + chrome-devtools-mcp 로 제어**해 포털/Dooray 를 다룬다. skill 은 `~/.claude/skills/` 에 두면 Claude Code·Desktop 이 인식한다(설치 후 **재시작 필요**).

**권장 모델**: 설치·첫 설정·첫 1~2회 실사용 = **Opus 5**(Fable 5.1 가능하면) · 노력도 high. 이후 kk-budget 은 Sonnet 5, kk-mail 은 Opus 5(분류, 스팸처리 Sonnet 5), kk-pay 카드 RPA·kk-inspect 는 Sonnet 5(high), **kk-meeting·kk-pay 세금계산서 직접작성은 Opus 5 유지**. README 에는 skill 별 권장모델(Opus/Sonnet)만 있으므로 **설치 완료 안내(Step 5) 때 "첫 설치·각 skill 첫 1~2회는 Opus, 이후 README 표대로" 를 한 번 알려준다**. 사용자가 다른 모델로 설치를 시작했으면 한 줄로 알려주되 진행은 계속한다.

---

## 1. 설치 절차 (에이전트가 그대로 실행)

### Step 0 — 실행 환경 (Python · Node.js · 사내망)
- **Python 3 와 Node.js 는 설치 때 기본으로 갖춘다** — 전체 설치(기본)면 둘 다, 사용자가 skill 을 골랐으면: kk-mail 만 → 둘 다 불필요 / kk-budget·kk-wiki → Python / **kk-pay·kk-meeting·kk-inspect(첨부 skill) → Python + Node.js**(chrome-devtools-mcp 가 Node 프로그램).
- 확인: `python --version`(macOS/Linux `python3`), `node --version`, `npx --version`. Windows 는 `python` 이 없어도 `py -3 --version` 이 되면 설치된 것(py 런처는 항상 PATH 에 있음) — 그 경우 이후 모든 명령을 `python` 대신 `py -3` 로 실행한다. `python` 을 쳤을 때 **Microsoft Store 창이 열리면 미설치**(Windows 의 가짜 python.exe).
- 없으면 **에이전트가 바로 설치를 시작한다**(kk-mail 만 설치하는 경우 제외 — 확인 질문 없이, 시작 전에 한 줄만 알린다): *"Python(과 Node.js)이 없어 지금 설치합니다 — Python 은 엑셀·증빙 변환, Node.js 는 파일첨부 도구에 필요합니다. 1~3분 걸리고, 중간에 '사용자 계정 컨트롤' 창이나 설치 화면이 뜨면 **예 / 다음**을 눌러 주세요."* 그 다음:
  - Windows: `winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements` → `winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements` (조용히 설치. Node.js 는 PC 전체 설치라 **UAC 창이 뜬다** — 사용자가 '예'를 눌러야 진행되니 실행 직후 그 사실을 다시 알린다. 타임아웃은 5분 이상으로.)
  - `winget` 은 Windows 11·최신 Windows 10 에 기본 포함이라 PowerShell·cmd 어디서든 된다. 단 **새 PC 는 Microsoft Store 가 '앱 설치 관리자'를 업데이트하기 전엔 `winget` 이 안 잡힐 수 있고**(Store 열어 업데이트하면 해결), 회사 정책으로 Store/winget 이 막힌 PC 도 있다. 그땐 다운로드 페이지를 열어주고(`start https://www.python.org/downloads/`, `start https://nodejs.org/en/download`) 설치 마법사를 **단계별로 안내**한다 — Python: 첫 화면 아래 **"Add python.exe to PATH" 체크 → Install Now → UAC 예 → Close** / Node.js: **Next → 약관 동의 체크 → Next → Next → (Tools for Native Modules 는 체크 안 함) → Next → Install → UAC 예 → Finish**. 끝났다고 하면 다시 확인.
  - macOS(미실측): 새 Mac 은 Python 이 **없다**(`python3` 는 Xcode 명령줄 도구를 설치하라는 스텁). 순서 — ① `xcode-select --install` 을 실행하면 **"명령어 라인 개발자 도구를 설치하시겠습니까?" 창**이 뜬다 → 사용자에게 "설치 → 동의" 클릭 안내(5~10분, 끝나면 Apple 제공 python3 + pip 사용 가능) ② Node.js 는 Homebrew 가 있으면 `brew install node`, 없으면 nodejs.org 의 macOS `.pkg` 를 내려받아 `open` 으로 열어주고 "계속 → 동의 → 설치 → **Mac 암호 입력** → 닫기" 안내(Homebrew 설치 스크립트는 암호를 대화식으로 묻기 때문에 에이전트 셸에서 돌릴 수 없다 — 사용자가 직접 할 때만). ③ 확인 `python3 --version`·`node --version`.
  - Linux(미실측): `python3` 는 거의 항상 기본 포함, pip·Node 는 없을 수 있다. `sudo` 는 암호가 필요해 에이전트 셸로 실행할 수 없으니 **사용자가 터미널에 붙여넣을 명령을 그대로 제시**한다: `sudo apt install -y python3-pip python3-venv nodejs npm`(Ubuntu/Debian). sudo 를 못 쓰면 pip 은 `curl -sS https://bootstrap.pypa.io/get-pip.py | python3 - --user`, Node 는 nodejs.org 의 Linux 바이너리 tar 를 `~/.local` 에 풀어 PATH 추가(둘 다 에이전트가 대신 가능).
- 설치 확인: Windows `py -3 --version`·`node --version`. `python`/`node` 가 아직 안 잡히면 PATH 미반영이니 이번 세션은 `py -3` 로 진행하고 재시작(Step 5) 후 정상화된다고 알린다(설치 실패로 단정 금지). pip 는 `py -3 -m pip install X`.
- Python **패키지**(openpyxl·Pillow 등)는 지금 깔지 않는다 — 각 skill 이 필요할 때 확인·설치.
- **git 은 필요 없다.** 있으면 clone 에 써도 되지만 없다고 설치를 요구하지 말 것(ZIP/폴더로 진행).
- **KIST 사내망**에서만 동작. 밖이면 KIST VPN 접속을 안내.
- OS 가 macOS/Linux 면 [INSTALL.md](INSTALL.md) §6 의 차이표(python3·pip 옵션·Homebrew·Xcode 도구·Finder 권한·hwp 변환 불가)를 먼저 읽고 그에 맞춰 안내한다. **macOS 는 미실측**이니 막히는 지점을 사용자에게 솔직히 말하고 우회한다.

### Step 1 — kiki 폴더 위치 정하기 + 패키지 확보
1. **먼저 묻는다**(AskUserQuestion 등 선택 프롬프트): *"kiki 를 어디에 둘까요? ① 기본 `C:\kiki`(권장, macOS/Linux `~/kiki`) ② 직접 지정"*. 이 폴더가 **skill 원본 + 엑셀·회의록·검수 파일 + `token.txt`** 의 집(`kiki_root`)이 된다.
2. 패키지를 그 폴더에 확보한다(이미 받아둔 폴더가 있으면 그 폴더를 root 로 쓰거나 위 폴더로 옮긴다):
   - **git 있으면** `git clone https://github.com/angmond1/kk.git <root>` (공개 repo 라 로그인 불요. 실패하면 조용히 넘기지 말고 사내망/프록시를 확인하거나 아래 ZIP 로).
   - **git 없으면** 사용자에게 안내: 브라우저에서 GitHub 페이지 `Code ▾ → Download ZIP` → `<root>` 에 풀기 → 완료를 알려달라. (`kk-main` 하위 폴더가 생겨도 그 안에서 진행하면 된다.)
   - 동료에게 받은 폴더면 그대로.
3. ⚠️ **이후 작업은 그 폴더 안에서**(Claude Code 는 그 폴더를 작업 루트로). 다른 폴더에서 계속하면 이 지침이 적용되지 않아 추측 설치가 된다. 작업 루트를 옮기는 법: Claude Code 는 그 폴더에서 `claude` 를 다시 실행(Desktop 은 그 폴더를 프로젝트로 열기). 못 옮기면 스크립트와 이 파일을 **절대경로**로 실행·Read 하며 계속한다.

### Step 2 — skill 설치 (OS 자동 감지)
현재 OS 를 판단해 **하나만** 실행한다. `-Root`/`--root` 에 Step 1 의 폴더를 넘긴다(패키지 폴더 = root 면 생략 가능).
- 설치 폴더가 곧 kiki 작업 폴더면 `{root}/wiki`(kk-wiki 내부 자료)·`budget`·`meeting`·`inspect` 는 `.gitignore` 로 제외된다(그래도 `git add -A` 로 올리지 않도록 주의).
- 기존 설치본 갱신이면: 2026-09-26 부터 `kk-dining` 은 **`kk-meeting`** 으로 이름이 바뀌었다. 설치 스크립트가 옛 `~/.claude/skills/kk-dining` 폴더를 지우고 개인 설정 `~/.claude/kiki/kk-dining.config.json` 을 `kk-meeting.config.json` 으로 바꾼다(수동 설치면 직접). 데이터 폴더도 `{kiki_root}/dining/` → `{kiki_root}/meeting/` 으로 바뀌었다(설치 스크립트가 기존 `dining/` 폴더 이름을 `meeting/` 으로 바꾼다. 수동 설치면 직접).
- **Windows** (PowerShell) — 신규 PC 는 실행정책이 `Restricted` 라 `./install.ps1` 이 막힌다. **Bypass 로 호출**:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File ./install.ps1 -Root "C:/kiki"   # 전체 (또는 끝에 kk-mail kk-pay ...). -Root 는 꼭 이름을 붙여서
  ```
- **macOS / Linux** (bash):
  ```bash
  bash ./install.sh --root ~/kiki                                                 # 전체 (또는 kk-mail ...)
  ```
스크립트는 `_shared` + 선택 skill → `~/.claude/skills/`, 개인설정 템플릿 → `~/.claude/kiki/`(+ `kiki_root` 기록), root 에 `budget/ meeting/ inspect/ _tmp/` + **`token.txt`** 를 만든다. 스크립트를 못 쓰면 [INSTALL.md](INSTALL.md) §2 방법 B(수동 복사) — `_shared`·`~/.claude/kiki/`·`token.txt`·`kiki_root` 누락 주의.

### Step 3 — 브라우저 도구 2개 (없으면 지금 설치·안내)
1. **"Claude in Chrome" 확장** — Chrome 웹스토어 https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn 설치 → 연결(Desktop: 좌하단 이니셜 → "설정" → 좌측 탭 "Claude in Chrome 설정" → "Claude in Chrome 사용설정" 켜기 / Code: `claude --chrome` 또는 `/chrome`). `list_connected_browsers` 로 확인.
2. **chrome-devtools-mcp** (파일첨부용 Claude 전용 Chrome 창) — 도구 목록에 `upload_file`/`evaluate_script` 가 없으면 미등록. 사용자 confirm 후 등록:
   ```
   claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest
   ```
   (`--scope user` 라 Claude Desktop 도 같은 등록을 읽는다. plugin 경로도 가능: `claude plugin install chrome-devtools-mcp@claude-plugins-official`.) `claude` CLI 가 PATH 에 없으면(데스크톱 앱만 설치) 먼저 **환경변수 `CLAUDE_CODE_EXECPATH`** 의 실행 파일(데스크톱 앱에 들어 있는 Claude Code)로 같은 명령을 돌린다: `"$CLAUDE_CODE_EXECPATH" mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest` (2026-09-28 Windows 실측: 격리한 설정 폴더에서 CLI·앱 내장본 모두 등록 후 `mcp list` 가 6초 만에 `✔ Connected`, `cmd /c` 없이 `npx` 그대로 동작). 그것도 없을 때만 사용자 홈의 **`.claude.json`**(Windows `C:\Users\<이름>\.claude.json`, macOS `~/.claude.json` — Claude Code 와 Desktop 의 Code 탭이 공통으로 읽는 사용자 설정)을 직접 편집한다(같은 결과): 파일이 없으면 `{"mcpServers": {"chrome-devtools": {"type": "stdio", "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"]}}}` 로 새로 만들고, 있으면 JSON 을 파싱해 `mcpServers` 에 이 항목만 **병합**(다른 키 보존, 편집 전 백업). 등록 후 재시작 필요.
   ⭐ **사용자가 "chrome-devtools mcp 설치해서 사용 가능하게 해줘"(README 준비물 3 문구)나 "chrome-devtools-mcp 설치해줘" 라고만 말해도 이 항목을 수행한다**: Node.js(`npx`) 확인 → 없으면 Step 0 대로 설치 → 등록 → "재시작 후 도구 목록에 `upload_file` 이 보이면 성공" 안내. 사용자에게 **"파일첨부 때는 Claude 전용 새 Chrome 창이 뜨고, 거기서 포탈 로그인을 한 번 더 해야 한다"** 를 미리 알려준다.

### Step 4 — 토큰 파일 안내 (Dooray 토큰)
설치로 `<root>/token.txt` 가 생겼다. **절대경로를 그대로 보여주며** 안내한다:
> "Dooray 드라이브 업로드(kk-pay 카드결제건 RPA)를 쓰려면 토큰이 필요합니다. https://kist.gov-dooray.com/setting/api/token 에서 개인 인증 토큰을 만들어 **`<kiki_root>\token.txt`**(예 `C:\kiki\token.txt`) 의 `Dooray token:` 다음 줄에 붙여넣고 저장한 뒤 '두레이 토큰 저장했다' 라고 알려주세요. 지금 안 해도 되고 kk-pay 쓸 때 해도 됩니다.
> ⚠️ 토큰·API 키를 **채팅창에 직접 붙여넣지 마세요** — 대화 기록에 남아 타인에게 노출될 수 있습니다."

원하면 파일을 열어준다(Windows `notepad <경로>`, macOS `open -e <경로>`). 사용자가 "두레이 토큰 저장했다"(또는 "토큰 넣었어") 라고 하면 파일을 읽어 **값은 출력하지 말고 형식만 확인**(공백 없는 30자 안팎의 영숫자·기호 문자열; 짧거나 공백·한글이 섞이면 잘못 붙여넣은 것) 후 진행. 채팅에 토큰이 붙여넣어지면 즉시 파일로 옮기고 채팅 노출 위험을 다시 알린다.

### Step 5 — ⚠️ 재시작 (반드시 안내, 건너뛰지 말 것)
`~/.claude/skills/` 에 **새 skill 디렉토리가 생기면 그 세션에서는 인식되지 않는다**(Code·Desktop 공통). 설치 직후 사용자에게:
> "설치 완료. **Claude 를 재시작**한 뒤 `kk-mail 설정해줘` 라고 해주세요. (새 skill 은 재시작해야 인식됩니다.)"

이때 README 에서 뺀 안내를 함께 준다: ① **권장 모델 표**(§0) ② **KIST 사내망**(밖이면 VPN) ③ **로그인 창**(§2 표 — 첨부 skill 은 Claude 전용 새 창에서 한 번 더 로그인).

- **Claude Code**: 세션 종료 후 재실행(또는 새 세션). **Claude Desktop**: 트레이(Windows)·Dock(macOS) 아이콘 → **Quit(완전 종료)** 후 재실행. 창만 닫는 건 재시작이 아니다.
- 같은 세션에서 바로 `kk-*` 를 트리거하려 하지 말 것. 재시작 전에 사용자가 `kk-* 설정해줘` 를 요청하면 skill 을 흉내 내지 말고 재시작을 다시 안내한다(같은 세션에서는 새 skill 이 로드되지 않는다).

### Step 6 — 첫 실행 + 인식 확인
재시작 후 `kk-<skill> 설정해줘`. **skill 부트스트랩이 응답하면 인식 성공.** 응답이 없으면 재시작을 다시 하고(Step 5), `~/.claude/skills/kk-mail/SKILL.md` 존재를 확인한다. 이후 실행 환경 점검은 [`skills/_shared/environment_setup.md`](skills/_shared/environment_setup.md) 0단계가 담당(Python 패키지·한글/Office 대안은 필요 시점에 묻는다).

---

## 2. 로그인 — 어느 창에 (사용자에게 미리 인지시킬 것)
| skill / 작업 | Chrome 창 | 로그인 |
|--------------|-----------|--------|
| kk-mail | 평소 Chrome(확장) | Dooray |
| kk-budget | 평소 Chrome(확장) | 포탈 `e.kist.re.kr` |
| kk-wiki | 평소 Chrome(확장) 또는 토큰만(브라우저 불요) | Dooray(위키) + 담당자표는 포탈 |
| kk-pay 카드 RPA 업로드 | 평소 Chrome(확장) + `token.txt` | 포탈 + Dooray. 새 창 없음 |
| kk-pay 세금계산서 직접작성 · kk-meeting · kk-inspect | **Claude 전용 새 Chrome 창**(chrome-devtools) | 그 창에서 포탈 로그인 **한 번 더** |

- 새 창은 별도 프로필이라 평소 Chrome 의 로그인이 넘어오지 않는다 — 낯설어하므로 **첨부 작업 시작 전에 먼저 설명**하고 로그인을 요청한다. (chrome-devtools-mcp 를 `--autoConnect` 로 등록했다면 새 창 대신 평소 Chrome 에 붙어 로그인이 그대로다 — `list_pages` 에 평소 탭이 보이면 이쪽.) 한 번 로그인하면 기억한다(정오 세션 리셋 제외).
- 로그인은 **사용자 본인이**(Claude 가 대신 로그인하지 않는다). 업무화면 딥링크 전에 항상 `e.kist.re.kr` 먼저.

## 3. Claude Code vs Claude Desktop (차이는 이것뿐)
| 항목 | Claude Code (CLI) | Claude Desktop 앱 |
|---|---|---|
| skill 경로 | `~/.claude/skills/` | **동일** |
| 설치 후 인식 | 재시작(새 세션) | **완전 종료(Quit)** 후 재실행 |
| 브라우저 확장 연결 | `claude --chrome` / `/chrome` | 좌하단 이니셜 → 설정 → 좌측 탭 "Claude in Chrome 설정" → "Claude in Chrome 사용설정" 켜기 |
| chrome-devtools-mcp | `claude mcp add --scope user …` | **CLI 로 한 등록을 그대로 읽음** |
| 개인설정·토큰 | `~/.claude/kiki/`, `<root>/token.txt` | **동일** |

Desktop 앱은 터미널 작업이 제한적이라 **설치는 CLI 또는 수동 복사**([INSTALL.md](INSTALL.md) §2 방법 B)를 권장 — 설치만 끝나면 Desktop 도 같은 `~/.claude/skills/` 를 읽는다.

## 4. 실행 메커니즘 (참고)
skill 은 로그인된 탭에 JS 를 주입해 포털/Dooray backend 를 호출한다(NEXACRO 화면은 fetch 직접 조회 + form 직접제어, **좌표 0**, 해상도 무관). 첨부가 있는 작업은 처음부터 chrome-devtools 창에서(도구 매핑은 `skills/_shared/nexacro_file_upload.md` §4-6). 확장·MCP 가 연결돼 있지 않으면 어떤 skill 도 동작하지 않는다.

## 5. 안전 경계 (항상 준수)
- 조회·로컬 파일 작성 = 자동 가능.
- **업로드·이름변경·이동·포털 저장·임시저장·신청·결재상신·스팸신고·메일이동 = 사용자 confirm 후.** 결재상신 = 실제 결재 제출 → 최종 확인 전 금지.
- 토큰·세션쿠키·`authTk`·카드번호·사번은 출력 금지. 토큰은 `token.txt`(파일)로만 받는다. (`skills/_shared/security_policy.md`)

## 6. 트러블슈팅
- **install.ps1 이 "running scripts is disabled"** → `powershell -ExecutionPolicy Bypass -File .\install.ps1`(Step 2).
- **`npx`/`python` 없음** → Step 0 (설치 후 새 터미널).
- **"설치했는데 `kk-*` 가 안 보임"** → 재시작(Step 5, Desktop 은 Quit). `~/.claude/skills/kk-mail/SKILL.md` 존재 확인.
- **첨부 도구(`upload_file`)가 없음** → chrome-devtools-mcp 미등록(Step 3) 또는 재시작 전.
- **포탈 팝업 창이 안 뜸** → Chrome 팝업 허용에 `https://p.kist.re.kr` 추가(설정 → 개인정보 보호 및 보안 → 사이트 설정 → 팝업 및 리디렉션). Claude 전용 새 창(chrome-devtools 프로필)도 따로 필요. **막혔을 때만 안내**(평소 포탈 사용자는 대개 이미 설정됨).
- **세션 만료("로그인 해달라")** → 해당 창에서 재로그인. 정오 이후 리셋.
- **clone 실패** → ZIP 다운로드로(Step 1).
- **`_shared` 참조 오류** → `~/.claude/skills/_shared` 복사 여부.
