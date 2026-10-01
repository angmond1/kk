---
name: kk-pay
description: |
  키키(KIST 행정 도우미)의 지급신청 기능 — "키키야"처럼 키키·키키야·키키씨·김키키·김키키씨·김키키야·네코짱·네코쨩·야옹이·고양이·냥이·냥냥이 로 불러도 된다(문장 맨 앞 부르는 말은 요청에서 빼고 읽는다).
  카드결제·세금계산서 증빙을 과제·비목으로 분류해 RPA 파일명(계정_항목_비목_카드승인번호_카드책임자]내용)으로 바꿔 담당 연구행정원 Dooray 드라이브 폴더에 올리거나(올리면 RPA 가 자동 기안), 세금계산서 지급신청서를 통합정보에서 직접 작성한다. 카드 승인번호·과제·금액은 통합정보 backend 를 직접 조회(화면 좌표 없음). 올리기·작성·상신은 확인 후.
  트리거: "키키야 세금계산서 처리하자", "지급신청하자", "여기 폴더 결제건들 지급신청하자", "영수증 처리해줘", "카드 명세서 올려줘", "RPA 지급", "비목 정해서 올려줘", "세금계산서 지급신청", "지급신청 파일명", "kk-pay" 등 KIST 연구비 지급신청. 회의비는 kk-meet, 물품 검수신청은 kk-inspect. 본인 로그인 세션 + 본인 Dooray 토큰.
---

# kk-pay — KIST RPA 지급신청 자동화

> 🐱 **부르는 말**: 키키·키키야·키키씨·김키키·김키키씨·김키키야·네코짱·네코쨩·야옹이·고양이·냥이·냥냥이 로 시작하는 요청도 이 skill 로 처리한다(고양이·냥이·야옹이처럼 흔한 말은 문장 맨 앞에서 부를 때만). 문장 맨 앞의 부르는 말은 요청에서 빼고 읽는다 — 사람 이름·검색어·발신자로 쓰지 않는다(문장 중간 '김키키와·김키키가'처럼 요청의 대상인 이름은 사람). 이 skill 일이 아니면 [`../_shared/kiki_call.md`](../_shared/kiki_call.md) 표에서 맞는 kk skill 로 넘긴다.

## 핵심 한 줄
영수증 폴더의 증빙을 → **건별로 과제·비목 확정**(사용자와) → 카드 건은 **fetch 로 승인번호 조회**(좌표 0) → **파일명 규칙 변환** → **담당 행정원 dooray 폴더에 업로드**(=RPA 자동 기안) → 처리완료 폴더로 정리. **모든 업로드·이동은 사용자 confirm 후.**

## 😺 보고 머리표 — 매 보고 첫 줄에 반드시 (2026-09-30 사용자 규칙)
첫 실행 때만이 아니라 **지급신청 작업 중 아래 시점마다 보고 첫 줄**에 머리표를 붙인다(한 번도 안 나오면 안 된다). RPA 두레이 업로드·세금계산서 직접작성(`references/tax_invoice_payment.md`) 모두 같다. 노란 고양이 얼굴만 쓰고, 제출값(적요·참고사항·파일명)·오류 원문에는 넣지 않는다.

| 시점 | 첫 줄 예 |
|---|---|
| 증빙 파악 + 계획 표 보여줄 때 (건별 과제·비목·금액·빠진 증빙) | `😺 지급신청 계획 — N건 (kk-pay)` |
| 로그인·확인·결정 등 사용자가 할 일로 멈출 때 | `😼 로그인해 주세요` / `😼 확인해 주세요` |
| 세금계산서 신청서 한 건 저장 끝, 상신 대기 | `😼 신청서 A 저장 완료 — 상신을 눌러 주세요` |
| 한 건 완료 (세금계산서 상신 확인 / RPA 파일 업로드 확인) | `😸 A건 완료 — FAM…` / `😸 A건 업로드 완료` |
| 모든 건 완료 (파일 정리 질문 전) | `😸 전체 완료 — N건 신청` |
| 원본 신청완료 이동·임시 파일 정리까지 끝나 작업 종료 | `😻 작업 끝 — 남은 할 일 없음` |
| 오류가 나서 원인 잡고 계속 진행 중 | `🙀 오류 — <한 줄 원인>, 다시 시도합니다` |
| 막혀서 멈춤 (세션 만료·저장 실패·토큰 오류 등) | `🙀 중단 — <원인>` |
| 일부 건만 처리하고 끝남 (증빙 없음·다음 달로 미룸 등) | `😿 부분 완료 — N건 중 M건` |

## 전제 (환경)
- **환경 점검은 [`../_shared/environment_setup.md`](../_shared/environment_setup.md) 0단계를 따른다** — **경로별로 쓰는 창이 다르다(사용자에게 먼저 알린다)**:
  - **카드결제건 RPA 업로드(이 문서의 주 경로)** = **평소 쓰는 Chrome 창**(Claude in Chrome 확장; 카드/과제 조회) + **`token.txt`**(Dooray 개인 토큰, `<kiki_root>/token.txt`) + 포탈 `e.kist.re.kr` 로그인 + Dooray 로그인(업로드 결과 확인 페이지). **새 창 없음.**
  - **세금계산서 직접작성**(`references/tax_invoice_payment.md`) = **Claude 전용 새 Chrome 창**(chrome-devtools-mcp, 첨부 때문) → 그 창에서 포탈 로그인 **한 번 더**(평소 Chrome 로그인은 넘어오지 않는다고 미리 안내). 토큰 불요.
  - 공통: KIST 사내망(밖이면 VPN). Python 패키지(`Pillow`·`requests`·Windows 문서 변환 시 `pywin32`)는 **필요한 시점에** 확인·설치. 한글/MS Office 는 증빙이 hwp/docx/xlsx 일 때만 — 없으면 `scripts/convert.py --check` 로 확인 후 LibreOffice(docx/xlsx)·HOP(hwp 열람·PDF 내보내기, https://github.com/golbin/hop) 설치를 **물어본다**(0단계 5).
- 통합정보(카드·과제) = SSO 세션(토큰 불요) / dooray(업로드) = 개인 토큰. **별개 시스템·별개 인증.**
- **공통 개인정보**(카드책임자·담당 행정원·참여과제·사번)는 `~/.claude/kiki/kiki.config.json`(Codex 는 `~/.codex/kiki/`) 에서 읽는다 → `../_shared/personal_config.md`.

---

## 실행 준비 (매 작업 시작)
1. 브라우저 연결: `list_connected_browsers` / `select_browser`.
2. **통합정보 화면 1개 확보**: `tabs_context_mcp` → **먼저 `navigate('https://e.kist.re.kr')` 로 로그인 상태 확인(포털 메인이 떠야 함)** → `navigate` `http://p.kist.re.kr:8081/nxui/kistis/indexQ.jsp?target=mis.fam::fam_0711.xfdl&menuParam=sysCd%3DCUS` → 9초 대기(NEXACRO).
   - 로그인 페이지면(세션 만료) "KIST 통합정보에 로그인해 달라" 안내 후 중단.
   - 🔴 **순서 고정: 새 브라우저·새 날·`about:blank`·정오 이후엔 먼저 `navigate('https://e.kist.re.kr')` 로 로그인 상태를 확인하고, 포털 메인이 뜬 뒤에만 fam_0711 딥링크**. 딥링크를 먼저 열면 `Your session has expired` alert + 무한 로딩(사용자가 반복 지적한 실수, 2026-09-12).
3. **portal 코어 주입**: `scripts/portal_ops.min.js` Read → `javascript_tool` inject((주입은 주석을 뺀 `portal_ops.min.js` 를 쓴다 — 내용 동일, 글자 수 30~40% 적음. 원본 `portal_ops.js` 는 읽을 필요 없다)) → `window.kkPay.ready()` true 확인(=`authTk` 확보). false면 화면 로드 재시도, 그래도 안 되면 조회는 **좌표 fallback**(워크플로 4의 fetch→좌표 순서)으로 전환.
4. dooray 작업은 Bash 로 `scripts/dooray_drive.py`(토큰) 사용.

---

## 부트스트랩 (첫 설치 또는 "kk-pay 설정")

> 🐱 **키키 인사(정체성)**: 첫 실행의 첫 줄은 *"안녕하세요 🐱 kk-pay 를 준비할게요."* 한 줄, 그 다음부터는 평소 문체. 작업 보고의 첫 줄은 상황별 머리표: `😸 완료 — kk-pay`(정상) / `😻 완료`(확인할 것 없음) / `😼 완료`(사용자가 할 일 남음: 결재 상신·확인) / `😺 완료`(조회만 한 가벼운 작업) / `🙀 중단`(막혀서 멈춤, 상황 보고) / `😿 부분 완료`(일부만 처리). 제출 문서·적요·파일명·오류 문구에는 넣지 않는다. **지급신청 작업 중 시점별 머리표는 위 '보고 머리표' 표를 따른다.**

**0. 환경 점검** — `../_shared/environment_setup.md` 0단계(어느 창·로그인·`token.txt`; python 패키지는 필요 시점에).
**공통 식별정보는 먼저 `~/.claude/kiki/kiki.config.json` 에서 읽는다**(이미 있으면 재질문 X). 없는 공통 항목만 물어 거기 저장(다른 skill 재사용). kk-pay 고유만 `kk-pay.config.json`. (`../_shared/personal_config.md`)

1. **RPA 업로드 사용 여부** *(kk-pay 고유 `uploadScope`)* — *"카드결제건을 Dooray 드라이브에 올려 RPA 로 지급신청할까요(권장)? 세금계산서 직접작성만 쓸 거면 '아니요'."* 예면 1-a~1-c, 아니요면 토큰·행정원 폴더 없이 2 로.
   - 1-a. **dooray 토큰** *(공통, `token.txt`)* — `<kiki_root>/token.txt`(예 `C:\kiki\token.txt`) 가 비어 있으면 **절대경로를 보여주며** 안내: 발급 `https://kist.gov-dooray.com/setting/api/token` → 파일의 `Dooray token:` **다음 줄**에 붙여넣고 저장 → "두레이 토큰 저장했다". ⚠️ **채팅에 토큰을 붙여넣지 말라고 항상 경고**(대화 기록에 남아 노출). 넣었다고 하면 `python scripts/dooray_drive.py check --live` 로 확인(값은 출력하지 않고 길이·파일 위치 + 실제 인증 결과만 나온다 — 파일을 Read 하지 말 것. 토큰이 없으면 종료 코드 1, 만료면 `ERR … 401`). 폴더 링크를 받은 뒤엔 `check --live <폴더링크>` 로 그 폴더 접근까지. 원하면 파일을 열어준다(`notepad`/`open -e`). (구형 `kiki.env` 도 읽힘)
   - 1-b. **담당 연구행정원** *(공통 `payment_admin`)* — 옵션1(권장) **폴더 링크 붙여넣기** → folderId / 옵션2 **이름 검색**(`dooray_drive.find_admin_folder`, "최대 5분" 진행표시). 후보 복수면 1개 선택.
   - 1-c. **업로드 범위 분기** *(kk-pay 고유)* — 행정원 폴더 구조 자동파악 후: 세금계산서·회의비 별도 폴더 있으면 "따로 업로드?" / 없으면 "어디까지 RPA?".
2. **카드책임자** *(공통 `card_holder`)* — 보통 본인(fam_0711 조회 키). 사번은 묻지 않고 fam_0711 화면 `ds_search.SEARCHID` 에서 읽어 kiki.config 에 저장한다(채팅에 출력하지 않음, 확인이 필요하면 `00****` 마스킹). 카드책임자가 본인이 아니면 이름만 묻고 사번은 fam_0711 화면에서 이름 Enter 로 확인.
3. **수행과제 확인** *(공통 `projects`)* — 지급신청할 **과제번호가 필요하므로 포탈에서 참여과제를 파악**한다: `window.kkPay.queryProjects()` 자동수집 → "이 과제들 맞나요?(전부/일부/추가)" → kiki.config 캐시.
4. **PC 영수증 저장 폴더 경로** *(kk-pay 고유 `receiptFolder`)*.

→ 공통(1-a·1-b·2·3) = `kiki.config.json`/`token.txt` / kk-pay 고유(1·1-c·4) = `kk-pay.config.json`.

---

## 작업 워크플로 (지급신청 실행)
> **"세금계산서 처리하자"** → 영수증 폴더(또는 사용자가 준 경로)에서 세금계산서 건만 모은다. 설정 `uploadScope.taxInvoice` 가 true 면 아래 1~8(RPA 업로드), false(기본)면 세금계산서 직접작성(`references/tax_invoice_payment.md`, 새 Chrome 창). 물품 100만원 이상이면 검수(kk-inspect)가 먼저인지 확인한다. 카드 건까지 함께 말하면("지급신청하자") 전부 아래 흐름으로.
1. **영수증 폴더 스캔** — config `receiptFolder`(또는 사용자 지정 폴더)의 증빙 파일 목록 파악.
2. **형식 전처리** — `python scripts/convert.py <파일>`(모듈로는 `ensure_uploadable()`) 로 jpg/pdf 보장(이미지→jpg, 여러 쪽 tif→pdf, 문서→pdf). 원본은 그대로 남고 같은 이름이 있으면 `_변환` 이 붙는다(필요 없는 원본 정리는 8 단계에서 confirm 후 `--trash`). **변환 시 "X→Y 변환함" 알림.** 실패 시 수동 안내. 변환 엔진(한글/Office/LibreOffice)이 없으면 `convert.py --check` 로 확인하고 무료 대안 설치를 **물어본다**(0단계 5). Windows 외 OS 는 docx/xlsx→pdf 만 자동(LibreOffice), hwp 는 수동.
3. **건별 과제·비목 확정 (사용자와 함께)** — 각 증빙에 대해:
   - 과제: config 캐시 목록에서 선택(과제명으로 말해도 매핑).
   - 비목: **3단 조회** — ① `references/expense_category.md`(자주 쓰는 것·판단 원칙)로 1차 제안 → ② 애매하면 `references/expense_category_table.md`(전체 41비목·증빙·한도·집행가능 lookup)에서 정확히 찾기 → ③ 그래도 모호하면 `references/dooray_wiki.md`로 wiki 실시간 검색 → **사용자 확정**. (소모성 우선·외화 환산금지 등 규칙 적용)
   - **증빙·검수·반려 점검**: `references/payment_request_manual.md`(재무팀 공식 매뉴얼)로 해당 비목의 **필수 증빙**(거래명세서 항목·온라인 배송지·결제대행 별도전표), **선행 검수**(100만원↑ 모바일검수 / 50만원↑ 정보화기기 / 소액물품 300만↑ 구매요구), **집행 한도·반려 예방**(회의비 1인5만·심야금지, 이어폰10만 등 한도, 계정책임자·부서협조 누락) 확인 → 미충족이면 사용자에게 보완 안내. 애매하면 매뉴얼 원문 링크로 최신 확인.
   - 카드 종류: **법인/연구비** 확인(법인=`CARDTYPECD` 5, 연구비 3).
4. **카드 건 승인번호 조회** — 2-스텝: `window.__c=null; window.kkPay.queryCards({fromDt,toDt,cardType,empno,custnm}).then(r=>window.__c=r, e=>window.__c={error:String(e)}); 'started'` → 다음 호출에서 `window.kkPay.fmtCards(window.__c, 0, 15)`(`javascript_tool` 은 비동기 결과를 `{}` 로 돌려주고 8자리 숫자·`=` 를 가리므로 — 승인번호는 `1234-5678` 꼴로 보인다). `empno` 는 필수(kiki.config `card_holder.empno`). 반환 항목 `{date, custnm, amount, apprno, status, holder(카드책임자), cancel(취소액), card4(카드 뒤 4자리)}` — 카드번호 전체는 돌아오지 않는다. 거래처·금액·날짜·`holder` 로 매칭해 `apprno` 확보. **외화는 임의 환산 말고** `USEAMT`(원화청구액) 그대로. (세금계산서·회의비는 승인번호 없음)
   - ⭐ **fetch 실패 시 좌표 fallback 자동 시도** (authTk 없음 / 빈 결과 / HTTP 에러 / 코어가 `PORTAL:` 오류를 던지면 먼저 `e.kist.re.kr` 로그인·탭 새로고침·재주입): `references/kist_portal_fetch.md` 의 좌표 절차(화면 캡처 + `zoom` 으로 칸 위치를 찾아 입력·Enter·조회버튼·grid 읽기)로 **재시도**. **시도 순서 = fetch → 좌표, "어떻게든 성공"이 목표.** 둘 다 실패할 때만 화면을 캡처해 사용자에게 보여주고 안내(조용히 멈추지 말 것). 과제목록 조회도 동일.
5. **파일명 규칙 변환 — 스크립트로**: 확정된 값(파일·계정·항목·비목·승인번호·카드책임자·내용·kind·같은 건 묶음 `group`·통장사본 여부)을 `items.json` 에 적고 `python scripts/kk_pay_files.py plan items.json` 으로 계획표(`계정_항목_비목_카드승인번호_카드책임자]내용`; 세금계산서는 승인번호 없이 `계정_항목_비목_이름]내용`; 같은 건 여러 파일은 ` (1) (2)`; 통장사본은 `_통장사본`)를 **사용자에게 보여 confirm** → `apply items.json`(같은 폴더에서 이름 변경. 규칙 위반·같은 이름이 하나라도 있으면 **아무것도 바꾸지 않고**, 도중에 실패하면 바꾼 것을 되돌린다; 다시 돌려도 이미 바뀐 건은 건너뛴다). 이름은 **80자 이내(확장자 제외)** — 넘으면 plan 이 내용을 줄이라고 표시한다. `items.json` 경로는 `C:/…` 꼴로(Git Bash 의 `/c/…` 도 된다). 카드영수증+주문내역이면 주문내역만 올린다. 셸에서 직접 rename 하지 않는다(`]`·공백 함정).
6. **업로드 (confirm 후)** — `python scripts/dooray_drive.py upload <폴더id|폴더링크> <파일…>`(모듈로는 `DoorayDrive().upload(folder_id, path)`). 올리기 전에 **모든 파일의 RPA 파일명 규칙(계정_항목_비목_…, 80자, jpg/pdf)을 검사해 하나라도 어긋나면 아무것도 올리지 않는다**(규칙과 다른 이름 — 예: 행정원에게 보내는 안내 파일 — 을 일부러 올릴 때만 `--any-name`). 마지막 줄 `[요약] 업로드 N건`. 유형별 폴더(카드=root / 세금계산서=하위 또는 동일, 1-c 분기대로). **RPA 비대상 비목(회의비·전문가활용·전화료·전기료·도서비·용역·공사 — `rpa_payment_filing.md` §1)은 올리지 않고** 회의비는 kk-meet, 나머지는 직접작성·행정원 안내로. 업로드 = **RPA 자동 기안 트리거**임을 알리고 confirm.
7. **업로드 결과 웹 확인 (필수 — 텍스트 '완료'만 통보 금지)** — 업로드 직후 **행정원 폴더의 dooray 드라이브 웹페이지를 브라우저에 띄운다**: `navigate` → `https://kist.gov-dooray.com/drive/3311002956353796322/{folderId}` (projectId `3311002956353796322` 는 전 KIST 공통, `{folderId}` = 담당 행정원 폴더 id). 올라간 파일 목록을 사용자가 **눈으로 확인**하게 하고, 방금 올린 파일명이 다 보이는지 대조한다. (사용자 피드백 2026-07-07: "다 했다고만 하지 말고 dooray 드라이브 웹페이지를 띄워 보여줄 것")
8. **처리완료 정리 — 스크립트로** `python scripts/kk_pay_files.py archive items.json --base <그 달 영수증 폴더> --dry` 로 계획을 보이고 confirm 후 `--dry` 없이 실행(파일 단위 이동, 같은 이름은 ` (2)`, GoogleDrive 동기 폴더 안전). ⭐ **카드·세금계산서 모두: 실제 쓴 원본 증빙을 `영수증폴더/{월}/신청완료/…/{과제번호}/` 로 이동(move)** = 신청완료 사본은 **증빙으로 반드시 보존**하고, 원래 폴더에서는 이동으로 제거된다. 🔴 **신청완료 폴더의 파일을 삭제하지 말 것**(2026-09-12 오해로 카드 건 13개를 지웠다가 복원 — 사용자: "신청완료한 것 증빙으로 남겨둬야 해"). 다음 달에도 붙일 문서(변경요청서 등)만 원래 폴더에 남긴다. 과제별 분류 규칙:
   - **카드**: 법인카드 = `신청완료/법인카드/{과제}/`, 연구비카드 = `신청완료/연구비카드/{과제}/`(items.json `card_kind` 는 `법인`/`연구비`, 폴더 이름에 '카드'가 붙는다 — 2026-10-01 사용자 확정) + 파일명 **RPA 업로드명 그대로**(`{계정}_{항목}_{비목}_{승인번호}_{카드책임자}]내용`). 업로드 안 한 물품사진·Npay 일괄전표는 root 유지.
   - **세금계산서**: `신청완료/세금계산서/{과제}/` + **원본명 유지**(세금계산서+거래명세서 건별). 물품사진·zip 은 원본 거래처 폴더 유지.
   - ⚠️ GoogleDrive 동기 폴더면 **폴더 통째 Move 금지 → 하위 폴더 만들고 `Move-Item -LiteralPath`(macOS/Linux `mv -- "파일" "폴더/"`) 파일 단위 이동**(파일명 `]`·연속공백 주의), 안 그러면 `{월} (1)` 충돌 사본 발생. mode("그대로 둘까/복사/이동?")는 첫 **2~3회만 묻고, 답이 일관되면 학습(config `moveOrCopy`)해 이후 자동.**

---

## 결과 점검 (스크립트·코어 결과를 쓰기 전)
공통 3줄은 `../_shared/environment_setup.md` '결과 점검' 절(요약 줄만 대조 → 어긋나면 원인 고쳐 1회 재실행 → 그래도 안 되면 수동 경로 + 사용자에게 알림). 이 skill 의 기대치:
- `fmtCards` 첫 줄이 `ERR …` 면 오류(`PORTAL:` = 세션 만료 → 로그인·탭 새로고침·재주입 1회), `(결과 없음 …)` 이 이어지면 호출에 오류 처리가 빠진 것. 머리줄 `[… of N]` 에서 N 이 0이면 기간·사번·카드종류(5/3)를 확인해 1회 재조회. 매칭 안 된 증빙은 사용자에게 보인다.
- `kk_pay_files.py` 는 마지막 줄 `[요약]` 만 본다: plan `점검 필요 0` 일 때만 `apply`, apply `이름 변경 N건`, archive 는 `--dry` 의 `이동 계획 N건` 을 보이고 confirm 후 실행(같은 items.json 그대로 — 바뀐 새 이름을 스스로 찾는다). archive 는 옮기기 전에 전부 검사한다(파일·과제번호 형식·`card_kind` 법인|연구비·목적지가 신청완료 안·같은 파일 두 번) — `ERR 옮기기 전 검사에서 걸려 아무것도 옮기지 않았습니다` 면 그 항목을 고쳐 다시, 옮기다 실패하면 이미 옮긴 것을 되돌리고 `되돌림 k/n` 을 찍는다.
- `dooray_drive.py upload` 는 `[요약] 업로드 N건` 이 올린 파일 수와 같아야 하고 웹 확인(7단계)까지. `ERR 올리지 않았습니다 —` 면 파일명부터 고친다. `convert.py` 는 `ok:false` 의 `manual` 문구를 그대로 사용자에게.

## 안전 규칙 (필수)
- **모든 쓰기(업로드·파일이동·rename)는 사용자 confirm 후.** 분류·제안만 자동.
- **업로드 = RPA 자동 기안**(매일 10/15/22시 배치) → 실제 결재 발생. 건수·과제·금액 보여주고 confirm.
- **비목은 제안만, 확정은 사용자·행정원.** 1차 판단은 `expense_category.md`, 애매하면 wiki.
- **물품 100~300만원은 소액검수(mcs_0003) 선행** 필요 — 미검수면 RPA 보류. 해당 시 안내.
- **외화 금액 임의 환산 금지** — fam_0711 `USEAMT` 그대로.
- **토큰·사번·카드번호는 skill·repo 에 저장 금지.** 토큰은 `token.txt`(로컬 파일 — 채팅 붙여넣기 X), 사번은 config(로컬), 카드번호는 조회로만(저장 X).
- 행정원 폴더 파일 **삭제는 하지 않는다**(권한·감사). 업로드만. 성공 시 RPA/dooray 가 자동 정리.

---

## config (`~/.claude/kiki/kk-pay.config.json`)
- repo 밖, 사용자 home(`~/.claude/kiki/`, 형제 skill 공유). `kk-pay.config.example.json` 참고.
- 내용: 업로드 범위(`uploadScope`)·별도폴더(`separateFolders`)·영수증 폴더(`receiptFolder`)·이동/복사 선호(`moveOrCopy`, 학습). 카드책임자·행정원 폴더·수행과제는 공통 `kiki.config.json`.
- **토큰은 config 아닌 `<kiki_root>/token.txt`.** 민감정보(카드번호 등) 저장 금지.

## 참고 문서
- `scripts/kk_pay_files.py` — 파일명 규칙 계획·적용·처리완료 이동(`plan/apply/archive`). `scripts/convert.py` — 형식 변환(`--check`, `--trash`). `scripts/dooray_drive.py` — `check [--live [폴더]]/find/structure/upload [--any-name]`. `scripts/portal_ops.js`(주입은 `.min.js`) — 카드·과제 조회·`fmtCards`.
- `references/payment_request_manual.md` — ⭐ **재무팀 공식 지급신청 매뉴얼**(Dooray Wiki 원문 스냅샷 + 빠른참조). 비목별 증빙·검수·집행기준·반려사항·계정코드·과세/국외소득 + 첨부양식 10 file_id + 원문 링크. 증빙·검수·반려 점검의 1차 권위(규정 개정 시 원문 링크로 최신 확인).
- `references/expense_category.md` — 비목 매핑·증빙·한도·파일명·외화·RPA운영 통합(1차 판단).
- `references/rpa_payment_filing.md` — ⭐ **RPA 지급신청 운영 사양**(재무팀 wiki 「7.RPA 지급신청 안내」 정제). RPA 대상(카드+**세금계산서**)/비대상(회의비·전문가활용·전화료·전기료·도서비·용역·공사)·파일명(카드/세금계산서 국세청승인번호/`_통장사본`/복수`(1)(2)`)·계좌 OCR+자주사용계좌·수행시간(10/15/22시,1건4분)·결재선(신청자→계정책임자전결)·결과(성공=폴더파일삭제/실패=잔존+메일)·실패사례 + 전화료/전문가활용 RPA. **세금계산서도 RPA 대상**(계좌 실명검증을 RPA OCR가 우회).
- `references/tax_invoice_payment.md` — ⭐ **세금계산서 직접 지급신청서 자동작성**(fam_0701 일반 → fam_0702: 영수증함 매핑·적요·계정 popBudgList·사용구분·검수 연결·통장표기 KIST_·행추가 묶음·첨부·계좌검증·상신까지 **2026-07-08 end-to-end 실증 완료** — WIP 해제). ⭐⭐ **`§0-0 실전 순서` + `§0-1 확인창(dialog) 처리` 먼저 읽기**. 핵심 6: ① **첨부 있으면 처음부터 chrome-devtools**(§0-0 1) ② **과제 다르면 신청서 분리 — `bt_reset` 금지→`bt_close` 후 `doNew`**(§0-0 5·§10) ③ **첨부 = chrome-devtools `upload_file`+`_input_node` adoptNode**(§9-1-A, gfn_upload 후 ds_files=0이면 재시도) ④ **계좌 실명검증 = `import2` divForm 컨텍스트, `TRANSFERSTAT_DESC='정상처리'`**(§8-0, 상신 필수·`Static00` 부정확) ⑤ 🔴 **저장·계좌검증 확인창은 fam_0702 *별도 page* 를 `select_page` 한 상태라야 `dialogAction`/`handle_dialog` 로 잡힌다**(§0-1 — 이거 몰라 한참 헤맴) ⑥ **결재상신은 사용자가 직접, 신청서 하나 완성될 때마다 상신 안내**(§0-0 9). (전각공백/괄호 예금주 통과, 공휴일 제약도 오인이었음.) (RPA 폴더 업로드 경로와 별개의 '직접 작성' 경로)
- `references/kist_portal_fetch.md` — 통합정보 fetch backend 명세(endpoint·ds_search·authTk·함정·좌표 fallback).
- `references/dooray_folder.md` — 행정원 폴더 조회(링크/이름검색·본부약어·캐시·성능).
- `references/dooray_wiki.md` — 비목·규정 wiki 실시간 검색.
- `../_shared/security_policy.md` — 보안 규약(C1~C5). `../_shared/dooray_wapi.md` — wapi 공통.
- `../_shared/rule_changes.md` — ⭐ **규정 변경표**(옛 값 → 현행 값: 회의비 1인 3만→5만원, 정산과제 외부인 = 과제 미참여자, 사전 내부결재 폐지 26.8.1, 모바일검수 기준, 임상시험 피험자 사례비 소득세 …; 원천세는 지급 유형별로 달라 거주자 자문료 8%·피험자 사례비 20% 가 둘 다 현행 — 표 아래 '헷갈리기 쉬운 현행 값'). 위키 첨부·옛 PDF(길라잡이 2024·행정원 지침서 2021)의 값이 kk-wiki 검색에 섞여 나오면 **이 표의 현행 값을 앞세우고** 옛 값은 `(구버전 2021: 3만원)` 로만. 현행의 1차 근거는 항상 `payment_request_manual.md`(재무팀 위키 스냅샷).
- `../_shared/nexacro_file_upload.md` — ⭐ **NEXACRO `ExtFileUpload` 첨부 자동화 공통 가이드**(2026-06-07 codex 해법). kk-pay·kk-meet·kk-inspect 공유. fam_0702 특화 적용은 `references/tax_invoice_payment.md` §9-1.
- **실패 시**: portal 은 `kkPay.ready()`(authTk) 확인 → 코어 1.1 부터 응답이 XML 이 아니거나 `ErrorCode<0` 이면 `PORTAL:` 오류를 던진다(세션 만료 → 로그인·새로고침·재주입) → 빌드 TODO(chkPopupValueSetting body)면 DevTools 캡처. dooray 는 토큰(`token.txt`)·rate limit(429) 확인.
