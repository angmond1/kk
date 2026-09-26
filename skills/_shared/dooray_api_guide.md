# Dooray API 사용 가이드 (kiki 공통 참조)

> **공식 가이드 원문**: https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419
> kiki skill이 Dooray API를 쓰다 문제가 생기면 **이 문서 → 원문 링크** 순으로 참조해 해결한다.

## ⭐ 먼저: kk-mail은 API 토큰이 불필요
kk-mail의 메일 기능(조회·스팸·분류·규칙·폴더 생성/삭제)은 **internal wapi**(`kist.gov-dooray.com/v2/wapi`) + **브라우저 세션 쿠키**로 동작한다 → **공식 API 토큰이 필요 없다.**
아래 토큰 가이드는 **공식 API 기능**(메일 발송 우회·캘린더·드라이브·wiki 등)이나 **형제 skill**(kk-pay 등)이 공식 API를 쓸 때만 해당.

## API key(개인 인증 토큰) 발급
- **발급 위치**: https://kist.gov-dooray.com/setting/api/token
  (Dooray Web → 개인설정 → API → 개인 인증 토큰)
- 토큰 권한 = **발급 계정과 동일** (UI에서 못 하는 작업은 API로도 불가).
- ⚠️ 토큰은 비밀번호급 비밀 — **skill·repo·로그에 저장 금지.** 각자 로컬 `<kiki_root>/token.txt`(`Dooray token:` 다음 줄) 에만.

## 인증·기본
| 항목 | 값 |
|------|-----|
| Base URL | `https://api.gov-dooray.com` (KIST 공공클라우드) |
| 인증 헤더 | `Authorization: dooray-api {TOKEN}` (`Bearer`/plain 토큰은 거부) |
| Content-Type | json body 보낼 때 `application/json` 명시(415 방지) |
| 파일 API host | `https://file-api.gov-dooray.com` (api → 307 → file-api로 follow) |

## 응답 envelope
```json
{ "header": { "isSuccessful": true, "resultCode": 0, "resultMessage": "" },
  "result": { ... }, "totalCount": 0 }
```
- `header.isSuccessful=false`이면 `resultCode`/`resultMessage`로 원인 파악.

## Rate limit (Token Bucket)
- 응답 헤더 `X-RateLimit-Remaining` / `X-RateLimit-Burst-Capacity`(20) / `X-RateLimit-Replenish-Rate`(5/s)로 자율 조정.
- 초과 시 HTTP 429.

## 메일 API — 공식 API에는 없음
- 메일 조회·스팸·이동·규칙·폴더는 **공식 API에 없고 internal wapi 전용**(`/v2/wapi`, 세션 쿠키). → kk-mail이 이것을 사용(`dooray_wapi.md`).
- 메일 "발송"도 공식 API 없음(프로젝트 email-address 우회 방식).

## 문제 해결 순서 (skill이 따름)
1. 응답의 `header.resultMessage`·`resultCode` 먼저 확인.
2. **internal wapi**(`/v2/wapi`)면 → `dooray_wapi.md`의 **필수 헤더**(`dooray-caller: WEB` 등) 누락 점검. (없으면 `-200200` 또는 `contents:[]`)
3. **공식 API**(`api.gov-dooray.com`)면 → 인증 헤더(`Authorization: dooray-api {TOKEN}`)·Content-Type 점검 + 이 문서·원문 링크 참조.
4. 정확한 요청 body가 미상이면 → **DevTools Network 탭에서 해당 동작을 1회 수행해 payload 캡처**가 가장 확실(이번 폴더 생성 `create-path` 형식도 이렇게 확정).
5. 그래도 막히면 원문 가이드(맨 위 링크)에서 해당 endpoint 검색.
