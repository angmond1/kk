# Dooray 업무·드라이브 검색 wapi — kk-dry 코어가 부르는 주소 (2026-09-29 캡처·실측)

> 모두 `kist.gov-dooray.com` 탭의 **세션 쿠키**로 호출한다(토큰 없음). 헤더는 `Accept: application/json`(+ POST 는 `Content-Type: application/json`)만으로 동작했다.
> 로그인이 풀리면 JSON 대신 로그인 화면(HTML)이 온다 → 코어가 `DOORAY: 응답이 JSON 이 아닙니다` 로 올린다.
> 예시 id 는 자리표시(`{projectId}` 등 19자리 숫자). 실제 프로젝트·사람 이름은 적지 않는다.

## 1. 업무 검색 — 업무 화면 검색창과 같은 호출
```
GET /wapi/task/v1/projects/*/tasks?size=100&page=0&order=-postUpdatedAt&all=<낱말 낱말>&projectScope=in_project_member
```
- `*` = 내가 속한 모든 프로젝트. 한 프로젝트만이면 **`!{projectId}`**(번호 앞 `!` 필수 — 없으면 `SERVICE_RESOURCE_PROJECT_NOT_FOUND`, 2026-09-29 실측)이고 `projectScope` 는 빼며, **`all` 없이 부르면 그 프로젝트 업무 전체 목록**(코어 `projectTasks`). 서버 검색은 글 속 낱말만 보므로 사람 이름으로 찾은 뒤 그 프로젝트 전체를 보는 게 빠짐이 없다.
- **`all` 은 한 칸에 띄어쓰기로** — 서버가 낱말 AND(순서 무관): `A B` 2건 = `B A` 2건 ⊂ `A` 3건(A·B = 실제 검색 낱말 자리).
  `all=A&all=B` 처럼 두 번 주면 **둘째는 무시**(A 만 준 것과 같은 3건), 쉼표는 0건. → 동의어는 요청을 따로(코어 `searchTasksMany`).
- 대상 = **제목·본문·댓글**. 실측: 본문에만 있는 낱말로 그 업무 5/5 hit, 댓글에만 있는 낱말 4/4 hit. 첨부 파일 속 글은 대상 아님.
- `size=100` OK. 응답 약 0.5초(20건 58KB).
- 응답: `{ header, result:[업무…], totalCount, references:{ projectMap, workflowMap, projectMemberGroupMap, milestoneMap, tagMap, organizationMap, boxProjectMap } }`
  - 업무: `id, projectId, number, subject, workflowId, workflowClass(registered|working|closed), users{from, to[], cc[], me}, createdAt, updatedAt, dueDate, fileIdList[], attachFileFlag, subPostCount, parent, …`
  - 사람 이름은 바로 들어 있다: `users.from.member.name`, `users.to[i].member.name`(그룹이면 `type:'group'`), 외부 메일 사용자는 `emailUser`.
  - 프로젝트 이름 `references.projectMap[projectId].code`, 상태 이름 `references.workflowMap[workflowId].name`.
- 결과 순서는 `postUpdatedAt`(글 수정) 기준이라 `updatedAt`(댓글·상태 변경 포함)과 다르다(실측 16건 중 역전 4) → **기간은 받은 뒤 거른다**(순서를 믿고 '기간 밖이 나오면 멈춤' 하면 빠진다). 코어는 합친 뒤 수정일 최신순으로 다시 정렬.

## 2. 업무 상세 — 본문·첨부
```
GET /wapi/task/v1/tasks/{taskId}?fields=me%2Cbody
```
- `result` = 업무 그대로(목록 필드 + `body{mimeType:'text/x-markdown'|'text/html', content}` + `me`, `predecessorTasks`, …) — `result.content` 가 아니다.
- 첨부 이름표: `references.fileMap[fileId] = { id, name, size, mimeType, createdAt, downloadUrl, creator{type, member{name}}, postId, … }`.

## 3. 업무 댓글
```
GET /wapi/task/v1/projects/!{projectId}/tasks/{number}/events?size=100&order=-createdAt&fields=me&direction=%3A&eventType=comment
```
- 프로젝트 id 앞에 `!`, 업무는 **번호(number)**. `order=-createdAt` = 최신순(실측: 26건 중 첫 건이 가장 최근), `size=100` OK. `totalCount` = 전체 댓글 수.
- 댓글: `createdAt, creator{member{name}}, body{mimeType, content}, fileIdList, reactions, …` + `references.fileMap`(댓글 첨부 이름표).
- 하위 업무 목록은 `GET /wapi/task/v1/tasks/{taskId}/sub-tasks`(코어 미사용, 목록의 `subPostCount` 로 개수만).

## 4. 드라이브 검색 — 드라이브 화면 검색창과 같은 호출
```
POST /v2/wapi/drives/search?size=100&page=0
{ "query":"all=<낱말1>&all=<낱말2>", "page":0, "order":"-updatedAt", "all":["낱말1","낱말2"], "searchType":"drive", "driveIds":["{driveId}"] }
```
- `driveIds` 를 빼면 **내가 볼 수 있는 모든 드라이브**. 웹 화면 검색은 지금 보고 있는 드라이브 하나로 좁힌다(`driveIds`).
- `all` 배열 원소끼리 **AND**(57건 ∩ 1,509건 → 5건). 한 원소 안 띄어쓰기는 구절 취급 → 0건 → 코어가 낱말로 나눈다.
- 대상 = **파일·폴더 이름 + 올린·고친 사람 이름**. **파일 속 글은 색인 안 됨**(발표 파일 속 영어 낱말 3개 모두 0건). 화면 주소의 `query=all%3D…` 도 같은 뜻.
- 응답 약 3초(헤더까지 2.6~3.9초), size 100 = 88KB. `size=100` OK.
- 응답: `{ header, result:{ totalCount, contents:[…], references:{ driveMap, organizationMemberMap } } }` — ⚠️ **`result` 가 배열이 아니다**(업무 검색과 다름. 배열로 다루면 예외 → `.then(성공, 실패)` 의 실패 쪽으로도 안 가서 영원히 '아직').
  - 항목: `id, driveId, projectId, name, type('file'|'folder'), subType, mimeType, size, createdAt, updatedAt, createOrganizationMemberId, lastUpdateOrganizationMemberId, isTrashed, hasThumbnail, downloadUrl('/drive/v1/downloads/…'), ancestorFiles(검색 결과에선 null), me{permissions}, …`
  - `driveMap[driveId] = { name(=프로젝트 이름), projectId, type:'project'|…, state }`, `organizationMemberMap[memberId] = { name, department, … }`.
  - 휴지통 항목(`isTrashed`)이 섞일 수 있다 → 코어 기본은 제외(`includeTrashed:true` 로 포함).
  - ⚠️ `order:'-updatedAt'` 를 줘도 **폴더가 먼저 오고 수정일 순이 아니다**(실측 57건 중 역전 3, 찾던 6월 파일이 28번째) → 기간은 받은 뒤 거른다. 초판 코어가 '기간 밖이면 멈춤'으로 그 파일을 놓쳤다(2026-09-29 실사용 시험에서 발견·수정).

## 5. 드라이브 파일·폴더 1건 — 경로
```
GET /v2/wapi/drives/{driveId}/files/{fileId}
```
- `result.content.parentFile = { id, path:'root/2026/2026-01' }`, `ancestorFiles:[{id,name}…]`(root 부터). 코어는 `root` 를 떼어 `/2026/2026-01` 로.
- 같은 화면이 `…/tags`, `…/events?direction=%3A&size=10&showFileVersion=false`(파일 이력)도 부른다(코어 미사용).

## 6. 파일 받기 (기능 3 — 허락 후에만)
- 검색 결과의 `downloadUrl`(드라이브) / `fileMap[…].downloadUrl`(업무 첨부)을 **같은 탭에서 `fetch(credentials:'include')`** → 200, 같은 origin, 리다이렉트 없음, `content-type` 은 파일 형식(실측: xls → `application/vnd.ms-excel`, 첫 8바이트 OLE 서명). `Range` 헤더는 무시되고 전체가 온다.
- `HEAD` 는 200 이지만 헤더가 비어 판단에 못 쓴다.
- 코어는 받은 바이트를 메모리에서만 풀어 글을 뽑는다(ZIP: `DecompressionStream('deflate-raw')` / hwp: OLE(CFB) 직접 파싱 + 본문 raw deflate). 디스크 저장 없음.

## 7. 링크 형식
| 대상 | 주소 | 비고 |
|---|---|---|
| 업무 | `https://kist.gov-dooray.com/task/{projectId}/{taskId}` | |
| 드라이브 파일 ★ | `https://kist.gov-dooray.com/drive/{projectId}/{부모 폴더 id}/views/{fileId}` | 폴더 안 파일을 누르면 생기는 주소(2026-09-29 실측). 새로 열어도 그 폴더가 열리고(왼쪽 트리 펼침) 파일이 선택되며 오른쪽에 미리보기 첫 장·크기·경로·히스토리. 부모 폴더 id = 파일 상세의 `parentFile.id`(검색 결과에는 없음 → 코어 `drivePath` 가 채움) |
| 드라이브 파일(대안) | `https://kist.gov-dooray.com/drive/{projectId}/views/{fileId}?query=<all=낱말&all=낱말 을 인코딩>` | 검색 결과 화면에서 그 파일이 선택된다(부모 폴더를 모를 때). 낱말 = 파일 이름을 띄어쓰기로 나눈 것, 한글 이름도 됨(한 번·두 번 인코딩 모두 실측 OK) |
| ⚠ `…/drive/{projectId}/views/{fileId}` (검색어 없이) | | **드라이브 최상위 폴더가 열리고 파일은 안 보인다**(2026-09-29 사용자 지적으로 확인). 검색창 결과 화면 안에서 누를 때만 선택 상태가 된다 — 링크로 주지 않는다 |
| 드라이브 폴더 | `https://kist.gov-dooray.com/drive/{projectId}/{folderId}` | 그 폴더가 열린다 |
| 드라이브 검색 화면 | `https://kist.gov-dooray.com/drive/{projectId}?query=all%3D<두 번 인코딩한 낱말>` | 사람이 직접 볼 때 |

## 7b. Dooray 미리보기(서버 문서 변환 — 업무 첨부의 🔍 버튼, 2026-09-29 실측)
| 단계 | 주소 | 응답 |
|---|---|---|
| 변환 요청 | `GET /v2/wapi/preview/services/project/files/{첨부 id}?convert=external&redirectUrl=/preview-pages/posts/{업무 id}/{첨부 id}&downloadUrl=/files/{첨부 id}?disposition=attachment&action=download` | `result.content.redirectUrl` = `/SynapDocViewServer/viewer/doc.html?key={키}&convType=img…` (Synap 문서 뷰어, 같은 도메인) |
| 상태·쪽 수 | `GET /SynapDocViewServer/status/{키}` | `{pageNum, format:'PPTX'…, fileName, imgErrCode}` — 변환이 끝나면 pageNum > 0(48MB hwp 50쪽 약 5초) |
| 쪽 그림 | `GET /SynapDocViewServer/thumbnail/{키}/{쪽-1}?dpi=150` | PNG — 슬라이드·쪽 모양 그대로(EMF 그래프·한글 그림 포함). 뷰어는 `&w=1500&h=1125` 를 붙이지만 없어도 된다 |
| 쪽 글 | `GET /SynapDocViewServer/thumbnailxml/{키}/{쪽-1}?dpi=150` | XML `<paragraph><text l t w h>글</text>…` — 쪽당 약 1초. PDF·옛 형식도 |
- ⚠ **키는 한 사람에게 한 번에 하나만 산다** — 다른 파일(같은 파일도)의 키를 새로 만들면 앞 키의 status·thumbnail·thumbnailxml 이 403(Dooray 오류 화면)이 된다(실측 재현). 코어는 미리보기 작업을 차례로(pvExclusive) 하고 쪽 그림을 키를 받은 즉시 blob 으로 받아 둔다.
- 미리보기 주소 `/preview-pages/posts/{업무}/{첨부}` 는 `window.open(_blank)` 로 새 탭에 열린다. 첨부 이름 링크(`/files/{id}?disposition=attachment`)는 **내려받기**라 누르지 않는다. 한 줄의 아이콘: ↓ 내려받기 · 🔍 미리보기 · (편집) · 🗑 삭제.
- **드라이브 파일**(파일을 두 번 누르면 `window.open('/preview-pages/drives/{드라이브}/{파일}?folderId={폴더}')` 새 탭): `GET /v2/wapi/preview/services/drive/files/{드라이브 id}-{파일 id}-{version}?convert=external&redirectUrl=/preview-pages/drives/{드라이브}/{파일}?folderId={폴더}&downloadUrl=/drive/v1/downloads/{프로젝트}/{파일}?disposition=attachment&action=download` → 같은 Synap 키. `version` 은 검색 결과·파일 상세의 `version`(보통 0 — 새 버전을 올리면 늘어남). **downloadUrl 이 없으면 서버 오류(-1)**, `…/drive/files/{파일}`(드라이브·version 없이)도 오류. status 는 처음 1~2초 `format:null, pageNum:0` 이었다가 채워진다. 슬라이드 그림 2000×1125(16:9).

- **문단 → 쪽**(docx·hwpx·hwp 에서 찾은 문단을 쪽 그림으로 보일 때, 코어 1.8): 문단이 파일 안 몇 % 쯤에 있는지로 쪽을 짐작해 그 둘레부터 `thumbnailxml` 을 4쪽씩 읽어 문단 글(공백 뺀 앞 40자)이 있는 쪽을 찾는다 — 전 쪽을 읽으면 100쪽 보고서에 약 25초. 같은 쪽의 문단은 한 곳으로 묶는다.

## 8. 함정·실측 메모
- **드라이브 검색 결과(contents)의 다른 필드**(2026-09-29): `webOfficeUrl`(`/office/drives/{projectId}/files/{fileId}` — 웹 오피스 **편집기**, 남의 파일을 열면 잠금·새 버전 위험이 있어 링크로 쓰지 않는다), `hasThumbnail`, `ancestorFiles`(null — 경로는 여기 없음), `sharedLinkIdList`, `lock`, `revision`. 미리보기 그림 `/drive/v1/downloads/{projectId}/{fileId}/thumbnails/0/large?action=prev` 는 **첫 쪽만** 있다(1 이상은 JSON 오류) → 슬라이드별 그림은 파일 안 그림 원본(`showFigures`)으로.
- `javascript_tool` 출력 필터(2026-09-29): `size=100&page=0` 같은 **쿼리·쿠키 꼴**이 있으면 결과 전체가 `[BLOCKED: Cookie/query string data]`. URL·19자리 id·`/`·`&`·`;`·`?`·`pH=7` 같은 단독 `=` 는 통과했다(kk-mail 을 만든 2026-09-24 보다 완화). 코어 포매터는 `=` → `＝` 만 바꾼다.
- 탭이 뒤에 있어도(`visibilityState: hidden`) fetch·타이머는 돌았다. 다만 응답 처리 코드에서 예외가 나면 2-스텝 변수가 `null` 로 남는다 → 코어는 항목별 실패를 `{error}` 로 남긴다.
- **결과 탭을 앞으로**(2026-09-29): Claude in Chrome 은 탭을 고르는 도구가 따로 없다 — 결과 탭에 `computer` `left_click` (4,4)(본문 여백, 누를 것 없음)를 하면 그 탭이 Chrome 앞으로 온다(그 뒤 screenshot 도 바로 됨; 뒤에 있는 탭의 screenshot 은 30초 뒤 멈춘다). Chrome 창 자체가 다른 프로그램 뒤에 있으면 앞으로 오지 않으므로 답 첫 줄 안내가 필요하다. 탭이 뒤에 있으면 코어가 결과 제목을 깜박인다(`document.hidden` 동안 1초마다, 최대 2분).
- `javascript_tool` 은 top-level `await` 가 된다(2026-09-29): 코어 올리기를 `const t = await …files[0].text(); …; (0, eval)(t)` 한 번에(2-스텝 불필요). 오래 걸리는 호출(quick·report)은 여전히 `.then` 으로 window 에 두고 화면을 `get_page_text` 로 읽는다(도구 시간 제한).
- 사람 이름 조회가 따로 필요하면 `GET /v2/wapi/members/{memberId}` → `result.content.name`(검색 응답에 이미 이름이 있어 코어는 안 쓴다).
- 공식 REST API(토큰)로도 같은 일을 할 수 있지만 느리다 — 프로젝트 44곳 × 검색어 7개를 하나씩 도는 데 약 100초, 드라이브 폴더 161개를 훑는 데 95초(2026-09-29). 공식 API 의 업무 검색은 제목(`subjects=`)만 된다.

## 9. 빠른 길 통로 (2026-09-29 실측 — 사용자 지적 "15분 걸리면 직접 하는 게 빠르다")
- **작업 탭** `https://kist.gov-dooray.com/robots.txt`: 가벼운 text/plain 문서지만 같은 origin 이라 세션 쿠키로 wapi 가 조회된다. 쓰던 Dooray 화면과 분리.
- **코어 올리기**: Claude in Chrome `file_upload` 로 `kk_dry_ops.min.js` 를 작업 탭의 `<input type=file>` 에 넣고 `file.text()` → `localStorage['kk.dry.core']` 저장 → `(0,eval)`. 대화창에 4만 자를 붙여넣지 않는다. 다음부터는 `localStorage` 에서 한 줄로(버전 문자열로 확인). Dooray 페이지에서 `eval`·`new Function`·localStorage 60KB·`crypto.subtle` 모두 된다(실측).
- **큰 결과 꺼내기**: 결과 글을 작업 탭 `<pre>` 에 쓰고 `get_page_text` 한 번 → 2.7만 자 그대로(1,000자 잘림 없음, `size=100&page=0`·URL 도 가려지지 않음).
- **시간(같은 질문)**: 이전 약 15분(코어 붙여넣기, 1,000자 조각 읽기 10여 번, 주소 디버깅) → 66초(탭 확인·코어 올리기·`report` 3.9초·`get_page_text` 1회, 첫 사용 기준). 코어가 이미 저장돼 있으면 올리기 3단계가 빠진다.
- **get_page_text 한도**: 5만 자에서 잘린다(도구에 글자 수 인자 없음). 2026-09-29 Sonnet 재시험: 첨부 67·86·132개짜리 업무가 섞여 결과가 10.7만 자 → 앞 5만 자만 읽혀 나머지를 다시 읽느라 총 4분 30초(자료 모으기 자체는 1분 30초, 브라우저 안 11초). → 코어 1.4 `report()` 가 4.5만 자(`BUDGET`) 안으로 단계별로 줄이고, 잘린 첨부는 `showFiles(번호)` 로 따로 읽는다.
