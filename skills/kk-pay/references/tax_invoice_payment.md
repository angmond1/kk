# fam_0702 일반 지급신청서(세금계산서) 자동작성

> 통합정보 fam_0701(지급신청서관리) → 신청서구분 **일반** → fam_0702 팝업. 전자세금계산서(매입) 기반 재료비·포스터 등 지급신청을 **부모탭 JS**로 자동작성.
> 2026-06-06 도출: 진입·영수증함 매핑·적요·계정(popBudgList)·사용구분·검수 연결·통장표기 자동화. 2026-07-07 **계좌 실명검증·첨부·상신까지 end-to-end 실증**(§0-0 순서 / §8-0 계좌검증 / §9-1-A 첨부).
> kk-meet `fam_0704_automation.md`와 같은 계열(부모탭 JS · popBudgList doDecision · killfocus). 차이: 카드매핑 → **세금계산서 영수증함 매핑**, **검수 연결**, **계좌 실명검증**. 2026-07-07 첨부·계좌검증·상신까지 **end-to-end 실증 완료**.
> 😺 **보고 머리표**: 계획 표·신청서 저장(상신 대기)·한 건 상신 확인·전체 완료·파일 정리 끝·오류·중단 때마다 보고 첫 줄에 `../SKILL.md` '보고 머리표' 표의 머리표를 붙인다(2026-09-30 사용자 규칙).

## ⚡ 0-0. 실전 작업 순서 (2026-07-07 시행착오 총정리 — 이대로만 하면 재작업 없음)
아래 원칙을 어겨서 **신청서 전체를 재작성**하고 한참 헤맸다. 다음엔 처음부터 이 순서로:

1. **⭐ 첨부 파일이 있으면 처음부터 `chrome-devtools` MCP 로 시작** (기존 Claude-in-Chrome 창에서 작성하다 첨부 단계에서 갈아타지 말 것 — 이번 최대 낭비).
   - 이유: Claude-in-Chrome `file_upload` 는 **세션공유 파일만** 허용 → 로컬 증빙 첨부 불가. 뒤늦게 chrome-devtools 로 옮기면 **로그인·신청서 작성을 처음부터 다시** 하게 됨. 세금계산서는 항상 첨부가 있으니 **기본이 chrome-devtools**. (첨부 없는 단순 조회만 Claude-in-Chrome 무방.)
   - chrome-devtools 는 **별도 브라우저**(KIST 로그인 세션 없음) → **사용자가 그 창에서 `e.kist.re.kr` 1회 로그인** 후 진행. 첨부파일은 미리 **cwd(세션 작업폴더) 하위로 복사** + 그림>1.5MB 압축(§9-1-A upload_file workspace 제약).
2. **포탈 진입 = `e.kist.re.kr` 먼저 로그인 → 업무화면은 `p.kist.re.kr:8081/nxui/…`** 🔴🔴 **새 브라우저·새 날·정오 이후·`about:blank` 상태에서는 예외 없이 `navigate('https://e.kist.re.kr')` 부터** — 업무화면 딥링크를 먼저 열면 `Your session has expired` alert + 무한 로딩(§0-3)이 되고 사용자가 '같은 실수 또 한다'고 지적한다(2026-09-09·09-12 2회 반복). 판정법: `list_pages` 가 `about:blank` 이거나 마지막 포털 작업이 오늘이 아니면 **세션 없음으로 간주**하고 e.kist.re.kr → 로그인 페이지(nsso)면 사용자에게 로그인 요청 → 포털 메인이 뜨면 그때 딥링크. 딥링크는 *로그인 확인 후*에만. (2026-07 포탈주소 e.kist.re.kr 로 변경, 단 **업무화면 URL 은 p.kist.re.kr:8081 그대로**). 세션 없이 업무화면 바로 열면 `Your session has expired`. ⚠️ `e.kist.re.kr`→`p.kist.re.kr/login.do` 가 **빈 페이지로 멈추면**(자동화 브라우저 SSO 리다이렉트 막힘) 사용자가 직접 포탈 로그인(북마크/주소창) → 메인 뜨면 이어서 진행.
3. **검수 선행 확인**: 물품 100~300만원(🔴 **VAT 포함 합계 기준**, 사용자 확정 2026-09-17)은 소액검수(mcs_0003) 완료돼 있어야 검수연결 가능. 합계 100만 미만은 검수 없이 비자산으로 저장(§7). mcs_0003 조회(btn_search)로 금액 매칭해 검수번호 확보, 미검수면 검수부터.
4. **작성**: fam_0701 → `doNew("N")` → fam_0702. 영수증함 매핑(§2, **금액 유니크면 금액으로·동액 다건이면 `NTS_ISSUEID`(승인번호)로 행 지정** — 같은 거래처 동일금액 주의) → 계정 popBudgList(§5) → 검수연결(§7, **동액이면 popTally 의 `PROD_NM`(품목)으로 검수번호 매칭**) → 통장표기 KIST_(§8) → 사용구분 이체(§6) → **적요 맨 마지막**(§4, doDecision·검수가 적요·사용구분 리셋하므로) → ⭐ **발급일 +1개월 지나 상신하는 건이면 「참고사항」에 지연 사유**(§4-1, 신청서 단위로 2문구 중 1개 랜덤·행마다 재추첨 금지).
5. **🔴 과제가 다르면 신청서를 나눠라 — 절대 `bt_reset`(초기화)로 이어 만들지 말 것**: 1신청서 저장 후 초기화로 항목 지우고 2신청서 채우면 **1신청서(직전 저장분)가 서버에서 유실**된다(실측: 과제 A 3건 저장·RQST_NO 발급됐으나 유실→재작성). **1신청서 저장 → `bt_close`(창 닫기) → fam_0701 `doNew("N")` 로 새 작성화면** 띄워 2신청서 작성.
6. **저장**(`bt_save`) → RQST_NO 발급. ⭐ **저장 확인창은 fam_0702 *별도 page* 에서 뜨므로 그 page 를 `select_page` 한 상태에서 명령**해야 `dialogAction:'accept'` 로 자동 처리(§0-1 — page 안 맞으면 timeout·"No open dialog", 그땐 사용자가 화면 확인).
7. **첨부**: 저장된 각 행에 세금계산서+거래명세서 → `_input_node` adoptNode + upload_file(§9-1-A). 저장된 신청서 재오픈은 **fam_0701 신청서번호(RQSTMGRNO) 셀 클릭 = `doNew("Y")`**.
8. **🔴 계좌 실명검증** (상신 필수): **fam_0702 page 를 `select_page` 한 상태(§0-1)에서** `btn_accCstm00` 핸들러를 **`import2` divForm 컨텍스트로** 호출 + `dialogAction:'accept'` → `TRANSFERSTAT_DESC==='정상처리'` 확인(§8-0). ⚠️ `Static00.visible`("계좌번호검증완료")은 **부정확** — 신뢰 금지. 검증 후 **저장**해야 유지(재오픈 시 미저장 검증 리셋). 전각공백/괄호 예금주도 통과.
9. **결재상신**(`bt_approval`) — ⭐ **사용자가 최종 확인 후 직접 상신한다 (Claude 는 상신하지 않는다, 사용자 지시 2026-07-08)**. ⭐ **신청서 하나가 완성(작성+저장+첨부+계좌검증)될 때마다 사용자에게 "상신하세요" 안내** → 상신 확인 후 다음 신청서로 넘어감 (여러 건 다 만들어놓고 한번에 상신 X → 문제 생기면 두 번 일). fam_0701 조회로 "최종결재자결재대기" 확인. 🔴 **안내 시 반드시 덧붙일 것 — "버튼 누른 뒤 알려주세요, 확인창은 제가 받습니다"**(chrome-devtools 가 dialog 를 가로채 사용자 화면엔 확인창이 안 뜨고 버튼이 먹통처럼 보인다, §0-2).

## ⚡ 0-1. 확인창(dialog) 처리 — fam_0702 별도 page (2026-07-08 규명, 핵심 — 이거 몰라 한참 헤맴)
**fam_0702 는 별도 browser page**(`popup.html?...fam_0702`, chrome-devtools `list_pages` 에 독립 page 로 나옴, **page id 는 팝업 열 때마다 증가**: 2→3…). **저장 confirm("저장하시겠습니까?")·계좌검증 alert("예금주명이…업데이트 되었습니다")는 그 fam_0702 page 에서 뜬다.**
- form 조작(매핑·계정·검수·통장·적요·첨부)은 **어느 page 에서든** `window.application.popupframes.fam_0702.form` 로 된다(부모 page 에서 popupframes 접근). **하지만 dialog 처리는 반드시 fam_0702 page 를 `select_page` 한 상태**여야 한다.
- ❌ **page 불일치 증상**: fam_0701 page 선택 상태로 저장/계좌검증하면 `dialogAction:'accept'` 가 그 dialog 를 못 잡아 **evaluate 가 45초 timeout**(dialog blocking), `handle_dialog` 는 **"No open dialog"**. (2026-07-08 이걸로 한참 헤맸다.)
- ✅ **해결 절차**:
  1. `list_pages` → fam_0702 page id 확인 (**매번** — 팝업 새로 열 때마다 id 증가, 예 신청서1=page2, 신청서2=page3).
  2. `select_page(그 id, bringToFront:true)`.
  3. **그 page 에서** `evaluate_script`(bt_save / 계좌검증 fire) + **`dialogAction:'accept'`** → 확인창 자동 처리됨. (page 선택돼도 form 은 `window.application.popupframes.fam_0702.form` 로 그대로 접근되고, 없으면 `window.application.mainframe.ChildFrame.form` fallback.)
  4. 서버콜백 지연으로 **남은 alert**(예: 계좌검증 여러 건 중 마지막 1건)가 있어 다음 도구 호출이 **"A dialog is open"** 에러를 내면 → **`handle_dialog('accept')`** 로 처리(fam_0702 page 선택 상태라 이번엔 잡힘).
- 첨부(`_input_node` adoptNode·snapshot·upload_file)도 fam_0702 page 선택 상태에서 그 page 기준으로 하면 된다(`_input_node.ownerDocument===document` 확인, snapshot uid 도 그 page prefix).

## ⚡ 0-2. 🔴 chrome-devtools 연결 중엔 *사용자가 직접 누르는* 저장·상신도 멈춘다 (2026-08-04 규명)
**CDP 가 그 브라우저의 모든 native dialog 를 가로채므로, Claude 조작뿐 아니라 *사용자가 마우스로* 저장·상신을 눌러도 `저장하시겠습니까?` confirm 이 화면에 안 뜬다.** 사용자 눈엔 **버튼이 먹통**으로 보인다(실측 호소: "저장이 안된다"). 화면 입력값은 멀쩡한데 아무 일도 안 일어나는 게 특징.
- ✅ **대응**: `take_screenshot` 등 아무 도구나 호출하면 **"A dialog is open (confirm: 저장하시겠습니까?)"** 로 정체가 드러난다 → **`handle_dialog('accept')`** 로 처리하면 즉시 저장/상신 진행.
- ⭐ **사용자에게 직접 상신을 맡길 때는 반드시 함께 안내**: "상신 버튼 누른 뒤 **눌렀다고 알려주세요** — 확인창은 제가 받겠습니다." (상신 여부 판단은 사용자, Claude 는 가로채진 창만 처리 = §0-0 9 의 사용자 직접 상신 원칙과 충돌 없음.) 안내 없이 맡기면 사용자가 먹통 화면 앞에서 헤맨다.
- 첨부용으로 노출한 `#kk_file_input` 은 화면 좌상단을 가려 사용자 확인을 방해하니, 첨부가 끝나면 **숨김**(`left:-9999px` 로 이동; `remove()` 는 NEXACRO 내부 참조가 깨질 수 있어 비권장).
- ✅ **상신 성공 신호 = fam_0702 page 자동 닫힘 (2026-08-04·09-09 2회 실측)**: 사용자가 상신을 누르면 팝업이 닫히고, 그 다음 `handle_dialog` 가 **`The selected page has been closed`** 에러를 낸다 — 이게 정상(확인창을 사용자가 직접 처리했거나 확인창 없이 상신됨). 절차: `list_pages` 로 팝업 부재 확인 → `select_page(1)`(fam_0701) → `doNew('N')` → 새 팝업 **page id 증가**(2→3) → `select_page(새 id)`. 새 창의 **영수증함 건수가 상신한 만큼 줄어** 있으면 상신 반영 재확인(15→12).

## ⚡ 0-3. ⚠️ KIST 포탈 세션 정오(12:00) 전체 리셋 — 저장분은 재작성 말고 재오픈 (2026-08-04)
**회사가 정오에 전 사용자 로그인을 리셋**한다(사용자 확인). 오전에 시작한 작업이 정오를 넘기면 세션이 풀려 저장·상신이 안 된다.
- **재작성 금지**: 이미 `bt_save` 로 **RQST_NO 가 발급된 신청서는 서버에 남아 있다**(첨부 `tmHeader='S'` 도 유지). 새로 만들면 **중복 신청서**가 생긴다.
- ✅ **복구 절차**: 사용자 재로그인 → fam_0701 조회 → **신청서번호(RQSTMGRNO) 셀 클릭 = `doNew("Y")`** 로 재오픈 → **계좌검증만 확인**(§8-0, `BANK_DPSTORNM` 빈값이면 재검증 후 저장) → 상신.
- 장시간 작업은 **정오 전에 저장까지 끝내두면** 세션이 끊겨도 잃는 게 없다.
- 🔴 **세션 만료 화면 증상 (2026-09-09 실측)**: 딥링크로 fam_0701/fam_0711 을 열면 **`Your session has expired` alert → 닫아도 `데이터 처리중입니다` 스피너가 무한 로딩**. 사용자 눈엔 "에러 팝업 뜨면서 계속 로딩" 으로 보인다(사용자 호소 그대로). 기다려도 절대 안 풀린다 — 서버 지연이 아니라 세션 문제. **대응**: alert 는 CDP 가 가로채므로 `handle_dialog('accept')` 로 닫고 → `navigate('https://e.kist.re.kr')` 로 **SSO 로그인 페이지(nsso.kist.re.kr)** 를 띄워 사용자가 로그인 → 딥링크로 재진입(정상이면 alert 없이 폼 로드). 로그인 여부는 `window.application.mainframe.ChildFrame.form.name==='fam_0701'` 이 25초 내 잡히는지로 판정. ⭐ **SSO 쿠키가 살아 있으면 사용자 재로그인 없이도 `e.kist.re.kr` 경유만으로 업무세션(p.kist.re.kr)이 복구**된다(2026-09-12 실측: 딥링크는 expired, e.kist.re.kr → `Portal(사용자명)` 메인 바로 표시 → 딥링크 정상). 즉 '세션 만료' alert 의 절반은 *로그인 부재* 가 아니라 *업무세션 미수립* — 항상 e.kist.re.kr 부터 가면 그냥 풀린다.

## 0. 핵심 함정 (먼저 읽기)
- **fam_0702는 별도 브라우저 window** (`popup.html?formname=mis.fam::fam_0702.xfdl`) — MCP 탭 그룹 밖이라 스크린샷·픽셀클릭 불가. **부모 탭에서 `window.application.popupframes.fam_0702.form` 으로 JS 제어**(읽기·쓰기 OK), 사용자는 그 창을 눈으로 확인.
- **GridClickEventInfo 생성자 인자 정렬이 NEXACRO 버전마다 다름** — 위치 인자로 row/cell 넣으면 `oldrow` 등 엉뚱한 곳에 들어간다. **생성 후 `ei.row`/`ei.cell`/`ei.col` 명시 세팅** 후 핸들러 호출.
- 셀클릭 핸들러가 명명 메서드(`Grid00_oncellclick`)면 그대로 호출, 아니면 `grid.oncellclick._user_handlers[i].handler.call(target, grid, ei)`.
- NEXACRO `components`는 iterable 아님 → 인덱스 접근. 중첩 컴포넌트(`f.X` 직접 접근 실패)는 **이름으로 재귀 walk**.
- Edit `set_value`는 바인딩 dataset 컬럼이 비면 재동기화로 안 남음 → **dataset 컬럼에 직접 `setColumn`**.
- **네이티브 alert/confirm 은 탭 CDP 를 frozen**(gfn_msg override 로 안 잡힘) → 사용자가 닫아야 복구. (계좌검증이 이걸 유발)

**🚨 이번 세션 실수 TOP — 반복 금지 (상세는 각 절):**
1. ⚠️ **적요·사용구분은 "맨 마지막"에** — `doDecision`(계정)·검수 dblclick·사용구분 변경이 `COMDSCCONT`(적요)·`RQSTDETLCD`(사용구분)를 **자동 리셋**한다. 계정·검수 다 끝낸 뒤 설정(§4·§6). 적요는 dataset 아닌 **컴포넌트 `formDetail_Comdsccont`** 로.
2. 🔴 **계좌 실명검증(`btn_accCstm00`)은 결재상신 필수** — 계좌번호 맞아도 미검증이면 "N번째 행의 계좌검증이 완료되지 않았습니다"로 상신 차단(통장사본 갈음 불가, **행마다**)(§8).
3. ⚠️ **자동화 중 `gfn_msg`/`gfn_confirm` 무력화했으면 사용자에게 넘기기 전 반드시 원복** — 안 하면 저장/상신 검증 메시지가 삼켜져 "버튼 눌러도 안 넘어감"으로 한참 헤맴(미해결/TODO#3).
4. ⚠️ **다건 행 전환은 `rqstGrid` row-click** 으로(`ds_rqstGrid.set_rowposition`은 상세내역이 안 바뀜 → 엉뚱한 행에 덮어씀). 전환 후 `ds_GNL.RQSTAMT`로 행 검증, 다건 적요는 저장 직전 화면 행별 확인(§10).
5. ✅ **첨부 자동화 가능** (codex 해법, 2026-06-07): NEXACRO `ExtFileUpload` 는 DOM input 이 없어 직접 `file_upload` 실패하지만, **`extUp.addFiles()` 호출하는 임시 DOM 버튼**을 팝업에 만들고 그 버튼에 `file_upload` → 네이티브 chooser 를 DevTools 가 가로채 파일 주입. **첨부만** 원하면 콜백 `fn_endFileCallBack` (숫자 없는 쪽), `fn_endFileCallBack1` 은 `doSave("S")` 까지 이어짐(§9-1).

공통 walk 헬퍼:
```js
function walk(o,nm,d){ if(d>13||!o)return null; var cs; try{cs=o.components;}catch(e){return null;} if(!cs)return null;
  for(var i=0;i<(cs.length||0);i++){ var c=cs[i]; if(c&&c.name===nm) return c; var r=walk(c,nm,d+1); if(r)return r; } return null; }
function fire(comp,evt,ei){ var hl=comp[evt]&&comp[evt]._user_handlers; if(!hl)return false; for(var i=0;i<hl.length;i++){(hl[i].handler||hl[i].func).call(hl[i].target||comp.form,comp,ei);} return true; }
```

## 1. 진입 — fam_0701 → 일반 신규 → fam_0702
fam_0701 **직접 진입**(경영정보>재무 메뉴 안 거침): `navigate` → `http://p.kist.re.kr:8081/nxui/kistis/indexQ.jsp?target=mis.fam::fam_0701.xfdl&menuParam=sysCd%3DCUS` (NEXACRO 9초 대기). 일반선택·신규는 **좌표 0**(JS 폼객체 제어 — 해상도 무관):
```js
var f01 = window.application.mainframe.ChildFrame.form;   // fam_0701
f01.ds_search.setColumn(0,"DOC_CLS","1");   // 신청서구분: 전체="" / 일반="1" / 연구비카드="3" / 법인카드="5" / 연구비회의="4" / 법인회의="G"
f01.doNew("N");                              // → window.application.popupframes.fam_0702.form (별도 window)
```

## 2. 영수증함에서 세금계산서 매핑
- 하단 탭 상세내역 | **영수증함**. 영수증함 grid = `gnlGrid` (bind `ds_gnlGrid`) = 전자세금계산서(매입) 목록.
- 컬럼: `NTS_ISSUEID`(국세청승인번호, **body cell 4**) · 공급일자 · 품목 · 총액 · `CUSTNM`(거래처) · `CUSTCD`(사업자) · 상태(수신승인).
```js
var f = window.application.popupframes.fam_0702.form;
var g = walk(f,'gnlGrid',0);
var R; var d=f.ds_gnlGrid; for(var i=0;i<d.getRowCount();i++){ if(String(d.getColumn(i,'NTS_ISSUEID'))===승인번호){R=i;break;} }
f.ds_gnlGrid.set_rowposition(R);
var ei=new nexacro.GridClickEventInfo(g,'oncellclick',false,false,0,0,0,0,0,0,0,0,'',0,0);
ei.row=R; ei.cell=4; ei.col=4;          // ★ NTS_ISSUEID 셀
fire(g,'oncellclick',ei);
// → ds_rqstGrid(요약) + ds_GNL(상세)에 CUSTNM·RQSTAMT·TAXBILLMGRNO(세금계산서관리번호)·USEDYMD·COMDSCCONT(적요=품목 자동) 매핑
```

## 3. 상세내역 = ds_GNL  (★ 위 그리드 ds_rqstGrid 아님)
- 화면 '상세내역'(노란 필수칸)은 **`ds_GNL`** 바인딩. 적요·계정·사용구분 등 입력 전부 ds_GNL.
- 위 '신청내역' grid 는 `ds_rqstGrid`(요약 목록) — 직접 편집 금지(저장은 ds_GNL 기준, 잘못 넣으면 불일치).

## 4. 적요
- 🔴 **적요 형식 `{거래처} {품목} 구매 / {구매자 성함} / {YYYY.MM.DD}` — 성함은 *구매자(사용자 본인)* 이지 계정책임자가 아니다** (사용자 확정 2026-09-17). 계정책임자가 타인인 과제라도 **구매자 본인**(kiki.config `user.name`)으로 쓴다. 이전 '적요명 = 지도박사 or 계정책임자' 는 **폐기**.
```js
// ⚠️ ds_GNL.setColumn 은 사용구분 변경/refresh 시 자동 품목명으로 재동기화됨 → 반드시 컴포넌트에 직접 set
var ac=walk(f,'formDetail_Comdsccont',0);   // 상세내역 적요(노란칸). 계산서 품목 컴포넌트 billDscCont 와 구분
ac.set_value("{거래처} {품목} 구매 / {구매자 성함} / {YYYY.MM.DD}");
fire(ac,'onchanged',{fromobject:ac});       // 이 컴포넌트 이벤트는 onchanged (onkillfocus/ontextchanged 없음)
```
구매자 성함 = 사용자 본인(kiki.config `user.name`) — 그 과제의 참여연구원이어야 한다. **참여연구원 아닌 이름 기재 시 정산 불인정** 주의.
> ⚠️ **계정 `doDecision`·검수 dblclick·사용구분(§6) 변경이 모두 `COMDSCCONT`(적요)를 자동 품목명으로 리셋**한다 → 적요는 **진짜 맨 마지막**(계정·검수·사용구분 다 끝낸 뒤), **컴포넌트 `formDetail_Comdsccont.set_value`** 로 설정. 다건이면 **행마다** 리셋되니 저장 직전 각 행 재확인.

## 4-1. ⭐ 참고사항 = 결재상신 지연 사유 (발급일 +1개월 초과 시 필수, 사용자 지시 2026-08-04)
**세금계산서 발급일자(`SUPPYYMD` / 계산서 작성일자)로부터 1개월이 지난 뒤 상신하는 건은 「참고사항」에 지연 사유를 반드시 기재**한다. 1개월 이내면 **적지 않는다**(불필요).
- **판정**: `상신일 > SUPPYYMD + 1개월` (예: 발급 07-14 → 08-14 이후 상신이면 기재 대상. 08-04 상신은 대상 아님). 다건이면 **행마다 각자의 발급일**로 판정.
- **문구 = 아래 2개 중 랜덤 1개**:
  - `거래명세서 재발급으로 인한 지연`
  - `제출 지연에 따른 지급신청 지연`
- 🔴 **한 지급신청서 안에서는 반드시 같은 사유로 통일** — 신청서(=fam_0702 창) 단위로 **한 번만 뽑아** 그 신청서의 모든 대상 행에 동일 문구를 넣는다. 행마다 다시 뽑지 말 것. (신청서가 2개면 각각 따로 뽑아도 무방.)
- **위치·컴포넌트 (✅ 2026-09-09 확정)**: 상세내역 「참고사항」 칸(적요 바로 아래, 안내문 `* 재무팀 담당자에게 전달사항 기입(이월금 등)`). **컴포넌트 `formDetail_Invtrsncont`**(Edit, `switch1/GNL` 하위, 라벨 `caption20`='참고사항') ↔ **컬럼 `ds_GNL.INVTRSNCONT`**(행 전환 시 ds_rqstGrid 에도 복사되어 행별 검증 가능). 설정은 적요와 같은 패턴 — `var rm=walk(f,'formDetail_Invtrsncont',0); rm.set_value(사유); fire(rm,'onchanged',{fromobject:rm});` → `ds_GNL.INVTRSNCONT` 즉시 반영, 저장·재오픈 후에도 유지(실측 확인). 탐색법(다른 칸 찾을 때): 폼 트리를 walk 하며 `name`/`text` 에 키워드(참고·Invtr)가 든 컴포넌트를 수집하면 라벨(Static)과 입력(Edit)이 같이 잡힌다.
- **실측 예(2026-09-09 상신)**: 4건 중 **발급 08-03 건만 대상**(한도 09-03 < 상신 09-09). 그 신청서(3건)는 「거래명세서 재발급으로 인한 지연」 추첨 → **대상 행만 기재, 나머지 행은 빈칸**(대상 아닌 행엔 넣지 않음). 추첨은 작업 시작 시 python `random.choice` 로 **신청서별 1회** 뽑아 두고 진행. 🔴 **경계 건 주의**: 발급 08-10 건은 한도 09-10 이라 09-09 상신은 정상이지만 **하루 밀리면 대상** — 경계 건이 있으면 사용자에게 '오늘 안에 상신' 을 명시 안내하고, 다음날로 넘어가면 재오픈해 참고사항을 채운 뒤 상신.
- **설정 시점은 적요와 같이 맨 마지막**(§4) — `doDecision`·검수 dblclick 이 상세 필드를 리셋하므로 계정·검수 다 끝낸 뒤. 적요와 동일하게 **컴포넌트 `set_value` + `onchanged` fire** 패턴으로 넣고, 저장 직전 행별로 값이 남았는지 재확인.

## 5. 지급계정 (popBudgList — kk-meet 방식 동일)
계정번호 입력 `formDetail_BudgSbjtNo` + 검색버튼 `btn_formDetail_BudgSbjtNo`.
⚠️ **계정번호를 먼저 dataset에 넣고** 검색 — 빈 검색은 전체 과제 로드(매우 느림).
```js
f.ds_GNL.setColumn(0,"BUDGSBJCD",계정번호);    // ★ dataset 직접 (Edit set_value 안 남음). 검색 필터로 쓰임.
var btn=walk(f,'btn_formDetail_BudgSbjtNo',0);
fire(btn,'onclick',{fromobject:btn});          // → popBudgList (해당 계정만 필터, 빠름)
```
popBudgList = kk-meet popBudgList 와 동일 구조 (Grid00 계정/Grid01 예산/Grid02 비용/Grid03 세부 + doDecision):
```js
var P=window.application.popupframes.popBudgList.form;
P.ds_BudgList.set_rowposition(0);                        // 계정 (1건 필터)
var e0=new nexacro.GridClickEventInfo(P.Grid00,'oncellclick',false,false,0,0,0,0,0,0,0,0,'',0,0); e0.row=0;e0.cell=0; P.Grid00_oncellclick(P.Grid00,e0);
var r1; var di=P.ds_ExpnItmList; for(var i=0;i<di.getRowCount();i++){if(String(di.getColumn(i,'BUDGITEMCD'))===예산항목){r1=i;break;}}   // 재료비=15
P.ds_ExpnItmList.set_rowposition(r1);
var e1=new nexacro.GridClickEventInfo(P.Grid01,'oncellclick',false,false,0,0,0,0,0,0,0,0,'',0,0); e1.row=r1;e1.cell=0; P.Grid01_oncellclick(P.Grid01,e1);
var r2; var dc=P.ds_ExpnCstList; for(var i=0;i<dc.getRowCount();i++){if(String(dc.getColumn(i,'EXPITEMCD'))===비용항목){r2=i;break;}}        // 재료구입비=330
P.ds_ExpnCstList.set_rowposition(r2);
var e2=new nexacro.GridClickEventInfo(P.Grid02,'oncellclick',false,false,0,0,0,0,0,0,0,0,'',0,0); e2.row=r2;e2.cell=0; P.Grid02_oncellclick(P.Grid02,e2);
P.ds_ExpnSubItmList.set_rowposition(0);                  // 세부
P.doDecision();   // → ds_GNL.BUDGSBJCD/BUDGITEMCD/BUDGEXPCD/DETLEXPCD/BUDGSBJNM(과제명)/RDSBJEMPNM(계정책임자)/REMAMT(잔액). popBudgList 닫힘.
```
비목 (project_code.md / 분류코드별): **재료비 = 예산 15 연구재료비 / 비용 330 재료구입비**. **포스터 = 예산 33 연구활동비1 / 비용 359 인쇄비 + 용도구분 92 그밖의비용**.
> ⚠️ doDecision 으로 채워지는 잔액(REMAMT)이 신청금액 이상인지 확인.

## 6. 사용구분 = 이체  (⚠️ 반드시 §5 계정 doDecision **이후**에 설정)
콤보 `formDetail_Payuseclscd`(지급사용구분). 항목: 1=현금 / 7=지로(수기) / **6=이체** / J=자동이체(수기) / H=위탁연구비. (대부분 이체)
> ⚠️ **순서 함정**: 계정 popBudgList `doDecision()`·검수 dblclick 이 `RQSTDETLCD`(사용구분)·`COMDSCCONT`(적요)를 **초기화**한다 → 사용구분·적요는 **계정·검수 다 끝낸 뒤 맨 마지막에** 넣어야 남는다. (행추가 2건째에서 doDecision 전에 넣었다가 "-- 선택 --"·자동품목명으로 리셋된 사례.)
```js
var c=walk(f,'formDetail_Payuseclscd',0); c.set_value("6");
fire(c,'onitemchanged',{fromobject:c,postvalue:'6',prevalue:'',post:6,pre:-1});   // → ds_GNL.RQSTDETLCD=6
```

## 7. 검수 연결 (검수 완료 건)
검수신청구분 라디오 `rdTallyCheck`: 1=자산포함 / **2=비자산** / 3=검수대상아님(용매·가스류). 비자산 먼저 선택 → 조회 빠름. 승인검수번호 조회 버튼 `btnSetMapTally`.
- ⭐ **100만원 미만 물품 = 검수 불요 — 🔴 기준 금액은 *세금(VAT) 포함 합계*** (사용자 확정 2026-09-17 "잘 기억해"): 공급가액이 아니라 세금계산서 **합계금액(=영수증함 RQSTAMT)** 이 100만원 미만일 때만. 예: 공급가 300,000+세 30,000 = **330,000 < 1,000,000 → 검수 불요** / 공급가 950,000+세 95,000 = 1,045,000 → **검수 필요**. popTally 에 해당 건이 안 뜨는 게 정상. **`rdTallyCheck='2'`(비자산) 그대로 두고 검수번호 빈칸으로 `bt_save`** 하면 검증 없이 통과(`저장하시겠습니까?`→`저장 되었습니다.` — 합계 NNN,NNN원 소모품 건으로 실측). '3=검수대상아님' 으로 바꿀 필요 없음. popTally 를 열어놓고 선택 안 할 땐 `window.application.popupframes.popTally.form.close()` 로 닫는다. popTally 목록은 **선택한 계정(과제) 기준으로 필터**되므로 다른 과제 검수는 안 보인다.
- 저장 검증 메시지를 잡고 싶으면 `f.gfn_msg/gfn_alert/gfn_confirm` 을 **호출 기록만 하고 원함수를 그대로 호출하는 래퍼**로 잠깐 감싼 뒤 저장 직후 반드시 원복(§0 실수 TOP 3 참조) — 이번 실측 `gfn_confirm:저장하시겠습니까?` → `gfn_msg:저장 되었습니다.`.
```js
var rd=walk(f,'rdTallyCheck',0); rd.set_value("2");
fire(rd,'onitemchanged',{fromobject:rd,postvalue:'2',prevalue:'1',post:2,pre:1});
fire(walk(f,'btnSetMapTally',0),'onclick',{fromobject:0});       // → popTally(검수 조회)
// ⚠️ 첫 조회 fire 로 popTally 가 안 열리거나 ds_datagrid1 미로드인 경우 잦음(race) → popTally 없으면 btnSetMapTally 재발화 + 3~4초 대기. (실측: 건1·건2 모두 첫 발화 실패→재발화 성공)
var PT=window.application.popupframes.popTally.form;
// 매칭은 검수번호(PRCT_NO) 우선 / 금액(TOTAMT) — PROD_NM.indexOf 는 null 위험(String() 가드 필수). 비자산이면 보통 해당 검수 1건만 필터됨.
var Rt; var dt=PT.ds_datagrid1; for(var i=0;i<dt.getRowCount();i++){ if(String(dt.getColumn(i,'PRCT_NO'))===검수번호 || String(dt.getColumn(i,'TOTAMT'))===금액){Rt=i;break;} }
PT.ds_datagrid1.set_rowposition(Rt);
var gT=walk(PT,/*ds_datagrid1 bind grid name 'datagrid1'*/'datagrid1',0);
var eT=new nexacro.GridClickEventInfo(gT,'oncelldblclick',false,false,0,0,0,0,0,0,0,0,'',0,0); eT.row=Rt;eT.cell=1;
PT.datagrid1_oncelldblclick(gT,eT);   // 더블클릭=선택 → ds_GNL.PRCT_NO 연결, popTally 닫힘
```
검수 목록 컬럼: `PRCT_NO`(검수번호) · `TOTAMT` · `PROD_NM`(품목) · `COMPLETE_DATE` · `TALLY_STATUS`(완료) · `RGST_USER_NM`.

## 8. 계좌 (계좌 버튼 패널) — ✅ 실명검증 **상신 필수** (2026-07-07 통과법 규명)
패널 컴포넌트: 입금은행 / `dpstAccNo`(계좌번호) / `dpstOrNm`(예금주명) / `dpstAmt`(입금액) / `dpstDispNm`(통장표기). 검증 버튼 `btn_accCstm00`("계좌번호 검증요청") / `btn_accCstm`("자주사용계좌조회") / `btn_accCstmReg`("자주사용계좌등록").

### ⭐ 8-0. 계좌 실명검증 통과법 (2026-07-07 규명 — 장기 "미해결" 해결) — 최우선
그동안 "미해결"이던 진짜 원인: **`btn_accCstm00` 의 onclick 핸들러가 참조하는 `this.ds_main_DPST` 가 fam_0702 form 이 아니라 계좌 탭 div(`import2`) 의 자식 form 에 있다.** fam_0702 form 기준으로 fire 하면 `this` 가 틀려 검증 API(`getChkDpstStat.do`)가 **아예 호출 안 됨**(에러·gfn_msg·network 요청 전부 없이 무반응 → "미해결"로 오인).
- **계좌 검증 dataset = `import2` divForm 의 `ds_main_DPST`**. btn_accCstm00 parent 체인: `btn → case1(Tabpage) → switch2(Tab) → useGroup(Div) → import2(Div ★ds_main_DPST 보유) → fam_0702(Form)`. 컬럼: `DPSTBANKCD`·`DPSTBANKNM`·`ACCOUNTNO`·`DPSTORNM`(예금주)·`DPSTAMT`·`DPSTDISPNM`·`BANK_DPSTORNM`(은행조회 실명, **검증 전 빈값**)·`TRANSFERSTAT`·`TRANSFERSTAT_DESC`.
- **검증 실행 = 핸들러를 `import2` 컨텍스트(this=import2)로 호출**:
  ```js
  var btn=walk(f,'btn_accCstm00',0);
  var af=btn; while(af && af.ds_main_DPST===undefined) af=af.parent;   // ★ import2 divForm 탐색
  var h=btn.onclick._user_handlers;
  for(var i=0;i<h.length;i++){ (h[i].handler||h[i].func).call(af, btn, {fromobject:btn}); }  // ★ this=af
  // → getChkDpstStat.do 호출 → 은행 실명검증 → af.ds_main_DPST 갱신
  ```
- **✅ 검증 성공 지표 = `af.ds_main_DPST.getColumn(0,'TRANSFERSTAT_DESC')==='정상처리'`** (+ `BANK_DPSTORNM` 이 은행 조회 예금주로 채워짐). ⚠️ **`Static00`("계좌번호검증완료") 컴포넌트의 `visible` 은 부정확** — 검증 안 됐어도 켜져 있음(실측). **절대 신뢰 말고** `TRANSFERSTAT_DESC`/`BANK_DPSTORNM` 로 판단.
- **예금주 전각공백·전각괄호 문제없음**: `○○인터내셔날　주`(전각공백)·`（주）○○테크`(전각괄호) 모두 은행 조회 일치로 **정상처리**. (§8 이전의 "예금주 mismatch 의심"은 기우 — 자동 매핑값이 은행 등록명과 실제 일치.)
- **행별**: 다건은 각 행 `rqstGrid_oncellclick`(ei.cell=2) 전환 → **계좌 로드 대기 2.5~3초**(전환 직후 바로 검증하면 `ds_main_DPST` 빈값 → 검증 실패, 실측: 신청서2 행0이 이 타이밍으로 첫 시도 실패) → `ACCOUNTNO` 채워진 것 확인 후 발화.
- **chrome-devtools MCP `dialogAction:'accept'`** 로 성공/실패 네이티브 alert 자동 처리(Claude-in-Chrome 은 frozen 되니 chrome-devtools 권장).
- ⚠️ **자주사용계좌 자동검증 착시 + 재오픈 리셋**: 자주사용 등록 계좌는 매핑 시 자동 검증돼 보이나(Static00 켜짐), **신청서 재작성/`doNew("Y")` 재오픈 시 미저장 검증은 리셋**됨 → `BANK_DPSTORNM` 빈값이면 재검증. 검증 후 **반드시 `bt_save` 저장**해야 상신까지 유지(저장 안 하면 상신 시 「N번째 행 계좌검증 미완료」 차단).
- 전자세금계산서 매핑 시 계좌가 거래처 기준 자동 채워지기도 함. ⭐ **통장표기 = `KIST_`** (KIST 표준 입금자표기 — 2026-06 확정, 이전 연구원명/적요명 표기 폐기). 비거나 다른 값이면 `KIST_` 로 덮어쓴다:
```js
var disp=walk(f,'dpstDispNm',0); disp.set_value("KIST_");
fire(disp,'onkillfocus',{fromobject:disp,fromreferenceobject:disp});   // killfocus 동기화 (kk-meet 교훈)
```
- ⭐ **통장사본 대조** (자동): 첨부 통장사본/사업자등록증 PDF → PyMuPDF 로 PNG 렌더 후 Read(스캔본은 텍스트 0) → 계좌번호·예금주·은행·사업자번호를 패널과 대조.
  ```python
  import fitz; doc=fitz.open(pdf); doc[0].get_pixmap(dpi=190).save(png)   # → Read(png) 시각 확인
  ```
- ✅ **계좌번호 검증요청 `btn_accCstm00`** = 은행 실명검증 (⭐ **통과법 = §8-0**; Claude-in-Chrome 은 네이티브 alert 로 탭 CDP frozen → **chrome-devtools `dialogAction:'accept'` 권장**). 아래는 8-0 규명 전 기록(참고):
  - **2026-06-06 미해결(→ 8-0 해결)**: alert "계좌정보를 다시 한 번 확인해주시기 바랍니다" 는 예금주 mismatch 가 아니라 **`this` 컨텍스트 오류(fam_0702≠import2)로 검증 API 자체가 안 돌아 생긴 오인**. 예금주 전각괄호/전각공백은 실제 은행 등록명과 일치해 정상처리됨(8-0).
  - 🔴 **계좌검증 = 결재상신 필수 (2026-06-07 확정)**: 계좌번호가 통장사본과 일치해도 `btn_accCstm00` 실명검증을 **완료(검증완료 플래그)** 하지 않으면 결재상신 시 **「N번째 행의 계좌검증이 완료되지 않았습니다」** 메시지로 차단된다. **통장사본 대조만으론 갈음 불가.** 묶음(다건)이면 메시지가 행을 지정("1번째 행…") → **행마다 계좌검증 필요**.
  - 💡 **예금주명(`dpstOrNm`)은 자동채움값 신뢰 말고 통장사본/거래명세서 표기에 정확히 맞출 것** (실명검증 mismatch 1순위 의심): 매핑 자동값이 `（주）○○`(전각 괄호·*주식회사*)인데 실제는 *유한회사*거나 통장/거래명세서엔 접두 없는 `○○`로 적힌 사례 → 검증요청 전 `dpstOrNm` 을 통장 예금주와 글자 그대로 일치시켜 시도.

## 9. 첨부 → 저장 → 결재상신

### 9-1. 첨부 자동화

#### ⭐ 9-1-A. chrome-devtools MCP 방식 (2026-07-07 실증 — 10파일 성공, **권장**)
Claude-in-Chrome `file_upload` 는 **세션 공유 파일만** 허용해 로컬 경로(외부 드라이브·cwd 복사본)까지 거부 → 막힘. **chrome-devtools MCP `upload_file`(filePath 자유, 단 workspace roots=세션 cwd 하위만)로 해결.** fam_0702 는 iframe(`framename=fam_0702`)이라 팝업 요소가 `take_snapshot`(a11y)·메인 `querySelector` 에 안 잡힘 → **`ExtFileUpload.extUp._input_node`(INPUT[file] multiple, 팝업 iframe 소속)를 메인 document 로 `adoptNode` 하면 snapshot 에 `button "파일 선택"` 으로 노출** → 그 uid 로 upload_file.
```js
// 준비: 첨부파일을 cwd 하위(_tmp\attach)로 복사(workspace roots 제약) + 그림>1.5MB Pillow 압축(q85). PDF 10p 미만.
var fu=walk(f,'importFileUpload',0); var cur=fu.extUp._input_node;
// 1) 행 전환 (그 행 RQST_NO 로 붙음) — ei.cell=2 필수(set_rowposition 만으론 detail·ds_files 안 바뀜)
f.ds_rqstGrid.set_rowposition(row); f.rqstGrid_oncellclick(walk(f,'rqstGrid',0), ei);  // ei.row=row,cell=2,col=2
//    ⚠️ 전환 직후 ds_files 가 이전 행 값(로드 지연)으로 잠깐 보임 → 재확인해 그 행 것(0건) 확인 후 진행
// 2) 행 전환마다 _input_node 새로 생성됨 → 구 input 제거 + 현재 것 adopt + id/visible
document.querySelectorAll('input[type=file]').forEach(function(x){ if(x!==cur) x.remove(); });
if(cur.ownerDocument!==document) document.body.appendChild(document.adoptNode(cur));
cur.id='kk_file_input'; cur.style.cssText='position:fixed;left:10px;top:10px;z-index:2147483647;width:240px;height:36px;opacity:1;';
// 3) take_snapshot → "파일 선택" uid → upload_file(uid,세금계산서) → upload_file(uid,거래명세서)
//    (multiple 이라 각 upload 의 change→NEXACRO addFiles 누적, ds_files tmHeader='I')
// 4) 서버 반영(첨부만·저장X = fn_endFileCallBack 숫자없는쪽):
var rqstNo=String(f.ds_rqstGrid.getColumn(row,'RQST_NO'));
f.gfn_setColumn(0,f.ds_main,"pgmId","FAM_9999"); f.gfn_setColumn(0,f.ds_main,"PGM_ID","FAM_9999");
f.gfn_setColumn(0,f.ds_main,"RQST_NO",rqstNo); f.gfn_setColumn(0,f.ds_main,"bfFocusRowRqstNo",rqstNo);
fu.gfn_upload("","fn_endFileCallBack","ds_file","RQST_NO="+rqstNo,"");  // → ds_files tmHeader='S'(서버반영)+RQST_NO 연결
```
- 🔴 **판정은 건수가 아니라 `tmHeader`로 — `count`가 2여도 `'I'`면 서버 미반영** (2026-08-04 실측): 파일은 붙었는데 상태만 `I`(선택됨)로 남는 패턴이 있다. 이땐 **파일 재선택·재노출 없이 `gfn_upload` 만 다시 호출**하면 `'S'` 로 전환된다(1회 재호출로 해결). 대기(3초 추가)로는 안 바뀌니 재호출이 답.
- 🔴 **gfn_upload 후 `ds_files` 재확인 필수 — `0` 이면 첨부 실패 → 재시도** (2026-07-08 실측, 첫 시도 실패 잦음): gfn_upload 후 `ds_files.getRowCount()===2`(tmHeader='S') 확인. **`0` 이면 첨부 안 된 것** → **input 재노출(구 input 제거 + `_input_node` 재 adopt + id/visible) → snapshot 새 uid → upload_file ×2 → gfn_upload** 재실행하면 붙는다. (원인은 upload 직후 change 반영 타이밍 추정 — 재시도로 해결. gfn_upload 전 `await sleep(1000)` 후 ds_files===2 확인하면 성공률↑.) ⚠️ 행 전환 **직후** `ds_files` 가 잠깐 이전 행 값(로드 지연)으로 보이니 **재확인**해 그 행 것(0건)인지 먼저 확인.
- ⭐ **fam_0702 page 를 `select_page` 한 상태에서** 첨부하면(§0-1) `_input_node.ownerDocument===document`(그 page 문서)라 adopt 성공, snapshot·upload_file·gfn_upload dialog 모두 그 page 기준으로 처리된다.
- ⚠️ **uid 는 snapshot 마다 갱신**(행0=2_0→행1=3_0→행2=4_0, 신청서 재오픈 시 5_213/6_5 등 프레임 prefix 변경) → 매 행 snapshot 필수. 출력 절약 위해 `take_snapshot(filePath)` 저장 후 Grep "파일 선택".
- **chrome-devtools 는 별도 브라우저 인스턴스**(로그인 세션 없음) → 사용자가 그 창에서 `e.kist.re.kr` **1회 로그인** 후, fam_0701 조회 → **`doNew("Y")`**(fam_0701 리스트의 **신청서번호(RQSTMGRNO) 셀 클릭 = doNew("Y") = 기존 신청서 열기**)로 저장된 신청서 재오픈해 첨부.
- chrome-devtools `evaluate_script` 는 **async/await 정상**(Claude-in-Chrome 의 async→`{}` 반환 현상 없음) → 계정 popBudgList 6단계 등 서버 대기를 `await sleep` 로 한 호출에 묶어 빠름. 네이티브 confirm/alert 은 `dialogAction:'accept'` 로 자동 처리.

#### 9-1-B. Claude-in-Chrome 임시버튼 방식 (2026-06-07 codex 해법 — 패턴 A, file_upload 경로 막히면 미사용)
> 공통 가이드: [`../../_shared/nexacro_file_upload.md`](../../_shared/nexacro_file_upload.md) **§3 패턴 A** (NEXACRO popupframe, 같은 chrome page 안 — 부모 page 에 임시 버튼 + `extUp.addFiles()`).
> 아래는 **fam_0702 화면 특화** — 컴포넌트명 `importFileUpload`, 행별 `RQST_NO` 등 fam_0702 특정 값.
> ※ fam_0702 는 NEXACRO popupframe 이라 패턴 A. kk-inspect mcs_0003_pop2 는 `window.open` 별도 page 라 패턴 B (다른 방법).
- fam_0702 의 첨부 UI = NEXACRO `ExtFileUpload`(`f.importFileUpload`). **DOM `<input type=file>` 없음** → `file_upload` 직접 호출 실패. 그래서 한동안 "사용자 수동"으로 분류했지만 ↓ 방법으로 자동화 가능.
- **핵심 아이디어**: `addFiles()`를 호출하는 **임시 DOM 버튼**을 팝업 문서에 만들고 → 그 버튼을 자동화도구의 `file_upload`로 클릭 → 버튼 onclick 이 `extUp.addFiles()` 호출 → **네이티브 파일창**이 뜨는 그 순간을 **DevTools `Page.handleFileChooser`** 가 가로채 지정 파일을 주입. → 좌표 0, 사용자 무개입.
- (예전 §9 의 "자동화 불가" 3가지 이유는 **input type=file 만 노린 file_upload 한정**의 얘기였고, codex 의 임시버튼 우회는 같은 file_chooser 이벤트를 띄워 같은 DevTools 후크로 처리하기에 통한다.)

```js
// 1) fam_0702 팝업 문서에서 실행 — 임시 트리거 버튼 주입
const f = window.application?.popupframes?.fam_0702?.form
       || window.application?.mainframe?.ChildFrame?.form;
let btn = document.getElementById("kk_pay_upload_trigger");
if (!btn) {
  btn = document.createElement("button");
  btn.id = "kk_pay_upload_trigger";
  btn.textContent = "파일추가 트리거";
  Object.assign(btn.style,{position:"fixed",zIndex:"2147483647",left:"20px",top:"20px",width:"180px",height:"36px"});
  btn.onclick = () => f.importFileUpload.extUp.addFiles();   // ★ ExtFileUpload.addFiles() — 네이티브 chooser
  document.body.appendChild(btn);
}
// 2) 자동화 도구의 file_upload 를 이 임시 버튼(#kk_pay_upload_trigger)에 호출 → chooser 가로채기로 파일 주입.
//    파일 여러 개면 한번에 가능(NEXACRO 가 multi-file 받음). 파일별로 반복도 OK.
```

- **행별 첨부** — 묶음(다건)은 **현재 행이 누구냐**에 따라 첨부가 그 행의 `RQST_NO` 로 붙는다. `ds_rqstGrid.set_rowposition` **만으론 부족**(detail 안 바뀜 — §10) → 반드시 `rqstGrid_oncellclick` 까지 태워야 `saveUploadFile()` 이 호출되며 그 행의 첨부 목록이 로드됨.
  ```js
  f.ds_rqstGrid.set_rowposition(row);
  f.rqstGrid_oncellclick(rqstGrid, ei);   // ei.row=row, ei.cell=0, ei.col=0
  // 이 시점 이후에 임시버튼 클릭(=file_upload) → 그 row 의 RQST_NO 에 첨부됨
  ```

- **첨부 상태 확인** — `f.importFileUpload.ds_files` 의 컬럼 `tmHeader`(상태) · `FLE_NM` · `RQST_NO`:
  - `I` = 파일 **선택**만 됐고 서버 전송 전
  - `S` = 서버 첨부 **반영 완료**
  - `D` = 삭제 예정

- **서버 반영 호출** — *첨부만* 하고 지급신청서는 저장하지 않으려면 콜백을 잘 골라야 한다.
  - ⚠️ `fn_endFileCallBack1` 은 끝에 `doSave("S")` 까지 이어진다 → 첨부+저장 동시 원할 때만.
  - **첨부만** 원하면 아래처럼 `fn_endFileCallBack` (숫자 없는 쪽):
  ```js
  const rqstNo = f.ds_rqstGrid.getColumn(f.ds_rqstGrid.rowposition, "RQST_NO");
  f.gfn_setColumn(0, f.ds_main, "pgmId", "FAM_9999");
  f.gfn_setColumn(0, f.ds_main, "PGM_ID", "FAM_9999");
  f.gfn_setColumn(0, f.ds_main, "RQST_NO", rqstNo);
  f.gfn_setColumn(0, f.ds_main, "bfFocusRowRqstNo", rqstNo);
  f.importFileUpload.gfn_upload("", "fn_endFileCallBack", "ds_file", "RQST_NO=" + rqstNo, "");
  ```

- **잘못 붙은 파일 삭제** — 현재 행에서 `removeFile(rowIndex)` 후 `gfn_upload(fn_endFileCallBack)` 재호출로 서버 반영.
  ```js
  f.importFileUpload.removeFile(rowIndex);
  f.importFileUpload.gfn_upload("", "fn_endFileCallBack", "ds_file", "RQST_NO=" + rqstNo, "");
  ```

- **임시버튼 청소**: 작업 끝나면 `document.getElementById("kk_pay_upload_trigger")?.remove();` 로 제거(사용자 화면 어지럽힘 방지).
- **제약**: 그림 1.5M 이하 / PDF 10p 미만.

### 9-2. 저장 → 결재상신
- `bt_save`(저장, 임시저장) → `RQST_NO`(신청관리번호) 생성. 행마다 RQST_NO 부여 — 첨부는 RQST_NO 단위라 **저장 후 첨부**가 자연스럽다(저장 전 첨부도 가능하지만 새 행이면 일단 저장 권장).
- `bt_approval`(결재상신) = 내부에서 저장+검증+상신 통합 → gw 전자결재. **결재선 = 계정책임자(`ds_GNL.RDSBJEMPNM`) + 발의자(본인).** 사용자 confirm.

## 10. 여러 건 묶기 (행추가)
> 🔴 **과제 다르면 신청서 분리 — `bt_reset`(초기화)로 이어만들기 금지 (2026-07-07 실측)**: 한 신청서는 **동일 계정만**. 과제 2개면 신청서 2개. **1신청서 저장 후 `bt_reset` 로 폼 비우고 2신청서 작성하면 → 1신청서(직전 저장분)가 서버에서 유실**됨(실측: 과제 A 3건 저장·RQST_NO 발급됐으나 bt_reset→과제 B 작성·저장 후 fam_0701 조회에 과제 A 0건 → 전체 재작성). **신청서 분리는 `bt_close`(닫기) 후 fam_0701 `doNew("N")` 로 새로 열기** (bt_reset 이 발급한 새 RQST_NO 로 직전 것을 덮어쓰는 것으로 추정). 재오픈 첨부는 `doNew("Y")`(신청서번호 셀 클릭).

**동일 계정**이면 한 신청서에 최대 5건. 1건 완료 후:
```js
// 행추가 버튼: text "행추가" 로 walk → onclick fire (새 ds_rqstGrid 행 + 새 row 자동 current + ds_GNL 빈 detail)
var addBtn=null; /* walk(document.body, n=>n.textContent.indexOf('행추가')>=0) 로 '행추가' 버튼 노드를 찾아 넣는다 */ fire(addBtn,'onclick',{fromobject:addBtn});
var rg=f.ds_rqstGrid; rg.set_rowposition(rg.getRowCount()-1);   // 새 행
// → §2 영수증함 매핑(다음 세금계산서 NTS_ISSUEID) → §4 적요 → §5 계정(같은 계정이라도 행마다 popBudgList 재실행) → §6 사용구분 → §7 검수 → §8 통장표기 KIST_ 반복
```
- ⭐ **행추가 버튼 핸들러가 master-detail row 전환을 처리** → 새 행 매핑이 기존 행을 덮지 않음(실증: 1행 금액 보존된 채 2행 추가). 각 행마다 §2~§8 그대로 반복.
- ⚡ **속도**: ① 행추가→매핑→계정검색(BUDGSBJCD set + search) **1배치** → ② 예산·비용·세부 `doDecision` **1배치** → ③ 검수(비자산+조회+dblclick) + **맨 마지막에 적요·사용구분·통장표기** **1배치** = 건당 ~3 호출.
  - ⚠️ **순서 절대원칙**: `doDecision`(계정)과 검수 dblclick 이 **`COMDSCCONT`(적요)·`RQSTDETLCD`(사용구분)를 리셋**한다 → **적요·사용구분은 계정·검수 다 끝낸 뒤 맨 마지막에** 설정해야 남는다(§4·§6). 통장표기(dpstDispNm)는 영향 없음. (탐색 0, 컴포넌트명·코드 고정.)
- 첨부는 신청서 단위(모든 건의 세금계산서+거래명세서 함께). **당해연도 세금계산서는 당해연도에** 지급신청. 타인 수신분은 [경영정보>재무>매입(세금)계산서 조회·이관]에서 담당자 이관 후 영수증함 등장.
- ⚠️⚠️ **다건 적요 함정 (실측, 미해결)**: 행 전환을 `ds_rqstGrid.set_rowposition(N)` 으로 하면 **상세내역(ds_GNL)·적요 컴포넌트가 안 바뀐다**(현재 행 유지) → 그 상태로 적요 set 하면 **엉뚱한 행에 덮어씀**. 행 전환은 **`rqstGrid` 그리드 row-click**(`rqstGrid_oncellclick`, `ei.row=N`, **set_rowposition 먼저 금지**)으로 하고 **매 전환 후 `ds_GNL.RQSTAMT`(금액)로 올바른 행인지 검증**. 단 전환해도 적요 컴포넌트가 새 행 값으로 reload 안 되는 경우가 있고, 저장이 grid(ds_rqstGrid) vs 행별 detail(ds_GNL) 중 무엇을 쓰는지 불확실 → **다건이면 적요만은 저장 직전 화면에서 행별로 직접 확인·입력 권장**. (단건은 §4대로 맨 마지막 1회 set 으로 충분.)

## 10-1. ⭐ 배치 통합 패턴 — 4건·2신청서를 evaluate ~15턴으로 (2026-09-09 실측)
`evaluate_script` 1회 한도 45초 안에서 아래처럼 묶으면 건당 1~2배치로 끝난다(이번 4건: 매핑→상신안내까지 신청서1 약 12턴, 신청서2 약 8턴).
- **건 작성 배치(≈20s)**: `[popBudgList 계정→15→330→doDecision] → [검수 비자산·btnSetMapTally·PRCT_NO 매칭·dblclick] → [통장 KIST_ → 사용구분 6 → 적요 (→ 참고사항)] → [행추가] → [다음 건 영수증함 매핑] → [다음 건 BUDGSBJCD set + 계정검색 버튼 → popBudgList 열림 대기]`. **배치 경계를 'popBudgList 가 열린 상태'** 에 두면 다음 배치가 계정 선택부터 바로 이어진다. (첫 건은 매핑+계정검색만 따로, 검수 목록은 첫 배치 끝에 `ds_datagrid1` 을 반환받아 PRCT_NO 를 미리 확인.)
- **마지막 건 배치**: 통장·사용구분·적요 후 **행별 자동 검증**(RQSTAMT·PRCT_NO·USEDYMD·`계정/15/330`·RQSTDETLCD='6'·적요 비어있지 않음·INVTRSNCONT 기대값) → **전부 pass 면 그 자리에서 `bt_save`** 까지 실행하고 RQST_NO 를 반환. 하나라도 fail 이면 저장하지 않고 rows 만 반환(사람 확인).
- **첨부 배치(행당 4턴)**: `[evaluate: 행 전환(ei.cell=2)+_input_node adoptNode 노출]` → `take_snapshot` → `Grep '파일 선택'` uid → **`upload_file` 2개(세금계산서·거래명세서)를 같은 응답에 병렬 호출**(CDP 직렬 처리라 ds_files 에 순서대로 2건, 이전의 순차 2턴 불필요) → `[evaluate: gfn_upload 를 tmHeader 전부 'S' 될 때까지 최대 3회 루프(6s 간격) → 성공 시 다음 행 전환+노출까지]`. 이번 4행 모두 1회에 'S'.
- **계좌검증 배치**: 행당 `[전환 3.5s + btn_accCstm00 fire + 7s]` ≈ 10.5s → **행 2개 + 마지막 gfn_upload + input 숨김** 을 한 배치(≈27s), **나머지 행 + `bt_save` + 행별 최종검증(첨부 tmHeader·TRANSFERSTAT_DESC·INVTRSNCONT)** 을 다음 배치. **계좌검증 3행 이상을 한 배치에 넣지 말 것**(45s 초과 위험).
- 저장·상신 뒤 남는 `저장 되었습니다` alert 는 다음 도구 호출을 막으니 **배치 직후 `handle_dialog('accept')` 1회** 를 습관처럼(§0-1 4).
- **첨부 사본 명명**: 원본 거래명세서명은 `거래명세서_XX000000-1 KIST_김키키 박사님 ○○ .pdf` 처럼 길고 확장자 앞 공백까지 있어 시스템 첨부명이 지저분해진다 → `<cwd>\_tmp\attach\` 에 `{YYMMDD} 세금계산서.pdf` / `{YYMMDD} 거래명세서.pdf` 로 **복사본**을 만들어 올린다(원본은 건드리지 않음). 처리완료 이동은 **원본명 그대로**(§0-0 9).
- PDF 4쌍의 발급일·품목·금액·국세청승인번호 파악은 PyMuPDF `fitz` 로 8개 한 번에 텍스트 추출(1턴). 세금계산서 `승인번호` 24자리 = 영수증함 `NTS_ISSUEID` 와 그대로 매칭.

## 미해결 / TODO
1. ✅ **계좌 실명검증 = 결재상신 필수 → 통과법 규명 (2026-07-07, §8-0)**: 진짜 원인은 alert/예금주/공휴일이 아니라 **`btn_accCstm00` 핸들러의 `this` 컨텍스트가 fam_0702≠`import2` divForm** 이라 검증 API(`getChkDpstStat.do`)가 안 돈 것. `import2`(ds_main_DPST 보유 조상 form) 컨텍스트로 핸들러 호출 + `TRANSFERSTAT_DESC==='정상처리'` 로 성공 확인. (2026-06-07 "공휴일 제약" 추정도 오인 — 화요일 정상 통과; 예금주 전각공백/괄호도 은행 등록명 일치로 통과.) `Static00.visible` 은 부정확하니 신뢰 금지.
2. ✅ 버튼 확정: **저장=`bt_save`**, **결재상신=`bt_approval`**(저장+검증+상신 통합 — handler hasSave=true·hasValid=true). 미저장 상태에서 결재상신 누르면 내부 저장+검증 후 진행.
3. ⚠️⚠️ **gfn_msg/gfn_confirm 억제 트랩**: 전역 무력화하면 저장/상신 검증 메시지 삼켜짐 → 넘기기 전 원복. **chrome-devtools 는 `dialogAction:'accept'` 로 대체**(무력화 불요).
4. 다건 **적요·사용구분 리셋/행전환** 함정(§4·§6·§10) — 다건 적요는 저장 직전 행별 확인 권장.
5. ✅ **첨부 자동화 실증 완료 (2026-07-07, chrome-devtools 10파일)** — Claude-in-Chrome `file_upload` 경로 제약 → **chrome-devtools `upload_file` + `_input_node` adoptNode**(§9-1-A). 행별 `rqstGrid_oncellclick`(ei.cell=2) 선행 + `fn_endFileCallBack` 서버반영. codex 임시버튼(§9-1-B)은 file_upload 경로 막히면 대체 곤란.
6. ✅ **end-to-end 상신 성공 (2026-07-07)** — 세금계산서 5건(2 신청서) 작성→계정→검수→통장→적요→저장→첨부→계좌검증→상신 전 과정 실증. SKILL.md 세금계산서 'WIP' 해제 가능.
7. ⚠️ **초기화(bt_reset) 다건 유실**: 신청서 분리 시 bt_reset 로 이어 만들면 직전 저장분 유실(§10) → `bt_close` 후 `doNew("N")` 로 새로.
