# NEXACRO ExtFileUpload 첨부 자동화 (kiki 공통)

> KIST 통합정보시스템(p.kist.re.kr:8081, NEXACRO) 의 **파일 첨부는 전부 `ExtFileUpload` 컴포넌트** 패턴. 첨부 자동화는 팝업 종류·컴포넌트 구조에 따라 3가지 패턴 (A/B/C) 으로 갈린다.
> 2026-06-07 codex 실증 — A: kk-pay fam_0702, B: kk-inspect mcs_0003_pop2, **C: kk-meet pop_fam_0703_02 — 사실상 가장 직접적·일반적인 정공법**(`extUp._input_node` = ExtFileUpload 내부 숨겨진 HTML input 을 노출 후 직접 주입). A/B 화면도 C 가 통할 가능성 큼(차후 검증).

## 0. 왜 그동안 안 됐고 왜 이제 되나
- **막힌 이유**: `ExtFileUpload` 는 화면에 **DOM `<input type=file>` 가 없다** → 자동화 도구의 `upload_file`(또는 `file_upload`)가 input 을 못 찾아 즉시 실패.
- **본질 해법**: DevTools `Page.handleFileChooser` 는 input 클릭이 아니라 **file chooser open 이벤트**를 가로챈다 → `addFiles()` 가 chooser 만 띄울 수 있으면 input 유무와 무관하게 파일 주입 가능.
- **두 패턴이 필요한 이유**: NEXACRO 의 "팝업"이 ① 같은 chrome page 안 NEXACRO popupframe (A) vs ② 진짜 `window.open` 으로 별도 chrome page (B) 두 종류고, file chooser 이벤트가 "어느 page" 에서 발생하느냐가 다르다.

## 1. 패턴 판별 (작업 시작 시 1회)
### 1-1. C 우선 시도 (가장 직접적 — 정공법)
어떤 화면이든 **먼저 §5 C 패턴**(`extUp._input_node` 직접 노출) 부터 시도. ExtFileUpload 의 내부 구조 `_input_node` 가 있으면 그게 진짜 HTML input 이라 chooser 가로채기 우회 없이 바로 파일 주입. A/B 화면도 통할 가능성 큼.
```js
const FU = f.<컴포넌트명>;   // §2 참고
FU.extUp && FU.extUp._input_node    // ← truthy 면 C 가능. falsy 면 A 또는 B 로 fallback.
```

### 1-2. C 가 안 되면 A vs B 판별
- 팝업이 열린 상태에서 **DevTools `list_pages`** 호출.
  - URL 에 `popup.html?formname=…` 이 별도 page 로 잡히면 → **B 패턴**.
  - 잡히지 않으면(부모 page 만 보이면) → **A 패턴**(NEXACRO 내부 popupframe).
- 또는 form 참조로:
  - `window.application.popupframes.<name>.form` 으로 form 은 보이는데 그 팝업이 부모 page DOM 안에 있다 → **A**.
  - `window.open` 새 창이거나 별도 chrome page 라 부모에서 그 DOM 직접 조작 불가 → **B**.

## 2. 컴포넌트명 확인 (첫 시도시 1회, 화면별)
첨부 컴포넌트의 form 멤버명이 화면마다 다르다 (실측: kk-pay=`importFileUpload` / kk-inspect=`fileDiv1`). 형식이 일정해 1줄로 찾는다:
```js
// 해당 화면의 form (팝업이면 그 팝업 form) 위에서
Object.keys(f).filter(k => f[k] && f[k].extUp && typeof f[k].extUp.addFiles === 'function')
// → ["importFileUpload"] / ["fileDiv1"] 식
```
또는 (extUp 가 없는 경우) `ds_files` 보유 컴포넌트로:
```js
Object.keys(f).filter(k => f[k] && f[k].ds_files)
```
한번 알아낸 이름은 해당 skill reference 에 박는다.

---

## 3. 패턴 A — NEXACRO popupframe (같은 page 안)
대표: 부모탭 화면(kk-meet fam_0704_02 등). (kk-pay fam_0702 는 별도 page 라 지금은 패턴 C 로 — `tax_invoice_payment.md` §9-1.)
첨부 화면이 부모 page 안에 있으니, **부모 page 에서 임시 DOM 버튼**을 만들고 그 버튼 onclick 에서 `addFiles()` 를 호출한다.

### 3-1. 임시 트리거 버튼 주입
```js
const f = /* 화면 form (popupframes.X.form or mainframe.ChildFrame.form) */;
const FU = f.importFileUpload;   // §2 로 알아낸 이름
let btn = document.getElementById("kk_upload_trigger");
if (!btn) {
  btn = document.createElement("button");
  btn.id = "kk_upload_trigger";
  btn.textContent = "파일추가 트리거";
  Object.assign(btn.style,{position:"fixed",zIndex:"2147483647",left:"20px",top:"20px",width:"180px",height:"36px"});
  btn.onclick = () => FU.extUp.addFiles();
  document.body.appendChild(btn);
}
```

### 3-2. 자동화 도구의 `upload_file`/`file_upload`
임시 버튼(`#kk_upload_trigger`)을 타깃으로 호출. 절대경로. NEXACRO multi-file 받아 복수도 한 번에 OK.

### 3-3. 청소
```js
document.getElementById("kk_upload_trigger")?.remove();
```

---

## 4. 패턴 B — 진짜 별도 chrome page (`window.open` 팝업)
대표: **kk-inspect mcs_0003_pop2**.
첨부 화면이 부모 page DOM 밖에 있다. **임시 버튼 만들 필요 없이** 그 page 안의 **실제 "파일추가" 버튼**(이미 존재)에 `upload_file` 을 직접 건다.

### 4-1. 별도 page 선택
```
DevTools list_pages
# → URL 에 popup.html?formname=mis.mcs::mcs_0003_pop2.xfdl 같은 page 식별
DevTools select_page <pageId>   # 이후 명령이 이 page 에서 동작
```

### 4-2. 실제 "파일추가" 버튼 UID 찾기
```
DevTools take_snapshot   # 또는 find / 접근성 트리
# → "파일추가" 텍스트 + btn_selectFiles 이미지 가진 버튼 노드의 uid (예: "8_305")
```
※ uid 는 세션마다 다를 수 있어 매번 take_snapshot 으로 확정.

### 4-3. 그 UID 에 `upload_file` 직접
```
upload_file({ pageId: <page>, uid: "<found_uid>", filePaths: ["<TEMP>\\kiki_upload\\파일.pdf"] })   // chrome-devtools-mcp 도구. 전체 이름은 mcp__<서버명>__upload_file (서버명은 설치방식별 상이 — environment_setup.md "도구 이름 표기 규칙"). 파일은 workspace root(cwd) 안이어야 함(§4-6)
```
한 파일씩 반복 (mcs_0003 실증). 복수 동시도 가능한지는 화면별 확인.

### 4-4. 첨부 확인 (그 page 의 console)
```js
(() => {
  const form = window.application?.popupframes?.mcs_0003_pop2?.form
            || window.application?.mainframe?.ChildFrame?.form;
  const ds = form?.fileDiv1?.ds_files;     // ★ 화면별 컴포넌트명 (mcs_0003 = fileDiv1)
  const out = [];
  for (let i = 0; i < ds.getRowCount(); i++) {
    out.push({
      idx: i,
      name: ds.getColumn(i, "FLE_NM"),
      tmHeader: ds.getColumn(i, "tmHeader"),   // I=선택만 / S=서버반영 / D=삭제예정
      size: ds.getColumn(i, "FLE_SZ"),
      prog: ds.getColumn(i, "PROG")
    });
  }
  return out;
})();
```

### 4-5. 왜 패턴 A (임시버튼 방식) 가 B 화면에서는 실패하나
- 부모 page 에 임시 버튼 만들어 chooser 띄우면 → **chooser 가 부모 page 에서 발생** → 자동화도구는 그걸 가로채 파일을 부모 page 의 file input 슬롯에 주입.
- 하지만 첨부 받아야 할 NEXACRO form (`popupframes.mcs_0003_pop2.form.fileDiv1`) 의 실제 input 은 **별도 page 에 있다** → 부모에서 띄운 chooser 의 파일이 그 form 으로 안 들어감.
- 그래서 B 패턴은 **page 를 그 팝업으로 전환한 뒤 그 page 의 실제 버튼에 직접** 거는 방법이 정답.

### 4-6. chrome-devtools-mcp 로 패턴 B 실행 (★ 단일 채널 권장 — 2026-06-19 Claude 실증)
Claude in Chrome(`javascript_tool`)은 입력은 되지만 **`window.open` 팝업이 tab group 밖이라 첨부가 안 된다**(파일은 chrome-devtools-mcp 의 `upload_file` 이라야 별도 page 에 직접 걸림). 그래서 mcs_0003 은 **처음부터 chrome-devtools-mcp 한 채널로** 입력·첨부·신청을 다 하는 게 깔끔하다.

**방법 A — chrome-devtools-mcp 자체 Chrome 을 KIST 작업창으로**: chrome-devtools-mcp 는 자체 **격리 Chrome** 을 띄운다(`~/.cache/chrome-devtools-mcp/chrome-profile`, `--remote-debugging-pipe`, `--disable-extensions` → 평소 extension Chrome 과 **다른 인스턴스**, KIST 로그인 없음). `navigate_page` 로 `http://p.kist.re.kr:8081/` 를 열면 SSO 로그인 페이지 → **사용자가 그 창에서 1회 로그인**(프로필 persist, 이후 세션 유지, credential 은 사용자 직접). 이후 입력·첨부·신청 전부 chrome-devtools-mcp 도구로.

도구 매핑 (Claude in Chrome → chrome-devtools-mcp):
| 단계 | chrome-devtools-mcp |
|---|---|
| 화면 이동 | `navigate_page({type:'url',url})` + `wait_for({text:['검수신청관리']})` |
| 팝업 열기 | `evaluate_script` 로 `button1`(`mainframe_ChildFrame_form_button1`) dispatchEvent click — **window.open 후킹 불필요**(새 page 가 `list_pages` 에 자동 등장) |
| 팝업 page 선택 | `list_pages` → `popup.html?...mcs_0003_pop2.xfdl` → `select_page(pageId)` |
| form 입력 | `evaluate_script` 로 `window.application.popupframes.mcs_0003_pop2.form...` (그 page 자체 window — 부모 `_popupWin` 불필요) |
| 지급신청자 | 같은 form `btn_input26.click()` → `popupframes.empSchPopup.form`(ds_search.setColumn→btn_search→ds_empList→btn_confirm) |
| 첨부 | `take_snapshot` → `btn_selectFiles`("파일추가") uid → `upload_file({pageId, uid, filePaths:[…]})` 파일별 |
| 신청 | 사용자(`btn_registration`) |

**★ workspace root 제약 (필수 — 2026-06-19 발견, 2026-09-27 보강)**: chrome-devtools-mcp 의 `upload_file` 은 **configured workspace roots 안의 파일과 OS 임시 폴더만** 허용. 밖(예 다른 드라이브의 증빙 폴더)이면 즉시 `Error: Access denied: ... is not within any configured workspace roots`. roots 가 세션 cwd 를 포함하는지는 에이전트마다 다르다(Codex 실측: cwd 하위도 거부, OS 임시 폴더는 성공 — chrome-devtools-mcp 1.10.1 소스도 OS 임시 폴더를 항상 허용). → **증빙을 OS 임시 폴더 아래로 복사한 뒤 그 경로로 `upload_file`**, 첨부가 끝나면 그 복사본 폴더를 지운다.
```powershell
$dst="$env:TEMP\kiki_upload\inspect_<case>"; New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item "<원본폴더>\<파일패턴>" $dst -Force   # 파일명에 연속 공백 있으면 wildcard
```
- 파일명에 **연속 공백**(예 `○○부품  A`) 이 있으면 정확 경로 매칭이 깨짐 → wildcard(`○○부품*A.jpg`) 로 복사하고 실제 `FullName` 으로 `upload_file`.
- mcs_0003 실측: `upload_file` 후 `tmHeader=I`(클라이언트 선택). **신청 버튼 누르면 검수 저장과 함께 서버 업로드**(0%→100%) — `gfn_upload` 별도 호출 불필요.
- 첨부 후 임시폴더는 정리(또는 inspect_folder 로 이관).

**⚠️ `upload_file(btn_selectFiles)` 실패 시 fallback = 패턴 C (2026-07-03 Claude 실증)**: 새로 launch 된 Chrome 등에서 "파일추가" 버튼 uid 에 `upload_file` 하면 `Error: ... clicking it did not trigger a file chooser` 로 실패할 수 있다. 그땐 아래 **§5 패턴 C** 로 전환:
1. `evaluate_script` 로 `form.fileDiv1.extUp._input_node`(type=file, multiple) 를 DOM 에 노출 — `input.id='kk_file_input'` + `removeAttribute('disabled')` + `display:block; opacity:1; z-index:2147483647` + `document.body.appendChild`.
2. `take_snapshot` 으로 그 input 의 uid 확인(예 `6_398`; snapshot 은 `filePath` 로 저장 후 "파일 선택"/"선택된 파일 없음" grep 하면 토큰 절약).
3. 그 uid 에 `upload_file` **파일별 반복** — HTML `input.files` 는 덮어써도 NEXACRO 가 change 마다 `ds_files` 에 **누적**하므로 여러 장도 순차 OK(매번 `ds_files.getRowCount()` 로 확인).
4. 첨부 후 input 숨김: `display:none; opacity:0` + `removeAttribute('id')`.
- mcs_0003 은 이 `_input_node`(패턴 C) 방식이 **버튼(패턴 B)보다 안정적**이라, 아예 처음부터 패턴 C 로 가도 된다.

### 4-7. ⚠️ 첨부 후 개수 검증 필수 (2026-07-07 실전 — 마지막 파일 누락 반복)
`upload_file` 은 HTML `input.change` → NEXACRO `ds_files` append 가 **비동기**라, **마지막 파일 직후 바로 `ds_files.getRowCount()` 를 읽으면 그 파일이 아직 반영 안 돼 누락**으로 보인다(특히 3MB+ 큰 이미지). 실전에서 4건 중 3건이 마지막 물품사진 1장씩 누락됐다.
- **마지막 upload 후 `evaluate_script` 로 2-3초 대기**(`await new Promise(r=>setTimeout(r,2500))`) 후 `ds_files` 확인.
- **첨부 끝나면 반드시 `count === 기대 개수` 검증**. 부족하면 누락 파일을 (input 재노출 후) 재업로드 — HTML input 은 덮어써도 `ds_files` 는 누적되므로 누락분만 다시 올리면 된다.
- 사용자 **중단(interrupt)** 으로도 마지막 upload 가 끊길 수 있으니, 신청 전 count 검증은 예외 없이 수행.

---

### 4-8. ⚠️ alert 후 input 요소 재생성 — uid 갱신 필수 (2026-09-08 실전, mcs_0003)
`upload_file` 이 화면 검증 alert(예 `특수문자는 첨부파일에서 사용 불가능합니다` — 파일명에 `+` 등)를 유발하면, `handle_dialog` 로 닫은 뒤 NEXACRO 가 `extUp._input_node` 를 **새로 만든다**. 이전 snapshot 의 uid 는 detach 된 옛 요소를 가리켜 `upload_file` 은 성공을 반환하지만 `ds_files` 에 반영되지 않는다.
- 판별: `document.getElementById('kk_file_input') === form.fileDiv1.extUp._input_node` 가 **false** 면 교체된 것.
- 처리: 옛 요소 `remove()` → 새 `_input_node` 재노출(§5-1) → `take_snapshot` 재촬영 → **새 uid** 로 재업로드 → §4-7 개수 검증.
- 예방: 파일명 특수문자(`+ & % # /`) 사전 제거 — `kk-inspect/references/evidence_rules.md`.

## 5. 패턴 C — `extUp._input_node` 직접 노출 (정공법, kk-meet 회의록 팝업 실증)
대표: **kk-meet `pop_fam_0703_02`** (회의비/업무추진비 회의록 팝업).
ExtFileUpload 내부의 **숨겨진 HTML input** (`extUp._input_node`) 을 DOM 에 노출만 시키면 자동화도구가 그 input 에 **`setInputFiles`/`upload_file` 로 파일 직접 주입**. chooser open 이벤트 가로채기 우회 불필요 — 가장 직접적.

### 5-1. input 노출
```js
const C = window.application?.popupframes?.pop_fam_0703_02?.form
       || window.application?.mainframe?.ChildFrame?.form;
const FU = C.fileDiv2;              // §2 로 알아낸 컴포넌트. fam_0703_02 회의록: fileDiv1=서명록 / fileDiv2=증빙 / fileDiv3=사전결재
const input = FU.extUp._input_node;  // ★ 핵심
input.id = "kk_file_input";
input.setAttribute("aria-label", "kk file upload");
Object.assign(input.style, {
  position:"fixed", left:"20px", top:"20px",
  width:"260px", height:"40px",
  opacity:"1", display:"block", zIndex:"2147483647",
  background:"white"
});
if (!document.body.contains(input)) document.body.appendChild(input);
```

### 5-2. 그 input 에 파일 직접 주입
- Playwright: `await page.locator("#kk_file_input").setInputFiles("D:\\…\\file.jpg");`
- chrome-devtools-mcp: `take_snapshot` 으로 노출한 `#kk_file_input` 의 uid 확보 → `upload_file({pageId, uid, filePaths:[…]})` 파일별 반복(로컬 경로 OK — 단 cwd 하위, §4-6).
- Claude in Chrome `file_upload(ref, paths)` 는 **채팅에 첨부한(세션 공유) 파일만** 올라간다 → 로컬 증빙은 chrome-devtools 로. 그래서 첨부 있는 작업은 처음부터 chrome-devtools 창에서(environment_setup 0단계 1).
※ 이 단계는 **클라이언트 선택**만 반영(서버 업로드 X). 서버 저장은 §5-3 으로.

### 5-3. 서버 저장 (`gfn_upload`)
```js
const rqst = C.CONFERENCENO + "-" + C.ds_param.getColumn(0, "CARDUSEMGRNO");   // 회의비 RQST_NO 합성식 (회의록 팝업 한정)
C.fileDiv2.gfn_upload(
  "",                       // url (NEXACRO 기본 사용)
  "fn_endFileCallBack1",    // 콜백 — fam_0703_02 회의록은 1 (저장 동시) 권장 (kk-pay fam_0702 와 다름)
  "ds_file",
  "RQST_NO=" + rqst,
  "02"                      // ★ FLE_TP — fam_0703_02: 02=증빙. 서명록/사전결재는 다른 값(첫 시도 시 확인)
);
```
- ※ `RQST_NO` 합성식과 `FLE_TP` 값은 **회의록 팝업 한정**. 다른 화면(fam_0702 등) 은 자체 RQST_NO + 자체 FLE_TP.
- ⚠️ 콜백 `fn_endFileCallBack1` vs `fn_endFileCallBack` 분기는 §6 참고. fam_0703_02 회의록은 1 권장(저장까지 한번에).

### 5-4. 성공 확인 (ds_files 새 컬럼)
```js
const ds = C.fileDiv2.ds_files;
for (let i=0; i<ds.getRowCount(); i++) console.log({
  tmHeader: ds.getColumn(i,"tmHeader"),   // "S" = 서버 저장됨 / I = 선택만 / D = 삭제예정
  FLE_TP:   ds.getColumn(i,"FLE_TP"),     // "02" = 증빙
  FLE_PATH: ds.getColumn(i,"FLE_PATH"),   // 서버 저장 경로
  NEW_FLE_NM: ds.getColumn(i,"NEW_FLE_NM")// 서버 저장 파일명
});
```

### 5-5. 청소
input 을 원래 위치/스타일로 되돌리거나 (NEXACRO 가 다시 쓸 수 있게 신중), 최소한 id/스타일은 제거. fam_0703_02 처럼 같은 팝업에서 fileDiv1/2/3 영역 별로 반복 첨부할 수 있어 input 을 영구 제거하지 말고 스타일만 원복하는 게 안전.

---

## 6. 공통: 서버 반영 (콜백 분기 ★중요)
첨부는 보통 **클라이언트 선택**(`tmHeader=I`) 만 일어나고, 서버 반영은 `gfn_upload` 호출이 필요할 수 있다.
- `fn_endFileCallBack1` = 업로드 후 **`doSave("S")` 까지 이어진다** → 첨부+저장 동시 원할 때만.
- **`fn_endFileCallBack`** (숫자 없는 쪽) = **첨부만 서버 반영**, 저장 안 함. 첨부만 분리하려면 이쪽.
```js
const rqstNo = f.ds_rqstGrid.getColumn(f.ds_rqstGrid.rowposition, "RQST_NO");
f.gfn_setColumn(0, f.ds_main, "pgmId", "FAM_9999");
f.gfn_setColumn(0, f.ds_main, "PGM_ID", "FAM_9999");
f.gfn_setColumn(0, f.ds_main, "RQST_NO", rqstNo);
f.gfn_setColumn(0, f.ds_main, "bfFocusRowRqstNo", rqstNo);
FU.gfn_upload("", "fn_endFileCallBack", "ds_file", "RQST_NO=" + rqstNo, "");
```
※ `ds_main`·`ds_rqstGrid`·`RQST_NO` 이름은 화면마다 다를 수 있다 (특히 mcs_0003 은 검수신청이라 키가 다름) — 해당 skill reference 확인.

화면에 따라 **upload_file 만으로 자동 서버 반영**되는 경우도 있다 (mcs_0003 실증: upload_file 후 ds_files 의 `tmHeader=S` 가 바로 보임 — `gfn_upload` 별도 호출 불필요할 수 있음). 작업 후 §4-4 식 console 로 `tmHeader` 확인해 결정.

## 7. 삭제 / 잘못 붙은 파일 제거
```js
FU.removeFile(rowIndex);
FU.gfn_upload("", "fn_endFileCallBack", "ds_file", "RQST_NO=" + rqstNo, "");
```

## 8. 행별 첨부 (다건 / RQST_NO 단위) — 주로 A 패턴
A 패턴에서 다건 묶음(예 kk-pay fam_0702) 은 **현재 행의 RQST_NO** 단위로 붙는다.
- ⚠️ `ds_rqstGrid.set_rowposition(N)` **만으론 부족** — 상세내역·`ds_main.RQST_NO` 가 안 바뀐다.
- 반드시 그리드 row-click 핸들러까지 태워야 `saveUploadFile()` 호출되며 그 행의 첨부 목록이 로드된다:
```js
f.ds_rqstGrid.set_rowposition(row);
f.rqstGrid_oncellclick(rqstGridComp, ei);  // ei.row=row, ei.cell=0, ei.col=0
```

## 8-1. 첨부/저장 후 화면 클릭 막힘 (NEXACRO modal layer — tool 무관)
첨부·저장(`gfn_upload`/`doSave`) 후 **빈 NEXACRO modal layer 가 화면 전체를 덮어** 이후 클릭(시간칸·그리드 등)이 안 먹는 경우가 있다. 임시 input 때문이 아니라 저장 후 남은 modal 레이어가 클릭을 가로채는 것 (2026-06-07 codex 실증, Claude 도 동일).
- 진단: `document.elementFromPoint(500,300)` → 반환이 `..._form_modalPopDiv` / `...modalPopDivScrollableInnerContainerElement(_inner)` 류면 그 레이어가 가로챔.
- 먼저 실제 확인창·입력 팝업이 열려 있는지 본다 — 열려 있으면 그 창을 정상 처리한다. **빈 레이어만 남은 것을 확인했을 때만** 아래를 쓴다(살아 있는 모달의 확인·입력을 건너뛰는 용도 금지, 2026-09-27 Codex 문서 정리에서 보강).
- 해결: 그 레이어들에 `pointer-events:none !important` 주입:
```js
let s = document.getElementById("kk-clickfix-style")
     || document.head.appendChild(Object.assign(document.createElement("style"),{id:"kk-clickfix-style"}));
s.textContent = `[id*="_form_modalPopDiv"], [id*="modalPopDivScrollableInnerContainerElement"] { pointer-events:none !important; }`;
// 적용 후 elementFromPoint 가 실제 입력칸/그리드를 반환하면 정상.
```
- ⚠️ 특정 화면 modal 만 노릴거면 id prefix 를 그 팝업명으로(`#pop_fam_0703_02_form_modalPopDiv` 등) 좁혀 적용.

## 9. 안전·예의
- A 패턴 **임시 버튼은 사용자 화면에 보인다** → 작업 후 반드시 `.remove()`.
- 잘못된 파일 붙으면 §6 으로 삭제 가능하지만, **확인 후 첨부**가 원칙(절대경로·개수·대상 행을 사용자에게 한번 보여주고 confirm 후 진행).
- **결재상신/신청 버튼은 사용자 confirm** 후 (kiki 보안정책 C2).

## 화면별 적용 현황
| 화면 | skill | 패턴 | 컴포넌트 | 비고 | 상태 |
|---|---|---|---|---|---|
| fam_0702 | kk-pay | **C**(별도 page) | `importFileUpload` → `_input_node` | A 는 2026-06-07 실증, 현재 표준은 C(`tax_invoice_payment.md` §9-1) | ✅ |
| fam_0704_02 | kk-meet | (A 또는 C) | §2 로 확인 | 부모탭 화면 — 실행 창은 chrome-devtools(첨부가 있으니 처음부터) | 🔵 미실증 |
| **pop_fam_0703_02** | kk-meet | **C** | `fileDiv1`(서명록)/`fileDiv2`(증빙)/`fileDiv3`(사전결재) | RQST_NO=`CONFERENCENO + "-" + ds_param.CARDUSEMGRNO`, FLE_TP=`"02"`(증빙). 로컬 증빙은 **chrome-devtools `upload_file`**(노출한 `#kk_file_input` uid)로 — Claude in Chrome `file_upload` 는 채팅에 첨부한 파일만 | ✅ codex 실증 2026-06-07 |
| mcs_0003_pop2 | kk-inspect | **B** | `fileDiv1` | 별도 chrome page (`window.open`) — **chrome-devtools-mcp 단일채널(§4-6) 권장**, `upload_file` 은 cwd workspace root 안 파일만(밖이면 복사) | ✅ codex 2026-06-07 / Claude(chrome-devtools) 2026-06-19 |

새 화면에 적용할 때는 §1-1 (C 우선) → 안되면 §1-2 (A/B 판별) → §2 (컴포넌트명) 순으로 확인 후 이 표 갱신.
