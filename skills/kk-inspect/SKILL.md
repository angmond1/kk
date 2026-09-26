---
name: kk-inspect
description: KIST 통합정보시스템 소액검수신청(검수신청관리, mcs_0003)을 반자동 처리하는 skill. 거래명세서·세금계산서·카드영수증(법인/연구비카드) 증빙을 파악해 품목·금액·수량을 추출하고, 자산/비자산을 보수적으로 판정하고, 외화결제는 카드영수증조회(fam_0711)에서 확정 원화를 조회하고, Chrome MCP로 검수창에 자동 입력·파일첨부한 뒤 사용자가 최종 신청(저장)만 confirm 하도록 안내한다. "검수신청", "소액검수", "물품검수", "검수 올려줘/처리해줘", 증빙 폴더 경로 제시, 법인카드/연구비카드 결제건 검수, 세금계산서 검수 등의 상황에서 반드시 사용. KIST 연구원이면 누구나 자기 config로 사용 가능. 대상은 100~300만원 물품 및 무형(SW/외화) 결제.
---

# kk-inspect — KIST 소액검수신청 자동화

KIST 통합정보시스템의 **소액검수신청 (검수신청관리, `mcs_0003`)** 을 반자동 처리한다. 증빙을 파악해 검수창에 입력·파일첨부까지 자동으로 하고, 최종 신청(저장)만 사용자가 confirm 한다. KIST 연구원이면 누구나 자기 `~/.claude/kiki/kk-inspect.config.json`(repo 밖)으로 쓸 수 있게 설계됐다 — skill 본체에는 어떤 개인정보도 들어있지 않다.

## 결과 점검 (스크립트·코어 결과를 쓰기 전)
공통 3줄은 `../_shared/environment_setup.md` '결과 점검' 절(요약 줄만 대조 → 어긋나면 원인 고쳐 1회 재실행 → 그래도 안 되면 수동 경로 + 사용자에게 알림). 이 skill 의 기대치:
- `convert_evidence.py` 마지막 `[요약]` 줄에서 실패가 0 이어야 한다. 실패 파일은 이유를 사용자에게 보이고 첨부에서 제외.
- `rename_evidence.py` 는 `개명 저장:` 한 줄과 파일 존재를 확인. fam_0711 조회에서 본인 건이 0건이면 카드종류(5/3)·카드책임자를 바꿔 1회 재조회.
- 검수창 입력 뒤 4단계 검증 JSON 이 기대값(검수일=다음 영업일, 지역·건물, 취득가)과 같아야 신청 안내로 넘어간다.

## ⛔ 안전장치 (항상 지킬 것)
이 규칙들은 KIST 포털 정책과 직결되니 예외 없이 지킨다.
- **신청(저장)은 사용자 본인** confirm 후. 결재성 저장은 본인 원칙. **파일첨부는 자동화 가능** (2026-06-07 codex + 2026-06-19 chrome-devtools-mcp 단일채널 실증): mcs_0003_pop2 는 `window.open` 별도 chrome page → 공통 가이드 [`../_shared/nexacro_file_upload.md`](../_shared/nexacro_file_upload.md) **§4 패턴 B + §4-6**. **★권장 = chrome-devtools-mcp 한 채널**(자체 격리 Chrome 에 KIST 1회 로그인 후 `navigate_page`/`select_page`/`take_snapshot`→`upload_file`). ⚠️ `upload_file` 은 **cwd workspace root 안 파일만** → 증빙이 밖(`D:\…`)이면 cwd 하위로 복사. 컴포넌트 = `fileDiv1`. 상세: `references/mcs0003_fields.md` "파일첨부 자동화" 절.
- **개인정보는 `~/.claude/kiki/kiki.config.json`(공통)·`kk-inspect.config.json`(고유) — repo 밖 — 에만** 둔다. 이름·사번·연락처·행정원 등은 config에서 읽고, 화면·로그·이 skill 파일에 적지 않는다.
- 계좌·카드번호 등 금융정보는 사용자가 직접. skill이 입력하지 않는다.
- **화면은 한글이름(코드)** 로 부른다 — 소액검수신청(mcs_0003), 카드영수증조회(fam_0711). 내부 코드만 단독으로 쓰지 않는다. (`references/screen_codes.md`)
- 형제 공통 규약 `../_shared/security_policy.md` 준수 — credential·개인식별자 skill 텍스트 금지, 모든 쓰기 confirm 후, config·token 은 `~/.claude/kiki/`(repo 밖)+gitignore.

## 환경 전제
- **환경 점검은 [`../_shared/environment_setup.md`](../_shared/environment_setup.md) 0단계를 따른다** — **Claude 전용 새 Chrome 창**(chrome-devtools-mcp 한 채널로 입력·첨부·신청 전부; 별도 window 팝업 mcs_0003 은 이걸로만 첨부 — 미등록 시 입력까지만·첨부는 사용자 수동, `../_shared/nexacro_file_upload.md` §4-6) + **그 창에서 통합정보 SSO 로그인 한 번 더**(포탈 `e.kist.re.kr` → 업무화면 `p.kist.re.kr:8081`; 평소 Chrome 의 로그인은 넘어오지 않는다고 미리 안내, 본인 로그인·Claude 자동로그인 금지) + KIST 사내망(밖이면 VPN). python `Pillow`(+ pdf→jpg 시 `PyMuPDF`)는 **증빙 변환 직전에** 확인·설치. 토큰 불요. **조회·입력·첨부는 자동, 최종 신청은 사용자 confirm.**
- 공통 개인정보(이름·사번·연락처·위치·담당 행정원·참여과제)는 `~/.claude/kiki/kiki.config.json` 에서 읽는다 → `../_shared/personal_config.md`.

---

## 1단계 — 최초 1회 setup

> 🐱 **키키 인사(정체성)**: 첫 실행의 첫 줄은 *"안녕하세요 🐱 kk-inspect 를 준비할게요."* 한 줄, 그 다음부터는 평소 문체. 작업 보고의 첫 줄은 상황별 머리표: `😸 완료 — kk-inspect`(정상) / `😻 완료`(확인할 것 없음) / `😼 완료`(사용자가 할 일 남음: 결재 상신·확인) / `😺 완료`(조회만 한 가벼운 작업) / `🙀 중단`(막혀서 멈춤, 상황 보고) / `😿 부분 완료`(일부만 처리). 제출 문서·적요·파일명·오류 문구에는 넣지 않는다.


**0. 환경 점검** — `../_shared/environment_setup.md` 0단계.

공통 개인정보는 **`~/.claude/kiki/kiki.config.json`** 에서 읽는다(이미 있으면 재질문 X). 없거나 빈 항목만 순서대로 물어 거기 저장(다른 skill 재사용) — **개인정보라 로컬에만, git/메모리에 안 올림**. 질문할 때 이 사실을 함께 말한다(*"이름·사번·연락처는 검수창 자동입력용이며 이 PC 의 config 에만 저장되고 채팅에 다시 출력하지 않습니다"*):
- `user`: 이름 · 사번(6자리) · 연락처
- `location`: 지역(본원=`LABT_00` / 강릉=`LABT_01` / 전북=`LABT_02`) → 건물(`references/code_tables.md` → `BD_xxx`) → 호실. **첫 실행 때 반드시 한 번 확인**(템플릿은 비어 있음 — 강릉·전북 사용자가 본원으로 신청되는 일 방지). 2-6 확인표에도 지역·건물·호실을 함께 보여준다.
- `payment_admin.name`: 지급신청 담당 연구행정원(검수창 자동검색용)
- `projects`: **(자동)** 통합정보 프로젝트(연구관리) 화면에서 참여 과제(번호+명) 수집. "과제 갱신" 시 재수집.

kk-inspect 고유(`kk-inspect.config.json`): **검수 파일 폴더**(기본 `{kiki_root}\inspect`, 예 `C:\kiki\inspect` / macOS·Linux `~/kiki/inspect`).

검수신청자 본인 정보는 검수창에 NEXACRO 가 로그인 사용자로 자동 채우기도 하지만, kiki.config 값으로 대조·보정한다.

---

## 2단계 — 검수 작업 (사용자가 "검수신청하자" 등으로 요청 시)

증빙이 모인 폴더(기본 `{kiki_root}\inspect`)를 기준으로 아래 흐름을 따른다. 결제건이 여러 개면 **하나씩 순차** 처리한다.

### 2-1. 증빙 파악
폴더의 PDF(세금계산서·거래명세서·카드영수증)를 읽어 **품목·규격·수량·단가·합계·거래일·거래처**를 추출한다. 품명/수량/단위 규칙은 `references/evidence_rules.md`.

### 2-2. 세금계산서 vs 카드결제 분류 + 원화 확정
- **세금계산서 건**: 세금계산서의 **합계금액(공급가액+VAT)** 이 원화 취득가액.
- **카드결제 건**: 카드영수증/명세는 환산액이 잠정치다. 반드시 **카드영수증조회(fam_0711)** 에서 카드책임자=사용자 이름으로 **법인카드+연구비카드 둘 다 조회** → 폴더 증빙(거래처·금액·날짜)과 대조해 맞는 건을 찾고, 그 행의 **`USEAMT`(확정 원화)** 를 취득가액으로 쓴다. 절차는 `references/fam0711_fx.md`.

### 2-3. 자산/비자산 판정 (보수적)
`references/asset_classification.md`의 기준으로 품목별 판정한다. **핵심 철학: 소액검수는 대부분 비자산이다. 보수적으로 — 웬만하면 비자산으로 자동 진행하고, 자산으로 볼 근거가 뚜렷할 때만 "이건 자산 같은데 맞나요?"라고 사용자에게 확인**한다. 비자산은 묻지 않는다.

### 2-4. 과제 선택
- **비자산**: 과제번호(지급계정) 기입 **불필요** — 생략.
- **자산**: 과제번호 **필수**. config 의 참여 과제 리스트를 보여주고 이 결제건을 어느 과제로 처리할지 물어본다.

### 2-5. 검수창 입력 (Chrome MCP)
소액검수신청(mcs_0003) 화면을 열고 팝업을 포획해 입력한다. 비자산은 `ds_main_NOT_ASST_INFO`, 자산은 `ds_main_ASST_INFO`. 필드맵·Chrome MCP 절차·주의사항(승인번호 미입력, 신청일시 공휴일 회피 등)은 `references/mcs0003_fields.md`.

### 2-6. 확인 요청
입력값(품명·금액·수량·취득일·지급신청자 등)을 표로 정리해 **"맞는지 확인"** 을 요청한다.

### 2-7. 첨부 + 신청
- **첨부**: 세금계산서/거래명세서 PDF + 물품 사진 JPG (또는 카드명세서 jpg + 영수증). png/jpeg는 미리 jpg로 변환(`scripts/convert_evidence.py`), 무의미한 파일명은 개명(`scripts/rename_evidence.py`). → **자동 첨부** 가능 ([`../_shared/nexacro_file_upload.md`](../_shared/nexacro_file_upload.md), 별도 window 처리). 사용자에게 파일 절대경로·개수·대상 행을 표로 보여주고 confirm 후 진행.
- **신청 버튼**: 결재성 동작이라 **사용자가 직접** 누르고 **신청완료** 확인. (저장 성공 시 팝업 자동 닫힘.)

### 2-8. 다음 건
결제건이 더 있으면 2-1로 돌아가 순차 처리한다. 검수창 팝업은 한 건 저장 시 닫히므로 다음 건은 팝업 열기부터 다시 한다.

### 2-9. 폴더 정리
모든 건 완료 후, 폴더의 파일들을 **`{kiki_root}\inspect\{yymmdd}`** 로 옮길지 물어본다. 승인하면 **폴더구조·파일명을 그대로 유지**한 채 이동한다. (yymmdd는 처리일.)

---

## 무형 SW / 외화 — 주의
- 무형 SW(AI 클라우드·라이선스)의 검수 대상 여부·방법은 규정상 회색지대다. **자산 SW는 1천만원 이상만** 자산이고, 카드 소액결제 SW는 보통 비자산으로 처리하지만, **검수가 필요한지/어떤 방식인지 애매하면 담당 행정원에게 확인을 권**한다(단정하지 않는다).
- 외화는 위 2-2대로 반드시 카드영수증조회(fam_0711) 확정 원화를 쓴다.

## reference 파일 (필요할 때 읽기)
- `references/mcs0003_fields.md` — 소액검수신청 검수창 필드맵(비자산/자산) + Chrome MCP 절차 + 재사용 JS
- `references/asset_classification.md` — 자산/비자산 판정 기준·보수적 지침·분류 코드
- `references/fam0711_fx.md` — 카드영수증조회(fam_0711) 외화 확정원화 조회법
- `references/evidence_rules.md` — 증빙(세금계산서/거래명세서) 파악·품명·단위 규칙
- `references/screen_codes.md` — 화면 한글이름 ↔ 내부 코드 매핑
- `references/code_tables.md` — 지역·건물·단위 코드표

## scripts
- `scripts/convert_evidence.py` — png/jpeg/bmp/tiff/webp/gif → jpg 변환(원본 유지, 같은 이름 있으면 `_conv`, 회전·투명 배경 반영, 여러 쪽 tif 는 쪽마다), pdf → jpg(필요 시). pdf는 그대로 둠.
- `scripts/rename_evidence.py` — 무작위 파일명을 `{YYMMDD} {금액} {내용} 카드영수증.jpg` 식으로 **복사**(원본은 남김, 같은 이름 있으면 거부). 필요 없는 원본은 사용자 confirm 후 `--trash`(휴지통, 복구 가능).
