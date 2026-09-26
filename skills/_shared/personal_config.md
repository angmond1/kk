# kiki 개인설정·토큰 (형제 skill 공유)

> 모든 kk-* skill 이 **개인 식별정보·토큰을 공유**한다. 한 번만 입력하면 다른 skill 이 다시 묻지 않는다.
> skill 텍스트·repo 에는 이 값들을 **절대 두지 않는다**(`security_policy.md` C1). 전부 `~/.claude/kiki/`(repo 밖) 와 `<kiki_root>/token.txt`.

## 파일 구성
| 파일 | 내용 | 공유 범위 |
|------|------|----------|
| **`~/.claude/kiki/kiki.config.json`** | 공통 개인정보 — 이름·사번·연락처·카드책임자·담당 행정원·위치·참여과제 + **`kiki_root`**(kiki 작업 폴더) | **모든 kk-* 공유** |
| **`<kiki_root>/token.txt`** | Dooray 개인 토큰 (`Dooray token:` 다음 줄) — 설치 스크립트가 생성, 예 `C:\kiki\token.txt` | 업로드 쓰는 skill 공유 |
| `~/.claude/kiki/kk-<skill>.config.json` | 그 skill **고유** 설정만 (예: 메일 분류규칙·예산 추적카테고리·회의록 저장모드) | 해당 skill |
| (구형) `~/.claude/kiki/kiki.env` | `DOORAY_TOKEN=` — 예전 설치 호환용. 있으면 계속 읽힘 | — |

템플릿: `kiki.config.example.json` · `token.txt.example` · `kiki.env.example` (이 폴더). Codex 는 `~/.codex/kiki/` + `<kiki_root>/token.txt`.

**`kiki_root`** = 사용자가 설치 때 고른 kiki 폴더(기본 Windows `C:\kiki`, macOS/Linux `~/kiki`). 그 하위 `budget/`·`meeting/`·`inspect/`·`_tmp/` 가 각 skill 의 기본 저장 폴더. config 예시의 `{kiki_root}` 는 이 값으로 치환해 읽는다. 비어 있으면(수동 설치) 사용자에게 한 번 묻고 기록.

## 공유 원칙 (skill 부트스트랩이 따름)
1. **먼저 `~/.claude/kiki/kiki.config.json` 을 읽는다.** 이미 있는 값(이름·사번·카드책임자·행정원·과제 등)은 **다시 묻지 않는다.**
2. 없거나 비어 있는 **공통 항목만** 사용자에게 물어 `kiki.config.json` 에 채운다(그 skill 이 처음 채워도 다른 skill 이 재사용).
3. 그 다음 **skill 고유 설정**(`kk-<skill>.config.json`)만 추가로 묻는다.
4. 폴더·파일이 없으면 **빈 템플릿 자동 생성**(파일 직접 못 만드는 사용자 우회).

## 토큰 입력 (필요 skill 만 — kk-pay 카드 RPA 업로드 / kk-meeting RPA 옵션)
- **표준 — 파일**: skill 이 `token.txt` **절대경로를 보여주며** 안내 → 사용자가 https://kist.gov-dooray.com/setting/api/token 에서 발급한 토큰을 `Dooray token:` **다음 줄**에 붙여넣고 저장 → 채팅엔 "두레이 토큰 저장했다" → skill 이 `python <skill>/scripts/dooray_drive.py check` 로 **값은 출력하지 않고** 길이·파일 위치만 확인(파일 Read 금지). 원하면 파일을 열어준다(Windows `notepad`, macOS `open -e`).
- **⚠️ 채팅 붙여넣기는 비권장** — 대화 기록에 남아 타인에게 노출될 수 있다는 것을 **항상 경고**한다. 그래도 붙여넣어지면 즉시 `token.txt` 에 옮겨 저장하고 채팅에서 다시 쓰지 않는다.
- 토큰 로드 우선순위(`dooray_drive.py`): 환경변수 `DOORAY_TOKEN` → `<kiki_root>/token.txt` → `~/.claude/kiki/token.txt` → `~/.codex/kiki/token.txt` → `~/.claude/kiki/kiki.env` → `~/.codex/kiki/kiki.env`.
- 토큰은 **repo·코드·로그 0건**(gitignore `*token*`). 조회 전용 skill·세션쿠키 skill·세금계산서 직접작성은 토큰이 아예 필요 없다.

## 공통 필드 ↔ 사용하는 skill
| kiki.config.json 필드 | kk-mail | kk-pay | kk-meeting | kk-budget | kk-inspect | kk-wiki |
|----------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| kiki_root | | ○ | ○ | ○ | ○ | ○ |
| user.name | | ○ | ○ | ○ | ○ | |
| user.emp_no | | ○ | ○ | | ○ | |
| user.phone | | | | | ○ | |
| card_holder | | ○ | ○ | | ○ | |
| payment_admin | | ○ | ○ | | ○ | |
| location | | | | | ○ | |
| projects | | ○ | ○ | ○ | ○ | |
| token.txt (토큰) | (옵션) | ○ | (옵션) | | | (옵션) |

> kk-mail 은 개인 식별정보가 필요 없다(메일은 브라우저 세션 쿠키로 동작). 분류 선호만 `kk-mail.config.json` 에.
