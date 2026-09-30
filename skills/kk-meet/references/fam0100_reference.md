# fam_0100 회의비 사전내부결재 — fetch 명세

> ⚠️ **2026-08-01 사용분(영수증 기준)부터 회의비 사전 내부결재는 기본 폐지**(재무팀 공지 2026-08-04). 이 조회는 **남은 경우**(목록 밖 부처 과제·자체·석좌 K 에서 통합정보가 사전결재를 요구할 때, 휴일·근무지 밖 사용의 차상위자 전결)와 2026-07-31 이전 사용분에만 쓴다. 현행 규정 → `meeting_form.md` 「사전 내부결재·참석자 — 현행」.

> 통합정보 NEXACRO backend 직접 호출(좌표0). `portal_ops.js` `queryPreApprovals()`.
> 인증: 세션쿠키 + `window.application.authTk` (토큰 불요, 조회는 KIST SSO 세션).

## 카드 조회 (fam_0711) — 재사용 (kk-pay 와 동일)
- `POST /mis/fam/fam0711/getList.do` · pgmId `fam_0711` · svcId `getList`
- ds_search: `FROM_DT`·`TO_DT`·`CARDTYPECD`(**'5'법인 / '3'연구비**)·`CARDRESPEREMPNO`/`SEARCHID`(카드책임자 사번)·`CUSTNM`?·`CARDNO`?
- 응답: `CARDUSEYMD`·`CUSTNM`(거래처)·`CARDAPPRNO`(승인번호)·`USEAMT`·`PRGRSSTATNM`
- ⚠️ **법인·연구비 둘 다** 조회(`queryCardsBoth`) → 건마다 `cardKind` 표시.

## 참여과제 조회 (rdm_2011) — 재사용
- `POST /mis/rdm/rdm2011/doSearchMain.do` · pgmId `rdm_2011` · svcId `doSearchMain`
- ds_search: `SRCHKND:'anyThing'`·`SRCHPROCESS:'0'`
- 응답: `ACCCD`(과제번호)·`PROJNM`(과제명)·`KORNM`(책임자)

## 사전결재 조회 (fam_0100) — 신규 (2026-06-04 캡처)
- `POST /mis/fam/fam0100/getListByBonbu.do` · pgmId `fam_0100` · svcId `getList`
- ds_search: `STRDNT`(시작 YYYYMMDD)·`ENDDNT`(종료)·`KORNM`(발의자명)·`PAYNO`(발의자사번)·`ACCPAYNO`/`ACCKORNM`(계정책임자)
- 응답: `PRI_CONFER_DATE`(회의일자)·`PRI_CONFER_PERPOSE`(회의목적=제목, 철자 PERPOSE 주의)·`PRI_CONFER_PLACE`(장소)·`PRI_CONFER_ACCCD`(계정)·`PRI_CONFER_STRTM`/`PRI_CONFER_ENDTM`(HHMM)·`KORNM`(발의자)·`JOINPEOPLE`(인원)
- ⚠️ **이름 "getListByBonbu" 대로 본부 전체를 반환**(발의자/계정 필터 서버 미적용). 발의자로 검색해도 본부 타인 발의 건까지 옴 → **응답에서 acccd(과제)+date(날짜)로 매칭**(`matchPreApproval`).

## 공통 함정 (kk-pay `kist_portal_fetch.md` 와 동일)
- 응답 `&#32;` 등 엔티티 decode 필요(`decodeEnt`).
- fetch 결과는 화면 grid 에 안 보임(정상).
- 발의자 사번 매핑 `chkPopupValueSetting.do` 는 화면선 동작하나 직접 fetch 빈 응답 가능(세션 의존) → 사번은 설치 시 config 저장 권장.
- 좌표 fallback: fetch 안 되면 zoom 으로 위치 찾아 클릭(고정좌표 금지), ⛔Ctrl+A(문자 a). 저장·제출은 SKILL 의 chrome-devtools 창에서.
