---
name: kk-rdp
description: |
  키키(KIST 행정 도우미)의 원격접근도구(RDP) 사용신청 기능 — "키키야"처럼 키키·키키야·키키씨·김키키·김키키씨·김키키야·네코짱·네코쨩·야옹이·고양이·냥이·냥냥이 로 불러도 된다(문장 맨 앞 부르는 말은 요청에서 빼고 읽는다).
  통합정보 경영정보 > 사이버보안 > 보안정책예외처리신청서 > 원격접근도구 사용신청(etc_3030)을 매달 반복 처리한다 — 지난 신청에서 사용기간을 이어 잡고(재신청은 지난 종료일 다음 날, 신규는 내일부터 한 달), 보안서약서 서명 날짜를 오늘로 고쳐, 신청사유·관련과제·접근대상(위치·OS·IP·포트·MAC)을 채우고 보안서약서와 과제 연구계획서를 첨부한다. 저장·결재상신은 확인 후(보통 사용자가 직접).
  트리거: "키키야 원격접근 신청해줘", "RDP 사용신청", "원격접근도구 사용신청", "원격 연장 신청", "원격데스크톱 재신청", "보안정책 예외 신청", "이번 달 원격 신청", "kk-rdp".
---

# kk-rdp — 원격접근도구(RDP) 사용신청

> 🐱 **부르는 말**: 키키·키키야·키키씨·김키키·김키키씨·김키키야·네코짱·네코쨩·야옹이·고양이·냥이·냥냥이 로 시작하는 요청도 이 skill 로 처리한다(고양이·냥이·야옹이처럼 흔한 말은 문장 맨 앞에서 부를 때만). 문장 맨 앞의 부르는 말은 요청에서 빼고 읽는다. 이 skill 일이 아니면 [`../_shared/kiki_call.md`](../_shared/kiki_call.md) 표에서 맞는 kk skill 로 넘긴다.

원격접근도구 사용 허가는 **한 달 단위**라 매달 재신청한다. 내용은 거의 같고 바뀌는 건 **사용기간**과 **보안서약서 서명 날짜**뿐 — 그래서 지난 신청을 읽어 그대로 이어 쓴다. 화면 구조·함정은 [`references/etc_3030.md`](references/etc_3030.md).

## 정보 5분류 (개인정보 격리)
- **내장(A)**: 화면 조작 코어 `scripts/rdp_ops.js`(목록·기간 계산·신청서 채우기·첨부 input), 서약서 날짜 고치기 `scripts/update_pledge_date.py`.
- **런타임조회(B)**: 지난 신청 목록·상세(사유·과제·접근대상·첨부 이름), 소속·연락처·부서보안관리담당자(포탈 자동).
- **환경준비(C)**: §1.
- **config(D)**: 신청사유·관련과제·접근대상·서류 폴더·서약서/증빙 파일명 → `~/.claude/kiki/kk-rdp.config.json`.
- **격리(E)**: 실제 IP·MAC·방 번호·과제·이름 → skill 텍스트에 0(예시는 자리표시).

## 1. 전제 (환경)
- **환경 점검은 [`../_shared/environment_setup.md`](../_shared/environment_setup.md) 0단계** — **평소 쓰는 Chrome 창**(Claude in Chrome 확장) + 포탈 로그인 + KIST 사내망(밖이면 VPN). 🔴 브라우저는 `mcp__claude-in-chrome__*` 만(내장 브라우저는 로그인 없음).
- 첨부는 확장의 `file_upload` 가 로컬 경로를 받으므로 chrome-devtools 불필요(파일 하나 10MB 미만일 때).
- 서약서 날짜 고치기는 **Windows + 아래아한글 + `pywin32`**(`update_pledge_date.py`). 한글이 없으면 사용자에게 서명 날짜만 고쳐 저장해 달라고 한 줄 부탁하고 이어 간다.

## 2. 실행 준비 (매번)
1. `tabs_context_mcp` → 새 탭이면 먼저 `navigate('https://e.kist.re.kr')` 로 로그인 확인(공지 팝업은 닫기) → 딥링크 `http://p.kist.re.kr:8081/nxui/kistis/indexQ.jsp?target=mis.etc::etc_3030.xfdl&menuParam=sysCd%3DCUS` → 9초 대기.
2. `scripts/rdp_ops.min.js` Read → `javascript_tool` inject(반환 `kk-rdp-portal/1.0 =^.^=`). 함수는 `await window.kkRdp.*` 로 부른다.
3. 코어가 `PORTAL:` 오류를 던지면(세션 만료 — 조회가 조용히 0건이 되고 화면이 영어로 바뀜) 1번부터 다시.

## 3. 첫 설정 (`kk-rdp 설정해줘`, 또는 config 없을 때 자동)
> 첫 줄 *"안녕하세요 🐱 kk-rdp 를 준비할게요."* 한 줄, 이후 평소 문체.
1. 준비(§2) → `await kkRdp.list()` → `kkRdp.fmtList()` 로 이력 보기.
2. 이력이 있으면 `await kkRdp.detail(0)`(가장 최근 건, 읽기만) → 사유·과제·접근대상·첨부 이름을 config 초안으로. 이력이 없으면 사용자에게 신청사유·관련과제·접근할 PC(위치·OS·IP·포트·MAC)를 묻는다 — PC 정보는 그 PC 에서 `ipconfig /all` 로 알려 줄 수 있다.
3. 서류 폴더(`docs_dir`, 기본 `{kiki_root}\rdp\`)에 **보안서약서**(포탈 신청서의 '보안서약서 양식 다운로드'로 받아 과제명·서명을 채운 hwp/hwpx)와 **증빙**(관련과제 연구계획서)을 두게 한다. 지난 신청 첨부 이름을 보여 주면 찾기 쉽다.
4. 초안을 표로 보여 주고 확인 → `~/.claude/kiki/kk-rdp.config.json` 저장(예시 `kk-rdp.config.example.json`).

## 4. 작업 (`원격접근 신청해줘` — 매달)
1. **기간**: `await kkRdp.list()` → `kkRdp.nextPeriod()` → `{gubun, sdate, edate, basis}`.
   - 재신청 = 지난 종료일 다음 날부터, 신규(이력 없음) = **내일**부터, 길이 = 시작 + 1개월 − 1일.
   - `lapsed:true`(지난 허가가 이미 끝남)면 내일부터로 잡았다고 한 줄 알린다.
   - 이미 이번 기간 신청이 목록에 있으면(같은 시작일) 멈추고 알린다 — 중복 신청 방지.
2. **보안서약서 날짜**: `python scripts/update_pledge_date.py "<docs_dir>\<pledge_file>" --pdf "{kiki_root}\_tmp\pledge_check.pdf"` → `OK <옛 날짜> -> <오늘>` 확인(원본은 `_history\` 에 자동 백업). 필요하면 PDF 첫 쪽을 그림으로 떠서 날짜·서명을 눈으로 확인. `(같음)` 이면 오늘 이미 고친 것.
3. **신청서 열기·채우기**: `await kkRdp.openNew()`(안내 팝업 '확인'까지) → `await kkRdp.fill({gubun, rereq_reason, sdate, edate, use_time, reason, projects, targets})`(config 값 + 1번 기간) → 반환값으로 칸마다 확인. 신청서는 **별도 창**으로 떠 있다고 사용자에게 알린다.
4. **첨부**(하나씩): `kkRdp.exposeInput()` → `find("kk file upload")` 로 ref → `file_upload(ref, [<docs_dir>\<pledge_file>])` → 증빙 파일마다 같은 ref 로 한 번씩 → `kkRdp.files()` 에 `I <파일명>` 이 모두 있는지 → `kkRdp.restoreInput()`.
   - 10MB 이상 파일은 확장으로 안 올라간다 → 사용자에게 신청서 창에서 직접 '파일추가' 를 부탁하거나 chrome-devtools 로.
5. **보고 후 확인**: 채운 값(등록구분·사용기간·사용시간·관련과제·접근대상)과 첨부 목록을 표로 → *"신청서 창에서 확인 후 '결재상신'을 눌러 주세요(저장도 함께 됩니다)."* 사용자가 맡기면 확인받고 `btn_approval` 을 누른다 — 그룹웨어 결재창이 이어 뜬다.
6. **확인**: 상신 뒤 `await kkRdp.list()` 에 새 신청번호·기간이 있는지, `await kkRdp.detail(0)` 의 `files` 가 첨부 수와 같은지 본다(목록의 상태 칸은 비어 나오는 게 정상).

## 5. 보고 머리표
`😼 완료 — kk-rdp`(채움·첨부 끝, 사용자가 상신할 차례) / `😸 완료`(상신까지 확인) / `🙀 중단`(로그인·세션·파일 없음 등) / `😿 부분 완료`(첨부 일부 실패 등). 제출 문서·파일명에는 넣지 않는다.

## 6. 안전
- 저장·결재상신·삭제는 확인 후([`../_shared/security_policy.md`](../_shared/security_policy.md) C2). 지난 신청의 상세는 **읽고 바로 닫는다**(수정·저장 금지).
- 채팅·파일에 IP·MAC·연락처를 필요 이상 늘어놓지 않는다 — 확인 표에 한 번만.
