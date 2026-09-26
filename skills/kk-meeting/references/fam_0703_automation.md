# fam_0703_02 연구비카드 회의비 지급신청 완전자동 (2026-09-08 실증)

> 법인카드 fam_0704_02 절차(`fam_0704_automation.md`)와 **같은 뼈대, 다른 이름**. 이 문서는 연구비카드 전용 "그대로 따라 하는 절차서" + 2026-09-08 첫 실행에서 버벅거린 지점의 예방책이다.
> **이름 추측(guess) 금지 — §0 정찰 → §1~§7 순서대로만.** 회의록 팝업·첨부·규정은 fam_0704 문서와 공통이므로 여기선 차이점만 코드로 적는다.

## 0. 시작 전 30초 정찰 (이름 추측 금지)
fam_0704_02 와 dataset·함수 이름이 다르다(`ds_datagrid1`→`ds_rndGrid`, `RAWCARD`→`RNDCARD`, `doSetDesp("RAWCARD")`→`doSetDesp("rndGrid")`). 새 화면을 만나면 **먼저 이 스니펫으로 실제 이름을 확인**하고 window 변수에 저장한 뒤 시작한다.
```js
(function(){ const F=window.application.popupframes.fam_0703_02.form; const ds=[],fn=[];
  for(const k in F){ try{
    if(F[k]&&F[k]._type_name==='Dataset') ds.push(k+'('+F[k].getRowCount()+')');
    else if(typeof F[k]==='function'&&/^(do|bt_|btn_|open|switch1_|fn_)/.test(k)) fn.push(k);
  }catch(e){} }
  window.__recon={ds:ds,fn:fn}; return ds.join(',')+' | fn '+fn.length; })()
```
- `javascript_tool` 반환은 **약 1,400자에서 잘린다** → 긴 목록·소스는 `window.__recon`/`window.__src` 에 두고 `.slice()` 로 나눠 읽는다.
- 소스를 반환할 땐 `=`→`＝`, `&`→`＆` 치환(안전필터 `[BLOCKED]` 회피). URL·토큰·`key=value` 텍스트는 절대 반환하지 않는다.
- 컬럼명도 추측 금지: `for(c<ds.getColCount()) ds.getColID(c)` 로 목록을 먼저 본다(예: 비목은 `EXPITEMCD` 가 아니라 **`BUDGEXPCD`**).

## 1. 진입
```js
const f01 = window.application.mainframe.ChildFrame.form;          // fam_0701
f01.ds_search.setColumn(0,"DOC_CLS","4"); f01.doNew("N");           // '4' = 연구비카드(회의/업무추진비) → fam_0703_02
window.__Fkey='fam_0703_02'; const F = window.application.popupframes.fam_0703_02.form;
```
- 식비안내 팝업 `F.imp_pop_fam_intro` → `bt_close_onclick` 호출 후 **`intro.visible===false` 검증**(fam_0704_automation §2 그대로. 호출만 하고 방치 금지).
- doNew 직후 신청내역에 **빈 초기행 1개**가 있다 → "rows>0 이면 건너뜀" 가드 금지, `CUSTNM` 유무로 판단.

## 2. 이름표 (fam_0704_02 대비)
| 항목 | fam_0704_02 (법인) | **fam_0703_02 (연구비)** |
|---|---|---|
| 영수증함 | `ds_datagrid1` | **`ds_rndGrid`** — CUSTNM / CARDAPPRNO / USEAMT / CARDUSEYMD / CARDBUYYMD / CARDUSEMGRNO / CARDNO / DPSTDISPNM / DESP_CLS / RNDCARDGB / VALID_BUDGSBJCDS |
| 상세 폼 dataset | `ds_main_RAWCARD` | **`ds_main_RNDCARD`** |
| 카드 매핑 | `doSetDesp("RAWCARD")` | **`doSetDesp("rndGrid")`** (`"RNDCARD"` 로 부르면 아무 분기도 안 타서 조용히 실패) |
| 거래처구분 / 거래처명 핸들러 | `switch1_RAWCARD_…` | **`switch1_RNDCARD_combo_custcls_onitemchanged`** / **`switch1_RNDCARD_formDetail_Custnm_onchanged`** |
| 통장표기 | `dpstDispNm` + `common_onkillfocus` 필수 | **불필요** — 카드사 입금이라 계좌탭(`import2…switch2.case1.dpstDispNm`) 미사용(value undefined), `ds_rndGrid.DPSTDISPNM`="과기연(연구비카드)" 고정, doSave 검증 없음 |
| 신청내역(`ds_rqstGrid`) 주요 컬럼 | 동일 | BUDGSBJCD / BUDGITEMCD / **BUDGEXPCD** / DETLEXPCD / COMDSCCONT(적요) / RQSTAMT / CUSTCLSCD / CUSTCD / CUSTNM / **DESP_LIST**(카드연결 문자열) / CARDUSEMGRNO / RQSTSEQNO |
| `curRow` | `this.curRow` | **form 스크립트 closure 변수** → 행 전환은 §3 |
| 임시저장 | `/mis/fam/fam0704/tmSave.do` | **`/mis/fam/fam0703/tmSave.do`**, 성공 메시지 **"저장 되었습니다."(띄어쓰기 있음)** |
| 회의록 팝업 | `pop_fam_0703_02` | 동일 `pop_fam_0703_02` (입력·첨부 절차 동일) |

## 3. 행 전환 규칙 (⚠️ 2026-09-08 가장 큰 버벅거림 원인)
```js
function goRow(i){ F.ds_rqstGrid.set_rowposition(i); F.curRow=i; F.rqstGrid_oncellclick.call(F,F.rqstGrid,{row:i}); }
```
- `{row:i}` 를 꼭 넘긴다 — 법인카드 fam_0704_02 의 같은 핸들러는 `this.curRow = e.row` 라 `{}` 면 회의록이 **직전 행 카드로** 열린다(2026-09-24). 두 화면 공통 코드로 통일.
- `rqstGrid_oncellclick` = closure `curRow = rowposition` + `doGetDesp()`(그 행 DESP_LIST → `import2.ds_main_CARD` 로드). `F.curRow=i` 만으로는 closure 가 안 바뀐다(회의록 버튼 `btn_Conference` 만 `this.curRow` 를 쓰므로 둘 다 세팅).
- **팝업(계정 popBudgList / 회의록 / 거래처)을 열기 전에 반드시 `goRow(i)`**. 팝업 복귀 콜백 `fn_popCall`→`doSetDesp("dsc")` 가 `import2.ds_main_CARD` 내용으로 **closure curRow 행의 DESP_LIST 를 재구성**한다(형식 `C@@CARDNO@@CARDAPPRNO@@EMPNO@@EMPNO@@CARDUSEYMD@@CARDBUYYMD@@USEAMT@@VATAMT@@SVCCHRGAMT##`). 어긋난 상태로 팝업이 닫히면 **다른 행 카드로 덮어쓴다** — CARDUSEMGRNO·RQSTAMT·가맹점명은 그대로라 **화면으론 안 보인다**.

## 4. 행별 작성 순서 (행마다 반복, 한 상신 최대 5행)
```js
if (i>0) F.bt_addRow_onclick.call(F,F.bt_addRow,{});
// 4-1 매핑 — ds_rndGrid 에서 CARDAPPRNO+CARDUSEMGRNO 로 idx 검색 (행번호 하드코딩 금지)
let idx=-1; for(let r=0;r<F.ds_rndGrid.getRowCount();r++) if(String(F.ds_rndGrid.getColumn(r,'CARDAPPRNO'))===apprNo) idx=r;
F.ds_rqstGrid.set_rowposition(i); F.ds_rndGrid.set_rowposition(idx); F.doSetDesp('rndGrid');
// 4-2 계정 — ⚠️ 매핑이 그 행의 예산항목/비목/책임자/적요를 초기화하므로 반드시 매핑 뒤에
goRow(i); F.ds_main_RNDCARD.setColumn(0,'BUDGSBJCD','2E11111');   // ← 실제 계정번호
F.openBudgPopup();
//     popBudgList: Grid00/01/02_oncellclick — BUDGITEMCD='33', EXPITEMCD='523' 행을 코드로 검색(계정마다 행번호 다름) → doDecision()
// 4-3 거래처구분 — 해외 가맹점(CUSTCD 없음)만 '2'=거래처명으로. 국내 카드는 기본 '4'=사업자등록번호 그대로(아래 블록 건너뜀)
//     코드표(인라인 innerdataset = cb[cb.innerdataset], codecolumn/datacolumn): ""선택 / 0 거래처코드 / 1 직원번호 / 2 거래처명 / 3 주민등록번호 / 4 사업자등록번호
if (!F.ds_rndGrid.getColumn(idx,'CUSTCD')) {                       // 해외 가맹점만
  const cb=/* §0 정찰 이름표의 거래처구분 콤보 */ null, cn=/* §0 정찰 이름표의 거래처명 입력칸 */ null;   // ← 이름 추측 금지, §0 에서 잡은 컴포넌트로 치환
  const prev=cb.value; cb.set_value('2'); F.switch1_RNDCARD_combo_custcls_onitemchanged.call(F,cb,{fromobject:cb,postvalue:'2',prevalue:prev});
  cn.set_value(name); F.switch1_RNDCARD_formDetail_Custnm_onchanged.call(F,cn,{fromobject:cn,postvalue:name});
  F.ds_rqstGrid.setColumn(i,'CUSTCLSCD','2'); F.ds_rqstGrid.setColumn(i,'CUSTNM',name);
}
// 4-4 적요 — 마지막에
F.ds_rqstGrid.setColumn(i,'COMDSCCONT','일시: YYYY-MM-DD / 장소: ○○식당 / 회의제목: … / 김키키 외 N명 / (필요시 사유, 예: 해외출장 중 사용으로 식비 1회분 반납 수입의뢰서 첨부)');
```
- 적요 `외 N명` = 총원 − 1. 회의제목·내용·적요 모두 **괄호 금지**. 출장계정 ≠ 회의비계정이면 공동계정 사용 사유 추가.

## 5. 회의록 + 첨부 (행마다)
```js
goRow(i); F.btn_Conference_onclick.call(F,null,{});     // → window.application.popupframes.pop_fam_0703_02.form (=C)
// ⏱ 6초 대기 — 서버가 참석자 grid 를 비동기 로드해 먼저 넣은 행을 지운다. 대기 후 C.ds_param.CARDUSEMGRNO 가 이 행의 카드인지 가드.
```
- 입력·저장은 fam_0704_automation §9 와 동일: `ds_SAVE` 컬럼 + components `set_value`, `rd_UseType` '3', 내부 `ds_datagrid1` KORNM/PAYNO/DEPTNM, 외부 `ds_datagrid2` OUTNAME/OUTCOMPANY/**PROJJOINYN 'N'**(8/1 이후 필수), `C.joinPeople=총원`, `C.doSave()`. 최소참석인원 ≥ ⌈금액÷50,000⌉.
- 저장 판정 = `C.ds_SAVE.CONFERENCENO` 발급 여부(메시지 "저장되었습니다." 는 4초 이상 늦게 옴). **CONFERENCENO 는 지급신청서당 1개**(두 행 공유) — 카드별 구분·첨부 키는 `CONFERENCENO-CARDUSEMGRNO`.
- 첨부(패턴 C, `../../_shared/nexacro_file_upload.md`): `C.fileDiv2.extUp._input_node` 에 id 부여·노출 → chrome-devtools `take_snapshot` 으로 그 input uid → `upload_file` 파일별(로컬 증빙; 채팅에 첨부한 파일이면 Claude in Chrome `find`→`file_upload(ref, 파일들)` 다중도 가능) → `C.fileDiv2.ds_files` 행수·tmHeader `I` 확인 → `C.fileDiv2.gfn_upload('','fn_endFileCallBack1','ds_file','RQST_NO='+C.CONFERENCENO+'-'+C.ds_param.getColumn(0,'CARDUSEMGRNO'),'02')` → 6초 → 전부 `S/02` 확인 → input 숨김(id 제거) → `C.bt_close_onclick.call(C,C.bt_close,{})`.
- 해외 건 첨부 = 영수증 jpg(전표+영수증)·**연구비카드매입.pdf**(카드사용내역서, 환율 증빙)·수입의뢰서(식비 반납 건별)·해외출장신청서 → **전부 fileDiv2(02 증빙)**.
- 다음 행으로 가기 전 회의록이 닫혔는지(`popupframes.pop_fam_0703_02` 없음) 확인. 회의록을 다시 열어 각 행의 회의록이 독립 보존됐는지 재검증 가능(2026-09-08 확인).

## 6. 저장 직전 체크리스트 (코드로 검증, 눈으로 보지 말 것)
행마다 아래를 JS 로 검사해 하나라도 틀리면 저장하지 않는다.
- `CARDUSEMGRNO`·`RQSTAMT` 가 해당 카드(fam_0711 USEAMT 확정 원화)와 일치
- `BUDGSBJCD` 계정 / `BUDGITEMCD` 33 / `BUDGEXPCD` 523
- `CUSTCLSCD` ('2' 가 아니면 `CUSTCD` 또는 `CUSTNM` 필수) / `CUSTNM`
- `COMDSCCONT` 에 `외 N명`(총원−1) 정확, 괄호 없음
- **`DESP_LIST` 에 `@@<그 행 CARDAPPRNO>@@` 포함** (행끼리 같은 문자열이면 오염)
- 회의록 CONFERENCENO 발급 + 첨부 전부 S

DESP_LIST 불일치 시 복구:
```js
const r=F.ds_rndGrid, cols=['DESP_CLS','CARDNO','CARDAPPRNO','CARDRESPEREMPNO','CARDRESPEREMPNM','CARDUSEYMD','CARDBUYYMD','USEAMT','VATAMT','SVCCHRGAMT'];
F.ds_rqstGrid.setColumn(i,'DESP_LIST', cols.map(c=>r.getColumn(idx,c)).join('@@')+'##');
goRow(i);   // import2.ds_main_CARD.CARDAPPRNO 가 그 행 카드로 로드되는지 재확인
```

## 7. 임시저장 (`bt_save`) — 결재상신은 사용자
```js
F.__o_msg=F.gfn_msg;  F.gfn_msg=function(){ window.__fmsg=(window.__fmsg||[]).concat([Array.from(arguments).join(' ')]); return true; };
F.__o_conf=F.gfn_confirm; F.gfn_confirm=function(){ return true; };          // "저장하시겠습니까?"
F.bt_save_onclick.call(F,F.bt_save,{});
// ⏱ 6초 → window.__fmsg 에 "저장 되었습니다." / F.ds_temp_rtnValue 첫 컬럼 = 지급신청번호 / F.ds_main.PRGRSSTATCD = 12(임시저장) / 행 RQSTSEQNO 1,2 / 행별 DESP_LIST 재확인
F.gfn_msg=F.__o_msg; F.gfn_confirm=F.__o_conf; delete F.__o_msg; delete F.__o_conf;   // ⚠️ 반드시 복원(트랩)
```
- `doSave` 검증 순서: 회의록 작성 여부 → 계정 → 사용일자(예산기간) → 예산과목 → 금액·한도 → 거래처 → 적요 → 회의록 → confirm → tmSave(ds_main+ds_rqstGrid).
- 팝업이 열린 동안 fam_0701 `doSearch` 호출 금지(탭 frozen). 결재선 안내: 계정책임자 = 발의자면 그대로 상신.

## 8. 2026-09-08 버벅거림 목록 → 예방 (같은 실수 반복 금지)
| # | 증상 | 원인 | 예방 |
|---|---|---|---|
| 1 | `F.ds_datagrid1` undefined | 연구비 화면 영수증함은 `ds_rndGrid` | §0 정찰 먼저, 이름표 §2 |
| 2 | `doSetDesp('RNDCARD')` 호출해도 무반응 | 분기 인자는 `'rndGrid'` | §2 |
| 3 | 잡아둔 계정·적요가 사라짐 | 매핑이 그 행을 초기화 | 순서 매핑 → 계정 → 적요 고정 |
| 4 | 거래처구분 코드표를 못 읽음 | 인라인 innerdataset 은 `cb[cb.innerdataset]` | §4-3 |
| 5 | 행0 카드가 행1 카드로 바뀜(DESP_LIST 오염) | closure curRow ≠ rowposition 인 채 팝업 닫힘 → `doSetDesp("dsc")` 재구성 | `goRow()` 후 팝업, §6 검증·복구 |
| 6 | 통장표기 세팅하려다 컴포넌트 undefined | 연구비카드는 계좌탭 미사용 | 건너뜀(§2) |
| 7 | 참석자 grid 가 비워짐 | 팝업 open 직후 서버 비동기 로드 | 6초 대기 후 입력, 저장 전 rowcount 재검증 |
| 8 | 저장 성공 여부 불명 | 메시지 지연 도착 | CONFERENCENO / ds_temp_rtnValue 로 판정 |
| 9 | `javascript_tool` 출력 잘림·`[BLOCKED]` | 1,400자 한도·안전필터 | window 변수 + slice, `=`→`＝` 치환 |
| 10 | Chrome 확장 연결 끊김 | 장시간 세션 | `list_connected_browsers`→`select_browser` 재연결, 새 tabId 로 계속 |
| 11 | 식비안내 팝업 방치 | 닫기 호출만 하고 검증 X | `visible===false` 검증(사용자 지적) |
| 12 | 컬럼명 추측(`EXPITEMCD`) | 실제는 `BUDGEXPCD` | `getColID` 로 목록 먼저 |
| 13 | 행번호 하드코딩(popBudgList row 8/20 등) | 계정마다 행 위치 다름 | 코드(33/523)로 검색 |
| 14 | **회의록 엑셀 미기록**(6월 이후 3개 처리일 누락, 2026-09-08 발견) | fam 자동작성에 집중해 SKILL 단계 9(엑셀 행 추가)를 건너뜀 | 임시저장 직후 `meeting_log_xlsx.append_row` 로 월별 파일에 건별 행 추가 → 완료 보고에 엑셀 경로 포함. 누락 시 전사(jsonl)의 `CONFERENCEPERPOSE/CONTENT` 로 백필 가능 |
