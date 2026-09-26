# kiki 보안 규약 (형제 skill 모두 준수)

이 패키지의 skill은 **KIST 구성원 누구나** 본인 계정으로 쓴다. 한 사람의 credential·개인정보가
다른 사람에게 새지 않도록 아래 규약을 지킨다.

## C1 — 개인 credential·식별자·개인학습을 skill 텍스트에 두지 않는다
- 토큰·비번·API 키 ❌ / 개인 멤버ID·사번·실제 폴더ID ❌ / 특정인의 발신처-폴더 학습 ❌. (예외: 전사 공통 상수인 RPA 드라이브 project/drive id 와 위키 space id 는 개인정보가 아니라 코드에 둔다.)
- 이런 값은 **런타임 자동조회**(폴더ID·멤버정보) 또는 **사용자 로컬 config**(`~/.claude/kiki/`)에만.
- 토큰은 **`<kiki_root>/token.txt` 파일로만** 받는다(절대경로를 보여주고 사용자가 붙여넣게). **채팅창 붙여넣기는 대화 기록에 남아 노출될 수 있음을 항상 경고**하고, 값은 출력하지 않는다.
- (반면교사: 일부 기존 skill은 SKILL.md에 실제 API 키를 박아 둠 — kiki는 금지.)

## C2 — 모든 쓰기는 사용자 confirm 후
- 스팸신고·폴더이동·규칙생성·삭제·결재상신·제출 등 되돌리기 어려운 작업은 제안만 자동, 실행은 confirm.

## C3 — 개인화는 자동조회 + 대화
- 환경별로 다른 값(폴더 구조 등)은 코드가 런타임 조회. 부족분만 사용자에게 물어 config 생성.

## C4 — config·credential은 repo 밖 + gitignore
- 개인 config는 `~/.claude/kiki/<skill>.config.json` (repo 밖, git 충돌·유출 방지). 토큰 파일 `token.txt` 는 kiki 폴더에 두되 gitignore(`*token*`).
- repo 내 실수 방지로 `.gitignore`에 `*.config.json`, `*token*`, `.env` 포함.

## C5 — 한국어
- 사용자 응답·코드 주석 한국어.

## 인증 모델 (유출 위험을 구조적으로 낮춤)
- 메일/행정 코어는 **브라우저 세션 쿠키**로 동작 → skill에 보관할 credential 자체가 없음.
- 각 사용자는 본인 Chrome SSO 로그인만 하면 됨. 토큰 공유·복붙 불필요.

## 배포 전 게이트 (필수)
repo 전체를 grep해 아래가 **0건**인지 확인 후 push:
- 토큰/비번 패턴, 개인 멤버ID·사번, 개인 폴더ID(전사 공통 상수 제외), 특정인 발신처 학습 목록.
