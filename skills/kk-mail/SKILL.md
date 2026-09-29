---
name: kk-mail
description: |
  KIST Dooray 메일 관리 skill (kiki 패키지). 키워드로 찾기 어려운 메일을 자연어 설명(기간·발신처·주제·본문 단서)으로
  찾아 주고(가장 많이 쓰는 기능), 받은편지함을 광고/학회/공고 등 폴더로 분류하며, 자연어 명령으로 자동분류 규칙을
  수립하고, 광고성/predatory 메일을 스팸 처리한다.
  트리거: "~~ 메일 찾아줘", "그 메일 어디 있지", "지난달 학회에서 온 메일", "작년 ○○대 세미나 관련 메일",
  "메일 정리", "받은편지함 정리", "광고메일 분류", "앞으로 ~~ 메일은 ~~ 폴더로 자동분류해줘", "스팸 골라줘",
  "지난주 메일 봐줘", "kk-mail" 등 KIST Dooray 메일 검색·정리·분류·자동분류 요청 시 활성.
  KIST 구성원 누구나 본인 계정으로 사용 (개인 토큰·식별자 불필요, 본인 브라우저 로그인 세션으로 동작).
---

# kk-mail — KIST Dooray 메일 관리

## 핵심 한 줄
**1 자연어로 메일 찾기(조회 전용, 가장 많이 쓰는 기능)** · **2 폴더 분류(물어보고, 선택)** · **3 "앞으로 X 메일은 Y 폴더로" 자연어 규칙 수립** · **4 광고성 스팸 신고(기본)**. 모든 쓰기 작업은 **사용자 confirm 후**.

## 전제 (환경)
- **환경 점검은 [`../_shared/environment_setup.md`](../_shared/environment_setup.md) 0단계를 따른다** — **평소 쓰는 Chrome 창**(Claude in Chrome 확장, 새 창·chrome-devtools 불필요) + **Dooray SSO 로그인**(`kist.gov-dooray.com`, =인증, 토큰·비번 없음) + KIST 사내망(밖이면 VPN). Python 불필요.
- **Dooray API key 는 kk-mail 에 불필요**(메일은 세션 쿠키로 동작) → 설치 때 발급을 묻지 않는다. 단 토큰 필요 작업(메일 발송·알림·캘린더 등 = 범위 밖 공식 REST API)을 요청하면 그때 on-demand 안내: https://kist.gov-dooray.com/setting/api/token (`../_shared/dooray_api_guide.md`).
- **개인 식별정보가 필요 없는 skill**(kk-dooray 와 함께 — 메일은 본인 세션으로 동작) — 분류 선호만 `~/.claude/kiki/kk-mail.config.json` 에. 공통 설정 체계는 `../_shared/personal_config.md`.

---

## 실행 준비 (매 작업 시작 시)

1. **브라우저 연결 확인** → `list_connected_browsers` / `select_browser`.
2. **탭 확보 + Dooray 이동**: `tabs_context_mcp` → `navigate` `https://kist.gov-dooray.com/mail`.
   - 로그인 페이지가 뜨면(세션 만료) 사용자에게 "Dooray에 로그인해 달라" 안내 후 중단.
3. **코어 주입(1회)**: `scripts/kk_mail_ops.min.js` 를 Read → `javascript_tool`로 inject (주입은 주석을 뺀 `kk_mail_ops.min.js` 를 쓴다 — 내용 동일, 글자 수 30~40% 적음. 원본 `kk_mail_ops.js` 는 읽을 필요 없다).
   - 반환값이 `kk-mail-ops/1.9 =^.^=`(버전 문자열)이면 성공. 이후 `window.kkMail.*` 호출.
   - 코어 1.3 부터 **Dooray 검색 API**(`POST /v2/wapi/mails/search`, 검색창과 동일 호출)가 `searchMails`/`searchMany` 로 들어 있다 — 메일 찾기(기능 1 경로 A)의 기본 수집 수단. 목록 API(`listMails`)는 최신부터 페이지를 넘기므로 오래된 기간은 검색 API 로. 파라미터 실측은 `references/wapi_reference.md` "검색" 절.
   - 코어 1.4 부터 **제목 키워드 도우미**(`subjectKeyword`·`checkSubjectKeywords`·`previewSubjectRule`)가 들어 있고, `createRule` 이 제목 키워드를 점검한다(기능 3 '제목 키워드 고르기').
   - 코어 1.5 부터 **메일 팝업 보기**(`openMail` 임시 버튼 + 실제 클릭 · `popupStatus` · `closePopups`, 링크는 `/mail/popup/mails/<id>`) — 기능 1 의 6.
   - 코어 1.6: 검색 오류는 `error` 로 돌아온다(빈 결과와 구분 — `error` 가 있으면 "없음" 이 아니라 오류로 보고), `createRule` 은 조건 없는 규칙을 만들지 않고, `listInbox` 는 기간 안 메일을 전부 넘겨 읽는다(`truncated` 확인).
   - 코어 1.8(2026-09-27 전체 흐름 검수): 로그인이 풀리면(JSON 대신 로그인 화면) `DOORAY:` 오류, API 거절은 오류로 올라온다(`폴더 0개`·`규칙 없음`·`0통`으로 보이지 않게). 포매터(`fmtList`·`fmtExternal`·`fmtOverview`)는 2-스텝 변수를 그대로 받아 `null` → `(결과 없음 …)`, `{error}` → `ERR …` 를 돌려준다. 스팸 점수(`spamHints`/`fmtSpam`)는 실측 정확도가 낮아 폐기하고 **`fmtExternal`**(사내 발신을 뺀 외부 발신 목록 — 판단은 Claude)로 바꿨다. 첫 실행 현황은 **`overview()`/`fmtOverview()`** 한 번. `reportSpam`·`moveMails` 는 하이픈 id·메일 항목도 받는다.
   - 페이지가 새로고침되면 `window.kkMail`이 사라지므로 재주입.
   - ⚠️ **async 반환이 `{}`로 비면**(특히 `/mail` → 특정 메일 redirect 직후 탭에서 발생): `javascript_tool`이 Promise 결과를 회수 못 하는 현상. 결과를 window 에 저장하고 마지막 식은 동기 마커로 즉시 반환 → **다음 호출에서 포매터로 읽는다**(2-스텝). **저장은 항상 오류까지**: `window.__x=null; <호출>.then(r=>window.__x=r, e=>window.__x={error:String(e)}); 'started'` — 오류 처리를 빼면 로그인 만료가 `null`(영원히 '아직')로 남아 원인이 안 보인다. sync 반환(`1+1`)은 정상이라 이 우회로가 통한다. 쓰기(`reportSpam`/`moveMails`)도 같은 패턴으로 실행 후 결과(`header.isSuccessful`)를 회수.
4. **출력 제약(2026-09-24 실측)**: `javascript_tool` 반환 문자열은 **약 1,000자에서 잘리고**(`[TRUNCATED]`), 출력 필터가 **`a=b` 꼴이 섞인 결과를 통째로 `[BLOCKED: Cookie/query string]`** 처리하며 URL·8자리 이상 숫자열(메일 id)도 가린다. → 결과는 window 에 두고 코어의 **`fmtList(window.__x, from, to)` / `fmtBody(b, chars, offset)` / `sanitize()`** 로 조각내어 회수(`=` 금지, id 는 `hyId` 하이픈 꼴). 포매터 첫 줄이 `ERR …` 면 결과가 아니라 오류다(로그인 → 탭 새로고침 → 재주입 1회). 모든 기능 공통.

---

## 기능 (4가지: 1 메일 찾기 · 2 폴더 분류 · 3 자동분류 규칙 · 4 스팸 처리)

### ⛔ 공통 mandate — "걸러낸 메일을 먼저 보여주고, 그 다음 묻는다" (모든 기능·부트스트랩, 예외 없음)
어떤 처리(스팸 신고·폴더 이동·규칙 생성·소급)든 **사용자에게 confirm 을 요청하기 전에, 대상 메일 전체를 대화창 본문에 markdown 표로 먼저 출력한다**:

| # | 날짜 | 발신자(주소) | 제목 | 분류 근거 |

- **표 없이 "처리할까요?"만 묻는 것을 금지한다.** 사용자가 무엇을 거르는지 보지 못하면 판단할 수 없다.
- 표는 **반드시 일반 대화 본문(markdown)으로** 출력한다 — confirm/승인 요청 도구의 짧은 prompt 에만 담지 말 것(본문 표가 누락되어 사용자에게 안 보인다). confirm 도구를 쓰더라도 **그 직전 응답 본문에 표를 먼저 펼친다.**
- 대상이 많으면 카테고리(스팸 / predatory / 마케팅 / 학회 모객 등)로 묶어 표를 나누되, **대상 메일을 하나도 빠짐없이** 보여준다.
- confirm 질문은 **표 다음에, 같은 응답 안에서** 한다. (표 → 그 아래 "이 중 스팸 신고할까요? 뺄 번호 알려주세요" 식.)

### 1. 자연어로 메일 찾기 (조회 전용, confirm 불필요 · 2026-09-24 실증 2회) — ★ 가장 많이 쓰는 기능
"작년에 ○○대 세미나 하러 간 적이 있어, 관련 메일 찾아줘", "첨부에 견적서 있던 업체 메일 어디 있지" 처럼 **검색창 한 번으로는 안 잡히는** 메일을 대화로 찾는다. Dooray 검색엔진이 자연어를 이해하는 게 아니라 **Claude 가 목록·미리보기·본문을 읽고 뜻으로 고르는** 방식이며, 수집 경로는 둘이다.

1. **조건 뽑기** — 기간(연도·"지난달"·없으면 최근 90일), 핵심어(기관·사람·주제어 — 동의어·영문·약어까지), 발신처 힌트, 본문 단서, 폴더. "관련 메일" 이면 **받은 것과 보낸 것 모두**. 애매하면 **한 번만** 되묻고 시작.
2. **경로 A — 서버 검색(기본, 빠름)**: 핵심어가 하나라도 있으면 `window.__x=null; window.kkMail.searchMany([['○○대'],['univ']], {since:'2025-01-01', before:'2025-12-31'}).then(r=>window.__x=r, e=>window.__x={error:String(e)}); 'started'` → 다음 호출에서 `window.kkMail.fmtList(window.__x, 0, 10, {pv:60})`(머리줄 `⚠ 일부 오류` 는 검색 묶음 중 일부가 실패한 것 — 그 묶음만 다시). Dooray 검색창과 같은 호출이라 **제목·본문·발신자 전체**가 대상이고 폴더 무관(받은·보낸 모두, 스팸·휴지통 제외), 기간은 서버가 거른다(연도 조건까지 서버가 걸러 즉시 돌아온다). 배열 원소끼리 AND, 한 원소 안 띄어쓰기는 구절 매칭이므로 **동의어는 묶음을 따로** 넣는다. 넓은 토큰(도메인 조각 `univ` 등)은 수신자 목록에 그 주소가 든 단체 메일까지 끌어오므로(넓은 토큰을 더하면 결과가 몇 배로 는다) **구체어 먼저**, 부족할 때만 넓힌다. 미리보기(`pv`)에 본문 앞부분이 실려 1차 판단에 쓴다. 결과 항목에 `url`·`folder` 가 들어 있다.
3. **경로 B — 목록 훑기(핵심어를 못 정할 때)**: "그 업체 이름이 기억 안 나", "첨부 있던 거" 처럼 검색어가 없으면 `listMails({folder:'inbox', since, until, size:1000, maxPages:40})` 로 기간 목록을 받아 `pick(정규식)` 후 12줄씩 읽는다. 최신부터 넘기므로 **1년 전 구간은 11페이지·20여 초**(실측) → 가능하면 A. 보낸편지함은 `folder:'sent'` 로 한 번 더.
4. **뜻으로 고르기** — 제목·발신·날짜·첨부수·미리보기를 읽고 10건 이내로 좁힌다. 검색어·정규식은 거르기용일 뿐이다. 함정: 약어는 대소문자 구분·단어경계(짧은 약어 정규식은 다른 단어 조각에도 걸린다), 사내 공지는 `pick(mails, re, {excludeFrom:/kist\.re\.kr$/i})` 로 제외, 같은 이름의 다른 기관(거래처 "○○정밀", "○○지원팀")은 제목으로 걸러낸다.
5. **본문 확인(필요할 때만)** — `window.__b=null; window.kkMail.getMails(window.__x.mails.slice(0,5)).then(r=>window.__b=r, e=>window.__b=[{error:String(e)}]); 'started'`(목록 항목을 그대로; 하이픈 id 문자열도 되지만 항목이 안전) → `window.kkMail.fmtBody(window.__b[0], 700)`(이어 읽기는 세 번째 인자 offset). 전체에 돌리지 말 것(건당 0.3초 + rate limit). 첨부 파일명은 머리줄 `files (…)`.
   - ⚠️ 본문 GET 은 서버가 그 메일을 **읽음으로 바꾼다** → `getMails` 는 목록의 `read=false` 건을 조회 직후 **`markUnread` 로 자동 복원**한다(목록 항목(`read` 포함)을 그대로 넘겨야 하며 id 문자열만 넘기면 복원 못 함). 실측 3건 복원 확인. `opened`(열어본 적 있음)는 남지만 화면 표시는 `read` 기준이라 보이지 않는다. 복원 요청이 거절되면 성공으로 적지 않고 `fmtBody` 머리줄에 `⚠ 안 읽음 복원 실패(읽음으로 바뀜)` 가 뜬다(본문은 그대로 보인다, 코어 1.9).
6. **결과 제시** — **같은 사건끼리 묶어**(안내 → 일정 조율 → 감사 인사 순) 표(날짜·발신·제목·비고)로 보여주고 건마다 **팝업 링크** `https://kist.gov-dooray.com/mail/popup/mails/<id>` 를 단다(2026-09-27 사용자 확정). 폴더와 관계없이 id 하나로 되고, 누르면 브라우저 새 탭에 그 메일 한 통만 뜨며 쓰던 메일함 화면은 그대로 남는다. id 는 `fmtList(..., {ids:true})` 의 하이픈 id 에서 `-` 를 지운다(출력 필터가 URL·긴 숫자를 가리므로 링크는 코어가 아니라 답에서 조합). 무엇을 제외했는지 한 줄 덧붙인다. 조회 전용이라 confirm 은 필요 없다.
   - **"N번 열어줘 / 띄워줘"**(읽음 처리되므로 사용자가 말했을 때만): `window.kkMail.openMail(항목)` → 화면 오른쪽 위에 임시 버튼 'kiki 메일 팝업 열기' 가 생긴다 → `find` 로 그 버튼을 찾아 `computer` `left_click`(ref) → `popupStatus()` 가 `opened` 면 Dooray 새 창 버튼과 같은 크기의 팝업 창이 뜬 것. 스크립트만으로 창을 열면 Chrome 팝업 차단기가 막으므로(실측) 반드시 이 실제 클릭으로 연다. 클릭 한 번에 창 하나라 여러 통이면 한 통씩 반복하고, 같은 메일은 같은 창을 다시 쓴다. `blocked` 면 팝업 링크를 주고 눌러 달라고 한다. 사용자가 다 봤다고 하면 `closePopups()` 로 닫는다.
- 실행 전 코어 주입(실행 준비 3) 필수. async 결과가 `{}` 로 비면 위 2-스텝이 정답(실행 준비 3 ⚠️). 출력이 잘리거나 `[BLOCKED…]` 면 실행 준비 4.
- 사용자 화면에 열려 있는 메일이나 다른 메일의 읽음 상태를 건드리지 않는다(스팸·이동은 기능 4·2 절차로만).

### 2. 폴더 분류 (선택) · 기본 OFF, 반드시 물어보고
스팸까진 애매한 광고/학회/공고 등을 **별도 폴더로 분류할지 사용자에게 먼저 묻는다.**
- 예: *"이 광고성 메일들을 '광고' 폴더로 옮기고, 앞으로도 자동분류할까요?"*
- **사용자가 명시 선택해야** 폴더 이동/규칙 생성. 기본값으로 자동 분류하지 않는다.
- 1회성 이동: `window.kkMail.moveMails([id...], folderId, folderName)`.
- 폴더가 없으면 → **폴더 확보 절차**(아래) 후 진행.

### 3. 자연어 자동분류 규칙 엔진
사용자가 자연어로 규칙을 말하면 skill이 수립한다.
- 입력 예: *"앞으로 `nature.com`에서 오는 메일은 저널 폴더로 자동분류해줘"*, *"이 메일 보낸 사람은 앞으로 학회 폴더로"*, *"제목에 '세미나' 들어간 건 세미나 폴더로"*.
- **조건 원칙 (2026-09-24 사용자 확정)**: 규칙 조건은 **기본적으로 발신 주소 1개만**(`fromEmails`, 정확한 주소). 발신+제목+받는사람을 모두 맞추는 규칙은 발신자가 제목을 조금만 바꿔도 빠져나가므로 **제목·받는사람 조건을 기본으로 붙이지 않는다.** 제목 키워드(`subjectKeywords`, 발신과 AND)는 (a) 사용자가 "제목에 X 들어간 것만"처럼 명시했거나 (b) 같은 주소에서 성격이 다른 메일이 섞여(도메인 양면성) 사용자가 세분화를 택했을 때만 추가한다. 발신 **도메인** 단위는 그 도메인이 한 성격(뉴스레터·시스템 발신)일 때만, 기관 도메인 전체는 경고 후 사용자 선택. 제목 키워드를 넣을 때는 **제목 전체가 아니라 매번 그대로인 핵심 구절만** 넣는다(아래 '제목 키워드 고르기', 2026-09-27 사용자 확정).
- 처리:
  1. **조건 파싱** — 발신 주소 → `fromEmails`(기본이자 보통 유일한 조건). 사용자가 명시한 경우에만 제목 키워드 → `subjectKeywords` — **제목 전체 금지, 핵심 구절만**(아래 '제목 키워드 고르기' 1~3).
  2. **폴더 확보** — `ensureFolder(name)` (찾거나 생성; 생성 실패 시 수동 안내).
  3. **과거 소급 여부 확인** — "기존에 받은 메일도 같이 옮길까요?"(`applyBefore`).
  4. **confirm** — 조건을 그대로 보여준다: *"발신 주소 `x@y.org` → '학회' 폴더, 과거 메일 소급 O"*. 이때 **"더 세밀하게 하려면 제목 키워드 같은 조건을 추가할 수 있습니다"** 를 한 줄로 안내만 하고, 사용자가 원할 때만 넣는다. 제목 키워드가 있으면 `원문 제목 → 구절 (뺀 것)` 한 줄과 `previewSubjectRule` 로 잡히는 지난 메일 표를 함께 보여준다.
  5. **규칙 생성** — `window.kkMail.createRule({fromEmails, subjectKeywords?, sampleSubjects?, toFolderName, applyBefore})`. 제목 키워드에 번호·날짜·머리말·`[To:…]` 태그·인사말이 섞이거나 제목을 통째로 넣으면 코어가 만들지 않고 `{blocked, problems}` 를 돌려준다 → 구절을 고쳐 다시.
- 결과를 사용자에게 보고(어떤 조건 → 어떤 폴더, 소급 여부).
- 받는사람 조건은 Dooray 화면에서는 가능하지만 코어는 미지원(요청 형식 미캡처) — 필요하면 사용자가 Dooray 설정에서 직접 추가.

#### 제목 키워드 고르기 (3·4 공통, 2026-09-27 사용자 확정)
사용자가 발신 주소 말고 **제목도 거르는 조건으로** 쓰라고 하면(자동분류·스팸 처리 모두) **제목 전체를 넣지 않는다.** 그 발신처·시리즈 메일에 **매번 그대로 들어가는 핵심 구절**만 골라 쓴다. 제목 전체를 넣으면 번호·날짜가 바뀌는 다음 메일부터 안 잡힌다.

| 원문 제목 | 쓸 키워드 | 뺀 것 |
|---|---|---|
| `[To:한국과학기술연구원*NNN][매입]○○업체(유)로부터 전자세금계산서(NNNNNNNNNN)가 YYYYMMDD 발급되었습니다.(XXXXXXXX)` | `○○업체(유)로부터 전자세금계산서` | 받는 곳·분류 태그, 승인번호, 발급일, 끝 추적 코드 |
| `거래명세서_○○업체 NNNNNNNNNN` | `거래명세서_○○업체` | 문서번호 |
| `Re: Invitation to ○○ Materials Science Conference` | `○○ Materials Science Conference` | 답장 머리말, 초대 문구 |
| `Dear Dr. Professor, Publish at very low APC - Journal of ○○ Science` | `Journal of ○○ Science` | 인사말, 광고 문구 |

- **남길 것**: 그 시리즈를 가리키는 고유한 구절 — 발신처 이름 + 문서 종류(세금계산서·거래명세서·견적서), 학회 이름, 저널 이름.
- **뺄 것**: 번호·날짜·연도·회차(4자리 이상 숫자, `9th`, `제N회`), `Re:`·`Fwd:`·`회신:` 머리말, `[To:…]`·`[매입]` 같은 태그, 인사말(`Dear …,`), 광고·모객 문구(`Publish at very low APC`, `Invitation to`, `Call for Papers`, 할인·마감), 끝의 추적 코드와 `안내`·`공지`·`(참석 회신 요청)` 같은 꼬리.
- **글자 그대로**: Dooray 제목 조건은 '포함' 일치다. 원문 제목 안에 **이어 붙어 있는 구간을 그대로 복사**한다(띄어쓰기·괄호·밑줄까지). 조각을 이어 붙이거나 번역·요약하지 않는다.
- **흔한 말 하나만은 피한다**: `전자세금계산서`·`Conference`·`Journal` 만 넣으면 다른 정상 메일까지 걸린다 → 발신처·고유 이름과 이어진 구절로.
- **사용자가 키워드를 직접 말하면 그대로** 쓴다(예: "제목에 (광고) 붙은 것"). 점검에 걸리면 이유를 한 줄로 알리고, 그래도 원하면 `overrideKeywordCheck: true`.
- **절차**
  1. `window.kkMail.subjectKeyword(제목)` → 1차 후보 `keyword`·`candidates`·`removed`(키워드 앞·뒤로 뺀 부분). 자동 후보는 참고용이다 — 같은 시리즈 메일 2~3건의 제목을 함께 보고 **뜻으로** 최종 구절을 고른다(학회 공지는 학회 이름과 회의 이름이 둘 다 후보로 나온다).
  2. `checkSubjectKeywords([구절], [대상 제목들])` → `block` 이 없어야 한다. `warn`(흔한 말·일반 [태그])은 사용자에게 알린다.
  3. `previewSubjectRule({subjectKeywords:[구절], fromEmails?})` → 지난 받은 메일 중 잡히는 것을 **표로 먼저** 보여준다(⛔ 공통 mandate — 결과는 window 에 두고 `fmtList` 로 조각 회수). 엉뚱한 메일이 섞이면 구절을 더 구체적으로, 같은 시리즈가 빠지면 덜 구체적으로.
  4. confirm 때 `원문 제목 → 구절 (뺀 것)` 을 한 줄씩 보여준다.
  5. `createRule({..., subjectKeywords:[구절], sampleSubjects:[대상 제목들]})` — 코어가 다시 점검해 `block` 이면 만들지 않고 `{blocked, problems}` 를 돌려준다.
- 실측(2026-09-27): 거래명세서·세금계산서 알림 177건의 실제 제목에서 자동 후보가 모두 같은 구절을 골랐고, 미리보기 건수는 검색 방식 네 가지를 합친 건수와 같았다.

#### 폴더 확보 (2·3 공통)
`ensureFolder(name)`이 **없으면 자동 생성**한다(`create-path` 형식 확정). 폴더 생성·자동분류 규칙은 사용자 confirm 후.
> 만에 하나 `ensureFolder` 가 `{needManual:true}`(→ `createRule` 은 `{needManualFolder}`)를 반환하면(생성 실패) Dooray UI 수동 생성을 안내 후 재시도.

### 4. 스팸 처리 (기본, 누구에게나 통용) · 사용자가 요청할 때 수행(첫 실행은 안내로 끝)
받은편지함에서 **광고성/predatory 메일을 식별 → 스팸 신고 제안**.
- 조회: `window.__x=null; window.kkMail.listInbox({days: N}).then(r=>window.__x=r, e=>window.__x={error:String(e)}); 'started'` (기본 7일).
- 후보 목록: `window.kkMail.fmtExternal(window.__x)` → 사내(kist.re.kr) 발신을 뺀 **외부 발신만**(`idx | 날짜 | 발신 도메인 | 제목`, 1,000자 안에서 끊기고 머리줄 `▶ 다음 조각 K` 면 `fmtExternal(window.__x, K)` 로 이어 읽는다). id 는 찍지 않는다 — 번호로 가리킨다. 전부 읽고 `references/classification_policy.md` 의 판별 패턴으로 **Claude 가 판단**한다 — 코드 점수는 쓰지 않는다(2026-09-27 실측: 키워드 점수가 약탈적 저널·학회 모객·피싱 약 10통 중 1통만 잡고 지갑 피싱은 0점 → 폐기). **피싱**(계정·지갑·결제 '조치 필요' + 무관한 도메인)은 스팸 신고와 함께 사용자에게 링크를 누르지 말라고 따로 알린다.
- 제안: **위 공통 mandate 대로** 걸러낸 메일 전체를 본문 표로 먼저 출력(번호·날짜·발신자 주소·제목·분류 근거) → 그 다음 **confirm**.
- 실행: `window.__s=null; window.kkMail.reportSpam([3,7].map(i=>window.kkMail.externalOf(window.__x)[i])).then(r=>window.__s=r, e=>window.__s={error:String(e)}); 'go'` → `window.__s.header.isSuccessful` 확인(휴지통 + 학습 + 발신자 차단 + 과거 inbox 소급). 표의 번호로 메일 항목을 넘기므로 19자리 id 를 옮겨 적지 않는다(하이픈 id·숫자 id 도 받는다).
- 스팸은 **폴더를 만들지 않는다**. 스팸함으로 보낼 뿐.
- **제목으로도 거르기**(사용자가 요청할 때만 — 발신 주소를 자주 바꾸는 predatory 저널·학회 등): 구절은 위 '제목 키워드 고르기' 대로 고른다(예: `Journal of ○○ Science` — 광고 문구·인사말 제외). 지난 메일은 그 구절로 `previewSubjectRule` → 표 → confirm → `reportSpam(ids, {addReject:false, applyBefore:false})`(제목으로 고른 목록엔 동료가 전달한 메일이 섞일 수 있으니 발신자 차단·과거 소급은 끄고, 필요하면 사용자가 켠다). 앞으로 올 메일까지 거르려면 그 구절로 자동분류 규칙을 만들되 대상을 `toFolderName: 'spam'`(스팸메일함)으로 한다 — 시스템 폴더를 대상으로 한 규칙은 아직 실측 전이라 첫 사용 때 confirm 후 1건으로 확인하고, 거부되면 사용자 폴더(예: 광고)로 대신하자고 제안한다.

---

## 결과 점검 (스크립트·코어 결과를 쓰기 전)
공통 3줄은 `../_shared/environment_setup.md` '결과 점검' 절(요약 줄만 대조 → 어긋나면 원인 고쳐 1회 재실행 → 그래도 안 되면 수동 경로 + 사용자에게 알림). 이 skill 의 기대치:
- 포매터 첫 줄이 `ERR …` 면 결과가 아니라 오류다 — `DOORAY:` 면 로그인 확인 → 탭 새로고침 → 재주입 후 1회. `(결과 없음 …)` 이 두 번 넘게 이어지면 호출에 오류 처리(`e=>window.__x={error:String(e)}`)가 빠진 것.
- 목록 머리줄 `[a-b of N]` 에서 N 이 0이면 조건을 넓혀 1회 재검색(오류는 위에서 이미 걸러진다). `⚠ 일부 오류` 는 그대로 보고에 싣는다. `⚠ 목록 잘림(전체 N 중 M)` 이면 결과가 전부가 아니다 — `maxPages` 를 늘리거나 기간·검색어를 좁혀 1회 다시, 그래도 잘리면 '일부만 봤다'고 밝힌다(목록·검색·묶음 검색 모두 코어 1.9 부터 표시). 본문 머리줄에 `⚠ 안 읽음 복원 실패` 가 있으면 그 메일이 읽음으로 바뀐 것 — `window.kkMail.markUnread([id])` 로 1회 다시, 안 되면 사용자에게 알린다. 본문 조회가 거절되면 빈 본문이 아니라 `ERR DOORAY 본문 조회 실패` 다.
- 스팸 후보는 `fmtExternal` 목록 전체를 Claude 가 정책 문서로 판단한다(점수 없음). 머리줄의 `사내 K 제외` 가 전체와 맞는지만 본다.
- `createRule`·`reportSpam`·`moveMails` 응답의 `header.isSuccessful`(또는 `blocked`)을 확인하고, 실패면 같은 요청을 반복하지 않는다.

## 안전 규칙 (필수 준수)

- **모든 쓰기(스팸신고·이동·규칙생성·삭제)는 사용자 confirm 후.** Claude는 분류·제안만 자동. **단 confirm 전에 대상 메일을 본문 표로 먼저 보여준다(위 ⛔ 공통 mandate).**
- **발신자 차단(addReject)·과거 소급(applyBefore)** 영향을 confirm 시 명시.
- **개인 발신 학술 메일은 폴더로 옮기지 않는다.** 교수 개인의 연사 섭외·공동연구 제안 등 **답장·후속 대응이 필요한 메일**은 받은편지함 유지. 폴더 분류는 학회 *사무국/단체 공식 발신* 위주.
- **도메인 양면성 주의.** 같은 도메인이 정상+광고 섞이면(예: 출판사 시스템 도메인이 본인 투고 확인 + 마케팅 동시 발송) 도메인 단위 일괄 규칙/차단 금지, 건별 처리.
- **찾기(기능 1)는 조회 전용** — 본문 조회로 바뀐 읽음 상태는 즉시 복원하고(`getMails` 자동), 그 외 어떤 상태도 바꾸지 않는다. 찾은 메일의 본문·첨부는 사용자에게 보여주는 용도로만 쓰고 파일에 남기지 않는다.
- **개인 학습은 skill에 누적하지 않는다.** 특정 발신처→폴더 같은 개인 규칙은 사용자 config(`~/.claude/kiki/kk-mail.config.json`)에만 저장. skill 본문/references에는 보편 판별 패턴만.

---

## 부트스트랩 (첫 사용 또는 "kk-mail 설정")

> 🐱 **키키 인사(정체성)**: 첫 실행의 첫 줄은 *"안녕하세요 🐱 kk-mail 를 준비할게요."* 한 줄, 그 다음부터는 평소 문체. 작업 보고의 첫 줄은 상황별 머리표: `😸 완료 — kk-mail`(정상) / `😻 완료`(확인할 것 없음) / `😼 완료`(사용자가 할 일 남음: 결재 상신·확인) / `😺 완료`(조회만 한 가벼운 작업) / `🙀 중단`(막혀서 멈춤, 상황 보고) / `😿 부분 완료`(일부만 처리). 제출 문서·적요·파일명·오류 문구에는 넣지 않는다.


첫 실행은 **환경 점검 → 현황 파악 → 할 수 있는 일 안내**로 끝낸다. 폴더 분류·권장 자동분류 규칙 설정(4·5)은 **사용자가 원한다고 말했을 때만** 진행한다(사용자 결정 2026-09-24). **메일 찾기(기능 1)는 설정 없이 바로 된다.**

1. 실행 준비(위) 완료.
2. **현재 상태 파악** — `window.__f=null; window.kkMail.overview().then(r=>window.__f=r, e=>window.__f={error:String(e)}); 'started'` → `window.kkMail.fmtOverview(window.__f)` 로 **기존 폴더·분류 규칙을 먼저 조회**(충돌 판단용). 폴더 목록 제시. `ERR` 면 로그인부터(‘규칙 없음’은 조회가 성공했을 때만 `자동분류 규칙 없음(조회 성공, 0개)` 로 나온다).
3. **기능 안내(반드시 출력 — 여기서 첫 실행은 끝)** — 준비물이 더 필요 없다는 것(같은 Chrome·같은 Dooray 로그인, 토큰·추가 설치 없음)과 앞으로 쓸 수 있는 말을 예시로 보여준다:
   - **1 메일 찾기(가장 많이 쓰는 기능)**: *"작년에 ○○대 세미나 갔던 거 관련 메일 찾아줘"*, *"첨부에 견적서 있던 업체 메일 어디 있지"* — 키워드 검색으로 안 잡히는 메일을 제목·본문·발신자를 뒤져 뜻으로 골라 팝업 링크로 보여준다(누르면 그 메일 한 통만 뜬다 — 링크를 열면 그 메일은 읽음 처리되지만, 찾기 자체는 읽음 상태를 바꾸지 않음; 받은·보낸 메일 모두). "3번 띄워줘" 하면 작은 팝업 창으로 연다.
   - 2 폴더 분류: *"받은편지함 정리해줘"*
   - 3 자동분류 규칙: *"앞으로 nature.com 은 저널 폴더로"* (기본 조건은 발신 주소만)
   - 4 스팸 처리: *"지난주 광고 스팸 골라줘"*
   - 끝에 한 줄만 덧붙인다: *"폴더 분류나 권장 자동분류 규칙(결재알림·과제·학회 등) 설정을 원하시면 말씀해 주세요 — 선택 사항입니다."* **아래 4·5 를 먼저 하자고 권하거나 질문을 이어가지 않는다**(사용자 결정 2026-09-24: 첫 실행은 안내로 끝, 분류 설정은 사용자가 원할 때).

4. **(선택 — 사용자가 폴더 분류를 원한다고 했을 때만)** "광고성·스팸은 기본으로 스팸함 처리합니다. 그 외 광고/학회/공고 같은 메일을 **별도 폴더로 분류**할까요?" → 예면 폴더명.

5. **(선택 — 4 에서 예라고 했을 때만) 메일분류 기본 권장** — `references/classification_policy.md`의 권장 체계를 **항목별로 순차 제안**(KIST/출연연 공통이라 권장하되 각각 사용자가 켜고/끔). 각 항목마다:
   - (a) "○○ 메일을 '○○' 폴더로 자동분류할까요?" 제안.
   - (b) **기존 폴더·규칙과 겹치면** → "기존 'X' 폴더/규칙이 있습니다. **거기 합칠까요, 그대로 두고 새로 나눌까요?**" 묻기. (임의로 기존 규칙 덮어쓰기 금지)
   - (c) 예 → `ensureFolder`(없으면 자동 생성) + `createRule`. 모두 confirm 후.

   **순차 제안 항목** (도메인·기관 정확값은 `classification_policy.md`):
   ```
   1) 결재알림  ← noreply@kist.re.kr
   2) 과제  ← nrf.re.kr · ketep.or.kr · kiat.or.kr · keit.re.kr
   3) UST      ← ust.ac.kr
   4) 기관뉴스  ← nzine@nrf.re.kr · email@keit.re.kr · nabis@keit.re.kr · newsletters@kiat.or.kr · ssm@kontrs.or.kr · kistep.re.kr · stepi.re.kr · kird.re.kr · kribb.re.kr · pr@kist.re.kr · sema.or.kr
   5) 학회     ← kiche · ksiec · kecs · kchem · kim · mrs-k · nanokorea · kontrs (.or.kr/.org/.net) · cleantechnol@pukyong.ac.kr
   6) 시약     ← sigmaaldrich · sial.com · merckgroup · sejinci 등 시약·기자재 업체 발신주소 (정확값은 classification_policy.md)
   ```
   - ⚠️ **NRF/KEIT/KIAT 분기**: 정확주소(`nzine@nrf.re.kr`·`email@keit.re.kr`·`nabis@keit.re.kr`·`newsletters@kiat.or.kr`·`ssm@kontrs.or.kr` → 기관뉴스)를 도메인(`nrf.re.kr`·`keit.re.kr`·`kiat.or.kr` → 과제 / `kontrs.or.kr` → 학회)보다 **먼저**(`createRule` `applyOrder` 작게) 등록. Dooray `not_include` 미지원이라 우선순위로만 분기.

6. **(4·5 를 진행한 경우)** `~/.claude/kiki/kk-mail.config.json` 생성/갱신 (`kk-mail.config.example.json` 참고).
   - config 없어도 기능 1(메일 찾기)·3(자연어 규칙)·4(스팸)는 동작. config는 기능 2/권장분류 선호 기억용.

---

## config (`~/.claude/kiki/kk-mail.config.json`)
- 위치: **repo 밖, 사용자 home** (git 충돌·유출 방지). 형제 skill과 `~/.claude/kiki/` 공유.
- 내용: 폴더 분류 ON 여부, 폴더명 매핑, 개인 분류 규칙/학습 발신처.
- **민감정보(토큰·비번) 저장 금지.** 메일 코어는 세션 쿠키로 동작하므로 토큰이 필요 없다.

## 참고 문서 / 문제 해결
- `references/classification_policy.md` — 광고성/predatory **판별 패턴**(보편) + 처리 가이드.
- `references/wapi_reference.md` — wapi endpoint·body·헤더(조회/페이징/본문/읽음·안읽음/스팸/이동/규칙/폴더 생성·삭제).
- `../_shared/dooray_wapi.md` — wapi 공통(필수헤더·rate limit). `../_shared/security_policy.md` — 보안 규약.
- `../_shared/dooray_api_guide.md` — Dooray **공식 API 가이드·토큰 발급·문제 해결 참조**(원문 링크 포함).
- **호출 실패 시 순서**: `header.resultMessage` 확인 → `-200200`/빈 응답이면 필수헤더 점검(`dooray_wapi.md`) → 정확한 body 미상이면 **DevTools Network 캡처**(폴더 `create-path`도 이렇게 확정) → 공식 API(토큰) 문제면 `dooray_api_guide.md` + 원문 가이드 참조.
- **async 결과가 `{}`로 빔** → Chrome `javascript_tool`이 Promise 반환을 비우는 현상(주로 `/mail` redirect 직후 탭). 결과를 `window.__x`에 저장 → 다음 `javascript_tool` 호출에서 `JSON.parse(JSON.stringify(window.__x))`로 동기 read (위 *실행 준비* 3 참고). sync 식 반환(`1+1`)은 정상이라 이 2-스텝이 통한다. 조회·쓰기·검증 모두 적용.
