# kk-mail wapi 레퍼런스 (메일 endpoint·body)

> 호스트·공통 헤더·rate limit은 `../_shared/dooray_wapi.md` 참조. 여기는 **메일 작업 endpoint**만.
> 모든 호출은 `kist.gov-dooray.com` 탭에서 **세션 쿠키**(`credentials:'include'`)로. 토큰 불필요.
> 코드는 `scripts/kk_mail_ops.js`에 구현됨 — 아래는 스펙 설명.
> **필수 헤더**(`dooray-caller: WEB` 등)·rate limit 은 `../_shared/dooray_wapi.md` 에 있다(중복 제거).

## 조회
| 작업 | endpoint |
|------|----------|
| 받은편지함 | `GET /v2/wapi/mails?folderName=inbox&size=N&page=0&order=-createdAt` |
| 사용자 폴더 메일 | `GET /v2/wapi/mails?folderId={id}&size=N&page=0&order=-createdAt` (사용자 폴더는 `folderId`, 시스템 폴더만 `folderName`) |
| 시스템 폴더 목록 | `GET /v2/wapi/mail-folders?type=system` (inbox/sent/draft/archive/spam/trash) |
| 사용자 폴더 목록 | `GET /v2/wapi/mail-folders?type=user&size=1000` |

- 응답: `result.contents[]` = 메일/폴더 배열, `result.totalCount`.
- 메일 발신자: `users.from.emailUser.{name,emailAddress}`. 날짜: `createdAt`. 첨부 수: `fileCount`. `mailSummary.previewText` 는 **비어 있음**(본문 단서는 상세 GET 필요).
- **읽음 플래그 두 종류**(`mailSummary.flags`): `read` = 사용자 화면의 읽음/안 읽음(토글 가능) / `opened` = 한 번이라도 열린 적 있음(상세 GET 시 true 로 굳고 되돌릴 수 없음). **표시용은 `read`**.
- **페이징**: `page=0,1,2…` 로 넘긴다(최신부터 — 1년 전 구간까지 11페이지×1000건 ≈ 23초 실측 → 오래된 기간은 아래 검색 API). `size` 는 500·1000 도 허용(실측 2026-09-24: 500×3페이지 1,500건 ≈ 2.5초). 코어 `listMails({folder|folderId, sinceDays|since, until, maxPages, size})` 가 기간 컷오프까지 자동으로 넘긴다.

## 메일 본문 (기능 1 찾기, ✅ 확정 2026-09-24 실측)
```
GET /v2/wapi/mails/{mailId}          // Dooray 웹이 메일을 열 때 부르는 것과 동일 (withBody 파라미터 불필요)
```
- 응답 `result.content`: `subject, createdAt, users.{from,to,cc,…}.emailUser.{name,emailAddress}, body:{mimeType:"text/html", content:"<html…>", showImage}, fileList[](첨부), mail.flags`.
- `/mails/{id}/body`·`/content`·`/detail` 은 **-300000 서비스 오류** — 위 형식만 유효.
- ⚠️ **이 GET 은 그 메일을 읽음(read=true)·opened=true 로 바꾼다.** 화면 표시를 원래대로 두려면 목록에서 `read=false` 였던 메일만 조회 직후 아래 `unread` 로 복원(코어 `getMails` 자동).
- HTML→텍스트는 코어 `htmlToText`(style/script 제거, 블록 요소 줄바꿈). 실측 21KB HTML → 1.6KB 텍스트.

## 읽음 / 안 읽음 표시 (UI 툴바 "읽음"·"안 읽음" 과 동일, ✅ 2026-09-24 캡처)
```
POST /v2/wapi/mails/read     { "mailIdList": ["..."] }
POST /v2/wapi/mails/unread   { "mailIdList": ["..."] }
```
- 응답 `header.resultCode 0`. 목록의 `flags.read` 가 바뀐다(`opened` 는 불변).

## 검색 — Dooray 검색창과 동일 호출 (기능 1 경로 A, ✅ 2026-09-24 캡처·실측)
```
POST /v2/wapi/mails/search?preview=true
{ "exceptFolders": ["draft","spam","trash"], "all": ["○○대"], "page": 0, "order": "-createdAt", "highlight": true, "size": 100,
  "since": "2025-01-01T00:00:00+09:00", "before": "2025-12-31T23:59:59+09:00" }
```
- `all` = 제목·본문·발신자 전체 대상. 배열 원소끼리 **AND**(`["○○대","세미나"]`), 한 원소 안의 띄어쓰기는 **구절 매칭**(`["○○대 세미나"]`). 본문에만 있는 구절도 hit(실측).
- 기간: **`since` / `before` 만 유효**(`until`·`period`·`createdAt`·`startDate`·`sentAt` 등은 조용히 무시). **ISO 시각+타임존 필수** — 날짜만(`2024-01-01`) 넣으면 -200200. 오름차순은 `order:"createdAt"`.
- 폴더 지정 없음(`folderName` 무시 → 받은·보낸 모두). `exceptFolders`(시스템 폴더 이름) 만 동작. 결과의 `folderId` 를 `references.folderMap` 으로 이름 매핑해 사후 필터.
- `subject` / `body` / `from` 같은 대상 한정 필드는 무시되고 totalCount 2000(cap) 전체가 돌아온다 → 대상 한정은 없다.
- 응답: `result.totalCount`, `result.contents[{id, uid, subject}]`(하이라이트용 껍데기, body 비어 있음), **`result.references.mailMap[id]`** = 목록 API 와 같은 메일 객체(`createdAt, subject, users, folderId, fileCount, mailSummary{flags, previewText}`), `references.folderMap[id]{name,type}`. `preview=true` 면 `mailSummary.previewText` 에 **본문 앞부분(~300자, 인용 포함)** 이 실린다. `size` 100 OK(50건 응답 ≈ 600KB).
- UI: 검색창 Enter → URL `/mail/all?query=all%3D<단어>&period=keyword%3Dall`, 기간 직접입력 → `period=keyword%3Ddirect%26startedAt%3D…%26endedAt%3D…`. 검색 결과 화면은 첫 메일을 자동으로 연다(읽음 처리) — 코어 `searchMails` 는 API 만 부르므로 화면·읽음 상태를 건드리지 않는다.

## 스팸 신고 (기능 4)
```
POST /v2/wapi/mails/report-spam-hacking
{ "idList": ["..."],                         // N건 일괄
  "spamOptions": { "reportSpam": true, "applyBeforeMail": true, "applyBeforeMailFolders": ["inbox"] },
  "hackingOptions": { "reportHacking": false, "reportReason": "" },
  "addRejectFromEmail": true }               // 발신자 차단
```
→ 휴지통 이동 + 학습 신고 + (옵션)발신자 차단 + (옵션)과거 inbox 소급.

## 폴더 이동 (기능 2, 1회성)
```
POST /v2/wapi/mails/move
{ "targetFolderId": "...", "targetFolderName": "...", "mailIdList": ["..."] }  // 셋 다 필수
```
키 이름 주의: 이동은 `mailIdList`/`targetFolder*`, 스팸은 `idList`.

## 자동분류 규칙 (기능 3)
```
GET    /v2/wapi/mail-rules?size=1000&page=0&types=auto_classification   // page=0 명시해야 contents 정상
POST   /v2/wapi/mail-rules                                              // body는 배열, 단 ⚠️ 첫 1건만 생성
DELETE /v2/wapi/mail-rules/{rule-id}
```
규칙 body (단건 배열):
```json
[{ "condition": { "operator": "and",
     "from":    { "type": "include", "value": ["sender@domain.com"] },
     "subject": { "type": "include", "value": ["키워드"] } },
   "action": { "toFolder": { "id": "{folder-id}", "name": "{name}", "type": "user" } },
   "type": "auto_classification",
   "applyBeforeMail": true,
   "applyBeforeMailFolders": ["inbox", "user_folders"] }]
```
- ⚠️ **배열에 N개를 넣어도 첫 1건만 생성됨** → 여러 규칙은 단건씩 N회 POST (코어 `createRule`이 단건).
- `condition`은 `from`·`subject` 중 하나 이상(둘 다 있으면 AND). **정책: 기본은 `from`(정확 주소) 만** — `subject` 는 사용자가 명시했을 때만(SKILL 기능 3, 2026-09-24). `applyBeforeMail`=과거 메일 소급.
- `subject.include` 는 제목에 그 구절이 들어 있으면 잡는 포함 일치다 → 키워드는 원문 제목의 이어진 구간 그대로, **제목 전체 금지**(SKILL '제목 키워드 고르기', 2026-09-27). 코어 1.4 `createRule` 은 `checkSubjectKeywords` 에 `block` 문제가 있으면 POST 하지 않고 `{blocked, problems}` 를 돌려준다.
- `action.toFolder.type` 은 사용자 폴더 `user`, 시스템 폴더 `system`. 코어는 이름으로 시스템 폴더(`spam` 등)도 찾아 넣지만, 시스템 폴더를 대상으로 한 규칙은 아직 실측 전(첫 사용 때 1건으로 확인).
- 규칙 객체 필드: `id, type, condition, action, applyOrder`(우선순위·낮을수록 먼저 적용), `lastAppliedAt, createdAt`.
- ⚠️ `condition.from.type`은 **`include`만** 지원 (`not_include`/`exact`는 -200200, 2026-06-04 확인). → 같은 도메인 두 용도 분기(예 `nrf.re.kr`→공고 / `nzine@nrf.re.kr`→뉴스)는 **`applyOrder`로** 처리(정확주소 규칙을 도메인 규칙보다 작은 값=먼저).

## 폴더 생성·삭제 (✅ 확정 2026-06-04, DevTools 캡처)
- **생성**: `POST /v2/wapi/mail-folders/create-path` — body는 **배열** `[{"name":"폴더명","order":N}]`.
  - `order` = 기존 사용자 폴더 `displayOrder` 최대값 + 1.
  - ⚠️ endpoint가 `/mail-folders`가 아니라 **`/mail-folders/create-path`**. 또 body가 **단일 객체면 -200200** — 반드시 배열.
- **삭제**: `DELETE /v2/wapi/mail-folders/{id}`.
- 코어: `ensureFolder(name)`(찾고 없으면 생성) / `deleteFolder(id)`(정리·롤백).
- 폴더 객체 필드: `id, name, type, parentFolderId(null=루트), displayOrder, totalCount`.

## 메일 팝업 보기 (2026-09-27 캡처·실측)
- 주소 `GET /mail/popup/mails/{mailId}` — Dooray 메일 화면의 새 창 버튼(`fa-external-link` 아이콘)이 `window.open('/mail/popup/mails/{id}?_t={시각}', '_blank', 'resizable=yes,toolbar=no,location=no,…,width=720,height=800')` 로 여는 주소. 목록·사이드바 없이 그 메일 한 통과 답장·전달 버튼만 나온다. 폴더와 무관(받은·보낸 메일 모두 확인), `_t` 는 없어도 된다. 열면 읽음 처리.
- 스크립트(javascript_tool)만으로 `window.open` 하면 Chrome 팝업 차단기가 막는다(null 반환). 페이지에 임시 버튼을 넣고 Claude in Chrome `computer left_click` 으로 실제 클릭하면 사용자 동작으로 인정돼 팝업 창이 열린다 → 코어 `openMail`·`popupStatus`·`closePopups`.
- ⚠️ 새 창 버튼의 주소를 가로채려고 `window.open` 을 null 을 돌려주는 가짜로 바꾸면 Dooray 가 알림창을 띄워 탭이 멈춘다(CDP 입력 30초 타임아웃, 탭을 다시 불러와 복구). 가로챌 때는 가짜 창 객체를 돌려줄 것.

## 메일 보내기 (기능 5, ✅ 2026-09-30 쓰기 화면 캡처 + 본인에게 발송 1통)
Dooray 쓰기 화면(`/mail/write/new` — 메일함의 '새 메일' 버튼은 `window.open('/mail/write/new?_t=…','_blank')` 새 창)의 호출을, 보내기 요청을 막은 채 기록했다.
```
POST /v2/wapi/search-email-addresses?page=0&size=30        // 받는 사람·참조 칸 검색
{ "all": "이름 또는 주소 일부",
  "typeList": ["member","distributionList","projectMail","contact","recent","contactsLabel","sharedMailMember"],
  "tenantMemberRoles": ["admin","owner","member","subMember","guest","dummy"] }
→ result.contents[{type, <type>:{name, emailAddress, departments[{name,primaryFlag}], rank, …}}], totalCount
   (all 이 빈 글이면 최근 받는 사람 목록. member 에는 사번·전화번호도 있으니 꺼내지 않는다. page 를 넘겨 totalCount 까지 읽는다 — 코어는 5쪽×30건까지, 다 못 읽으면 complete=false)

POST /v2/wapi/mail-drafts                                   // 초안 만들기 — body 는 배열
[{ "id": null,
   "users": { "from": {"type":"emailUser","emailUser":{"name":"…","emailAddress":"…"}},
              "to": [ {"type":"emailUser","emailUser":{"name":"…","emailAddress":"…"}} ], "cc": [ … ], "bcc": [ … ] },
   "subject": "…", "priority": 3,
   "body": { "mimeType": "text/html", "content": "<div style=\"font-family: Arial; font-size: 16px\"><div>줄</div>…<div><br></div><!-- begin signature -->서명<!-- end signature --></div>" },
   "fileList": [], "fileIdList": [],
   "security": { "level": "normal", "resend": true, "autoDelete": false, "retentionDays": 0 },
   "relation": {}, "reservation": { "type": "", "toBeSentAt": null, "toBeSentTimezone": null },
   "individualSend": false, "securityEditable": true, "version": 0, "mimeSize": 0 }]
→ result: [{ id, version, mimeSize }]

PUT  /v2/wapi/mail-drafts/{id}      // 쓰기 화면이 보내기 직전에 같은 모양(id 채움)으로 다시 저장 — 처음 POST 에 내용을 다 담으면 필요 없다
POST /v2/wapi/mails/send            { "draftId": "{id}" }     // 보내기
```
- 받는 사람(`to`)·참조(`cc`)·숨은 참조(`bcc`)는 같은 모양이다. 주소로 쓸 수 없는 글이 들어가면 `emailAddress:"invalid"` 가 된다(쓰기 화면의 빨간 칩).
- 보내는 사람 = `GET /v2/wapi/members/me/settings/mail.write-from` 의 `result.content.value.{selectedName, selectedEmailAddress}`. 보낼 수 있는 내 주소 목록 = `GET /v2/wapi/members/me/email-addresses?page=0&size=100&status=confirmed&emailAddressTypes=general%2CmemberAlias&sendable=true`.
- 서명 = `GET /v2/wapi/members/me/settings/mail.signature` 의 `value.{enabled, options:{new, reply, forward}, useIndex, signatures[{name, content}]}` — 쓰기 화면은 `signatures[useIndex].content` 를 `<!-- begin signature -->`·`<!-- end signature -->` 사이에 그대로 넣는다. 글꼴 = `mail.write` 의 `value.format.{font, fontSize}`.
- 저장한 초안의 지금 내용 = `GET /v2/wapi/mails/{초안 id}`(쓰기 화면 미리 보기도 `?render=html` 로 같은 호출) → `result.content.{subject, users.{to,cc,bcc}, body.content}`. 코어는 임시 보관함 초안을 보내기 직전에 이것으로 승인본과 대조한다(Dooray 에서 고쳤으면 보내지 않음).
- 쓰기 화면의 '미리 보기' 창(보내기/취소)은 개인 설정 `mail.write.preview`(value `all`)일 뿐 API 단계가 아니다. 보낸 메일은 보낸 메일함(`folderName=sent`)에 남는다 → 코어 `checkSent` 가 목록에서 같은 제목·보낸 시각 이후의 메일을 찾아 받는 사람을 대조한다.
## 답장 (기능 6, ✅ 2026-09-30 답장 버튼 화면 캡처 + 사용자 승인 답장 1통)
- 받은 메일의 답장 버튼 = `window.open('/mail/write/reply/{mailId}?_t=…','_blank')`. 쓰기 화면이 저장하는 초안은 새 메일과 같은 모양에 `"relation": {"type": "reply", "mailId": "{원래 메일}"}`, 제목 `RE: 원제목`, 받는 사람 = 원래 보낸 사람.
- 서명은 설정 `mail.signature` 의 `options.reply`(꺼져 있으면 `<!-- begin signature --><!-- end signature -->` 빈 표시만). 본문 뒤 원문 인용 블록:
  `</div><br><br>-----Original Message-----<br>From:  "이름" &lt;주소&gt;<br>To:     "이름" &lt;주소&gt;; <br>Cc:    <br>Sent:  YYYY-MM-DD (요일) HH:MM:SS (UTC+09:00)<br>Subject: 원제목<br><br>` + 원문 본문 HTML(`GET /v2/wapi/mails/{id}` 의 `body.content`)
- 보내면(`POST /v2/wapi/mails/send {draftId}`) 원래 메일의 목록 표시 `mailSummary.flags.replied` 가 true, 보낸 메일의 id 는 초안 id 와 같다.
- 받은 메일 목록(`GET /v2/wapi/mails?folderName=inbox…`)의 `mailSummary.flags` 에 `replied`·`forwarded` 가 있다 → 답장 안 한 메일 찾기(코어 `unrepliedMails`).
- 전체 답장(받는 사람 모두) 버튼의 형식은 아직 캡처하지 않았다.

- 아직 없는 것: 첨부 파일(업로드 API 미캡처)·전체 답장·전달(`relation` 형식 미캡처)·예약 발송(`reservation`)·중요 표시(priority 값 미확인)·메일 지우기(휴지통 이동 요청 미캡처).
