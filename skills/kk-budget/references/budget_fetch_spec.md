# kk-budget — 통합정보 예실대비표(bdg_2030) fetch 명세

> KIST 통합정보 예실대비표(`mis.bdg::bdg_2030`)를 좌표 없이 backend fetch로 조회한 명세.
> 좌표·해상도·모니터 무관. `window.application.authTk` + 세션쿠키. **2026-06-02 실증 + 화면 스크린샷 1:1 대조 검증.**
> 공통 fetch 유틸(`nexBody`/`post`/`parseRows`/`decodeEnt`)은 `../../_shared/kist_portal.md` 준용.

---

## fetch 3단계 흐름
1. **`queryProjects()`** — `rdm_2011`/`doSearchMain.do` → 본인 참여 과제 `[{acccd, name(PROJNM), pi(KORNM), projType(PROJTYPE)}]`.
   - ⚠️ `projType`(PROJTYPE)은 **과제유형(주관/공동)이지 본인 역할이 아님**. 본인이 과책(PI)인지는 **`pi == 본인 이름`** 으로 판별 (참여과제는 pi가 타인).
2. **`getBdgInfo(acccd)`** — `bdg2030/getBdgInfo.do` (ds_search: BUDGSBJCD, BUDGYEAR=9999) → 과제 메타 1행 + **`ACCCLSCD`**(다음 단계 필수).
3. **`getMainList(BUDGYEAR=9999, BUDGSBJCD=acccd, ACCCLSCD)`** — `bdg2030/getMainList.do` → 카테고리별 예산 완전체.

## getMainList request (ds_main) — 필수 3 컬럼
| 컬럼 | 값 | 비고 |
|---|---|---|
| `BUDGYEAR` | `'9999'` | ★ 전체/누적 의미. 실제 연도(2026 등) 넣으면 **빈 응답** |
| `BUDGSBJCD` | 과제번호(acccd) | |
| `ACCCLSCD` | 회계분류코드 | getBdgInfo에서 취득. ★ **없으면 세부항목(LEV2)만 와서 카테고리 소계 A/D가 누락** |

---

## getMainList response (`ds_datagrid1`) ↔ 화면 예실대비표 컬럼 완전 매핑

| fetch 컬럼 | 화면 컬럼 | 설명 |
|---|---|---|
| `BUDGITEMNM` | 예산항목 | `"NN : 이름"` (예 `05 : 내부인건비2`) |
| `BUDGITEMCD` | (코드) | 항목코드 (`05`) |
| `BUDGITEMCLSNM` | 항목 | `간접비` / `직접비` |
| `FRSTBUDGAMT` | 최초예산액 | |
| `BF_BALAMT` | 최종예산액 › 이월 | 전년이월 |
| `LASTBUDGAMT` | 최종예산액 › **합계(A)** | ★ **예산총액** |
| (별도컬럼 없음) | 최종예산액 › 당해 | = `LASTBUDGAMT − BF_BALAMT` 로 계산 |
| `CTRLPERFAMT` | **집행액(B)** | 실집행(결재완료된 지출) |
| `CTRLCAUSAMT` | 계류액(C) › 결재완료 | |
| `TEMPAMT` | 계류액(C) › 결재진행 | |
| `BALNAMT` | 예산잔액 **D = A−(B+C)** | ★ **잔액** |
| `BAL_RATE` | 잔액비율 | `"52.56%"` |
| `LEV` | (행 레벨) | `1`=카테고리, `2`=세부항목, `1`·`3`=소계 |
| `EXPITEMKORNM` | (세부 집행항목명) | LEV2일 때 세부명. LEV1은 `BUDGITEMNM`과 동일 |
| `CTRLCRTAMT`, `TEMPCTRLAMT` | — | 내부 집계용(미사용) |

**검산식**: `LASTBUDGAMT(A) = BALNAMT(D) + CTRLPERFAMT(B) + CTRLCAUSAMT(C완료) + TEMPAMT(C진행)`
(실증 검산 통과 — 한 카테고리에서 A = D + 집행 + 계류완료 + 계류진행 일치 확인)

## 행 추출 기준 (오집계 방지)
- **카테고리 행** = `LEV==='1'` **&&** `BUDGITEMCD` 있음 **&&** `BUDGITEMNM`이 `/^\d+\s*:/` 패턴.
- **소계 행** = `BUDGITEMNM`이 `"소계 [...]"` (BUDGITEMCD 없음, LEV 1 또는 3) — 보통 제외.
- **합계 행** = `BUDGITEMNM`이 `"합계"` (과제 전체) — 또는 카테고리 A 합산.
- **세부 행** = `LEV==='2'` (EXPITEMKORNM이 BUDGITEMNM과 다름; A 없음) — 카테고리 추출 시 **반드시 제외**.
  - ⚠️ "33 : 연구활동비1"은 카테고리 소계(LEV1, A=총액)와 세부행(LEV2, 예 "523 : 회의비" A=부분)에 **둘 다** 붙음 → `LEV==='1'` 안 거르면 세부값으로 오집계됨.

## 예산항목 코드(BUDGITEMCD) 전체 — 화면 전 항목
**간접비**: `07` 지식재산권관리비 · `30` 간접비(통합) · `61` 간접비(주요사업 통합)
**직접비**: `01` 내부인건비1 · `05` 내부인건비2 · `11` 연구시설·장비비 · `15` 연구재료비 · `19` 위탁연구개발비 · `29` 연구수당 · `31` 학생인건비 · `33` 연구활동비1 · `34` 연구활동비2
- 과제마다 일부만 존재. **추적 기본 6**: `15`·`11`·`33`·`34`·`05`·`31` (재료비·시설장비비·활동비1·활동비2·내부인건비2·학생인건비).
- 소계 행: `소계 [간접비]` · `소계 [내부인건비]` · `소계 [연구시설·장비비]` · `소계 [연구활동비]` · `소계 [직접비]`.
- → 사용자가 "간접비·인건비1·수당·위탁개발비도 보여줘" 요청 시 BUDGITEMCD로 즉시 추가 가능.

## getBdgInfo response (`ds_main`, 1행) — 과제 메타
- `ACCCLSCD` (getMainList 필수) · `TOTBUDGAMT` (과제 전체 예산) · `BUDGFROMYMD`/`BUDGTOYMD` (기간) · `PRJ` (사업명 요약) · `DEPTNM` (부서).
- ⚠️ **개인정보 컬럼**: `RDSBJEMPNM`(책임자명) · `EMPNOS`(사번) · `PARTRSCHER`/`AGENTEMPINFO` — 추출 시 주의, config·로그에 남기지 말 것.
- 화면 헤더의 **연구관리자/계정관리자**(행정원)는 별도 표시 — 개인집계 시 적요에 잡을 행정원명 후보.

## 개인집계(집행내역) 경로 — 보조 (2026-06-17 실전 보강)
- 예실대비표에서 **집행액(B)·계류액 셀 클릭** → 집행내역 팝업(`popBdgExeList_form_datagrid1`).
  - 결재완료(title "집행내역"): 적요 col3, **신청인 col9**, 금액 col13.
  - 계류(title "계류내역(결재완료)"): 적요 col2, 금액 col5(신청인 컬럼 없을 수 있음) → **헤더 '적요'/'금액'/'신청인' 텍스트로 컬럼 자동탐지**(고정 col 번호 신뢰 X — 화면·팝업마다 다름).
- ★ **이름은 적요 + 신청인 두 컬럼을 모두 봐야 한다** (실전 발견). 카테고리마다 사용자명 위치가 다르다:
  - **재료비·활동비1**(소모품·운영): 적요에 `"{연구자}/{내용}"`, 신청인은 보통 **행정원**(구매 대행).
  - **활동비2(연구활동비2 = 시험분석료; XPS·XRD·FE-SEM·Raman 등 외부분석 의뢰)**: 적요엔 **분석명만**(이름 없음), **연구자명은 신청인(col9)에만** 있다. → 적요만 필터하면 활동비2 본인분이 **전부 0으로 누락**된다(실측: 어느 과제에서 연구자 A 의 외부분석 3건이 적요필터로 0이었다가 신청인으로 잡힘).
  - 따라서 `filter_names` 매칭은 **`적요 + ' ' + 신청인` 을 합쳐** 부분일치 검사. (신청인은 `"사번 : 이름"` 형식)
  - 매칭 0건이면 속단 말고 **그 카테고리 집행내역 전체의 적요·신청인 raw 샘플을 떠서** 이름이 어느 컬럼·형식인지 확인(§함정의 raw 역검색과 동일 원리).
- ⚠️ `getBdgItemExp.do` 직접 fetch는 항목 미선택 시 빈 데이터셋 → 개인집계는 **화면 팝업 경로**가 확실(추가 fetch 캡처는 미검증). 과책 아닌 과제의 내부인건비2·학생인건비는 집행내역 권한 제한 가능.

## 개인집계 DOM 안정화 (자동화 브라우저 함정 — 2026-06-17)
일부 Claude-in-Chrome 환경에서 예실대비표 → 집행내역 **2단 팝업 연쇄**가 다음 이유로 느리거나 틀린다. fetch 화가 안 된 현재 개인집계의 최대 약점 — 가능하면 집행내역 fetch endpoint 캡처를 우선 시도하라.
1. **async IIFE 결과가 `{}` 로 반환** — `javascript_tool` 이 `(async()=>{...})()` 의 resolve 값을 못 받는 버전이 있음 → 결과를 **전역(`window.__x` 등)에 저장**하고 잠시 대기 후 **동기 read**(`JSON.stringify(window.__x)`)로 회수.
2. **백그라운드 탭 throttle** — Chrome 이 비활성 탭 timer 를 늦춰 팝업 연쇄가 90초+ 걸리고 **부분 집계(일부 팝업 누락)로 틀린 값**이 나옴(활동비1 이 11건→재조회 9건으로 바뀐 사례) → 작업 중 **Chrome 창을 foreground 로** 두게 안내.
3. **예실대비표 재오픈 불안정** — 같은 탭에서 예실대비표 팝업을 두 번째로 열면 grid 가 **빈 채(0행)** 뜰 수 있음 → `rdm_2011` 로 **navigate 리셋 후 1회만** 열고, grid·집행내역 팝업 로딩은 **polling**(행 수 > 0 될 때까지 최대 N회 대기) 후 파싱.
4. (구) **팝업 window 후킹** — 예전엔 집행내역을 별도 window 로 보고 `window.open` 을 후킹했으나, 현재 표준(아래 절·`exec_detail.js`)은 같은 페이지의 `application.popupframes` 를 읽는다 — 후킹 불필요.

## ⭐ 집행내역 팝업 — 셀클릭 핸들러 직접 호출 (2026-09-18 확립, **권장 표준**)
좌표 클릭(zoom 으로 행·열 찾기)은 과제마다 비목 구성이 달라 행 Y 가 밀리고, 한 번 어긋나면 엉뚱한 팝업이 뜨거나 아무 반응이 없다.
**NEXACRO 그리드의 셀클릭 핸들러를 코드로 직접 호출**하면 해상도·스크롤·행 위치와 완전히 무관해진다.

1. **메인 폼 잡기** — `application.mainframe.all[0].form` 이 `bdg_2030` 폼.
   (`mainframe.frames` / `mainframe.components` 로는 못 찾는다 — `all[0]` 이 ChildFrame.)
2. **그리드 찾기** — 폼 하위를 재귀로 돌며 `_type_name==='Grid'` 이고
   `getBindCellIndex('body','CTRLPERFAMT') >= 0` 인 컴포넌트(실측 `Div00/Grid10`).
3. **셀 인덱스는 조회해서 쓴다**(하드코딩 금지) — `grid.getBindCellIndex('body', <컬럼>)`
   → 집행 `CTRLPERFAMT`=8 · 계류완료 `CTRLCAUSAMT`=9 · 계류진행 `TEMPAMT`=10 · 잔액 `BALNAMT`=11.
4. **행은 rowposition 으로 지정** — 핸들러는 인자의 `e.row` 가 아니라 **그리드 현재 행**을 본다.
   `form.ds_datagrid1.set_rowposition(dsRow)` 를 **먼저** 하지 않으면 무조건 첫 행 팝업이 열린다(실측 함정).
5. **호출**
   ```js
   form.ds_datagrid1.set_rowposition(dsRow);
   form.Tab00_tabpage1_Grid01_oncellclick(grid, {row:dsRow, cell:c, col:c,
     fromobject:grid, fromreferenceobject:grid, eventid:'oncellclick'});
   ```
   함수명이 `Tab00_tabpage1_...` 인데 실제 그리드는 `Div00/Grid10` 로 **이름이 안 맞아도 이 함수가 맞다**
   (내부에서 CTRLPERFAMT/CTRLCAUSAMT/TEMPAMT 로 분기).
6. **대상 행 매핑** — `ds_datagrid1` 에서 `LEV==='1'` 인 행이 카테고리.
   **화면에 보이는 행 순서 ≠ dataset 행 인덱스**(LEV2 세부행이 사이에 섞임) → 반드시 dataset 인덱스를 쓴다.
7. **팝업 수신** — `application.popupframes` 최상단에 뜬다. 폼 종류가 셋:
   집행 `popBdgExeList` / 계류완료 `popPendList` / 계류진행 `popBdgCusExpList`.
   폼 로딩이 비동기라 **4~7초 대기** 후 `frame.form.ds_datagrid1` 을 읽는다(즉시 읽으면 `form`=null).
8. 🔴 **닫기는 반드시 팝업 폼의 `btn_close.click()`** — `form.close()` / `removeChild` / `destroy` 로 닫으면
   폼에 `modalPopDiv_popBdgExeList` Div 가 **잔류**해서, 이후 모든 셀클릭이
   `"Object with the ID [modalPopDiv_popBdgExeList] already exists."` 로 **조용히 실패**한다
   (팝업 0개·화면 무반응·에러도 안 보임 → 원인 찾기 매우 어렵다). 이미 이 상태면 **페이지 navigate 리셋**이 가장 빠른 복구.
9. **금액 컬럼 자동 판별** — 팝업마다 다르다. 후보 `RESOLAMT` / `CTRLCHNGAMT` / `INVOICE_RQSTAMT` 중
   **합계가 0 보다 큰 첫 컬럼**을 고른다. 날짜(`RESOLYMD`/`BUDGCTLYMD`)가 빈 행 = **합계행** → 제외.
   상세합이 화면 소계와 일치하는지 매번 검산.
10. **이름 매칭은 행의 모든 문자열 컬럼을 합쳐서** — 팝업별 컬럼명 차이(적요 `COMDSCCONT` vs `CONT`,
    신청인 `USERNM` vs `RQSTEMPNM`)를 그대로 흡수한다. 이름 뒤 글자가 한글/영숫자면 오탐으로 표시(경계 검증).

> 이 방식은 좌표·해상도 무관 + 비링크 셀 구분까지 되므로, 앞 절의 좌표 기반 DOM 우회보다 **항상 먼저 시도**한다.

## 실전 보강 — 재수집·진입·팝업 종류 (2026-09-24)
- **진입 경로**: `mis.bdg::bdg_2030` 을 열면 **수행중 계정 목록**(계정년도·계정번호·계정명) grid 가 먼저 뜬다. 계정번호 셀이 링크 → `find('<과제번호>')` → ref 클릭 → 4초 후 예실대비표 grid 로드 → `kkExe.init()`. 계정칸에 타이핑하는 방식(첫 입력이 씹힘)보다 확실하다.
- **`ds_datagrid1` 의 `LEV==='1'` 에는 소계행도 섞인다** — `BUDGITEMCD` 가 빈 행 = `소계 [간접비]`/`소계 [직접비]`/총계. `kkExe.cats()` 1.1 부터 제외.
- **계류진행(`TEMPAMT`) 팝업 = `popBdgCusExpList`** — 금액 `CTRLCHNGAMT`, 날짜는 조회일로 찍힘. 회의비 건은 적요가 `"일시: … / 장소: …"` 형식이라 **참석자명이 없다** → 신청인으로만 귀속 판단.
- **`parse()` 의 `rows` 는 샘플(최대 12건)** — 인물별 합·건수는 `by`/`mineN` 을 쓴다. 전체 행 확인은 `parse(names,true,cap)` 의 `all`.
- **증분 재수집**: 직전 인물 스냅샷과 `cats()` 의 exec/pd/pp 를 대조해 **변한 비목·새 계류만** 팝업을 다시 연다. 실측(13비목 과제): 전수 26팝업 → 증분 5팝업. 동일 비목은 '재사용' 표기 + "금액이 같은 취소·재등록 상쇄는 못 잡음" caveat.
- 검산 기준: `parse().sum`(상세합) == `hdr`(합계행) == 화면 해당 셀 값. 셋이 다르면 팝업 로딩 미완(대기 후 재파싱) 또는 잘못된 행.

## ⚠️ 인건비는 개인 귀속이 안 된다 (2026-09-18 실측)
- **내부인건비1**: 집행내역이 월별 `"{YYYY}년 {MM}월 프로젝트 내부 인건비 흡수"` 한 줄씩 — **개인명 없음**.
  (예실대비표 화면에서 이 셀만 **밑줄 없는 비링크**인 경우가 있다 = 드릴다운 자체가 없음.)
- **학생인건비**: `"학생인건비 풀링제 흡수({과제번호})"` 단 1건 — **개인명 없음**.
- **내부인건비2**(별정직)만 `"{YYYY}년{MM}월:별정직급여/퇴직충당금/법정부담금 {성명}"` 형식으로 개인이 보인다.
- → "특정 연구자가 이 과제에서 쓴 인건비"는 예실대비표로 답할 수 없다. 인사·급여 또는 참여율 화면을 안내할 것.
- **조회 권한 (2026-09-28 26N4090 실측, 과책·계정관리자 아님)**: 예실대비표의 행·금액은 **인건비 포함 전부** 보이고 fetch(`getMainList`)에도 그대로 온다. 막히는 것은 **인건비성 항목의 세부내역**뿐 — `bdg_2030` 의 셀클릭 핸들러가 `needRole=='Y'` 이고 행의 `EXPITEMKORNM` 에 `인건비`·`연구수당` 이 있거나 `BUDGITEMCD=='29'`(연구수당)·`합계`·`소계 [직접비]` 행이면 세션 역할(`0000`/`0080`/`0081`) 또는 계정책임자·지정 계정관리자인지 보고, 아니면 `gfn_showMsg('BDG_CHK_0143')` → `Ex.core.showMsg` → **네이티브 `alert()`**. 알림창이 떠 있는 동안 탭 전체가 멈춰 자동화 명령이 시간초과로 끝난다 → `exec_detail.js` 1.3 `open()` 이 셀클릭 동안 `window.alert` 를 가로채 `DENIED …` 로 돌려주고, `cats()` 가 `personnel:true` 로 미리 표시한다. 같은 과제의 재료비·활동비·시설장비비·간접비·위탁 세부내역은 참여자도 열린다(개인집계 가능).
- **수행중 계정 목록**(`bdg_2030` 첫 화면)에는 본인이 계정책임자·관리자인 계정만 있다 — 참여만 한 과제는 없으니 계정칸에 과제번호를 입력해 연다(입력만으로 바로 조회됨, 2026-09-28).
- 반대로 **지식재산권관리비(간접비)** 는 `"특허비용({성명},{특허번호})"` 형식이라 **개인 귀속이 된다** —
  개인 사용분을 집계할 땐 직접비만 보지 말고 이 항목 포함 여부를 사용자에게 확인(반환 건은 음수로 잡혀 순액 처리됨).

## 함정 요약
1. `BUDGYEAR='9999'` 필수 (연도 넣으면 빈 응답).
2. `ACCCLSCD` 필수 (없으면 LEV2 세부만 → 카테고리 A/D 누락).
3. 카테고리는 `LEV==='1'` 필터 (세부·소계에도 BUDGITEMNM 중복).
4. `&#32;` 등 entity → `decodeEnt`/`parseRows`.
5. 응답에 쿠키·authTk 섞이면 `[BLOCKED]` → 핵심 필드만 추출(값 마스킹).
6. 화면 스냅샷과 fetch 값이 다를 수 있음 — 집행이 실시간 진행 → **fetch가 더 최신**(버그 아님).
7. async fetch 결과는 `{}` 로 올 수 있음 → `window.__r` 저장 후 **다음 호출에서 동기 read**.
8. 반환 키 이름에 `authTk`/`token` → `[BLOCKED: Sensitive key]`(값이 아니어도) → 불리언 `ready` 만.
9. `LEV==='1'` 에 소계행(`BUDGITEMCD` 빈 값) 포함 → 코드 있는 행만 카테고리.
