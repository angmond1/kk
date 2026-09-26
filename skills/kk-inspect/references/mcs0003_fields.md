# 소액검수신청(mcs_0003) 검수창 — 필드맵 + Chrome MCP 절차

> `<config.xxx>`는 사용자 `config.json` 값으로 치환. 개인정보는 여기 적지 않는다.

## 화면 구조
- 진입: 소액검수신청(mcs_0003) — `http://p.kist.re.kr:8081/nxui/kistis/indexQ.jsp?target=mis.mcs::mcs_0003.xfdl&menuParam=sysCd%3DCUS` → 제목 "검수신청관리"(리스트) → 우상단 "검수신청"(`button1`) → 팝업 `mcs_0003_pop2`("소액검수신청")
- 팝업은 **window.open 별도 chrome page**(부모 탭과 다른 page). 부모 탭에서 `window._popupWin` 으로 호출하고 form 객체는 `application.popupframes.mcs_0003_pop2.form` 으로도 접근 가능. **파일첨부는 자동화 가능** (별도 page 패턴 — §파일첨부 참조). 부모 탭 스크린샷은 팝업 내용 안 잡힘(별도 page) → 필요하면 그 page 를 select 한 뒤 캡처.
- dataset 3종:
  - `ds_main_PRCT_INFO` — 공통정보 (검수일(CCK_DTM, =내일 영업일)·지역·건물·호실·지급신청자·검수신청자)
  - `ds_main_NOT_ASST_INFO` — **비자산** 물품정보
  - `ds_main_ASST_INFO` — **자산** 물품정보

## Chrome MCP 절차 (재사용 JS)

**0. 진입** — SKILL 대로 **chrome-devtools 창**(첨부까지 한 채널): `list_pages` → `navigate_page`(위 URL; 세션 없으면 먼저 `e.kist.re.kr` 로그인) → `wait_for` 7s → 제목 "검수신청관리" 확인. 도구 매핑은 `../../_shared/nexacro_file_upload.md` §4-6. (Claude in Chrome 으로 시작하면 첨부 단계에서 다시 로그인·재입력해야 한다.)

**1. 팝업 열기** (window.open 후킹 + 검수신청 버튼 클릭)
```js
(() => {
  if (!window.__nativeOpen) { const t=document.createElement('iframe'); t.style='display:none';
    document.body.appendChild(t); window.__nativeOpen=t.contentWindow.open.bind(window); t.remove(); }
  window.open=function(u,n,f){ window._popupWin=window.__nativeOpen(u,n,f); return window._popupWin; };
  const b=document.getElementById('mainframe_ChildFrame_form_button1'); const r=b.getBoundingClientRect();
  ['mousedown','mouseup','click'].forEach(t=>b.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window,clientX:r.x+r.width/2,clientY:r.y+r.height/2,button:0})));
  return 'clicked';
})()
```
→ wait 9s → 포획 확인: `(()=>{const p=window._popupWin; return p&&!p.closed&&p.application.popupframes.mcs_0003_pop2 ? 'OK '+p.document.title : 'no popup';})()`

**2. 공통정보 + 물품 입력** (비자산 예시 — ⚠️ 승인번호 input06 절대 입력 금지)
```js
(() => {
  const form = window._popupWin.application.popupframes.mcs_0003_pop2.form;
  form.CheckBox00.set_value('Y');                       // 카드/계산서 정보없음
  form.input9.set_value('<검수일 YYYYMMDD = 내일(다음 영업일)>'); // ★ input9=검수일(실제 검수받는 날), 신청일 아님 — 오늘·과거 금지, 기본 내일(토/일·공휴일이면 다음 영업일). 휴일값이면 네이티브 모달→frozen
  form.combo2.set_value('<config.location.region_code>'); // 예 LABT_00
  form.combo3.set_value('<config.location.building_code>');// 건물코드 (code_tables.md)
  form.output1.set_value('<config.location.room>');        // 호실 문자열
  form.radio2.set_value('N');                              // N=비자산 / Y=자산
  // ❌ form.input06 (승인번호) 입력 금지 → ds_main_PRCT_INFO.RLTDMGRNO DB 10자 초과 ORA-12899
  const d = form.ds_main_NOT_ASST_INFO;                    // 자산이면 ds_main_ASST_INFO
  if (d.getRowCount()===0) d.addRow(); d.set_rowposition(0);
  d.setColumn(0,'PROD_NM','<품명 (2품목↑이면 "첫품목 규격 수량ea 외 N종")>');
  d.setColumn(0,'MDL_NM','<모델/물품코드>');
  d.setColumn(0,'QTY',<2품목↑면 종수 / 1품목이면 수량>);
  d.setColumn(0,'UNIT','<단위코드: 2품목↑=0154 종, 무형=0155 기타, 1품목=품목 단위>');
  d.setColumn(0,'OBT_AMT',<원화 취득가: 세금계산서 합계 또는 fam_0711 USEAMT>);
  d.setColumn(0,'OBT_DT','<YYYYMMDD 거래/사용일>');
  return 'done';
})()
```

**3. 지급신청자** (config 행정원 이름으로 검색, 비동기 → 단계 분리)
- `form.btn_input26.click()` → wait 4s
- 검색: `(()=>{const f=window._popupWin.application.popupframes.empSchPopup.form; f.ds_search.setColumn(0,'EMP_NM','<config.payment_admin.name>'); f.btn_search.click(); return'search';})()` → wait 3s
- 결과 확인(확정 전): `(()=>{const f=window._popupWin.application.popupframes.empSchPopup.form; const n=f.ds_empList.getRowCount(); const rows=[]; for(let i=0;i<n;i++) rows.push({i, nm:f.ds_empList.getColumn(i,'EMP_NM'), dept:f.ds_empList.getColumn(i,'DEPT_NM')}); return JSON.stringify(rows);})()` → 이름이 정확히 같은 행이 **1건**일 때만 다음으로. 0건이면 이름 재확인, 2건 이상(동명이인·긴 이름 포함)이면 목록을 사용자에게 보여 고르게 한다.
- 선택+확정(그 행 번호 r 로): `(()=>{const f=window._popupWin.application.popupframes.empSchPopup.form; f.ds_empList.set_rowposition(r); f.btn_confirm.click(); return f.ds_empList.getColumn(r,'EMP_NM');})()` (사번은 채팅에 출력하지 않는다)

**4. 검증** (RLTDMGRNO 가 비어있어야 ORA 에러 안 남)
```js
(() => {
  const form=window._popupWin.application.popupframes.mcs_0003_pop2.form;
  const p=form.ds_main_PRCT_INFO, d=form.radio2.value==='Y'?form.ds_main_ASST_INFO:form.ds_main_NOT_ASST_INFO;
  return JSON.stringify({검수일:p.getColumn(0,'CCK_DTM'),지급신청자:p.getColumn(0,'FNSH_PTT_USER_NM'),지역:form.combo2.value,건물:form.combo3.value,호실:form.output1.value,
    RLTDMGRNO:String(p.getColumn(0,'RLTDMGRNO')),자산구분:form.radio2.value,
    품명:d.getColumn(0,'PROD_NM'),취득가:d.getColumn(0,'OBT_AMT'),취득일:d.getColumn(0,'OBT_DT')});
})()
```

**5. 첨부 = 자동(confirm 후, 아래 '파일첨부 자동화') / 신청 버튼 = 사용자.** 저장 성공 시 팝업 자동 닫힘. 다음 건은 1번부터 다시.

## 비자산 필드 (`ds_main_NOT_ASST_INFO`)
| 필드 | 컬럼 |
|------|------|
| 품명/모델 | PROD_NM / MDL_NM |
| 수량/단위 | QTY / UNIT |
| 취득가/취득일 | OBT_AMT / OBT_DT |
| 지급계정#1·2 | FNSH_ACC_1 / FNSH_ACC_2 (비자산은 보통 공란) |

## 자산 필드 (`ds_main_ASST_INFO`, radio2='Y')
| 필드 | 컬럼 | 입력 |
|------|------|------|
| 취득가/취득일 | OBT_AMT / OBT_DT | 값 |
| 도입방법 | IRTC_WAY | 콤보 01 국내/02 국외 |
| 구매물품분류 | PUR_PROD_CL_CD | 콤보 0040 연구장비/0041 공기구비품/0062 그래픽처리장치 |
| 자산표준분류 | ASST_STD_CL_CD | 검색팝업 |
| 품명/모델/원산지/수량/단위 | PROD_NM/MDL_NM/POO/QTY/UNIT | 값·콤보 |
| 생산업체/사용부서/사용자/사용책임자 | PRDN_FIRM/USE_OPS/PROD_USER/USE_RSPP | 검색팝업 |
| 설치장소/지급계정#1·2 | ISTL_PL/FNSH_ACC_1·2 | 값 / 검색(**자산은 과제계정 필수**) |
- 검색팝업 5종(생산업체·자산표준분류·사용자·사용책임자·지급계정) 내부구조는 자산 첫 실전 검수 때 확정(현재 코드 dataset 없음). empSchPopup 류 공통 패턴 예상.
- '사용자'=무기계약직 이상, '사용책임자'=비유동자산 직접 사용 부서장/연구책임자만.

## ⚠️ 함정
- **승인번호(input06→RLTDMGRNO) 입력 금지** — DB 10자, 24자 넣으면 `ORA-12899`. KIST 자체관리 칸이라 비운다.
- **⚠️ 검수일(input9=CCK_DTM) = "내일(다음 영업일)" — 오늘·과거 절대 금지 (2026-07-13 실전 교훈)**: input9 은 신청일이 아니라 **실제 검수받는 날**이다. 오늘로 넣으면 사용자가 재수정해야 한다 → **기본값 = 내일**(토/일·공휴일이면 다음 영업일). 휴일값 set 시 calendaredit 네이티브 모달 → 페이지 frozen(CDP 45초 타임아웃, 사용자가 모달 닫아야 복구). 애매하면 사용자에게 날짜 확인.
- **비자산은 묶음**("외 N종" 1행), **자산은 품목별 개별 등록**(자산번호 부여). 한 거래에 자산·비자산 섞이면 분리 신청.
- **⚠️ 신청 안 하고 창 닫으면 소실 (2026-07-07 실전)**: 입력·첨부 다 해도 신청 버튼을 **안 누르고 팝업을 닫으면 전부 날아간다**(임시저장 없음) → 그 건은 팝업 열기부터 재작성. 각 건 신청 버튼을 확실히 안내하고 저장 성공(팝업 자동 닫힘) 확인 뒤 다음 건으로.
- **⚠️ 첨부 개수 검증 필수**: `upload_file` 후 마지막 파일이 `ds_files` 에 비동기 반영이라 바로 확인 시 누락으로 보인다 → **마지막 upload 후 2-3초 대기 → `count===기대개수` 검증 → 부족분 재업로드**. (`../../_shared/nexacro_file_upload.md` §4-7)
- **⚠️ 세션 만료 / 포탈 주소**: 오래 후 `indexQ.jsp` 바로 navigate 시 `Your session has expired` alert 반복 → 먼저 `e.kist.re.kr` 포탈 로그인 확인 후 검수화면. 포탈=`e.kist.re.kr`(2026-07 변경), 이 검수화면은 `p.kist.re.kr:8081` 그대로. (`../../_shared/environment_setup.md`)
- **⚠️ 특수문자 파일명 alert → file input 재생성 (2026-09-08 실전)**: `+` 등 특수문자 파일명을 `upload_file` 하면 `특수문자는 첨부파일에서 사용 불가능합니다` alert. `handle_dialog` 로 닫으면 NEXACRO 가 `fileDiv1.extUp._input_node` 를 **새 요소로 교체**한다 → 기존 uid 로 다시 `upload_file` 하면 "성공" 응답이지만 `ds_files` 에 안 들어감(죽은 요소). **alert 처리 후엔 반드시 input 재노출 → `take_snapshot` 재촬영 → 새 uid 로 업로드 → 개수 검증**. 파일명은 사전에 `evidence_rules.md` 규칙으로 정리해 alert 자체를 피할 것. (`../../_shared/nexacro_file_upload.md` §4-8)

## 파일첨부 자동화 (2026-06-07 codex 실증 패턴 B / 2026-06-19 chrome-devtools-mcp 단일채널 ★권장)
공통 가이드: [`../../_shared/nexacro_file_upload.md`](../../_shared/nexacro_file_upload.md) **§4 패턴 B** + **§4-6 chrome-devtools-mcp 단일채널**.

**★ 권장 — chrome-devtools-mcp 한 채널로 입력·첨부·신청** (Claude in Chrome 은 팝업이 별도 window 라 첨부 불가). chrome-devtools-mcp 자체 **격리 Chrome** 에 **사용자가 KIST 1회 로그인**(방법 A) 후: `navigate_page`(mcs_0003) → `evaluate_script`(button1 클릭) → `list_pages`/`select_page`(mcs_0003_pop2 page) → `evaluate_script`(입력: `application.popupframes.mcs_0003_pop2.form`) → `take_snapshot`(`btn_selectFiles` "파일추가" uid) → `upload_file`(파일별).
- **⚠️ `upload_file` 은 cwd(workspace root) 안 파일만** 허용 → 증빙이 cwd 밖(예 다른 드라이브의 증빙 폴더)이면 **cwd 하위로 복사 후** 그 경로로(파일명 연속공백은 wildcard). `tmHeader=I` → 신청 시 함께 서버 업로드. 자세히 §4-6.

(Claude in Chrome `_popupWin` 경로로 **입력만** 하던 옛 방식도 유효하나 그땐 첨부는 사용자 수동.) mcs_0003_pop2 는 `window.open` 으로 **부모 탭과 다른 chrome page** 라, A 패턴(부모에 임시 버튼 + extUp.addFiles()) 은 **실패한다** — chooser 가 부모 page 에서 발생해 팝업 form 에 안 묶임.

대신 ↓ 순서로:
1. **별도 page 선택**: DevTools `list_pages` → URL 에 `popup.html?formname=mis.mcs::mcs_0003_pop2.xfdl&framename=mcs_0003_pop2` 식별 → `select_page <pageId>`.
2. **실제 "파일추가" 버튼 UID 찾기**: 그 page 에서 `take_snapshot` → 내부에 `btn_selectFiles` 이미지 + "파일추가" 텍스트 가진 버튼 노드의 uid (세션마다 다름 — 예: `8_305`).
3. **그 UID 에 upload_file 직접**:
   ```
   chrome_devtools.upload_file({ uid: "<uid>", filePath: "D:\\…\\파일.pdf" })
   ```
   파일별 반복 (mcs_0003 실증).
4. **첨부 확인** (그 page 의 console 에서):
   ```js
   (() => {
     const form = window.application?.popupframes?.mcs_0003_pop2?.form
               || window.application?.mainframe?.ChildFrame?.form;
     const ds = form?.fileDiv1?.ds_files;       // ★ 컴포넌트 = fileDiv1 (kk-pay 는 importFileUpload)
     const out = [];
     for (let i=0; i<ds.getRowCount(); i++) out.push({
       idx:i, name:ds.getColumn(i,"FLE_NM"),
       tmHeader:ds.getColumn(i,"tmHeader"),     // I=선택만 / S=서버반영 / D=삭제예정
       size:ds.getColumn(i,"FLE_SZ"), prog:ds.getColumn(i,"PROG")
     });
     return out;
   })()
   ```
- **컴포넌트명**: `fileDiv1` (확정, 2026-06-07).
- **자산·비자산 1건 = 첨부 1셋**(세금계산서/거래명세서 PDF + 물품사진 JPG). 자산·비자산 섞인 거래는 분리 신청이라 첨부도 각각.
- 사용자에게 첨부 파일 절대경로·개수를 표로 보여주고 confirm 후 진행.
- **신청(저장) 버튼은 사용자 confirm** 후 — 첨부까지 자동, 신청만 사용자.
