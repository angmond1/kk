# Dooray 쓰기·파일 주고받기 — 공식 API 구조 (kk-dooray `dooray_io.py`, 2026-09-29 확인·실계정 시험)

> 찾기·읽기는 브라우저 코어(세션 쿠키, `wapi_search.md`)가 빠르다. **글 쓰기·파일 올리기·PC 폴더로 받기는 공식 API + 개인 토큰**으로 한다
> — 업로드는 세션 쿠키로 되지 않는다(kk-pay 실측). 토큰은 kk-pay·kk-wiki 와 같은 `<kiki_root>/token.txt`, 값은 어디에도 출력하지 않는다.
> 예시 id 는 자리표시. 이 문서의 구조를 알면 탐색 없이 바로 호출한다(속도).

## 1. ID 체계 — 웹 주소의 번호가 곧 API id
| 대상 | 웹 주소 | API 에서 |
|---|---|---|
| 프로젝트 | `/task/{P}/…`, `/drive/{P}/…` 의 첫 번호 `P` | 같은 `P` (`/project/v1/projects/{P}`) |
| 업무 | `/task/{P}/{T}` 의 `T` | 같은 `T` (`/project/v1/projects/{P}/posts/{T}`) |
| 업무 첨부 | 브라우저 검색 결과 `fileMap` 의 id | 같은 id (실측: 웹·API 끝 4자리 3개 일치). 댓글에 단 파일도 업무 첨부 목록에 들어 있다 |
| 드라이브 | 주소에 없음 | **프로젝트 정보의 `drive.id`** (`GET /project/v1/projects/{P}` 또는 목록 `?member=me` 항목마다 `drive:{id}`). 브라우저 드라이브 검색 결과의 `driveId` 와 같다 |
| 드라이브 폴더 | `/drive/{P}/{폴더}` | 같은 폴더 id. 최상위는 주소에 번호가 없다 → `GET /drive/v1/drives/{D}/files?type=folder&subTypes=root` |
| 드라이브 파일·폴더(검색 결과) | `/drive/{P}/views/{id}` | 같은 id — 파일인지 폴더인지는 `?media=meta` 의 `type` |
| 내 드라이브 | 개인 프로젝트 | `GET /project/v1/projects?member=me&type=private` 1건 → 그 `drive.id` (= `GET /drive/v1/drives?type=private`) |
| 사람 | — | `GET /common/v1/members?name=<이름>` → `[{id, name, userCode, externalEmailAddress}]` 의 `id` = 업무 담당·참조에 쓰는 organizationMemberId. 프로젝트 멤버는 `GET /project/v1/projects/{P}/members` → `[{organizationMemberId, role}]` |

## 2. 공통
- Base `https://api.gov-dooray.com`, 헤더 `Authorization: dooray-api {TOKEN}`, JSON 본문이면 `Content-Type: application/json`.
- 응답 `{header:{isSuccessful, resultCode, resultMessage}, result, totalCount}` — `isSuccessful:false` 면 실패(HTTP 200 이어도).
- 속도 제한 5회/초(버스트 20) → 429 면 1.5·3·4.5초 쉬고 다시. 연속 작업은 0.2초 간격.
- **파일 받기·올리기는 307**: api 가 `Location: https://file-api.gov-dooray.com/…` 로 보내면 **토큰을 들고 같은 메서드로 한 번 더**. 자동 리다이렉트는 Authorization 을 떨굴 수 있어 수동으로 따라가고, `*.gov-dooray.com` 이 아니면 토큰을 보내지 않고 멈춘다.
- 속도(실측, 파이썬 시작 포함): 인증 확인 1.5초, 프로젝트 목록(진행 43+보관+개인) 1.8초 → 7일 캐시(`<설정 폴더>/kk-dooray.cache.json`). 캐시에는 **번호만** — 토큰·본인 이름·개인 프로젝트 코드(@아이디, `(개인)` 으로 대체)는 저장하지 않는다(캐시 v2, 2026-09-29 사용자 지적).

## 3. 업무
| 일 | 호출 | 본문·비고 |
|---|---|---|
| 업무 1건 | `GET /project/v1/projects/{P}/posts/{T}` | `subject`, `number`, `body{mimeType, content}`, `users{from,to,cc}` |
| 업무 만들기 | `POST /project/v1/projects/{P}/posts` | `{"users":{"to":[{"type":"member","member":{"organizationMemberId":"…"}}],"cc":[…]},"subject":"…","body":{"mimeType":"text/x-markdown","content":"…"}}` → `result.id` = 새 업무. 담당·참조는 **프로젝트 멤버만** |
| 댓글 쓰기 | `POST /project/v1/projects/{P}/posts/{T}/logs` | `{"body":{"mimeType":"text/x-markdown","content":"…"}}` → `result.id`. 댓글 목록 `GET …/logs`(`type`·`subtype`·`creator`·`body`) |
| 첨부 목록 | `GET /project/v1/projects/{P}/posts/{T}/files` | `[{id, name, size, createdAt, mimeType, creator}]` (실측 0.2초) |
| 첨부 받기 | `GET …/files/{F}?media=raw` | **307 → file-api**(실측 44ms 만에 Location). 정보만은 `?media=meta` |
| 첨부 올리기 | `POST /project/v1/projects/{P}/posts/{T}/files` (multipart `file`) | 307 → file-api 에 같은 multipart 로 |

## 4. 드라이브
| 일 | 호출 | 본문·비고 |
|---|---|---|
| 폴더 안 목록 | `GET /drive/v1/drives/{D}/files?parentId={폴더}&page&size=100` | `[{id, name, type:'folder'|'file', size, updatedAt, …}]`. **parentId 없이 부르면 하위까지 평평하게 섞여 나온다**(kk-pay 실측) — 꼭 parentId |
| 최상위 폴더 | `GET /drive/v1/drives/{D}/files?type=folder&subTypes=root` | 1건 |
| 파일·폴더 정보 | `GET /drive/v1/drives/{D}/files/{id}?media=meta` | `name, size, type, parentFile{id, path:'root/…'}` |
| 받기 | `GET /drive/v1/drives/{D}/files/{id}?media=raw` | 307 → file-api |
| 올리기 | `POST /drive/v1/drives/{D}/files?parentId={폴더}` (multipart `file`) | 307 → file-api (kk-pay RPA 업로드로 실증) |
| 새 버전 올리기 | `PUT /drive/v1/drives/{D}/files/{id}?media=raw` (multipart `file`) | 307 → file-api (공식 가이드 기준, 실계정 미실측) |
| 찾기 | 공식 API 에 이름 검색 없음 → 브라우저 코어 `searchDrive`(서버 검색 3초) | 공식 API 로 폴더를 훑으면 폴더 161개에 95초(실측) |

## 5. 실계정 시험 (2026-09-29, 사용자 허락 — 개인 프로젝트·내 드라이브에서만)
| 명령 | 결과 | 걸린 시간(파이썬 시작 포함) |
|---|---|---|
| `task-create`(담당 본인, 본문 2줄, 첨부 24B) | 업무 생성 + 첨부 1/1 — 브라우저 상세에서 본문 줄바꿈·첨부 확인 | 3.1초 |
| `task-comment`(2줄) | 댓글 1개, 줄바꿈 유지 | 2.0초 |
| `drive-upload private` | 내 드라이브 최상위에 올림, 응답 `result.id` 로 파일 링크 | 2.9초 |
| `task-download --all` | 첨부 받음, 원본과 바이트 동일 | 2.6초 |
| `drive-download` | 받음, 원본과 바이트 동일, 같은 이름은 ` (2)` 로(덮어쓰기 없음) | 1.9초 |
- 미실측: `drive-upload --new-version`(PUT, 공식 가이드 기준), 브라우저 `saveFile`(오프라인 시험만), 프로젝트 공용 드라이브 올리기(kk-pay RPA 업로드로 같은 호출은 실증).

## 6. dooray_io.py 가 지키는 것
- 쓰기·받기는 **기본이 미리보기**(무엇을·어디에·크기)이고 `--yes` 가 있어야 실행 — 사용자 확인 뒤에만 `--yes`.
- 받기: 이름의 `\ / : * ? " < > |` 는 `_`, 같은 이름이 있으면 ` (2)` — **덮어쓰지 않는다**. `.part` 로 받다가 끝나면 이름을 바꾼다. 파일 대신 dooray 오류 봉투가 오면 저장하지 않는다.
- 드라이브 올리기: 폴더에 같은 이름이 있으면 멈춘다(코드 2) → 사용자에게 물어 `--as-copy`(이름 뒤 ` (2)`) 또는 `--new-version`.
- 사람·프로젝트 이름이 여럿 맞거나 프로젝트 멤버가 아니면 멈추고 후보만 보여준다(코드 2) — 추측해서 쓰지 않는다.
- 폴더째 받기·삭제·이동·업무 상태 바꾸기는 하지 않는다(요청이 오면 Dooray 화면에서 직접).

## 7. 브라우저 → 스크립트 넘기기 (탐색 없이)
- 브라우저 `find` 결과의 링크를 그대로 준다: 업무 `fmtLinks(window.__d.tasks)` 의 `/task/{P}/{T}`, 드라이브 `fmtLinks(window.__d.drive)` 의 `/drive/{P}/views/{id}`(파일이면 받기, 폴더면 올릴 곳).
- 업무 첨부 id 는 `fmtFiles(업무항목, 0, 15, {ids:true})` 의 `id …`.
- 토큰이 없으면 받기만 브라우저로: `saveFile(항목)` → Chrome 다운로드 폴더(한 파일씩).
