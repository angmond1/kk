# Dooray wapi 공통 (kiki 형제 skill 공유)

> KIST Dooray 자동화 skill(kk-mail 등)이 공통으로 쓰는 wapi 기본. 개인 토큰·식별자 없음.

## 인증 원칙 (핵심)
- **메일/행정 internal wapi는 브라우저 "세션 쿠키"로 인증** (`credentials:'include'`).
  사용자가 Chrome에 본인 KIST SSO 로그인만 돼 있으면 동작 → **API 토큰·비번을 skill에 넣지 않는다.**
- 공식 REST API(`api.gov-dooray.com`, `Authorization: dooray-api {token}`)는 메일 관리에 **불필요**(메일 조회·스팸·이동·규칙은 internal wapi 전용). 토큰이 필요한 확장 기능은 각 사용자 로컬 `<kiki_root>/token.txt` 에서만 읽고 skill에 값 박지 않음.

## 호스트
| 용도 | 호스트 |
|------|--------|
| internal wapi (SPA용, 세션 쿠키) | `https://kist.gov-dooray.com/v2/wapi` |
| 공식 REST API (토큰) | `https://api.gov-dooray.com` |

## internal wapi 필수 헤더
없으면 일부 endpoint `-200200` 거부, 일부는 `200 OK + contents:[]` silent fail.
```
Content-Type: application/json
Accept: application/json, text/plain, */*
dooray-api-version: 1.1
dooray-caller: WEB
dooray-mail-api-version: 1.2
dooray-drive-api-version: 1.1
```

## Rate limit (Token Bucket)
- burst 20 / 1초당 5 보충. 초과 시 HTTP 429.
- 다건 순회는 한 번에 묶거나(배열 body 지원 endpoint) 적당히 분할.

## 알려진 함정 (이번 빌드에서 확인)
- `mail-rules` 목록 GET은 `page=0` 명시해야 `contents` 정상 반환.
- `mail-rules` POST는 배열이어도 **첫 1건만 생성** → 여러 규칙은 단건씩 N회.
- `mail-folders` 생성은 `POST /mail-folders/create-path` + **배열** body `[{name,order}]` (확정 2026-06-04). 삭제는 `DELETE /mail-folders/{id}`. (`/mail-folders`에 단일 객체 POST는 -200200)
- 파일 업로드/다운로드는 `api`→307→`file-api` redirect 시 Authorization 자동 제거 → manual redirect 필요(메일 관리엔 불필요).

## Drive (kk-pay 등 — 공식 API + 개인 토큰)
메일은 세션쿠키 wapi 지만, **drive 업로드/조회는 공식 API(`api.gov-dooray.com`) + 개인 토큰** 사용(세션쿠키 wapi 업로드는 미검증). 토큰은 `<kiki_root>/token.txt`(repo 밖, 구형 `~/.claude/kiki/kiki.env` 도 읽힘).
- 폴더 목록: `GET /drive/v1/drives/{driveId}/files?parentId={}&page=&size=` — 페이징(`result`/`totalCount`). 폴더 판별 `type=="folder"`.
- 업로드: `POST /drive/v1/drives/{driveId}/files?parentId={}` (multipart, field `file`) → **307** → `Location`(file-api) 로 **같은 `session.post` 재전송**(Session 이라 Authorization 유지).
- 다운로드: `GET .../files/{id}?media=raw` → 307 → file-api **manual GET**(Authorization 헤더만; requests 자동 follow 는 cross-host 에서 Authorization 제거되어 401).
- ⚠️ **폴더 이름 검색 API 없음** → 트리 `files` 재귀 순회 + 이름 매칭. root 가 **수천 항목**일 수 있어 전수 검색은 수 분 → 상위(본부 등) 폴더 id 를 캐시해 그 안만 검색하면 수 초.
- ⚠️ **동명 폴더 복수 존재** 가능 → 하위 구조(특정 폴더 보유)로 정식 식별 + 모호 시 사용자 확인.
- web URL: `https://kist.gov-dooray.com/drive/{projectId}/{folderId}` — **projectId ≠ driveId** (`GET /drive/v1/drives/{driveId}` 의 `result.project.id` 가 projectId, URL 용 / `result.id`·요청경로는 driveId).
