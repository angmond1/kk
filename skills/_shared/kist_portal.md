# KIST 통합정보시스템(NEXACRO) 공통 — 좌표 없이 backend 직접 호출

> kiki 형제 skill(kk-pay·kk-inspect·kk-budget 등)이 KIST 통합정보(`p.kist.re.kr:8081`, NEXACRO 14)를
> 조회할 때 공통으로 쓰는 패턴. **화면 클릭·좌표 없이 backend 를 fetch** → 해상도·모니터 무관.
> kk-pay 에서 2026-06-04 실증(카드내역·과제목록 fetch 성공). **새 화면도 이 방식으로 먼저 시도하라.**

## 핵심 원리
- 통합정보 NEXACRO 화면 **1개만 열려 있으면**(아무 화면, 세션+authTk 확보용) 그 탭에서 fetch 로 **모든 backend 호출** 가능(화면 전환조차 불필요).
- 인증: `window.application.authTk`(전역·쿠키 둘 다 존재, 세션 내 고정, 매 요청 자동) + 세션쿠키(`credentials:'include'`). **통합정보는 SSO 세션이라 API 토큰 불필요.**
- 요청: `POST {endpoint}.do`, `Content-Type: text/xml; charset=UTF-8`, body = NEXACRO SSV(XML).

## NEXACRO SSV body / 응답 형식
요청:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.nexacroplatform.com/platform/dataset">
  <Parameters>
    <Parameter id="authTk">{window.application.authTk}</Parameter>
    <Parameter id="pgmId">{화면코드 예 fam_0711}</Parameter>
    <Parameter id="svcId">{서비스 예 getList}</Parameter>
  </Parameters>
  <Dataset id="ds_search">
    <ColumnInfo><Column id="FROM_DT" type="STRING" size="256"/>...</ColumnInfo>
    <Rows><Row><Col id="FROM_DT">20260504</Col>...</Row></Rows>
  </Dataset>
</Root>
```
- 응답도 같은 형식: `<Root><Parameters>...</Parameters><Dataset id="ds_datagrid1"><Rows><Row><Col id="X">값</Col>...`.
- ⚠️ 일부 backend(예 직원검색 `chkPopupValueSetting`)는 응답이 Dataset 없이 **`Parameters` 에 결과**(`<Parameter id="EMP_NO">…`).

## ⭐ 새 화면 backend 알아내는 법 (endpoint·body 캡처)
1. 화면 navigate(`indexQ.jsp?target={모듈}::{화면}.xfdl&menuParam=sysCd%3DCUS`) → 9초 대기.
2. XHR 후킹 inject(javascript_tool):
   ```js
   (function(){window.__x=[];var o=XMLHttpRequest.prototype.open,s=XMLHttpRequest.prototype.send;
   XMLHttpRequest.prototype.open=function(m,u){this.__u=u;return o.apply(this,arguments)};
   XMLHttpRequest.prototype.send=function(b){var t=this;this.addEventListener('load',function(){
   try{window.__x.push({u:String(t.__u).split('?')[0],body:b&&String(b),resp:(t.responseText||'').slice(0,3000)})}catch(e){}});
   return s.apply(this,arguments)};return 'hooked'})()
   ```
3. 화면에서 조회/동작 1회(좌표 클릭) → `window.__x` 에서 endpoint·요청 body(ds_search 컬럼)·응답(Dataset·컬럼) 확인.
4. 확보 형식으로 fetch 직접호출 함수화 → 이후 좌표 불필요. 검색조건은 ds_search Col 값만 바꿔 모든 조합 조회.

## 응답 파싱 (정규식, 네임스페이스 무관)
```js
function parseRows(xml){var out=[],R=/<Row[^>]*>([\s\S]*?)<\/Row>/g,m;
 while(m=R.exec(xml)){var o={},C=/<Col id="([^"]+)">([\s\S]*?)<\/Col>/g,c;
 while(c=C.exec(m[1]))o[c[1]]=c[2].replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(+n)});
 out.push(o)}return out}
```

## 함정 (꼭 알고 시작)
- 응답 공백은 `&#32;` 로 인코딩 → **decode 필수**(위 parseRows 가 처리).
- fetch 결과는 **화면 grid 에 안 보인다**(정상 — 데이터만 받음). 사용자가 빈 화면 보고 "안 됐다" 오해 주의 → 설명.
- `authTk` 빈값 = 통합정보 화면 미로드 → 화면 1개 navigate 후 9초 재시도.
- 브라우저 자동화 **출력에 쿠키·세션값 섞이면 `[BLOCKED: Cookie/query string data]`** 로 차단 → 출력에서 `_ga`/`_fwb`/`WMONID`/`authTk` 등 제거하고 핵심 필드만 반환.
- 일부 backend 는 화면 호출 순서/세션 상태에 의존해 **직접 fetch 가 빈 응답**(kk-pay `chkPopup` 사례, 화면 Enter 로는 동작) → 그땐 좌표 fallback 또는 config 우회.
- **DOM 팝업 연쇄(자동화 브라우저)는 불안정** — fetch 안 되는 화면(예 예실대비표 → 집행내역 개인집계)을 DOM 팝업으로 우회할 때 3가지 함정: ① `(async()=>{})()` 결과가 `{}` 로 옴 → **전역 저장 후 동기 read**, ② 백그라운드 탭 **throttle** 로 느림 + *부분누락으로 틀린 값* → **Chrome foreground** 안내, ③ 팝업 **재오픈 시 빈 grid** → navigate 리셋 + **로딩 polling**(행>0 대기). 상세 kk-budget `budget_fetch_spec.md` §개인집계 DOM 안정화.
- ⭐ **그리드 셀클릭 팝업은 좌표 말고 핸들러 직접 호출**(2026-09-18 확립) — `application.mainframe.all[0].form` 으로 화면 폼을 잡고, 그리드(`getBindCellIndex('body',<금액컬럼>)>=0`)를 재귀 탐색해 `ds.set_rowposition(행)` **후** `form.<Grid>_oncellclick(grid,{row,cell,...})` 호출하면 해상도·행위치 무관(핸들러가 인자 row 가 아니라 *현재 행*을 보므로 rowposition 필수). 🔴 닫기는 **팝업 폼 `btn_close.click()`** 만 — `form.close()`/`destroy` 로 닫으면 `modalPopDiv_*` Div 가 남아 이후 모든 클릭이 `already exists` 로 **조용히 실패**(복구는 navigate 리셋).

- 🔴 **브라우저 도구 혼동 금지** — Claude Desktop(Code 탭)에는 내장 브라우저(`mcp__Claude_Browser__*`, browser pane)가 기본으로 붙어 있지만 **사용자 Chrome 의 SSO 세션이 없다**. 통합정보·두레이 작업은 전부 **Claude in Chrome(`mcp__claude-in-chrome__*`)** 으로 — `browser_batch`/`navigate`/`computer` 도 같은 서버 것을 쓴다(섞어 부르면 빈 창이 열리고 `Preview not found`, 2026-09-24).
- 반환 객체 **키 이름**에 `authTk`·`token`·`cookie` 가 있으면 값이 없어도 `[BLOCKED: Sensitive key]` — authTk 는 `ready:true` 불리언으로만 확인.

## 좌표 fallback (fetch 가 안 될 때 — "어떻게든 성공")
fetch 실패해도 포기 말고 화면 캡처+좌표로 2차 시도:
- **해상도 달라도 매번 `zoom`/`screenshot` 으로 요소 위치를 찾아** 클릭(고정좌표 하드코딩 금지).
- ⛔ NEXACRO 입력칸 `Ctrl+A` 금지(문자 'a' 가 입력됨) → `End`+`Backspace` 로 비움.
- 입력 후 **Enter**(코드 매핑) → **우상단 조회 버튼까지** 눌러야 결과. 날짜칸 기본값 함부로 수정 금지(마스크 꼬여 옆 칸 오염).
- 결과는 `get_page_text`/`read_page`/`screenshot`+`zoom`(작은 글씨 확대)으로 읽기.
- 시도 순서 = **fetch → 좌표**, 둘 다 실패 시에만 화면 캡처해 사용자 안내(조용히 멈추지 말 것).

## 화면 직접 접근 URL + 알려진 화면코드
`http://p.kist.re.kr:8081/nxui/kistis/indexQ.jsp?target={모듈}::{화면}.xfdl&menuParam=sysCd%3DCUS`
| 업무 | target |
|------|--------|
| 카드영수증 조회 | `mis.fam::fam_0711` (svc `getList`) |
| 과제별관리(수행과제) | `mis.rdm::rdm_2011` (svc `doSearchMain`) |
| 직원 이름→사번 | `/popup/common/getRqstNoMgt/chkPopupValueSetting.do` (svc `empSchPopup`, 인사뷰 `VI_HRM_BAS_MGT`) |
| 소액검수신청 | `mis.mcs::mcs_0003` (kk-inspect 빌드 시 캡처) |
| 예실대비표(예산) | `mis.bdg::bdg_2030` (kk-budget 빌드 시 캡처) |
| 과제 심의요청 | `mis.rdc::rdc_2700` |

## endpoint 상세 (검색조건 ds_search · 응답 컬럼) — fetch 재현용
> 여러 skill 공용. fam_0711(카드)·rdm_2011(과제)은 kk-pay·kk-meeting·kk-inspect 가 공유.

| 기능 | POST | 요청 ds_search | 응답 핵심 |
|------|------|---------------|----------|
| 카드내역 (fam_0711) | `/mis/fam/fam0711/getList.do` (`fam_0711`/`getList`) | `FROM_DT`/`TO_DT`(YYYYMMDD) · `CARDTYPECD`(**5**=법인/**3**=연구비) · `CARDRESPEREMPNO`(사번) · `SEARCHID`(=사번) · `CUSTNM`(거래처 부분일치) · `CARDNO` · `CARDAPPRNO` | `CARDAPPRNO`(승인번호) · `CARDUSEYMD`(사용일) · `CUSTNM` · `USEAMT`(확정 원화) · `USETIME`(승인시간) · `CARDNO` · `PRGRSSTATNM` |
| 과제목록 (rdm_2011) | `/mis/rdm/rdm2011/doSearchMain.do` (`rdm_2011`/`doSearchMain`) | `SRCHKND=anyThing` · `SRCHPROCESS=0`(수행중) | `ACCCD`(과제번호) · `PROJNM`(과제명) · `KORNM`(책임자) · `PROJTYPE`(주관/공동) |
| 이름→사번 (chkPopup) | `/popup/common/getRqstNoMgt/chkPopupValueSetting.do` (`empSchPopup`) | Parameters만: `keyTableNm=VI_HRM_BAS_MGT`·`keyColNm=HOLD_OFFI`·`keyColVal=1`·`UP_COMM_COL_NM=EMP_NM`·`UP_COMM_CD={이름}`·`USE_RESNO=N` | 응답 **Parameters** `EMP_NO`(사번)·`EMP_NM`·`DEPT_NM`·`result` |
| 예실대비표 (bdg_2030) | `getBdgInfo` → `getMainList` | `BUDGYEAR=9999`(전체/누적) · `BUDGSBJCD`(과제) · `ACCCLSCD`(회계분류, getBdgInfo 취득) | 카테고리 `LEV=1` 행 `LASTBUDGAMT`(A)·`CTRLPERFAMT`(집행)·`BALNAMT`(잔액). 상세 → kk-budget `budget_fetch_spec.md` |

- ⚠️ `fam_0100`(사전결재) 등은 **검색조건을 줘도 서버가 회사/본부 전체를 반환**할 수 있다 → 응답에서 날짜·거래처·발의자로 **클라이언트 필터**. `fam_0711` 은 fetch 에 `CARDRESPEREMPNO`·`SEARCHID`(사번)를 주면 그 카드책임자 건만 온다(2026-09-27 실측) — 사번 없이 부르면 전체.
- ⚠️ `chkPopup`(이름→사번)은 화면 Enter 로는 동작하나 **동일 body 직접 fetch 는 빈 응답**(세션 의존 추정) → 사번은 `kiki.config.json` 에 1회 저장해 운용(좌표 fallback 도 가능).
- 금액 `USEAMT` 등은 `{hi,lo}` 객체로 올 수 있음(`.hi` 사용).

> ⚠️ **저장·제출(쓰기)은 회사 정책상 Edge 권장**(Chrome 저장 실패 사례 있음). **조회(fetch)는 Chrome 무방.** 단 제출 화면은 NEXACRO **form 직접제어**(좌표 0)로 Chrome 입력~저장 성공 사례 있음(kk-inspect) — 케이스별. 쓰기까지 fetch 로 되는지는 화면별 캡처·검증.
