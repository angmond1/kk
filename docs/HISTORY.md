# kiki 빌드 이력·유지보수 (maintainer)

> kiki 패키지를 **통합 관리하는 사람**을 위한 문서. 사용자는 [README](../README.md)/[INSTALL](../INSTALL.md) 만 보면 된다.
> 재사용 가능한 빌드 방법론·NEXACRO/dooray 패턴은 [DEVELOPMENT.md](DEVELOPMENT.md), skill 별 캡처 상세는 각 skill 의 `references/`.

## 배포
- KIST 구성원용 행정 자동화 skill 패키지. GitHub `angmond1/kk` **공개**(2026-09-27~).

## repo 구조
```
kiki/
  README.md  INSTALL.md  CLAUDE.md(Claude 설치지침)  CODEX.md(Codex 가이드)  install.ps1  install.sh  VERSION  LICENSE  .gitignore  .gitattributes
  docs/      DEVELOPMENT.md (빌드 방법론·패턴)  HISTORY.md (이 파일)
  tools/     fresh-test.sh · sync-check.sh · evaluator_prompt.md   # 메인테이너 검증 도구 (fresh 설치 격리검증 / 설치본↔본진 diff·개인정보 스캔)
  skills/
    _shared/   security_policy · kist_portal · dooray_wapi · dooray_api_guide
               · project_codes · environment_setup · personal_config · nexacro_file_upload
               · kiki.config.example.json · token.txt.example · kiki.env.example(구형)   # 형제 공통 (install 시 항상 복사)
    kk-mail/ · kk-wiki/ · kk-pay/ · kk-meeting/ · kk-budget/ · kk-inspect/   # SKILL.md + references/ + scripts/ + <skill>.config.example.json
  assets/    로고
```

## skill 빌드 상태 (전부 사용 가능)
| skill | 핵심 | 인증 |
|-------|------|------|
| kk-mail | **1 자연어 찾기**(서버 검색 API + 페이징 목록 + 본문 GET + 읽음 복원, 2026-09-24) / 2 폴더분류 / 3 자연어 규칙 / 4 스팸 + 권장분류 23규칙 + 폴더 자동생성·삭제 + confirm 전 본문 표 + async `{}` 우회 + 출력 1,000자·필터 대응 | Dooray 세션 쿠키 |
| kk-pay | 좌표0 fetch(카드·과제·이름→사번) + 비목 3단조회 + Dooray 폴더 업로드(RPA) + **세금계산서 직접작성 fam_0702 end-to-end**(계정·검수·계좌 실명검증·첨부·상신, 2026-07-08) | 통합정보 SSO + Dooray 토큰 (첨부는 chrome-devtools-mcp) |
| kk-meeting | 카드 회의비 추출 + 사전결재 매칭 + 회의록 엑셀 master + **fam_0704_02(법인)·fam_0703_02(연구비카드)** 자동작성·임시저장·결재상신 + 2026-08-01 규정(사전결재 폐지 대상·PROJJOINYN) 반영 | 통합정보 SSO (좌표0 부모탭 JS) |
| kk-budget | 좌표0 fetch 예실대비표(`BUDGYEAR=9999`+`ACCCLSCD` LEV1) + 직접비 소계 + 개인지분(적요+신청인 합산) | 통합정보 SSO (조회 전용) |
| kk-inspect | 소액검수 `mcs_0003` NEXACRO form 직접제어 + 자산 보수판정 + 외화 `fam_0711` USEAMT + **첨부 자동**(chrome-devtools-mcp 단일채널) | 통합정보 SSO (첨부는 chrome-devtools-mcp) |
| kk-wiki | KIST Wiki 2.0 규정·지침 자연어 찾기 — 전체 본문 스냅샷(`{kiki_root}/wiki`) 로컬 검색·판독 + 인용 페이지 `fresh` 최신 확인 + 첨부(토큰) (2026-09-25 신설) | Dooray 토큰(권장) 또는 세션 쿠키 |

## 공통 규약
`skills/_shared/security_policy.md` C1~C5 — 개인 credential·식별자·개인학습 repo 0건 / 모든 쓰기 confirm / 개인화는 자동조회+로컬 config / config·token 은 `~/.claude/kiki/`(repo 밖)+gitignore / 한국어.

## 공통화 정리 (2026-06-06)
- **rename**: 전 skill `ki-` → `kk-`, `ki-rpa` → `kk-pay`.
- **공통 추출**: 개인 식별정보·토큰을 `~/.claude/kiki/kiki.config.json` + `kiki.env`(형제 공유)로 단일화. skill 고유만 `kk-<skill>.config.json`. 공통 문서·규정·portal·화면코드·과제코드는 `skills/_shared/` 로(중복 제거, skill 은 `../_shared/` 참조).
- **환경 점검 통일**: 모든 skill 부트스트랩이 `_shared/environment_setup.md` 0단계(Chrome+MCP·로그인·토큰·python) 동일 수행.
- **문서 정리**: 사용자용 README/INSTALL + 개발자용 docs/(DEVELOPMENT·HISTORY) 분리. install.ps1 추가(`_shared` 자동 복사).
- **개인정보 제거**: 예시 데이터(이름·거래처·사번·과제번호·외부소속·연구주제)·개인 경로 전부 익명화/중립값.

## 남은 일
1. 버전 git tag / CHANGELOG 정식화 (현재 `VERSION` 파일 + 이 이력).
2. 온보딩·파일럿 피드백 수렴 — 타 사용자 PC zeroshot 은 `tools/fresh-test.sh` 로 사전 검증.
3. 미실증: kk-meeting fam_0704_02 본화면 첨부 패턴(A/C 판별) / kk-inspect **자산** 건 검색팝업 5종(생산업체·자산표준분류·사용자·사용책임자·지급계정) / kk-budget 집행내역 fetch endpoint(현재 DOM 팝업 경로).
4. 미해결: `chkPopup`(이름→사번) 직접 fetch 빈 응답(세션 의존) → 사번 `kiki.config` 운용 / `fam_0100`·`fam_0711` 서버 미필터 → 클라 필터로 대응 중.
5. (후순위) 정식 plugin marketplace 형식 검토.

## 빌드 노하우
재사용 패턴(NEXACRO 부모탭 JS 완전자동·fetch backend 직접호출·form 직접제어·hwp 자동화·과제분류코드·데이터 master·임시저장↔결재상신 분리·killfocus 동기화 등)은 전부 **[DEVELOPMENT.md](DEVELOPMENT.md)** 에 통합. skill 별 화면·필드 캡처 상세는 각 skill 의 `references/`.

## 빌드 이력 (요약)
- **2026-09-27 v0.4.3 (결과 점검 규칙)**: 스크립트·코어 결과를 쓰기 전 LLM 이 **요약 줄만** 기대치와 대조하고, 어긋나면 원인을 고쳐 1회 재실행, 그래도 안 되면 수동 경로 + 사용자 통보(전체 재독·숫자 재계산·무한 재시도 금지) — 공통 3줄은 `_shared/environment_setup.md`, skill 별 기대치는 각 SKILL '결과 점검' 절. `make_report.py`(과제·비목·기준일)·`convert_evidence.py`(`[요약]`) 요약 줄 보강.
- **2026-09-27 v0.4.2 (LLM 사용량 최적화)**: 새 판단이 필요 없는 반복 구간을 스크립트·코어 함수로 — `.min.js` 주입본(`tools/build_min.py`, sync-check 검사) · `_shared/kiki_doctor.py` 환경 점검 · kk-wiki `staffDownload()`+`wiki_staff.py import --from-downloads`, `wiki_snapshot.py import --from-downloads`(코어 1.6) · kk-budget `collectAll/collectStatus/downloadSnapshot/fmtBudget`(코어 1.2)+`make_report.py --from-downloads --save-snapshot`(숫자를 LLM 이 옮겨 적지 않음) · kk-meeting `meetingHints/fmtMeeting/headcount`(코어 1.2)+`meeting_log_xlsx.py append/titles/path` · kk-mail `spamHints/fmtSpam/fmtFolders/fmtRules`(코어 1.7) · kk-pay `kk_pay_files.py plan/apply/archive`. 원칙은 DEVELOPMENT.md §10. 오프라인 시험 전부 통과, kk-budget 은 포탈 실측(수집→다운로드→엑셀).
- **2026-09-27 v0.4.1 (배포 전 전수 검토·안전화)**: 하위 검토 5갈래(kk-pay·_shared / kk-meeting / kk-inspect·kk-budget / kk-wiki·kk-mail / 설치 스크립트·문서) 결과 반영. **코드**: 모든 파이썬 스크립트 출력 UTF-8 강제(한국어 Windows 콘솔 깨짐·기호 오류) · kk-pay `convert.py` 가 열려 있던 Word/Excel/한글을 닫던 문제(`DispatchEx` 새 프로세스)·덮어쓰기·투명 png 검정·회전·여러 쪽 tif·원본 자동 휴지통 제거 · `dooray_drive.py` TLS 검증 기본·API 오류 판정·`check/structure/upload` 명령·토큰 값 미출력 · 포탈 코어 3종 1.1(XML 아님·ErrorCode<0 throw, XML 이스케이프, 카드번호 뒤 4자리만, `fmtCards`) · kk-inspect `rename_evidence.py`(파일명이 PowerShell 명령으로 실행되던 취약점, 덮어쓰기·금지 문자)·`convert_evidence.py` · kk-budget `make_report.py`(목록 입력·BOM·인자 없음) · kk-meeting 엑셀 폴더가 `C:\kiki` 고정이던 것을 kiki_root 로, hwpx 파일명 안전·덮어쓰기 금지·제어문자, 면제 코드 I·S·B·F, 양식 hwpx 미리보기 이미지·저장자 등 개인정보 제거, 구형 한글 COM 스크립트·.hwp 양식 삭제 · kk-wiki `wiki_snapshot.py` crawl/import 가 기존 스냅샷을 지우지 않게(실패 시 중단·`raw/_old` 보관·절반 미만 거부 `--force`)·TLS·리다이렉트 호스트·intermixed 인자, 코어 1.5(`fmtFresh`, 제목 `|`) · kk-mail 코어 1.6(검색 오류 전파, 조건 없는 규칙 차단, 하이픈 id 읽음 복원, listInbox 기간 전체, pick /g). **설치**: `install.ps1` 위치 인자로 skill 이름이 root 로 잡히던 결함(`PositionalBinding=$false`), `install.sh` 상위 폴더 없는 root, kiki_root 기존 값 유지 알림, 옛 kk-dining 설정 안 경로 치환, 파이썬 스텁 오탐, JSON 안전 기록, `.gitignore` `/wiki/`·`/dining/`, `fresh-test.sh` 는 `git archive HEAD`. **문서**: 실명·내선·실제 거래처·금액·승인번호 자리표시 통일, 공개 repo 문구, kk-wiki 표·행 추가, 문서 간 모순(RPA 비대상 회의비 업로드 옵션 제거, 사전결재 폐지 대상 한정, 비목 17-448=S·I·F·B, 지급신청자 검색 동명이인 확인, 검수 지역 첫 실행 확인, chrome-devtools 한 채널, 첨부 임시 폴더 `<cwd>/_tmp`, `upload_file` 인자) 정리, `AGENTS.md`(Codex 진입) 추가. ⚠️ 검토 중 사고 2건: 하위 검토가 실제 `C:\kiki\wiki` 스냅샷(raw·pages 377)을 지워 재수집으로 복구(담당자표·OCR 무손실), 다른 검토가 실제 설치본 `_shared`·`kk-mail` 을 HEAD 로 재복사(내용 동일). 교훈: 하위 작업에 실데이터 접근을 도구·환경 수준에서 막고, 파괴적 명령은 기본이 보관이어야 한다.
- **2026-09-27 (kk-mail 팝업 보기, 코어 1.5)**: 사용자 요청 — 찾은 메일 링크를 누르면 쓰던 메일함 화면에 뜨는 대신 팝업으로. 새 창 버튼 캡처로 `/mail/popup/mails/{id}`(목록 없이 한 통, 폴더 무관) 확인 → 답의 링크를 이 주소로. "N번 띄워줘" 는 코어 `openMail` 이 임시 버튼을 만들고 Claude 가 실제 클릭(`computer left_click`)해 Dooray 와 같은 크기 팝업 창을 연다(스크립트만의 window.open 은 Chrome 팝업 차단기가 막음, 실측). `popupStatus`·`closePopups`. 같은 메일을 원래 방식과 나란히 띄워 비교한 뒤 사용자 확정.
- **2026-09-27 (kk-mail 제목 키워드, 코어 1.4)**: 사용자 지시 — 스팸 처리·자동분류에서 발신 주소 말고 제목도 거르라고 하면 제목 전체가 아니라 매번 그대로인 핵심 구절만 쓴다(세금계산서 알림 → `○○업체(유)로부터 전자세금계산서`, 거래명세서 → `거래명세서_○○업체`, 모객 메일 → `○○ Materials Science Conference`·`Journal of ○○ Science`). 코어에 `subjectKeyword`(받는 곳 태그·번호·날짜·회차·머리말·인사말·광고 문구·공지 꼬리를 잘라 원문에서 이어진 구간만 후보로)·`checkSubjectKeywords`(block/warn)·`previewSubjectRule`(검색 API 로 넓게 받고 제목 포함으로 재필터, 보낸 메일 제외) 추가, `createRule` 은 block 이면 만들지 않음(`overrideKeywordCheck`). SKILL '제목 키워드 고르기'(3·4 공통)·classification_policy·wapi_reference 반영. 오프라인 시험 통과, 실측: 거래명세서·세금계산서 알림 177건 제목에서 같은 구절 추출, 미리보기 건수 = 검색 방식 네 가지 합집합.
- **2026-09-26 v0.4.0 (kk-dining → kk-meeting 개명)**: 사용자 지시로 skill 이름을 `kk-meeting` 으로 바꿈. repo(폴더 `git mv`, `kk-meeting.config.example.json`, 문서·스크립트 주석·설치 스크립트·이 이력의 옛 항목까지 94곳 치환), 설치본(`~/.claude/skills`·`~/.codex/skills`) 폴더 교체, 개인 설정 `kk-dining.config.json` → `kk-meeting.config.json`. 설치 스크립트에 옛 폴더 삭제·설정 파일 개명 단계 추가(install.sh/install.ps1), CLAUDE/CODEX 에 갱신 안내. 같은 날 2차 지시로 **데이터 폴더 `{kiki_root}/dining/` → `meeting/`, 스크립트 `make_dininglog*.py` → `make_meetinglog*.py`, 코어 객체 `window.kkdining` → `window.kkmeeting`** 까지 교체(설치 스크립트가 기존 `dining/` 폴더 이름을 `meeting/` 으로 바꿈, 개인 설정의 경로도 교체). 이 이력에서 2026-09-26 이전 항목의 `kk-meeting` 은 당시 이름 `kk-dining`.
- **2026-09-26 (kk-wiki 이미지 표 판독본 `ocr/`)**: 위키에 이미지로만 있는 표(해외출장 국가·도시 등급표 등)를 화면 확대로 판독해 `{kiki_root}/wiki/ocr/<주제>.md`(frontmatter 로 출처 페이지·이미지 id·판독일)로 저장하고 `wiki_search.py` 가 `ocr/` 도 함께 검색하도록 함(`load_ocr`, 결과에 "이미지 판독본" 표시). 답 형식 교정(사용자 2026-09-26): 질문 조건에 맞는 행·서류·담당자만.
- **2026-09-25 (kk-wiki 담당자표 차분 갱신, 코어 1.4)**: 업무분장이 수시로 바뀌므로 사용자 한마디에 최신화할 수 있게 — 파서 `known`(팀별 글번호 JSON) → 코어 `staffChanged(known)`/`staffChangedStatus()` 로 글번호가 커진·새로 생긴 팀만 골라 `staffCollect({list: kkWiki.changed})` → `import --keep`(기존 팀 유지, 바뀐 팀만 교체). 절차는 `staff_board.md` "차분 갱신" 절.
- **2026-09-25 (kk-wiki 담당자표 기간 정책, 코어 1.3)**: 게시판 169건 재점검 — 제목에 `[팀명]` 이 없는 글 55건과 `[ 부서별 업무분장 ]` 태그 글 15건이 팀 추출에서 빠져 있었음 → `teamFromTitle()` 로 제목 형식 3종 + 개편 전 이름 매핑. **사용자 정책**: 조직개편이 잦으니 2025-01-01 이후 글을 우선하되, 그 이후 글이 없는 존속 부서(시설운영팀·데이터정보팀)는 그 전 최신 글로 채우고 ⚠오래됨 표시(코어 `staffList({minDate, floorDate})`, 파서 `import --since`, find/team/status 표시). 시설운영팀('22.6)·데이터정보팀/사이버보안팀('21.10) 이미지 게시글 OCR 로 추가 → **20팀**. 목록 POST 는 frmList 없이도 되는 것을 실측(게시판 메뉴를 안 열어도 됨, 빈 화면 탭이어도 같은 origin 이면 충분) → 기능 3 절차 단순화.
- **2026-09-25 (kk-wiki 담당자표 보강, 코어 1.2)**: 사용자 지적("학연운영팀은 표인데 왜 못 잡나 / 가치혁신팀 이미지는 OCR 하면 바로 읽힌다")으로 두 가지. (1) **표 인식 확대** — 헤더 어휘(직무·업무·구분·분류·항목·내용·성명·세부 × 담당·성명·이름)와 **앞 6행 안 헤더 탐색**(제목 행이 위에 오는 팀), 파서는 헤더 셀로 열 종류(번호 / 구분·분류 / 업무·내용 / 담당·성명·정·부)를 정하고 rowspan 이어받기·오른쪽 정렬·성명 우선형 처리 → 학연운영팀(대·중·소분류)·수탁사업운영팀(헤더 5번째 행, 성명 가운데)·구매·자산팀(담당업무) 복구. (2) **이미지 게시글 OCR 절차** — 코어 `staffShowImage()` 로 본문 이미지를 원본 폭으로 펼치고 `computer zoom` 띠 캡처로 판독해 `_ocr.txt` 보정 덤프(같은 형식) → `wiki_staff.py import <원본> <보정…>`(여러 파일, 뒤가 덮어씀). 가치혁신(7행)·총무복지(25행)·국제협력(30행) 판독 → **18팀 전부 표**. SKILL 기능 3 에 6단계, `staff_board.md` 에 헤더 규칙·OCR 절차.
- **2026-09-25 (kk-wiki 담당자표, 코어 1.1)**: 답에 **담당자(팀·직무·이름·내선·기준일·게시글 링크)** 절 추가(사용자 요청). 출처 = 포탈 게시판 "부서별업무분장표"(그룹웨어 xClick `FC_BBS224`, 부서별 최신 글). 실측: 포탈 첫 화면 팝업 먼저 닫기(경고창 상태에서 JS 45초 타임아웃), 게시판은 교차출처 iframe → 그룹웨어 주소로 탭 직접 진입, 목록은 frmList POST(100건/페이지), 글 열람은 viewArticle POST 흉내가 error.jsp 라 **'URL복사' 공유 주소를 숨은 iframe 으로** 읽음(≈2초/건, 같은 주소가 링크), 표 = 헤더 직무·담당 가장 안쪽 table, 이미지 게시글은 링크만. **`get_page_text` 로 3만 자 이상 한 번에 반출**(javascript_tool 1,000자 제한 우회 채널). `wiki_staff.py`(import/find/team/status), `references/staff_board.md`.
- **2026-09-25 v0.3.0 (kk-wiki 신설)**: KIST Wiki 2.0 규정·지침 자연어 찾기. 위키 전체 본문(373p, ≈3MB)을 `{kiki_root}/wiki` 스냅샷(raw/·pages/·index.json·index.md·CHANGES)으로 두고 로컬 검색(`wiki_search.py` AND/OR·발췌·목록)과 본문 판독으로 관련 조항을 모은 뒤, 인용 페이지만 `wiki_snapshot.py fresh` 로 수정일·버전 대조(바뀐 것만 재수집) → 원문 인용+링크+수정일. 경로 A 토큰(공식 API `/wiki/v1/wikis/{space}/pages`, 첨부 hwp/pdf 는 307→file-api 직접 GET) / 경로 B 브라우저 세션(코어 `kk_wiki_ops.js` crawlAll → export JSON → import; 백그라운드 탭 타이머 지연 실측). 첫 실행은 스냅샷 유무 확인 → 만들기 제안 → 기능 안내. 위키 내용은 내부 자료라 각자 PC 만(repo 0).
- **2026-09-24 (kk-mail 첫 실행 흐름)**: `kk-mail 설정해줘` = 환경 점검 → 기존 폴더·규칙 파악 → **기능 안내(메일 찾기 우선)로 끝**. 폴더 분류 여부 질문·권장 6항목 제안·config 저장은 **사용자가 원한다고 말했을 때만**(4·5·6, 선택). 사용자 결정: "바로 3·4번을 하라고 하진 말자, 할 수 있다고만 보여주자".
- **2026-09-24 (kk-mail 기능 번호 재정렬)**: "Tier" 표기를 버리고 번호+기능명으로 — **1 자연어 메일 찾기(가장 많이 쓰일 기능, 사용자 결정)** · 2 폴더 분류 · 3 자동분류 규칙 · 4 스팸 처리(README 구성표 순서와 일치). SKILL 절 순서를 1→4 로 재배치하고 description·핵심 한 줄·부트스트랩 마무리 안내도 메일 찾기 우선. 참고문서·코어 주석·config 예시 동일 반영(동작 변경 없음).
- **2026-09-24 (kk-mail 부트스트랩 마무리 안내)**: 첫 설정 끝에 사용 예시(스팸·분류·규칙·**메일 찾기**)와 "준비물 추가 없음"을 반드시 출력하도록 6단계 추가(사용자 지적: 설치 안내에 자연어 검색 언급 없었음). INSTALL.md kk-mail 예시에 메일 찾기 추가.
- **2026-09-24 (kk-mail Tier 3 규칙 조건 정책)**: 자동분류 규칙의 **기본 조건 = 발신 주소 1개**. 발신+제목+받는사람 AND 규칙은 발신자가 제목을 조금만 바꿔도 빠져나가므로 기본 금지(사용자 지적). 제목 키워드는 사용자가 명시하거나 도메인 양면성으로 세분화를 택할 때만, confirm 때 "추가 가능" 한 줄 안내. 권장 23규칙은 원래 발신 단위라 변화 없음. 코어 동작 변경 없음(SKILL·classification_policy·wapi_reference·주석).
- **2026-09-24 v0.2.6 (kk-mail Tier 4 공식화 — 서버 검색 경로 + 실전 1회)**: 실전 검색 1회로 절차 확정 — 받은·보낸 모두, 사건별 묶기, 짧은 약어 정규식 함정, 동명 기관 제외, 1년 전 구간 목록 훑기(수십 초). 그 대안으로 **Dooray 검색 API `POST /v2/wapi/mails/search?preview=true`**(검색창과 동일: `all` 제목·본문·발신 AND/구절, `since`/`before` ISO 시각, `exceptFolders`, `references.mailMap/folderMap`, `previewText` 본문 앞부분; 기간 이름 후보 20여 개 대조로 확정)를 코어 1.3 `searchMails/searchMany` 로 추가 → 경로 A(서버 검색, 기본)·경로 B(목록 훑기, 핵심어 없을 때) 이원화. `fmtList {pv}` 미리보기, `pick {excludeFrom}`. README 구성표에 "자연어로 메일 찾기".
- **2026-09-24 v0.2.5 (kk-mail Tier 4 자연어 찾기)**: 코어 1.2 — `listMails`(기간 컷오프 페이징, size 500) · `getMail/getMails`(`GET /v2/wapi/mails/{id}` → HTML→텍스트·첨부명, **상세 GET 이 read/opened 를 true 로 만들어 목록의 `read=false` 건은 `POST /mails/unread` 로 자동 복원**) · `markRead/markUnread` · `pick`(정규식 1차 선별) · `fmtList/fmtBody/sanitize/hyId`(javascript_tool 출력 ~1,000자 truncation + `a=b`/URL/긴 숫자 필터 대응) · `openMail`. SKILL 에 Tier 4 절차(조건→페이징 수집→정규식+뜻 선별 ≤10→본문 확인→표+링크), `wapi_reference.md` 에 상세/읽음/페이징/플래그(read vs opened) 기록. 실측: 14일 137건 0.2초, 안 읽은 3건 본문 후 read=false 복원 확인.
- **2026-09-24 (hwpx 생성기 수정)**: `make_meetinglog_hwpx.py` 가 템플릿 단락의 `<hp:linesegarray>` 를 제거하고(남기면 한글이 자간을 눌러 한 줄에 우겨 넣음 → 긴 문장 줄바꿈 안 됨), `_fill_cell(para_pr=, char_pr=)` 로 문단·글자모양 지정 가능. AIX 성과공유회 신청서(hwp 양식) 채우기에 같은 생성기를 재사용하며 발견·수정.
- **2026-09-24 (테스트 종료)**: 배포 전 검증은 **1단계 격리 검증(80/100, HIGH 0)까지로 마무리**(사용자 결정). 2단계 Windows Sandbox 실환경·새 로컬 계정 테스트는 준비 자료만 남기고 보류(`_tmp/sandbox/`, gitignore). 3단계 파일럿은 배포 후 피드백으로 대체. 설치본(`~/.claude/skills`) = 배포본 동기화 확인.
- **2026-09-24 (v0.2.4)**: **kk-meeting 회의록 기록 방식 개정**(사용자 결정) — 회의록 엑셀은 **한 폴더 `meeting_log\` + 월별 `{yymm}_회의록.xlsx`**(연월 하위폴더 폐지), hwpx 는 같은 폴더에 `{yymmdd}_{과제번호}_{과제이름 간략}_회의록.hwpx`(건당 1파일); **엑셀의 주목적 = 중복 방지 기록**(지급신청에 첨부하지 않음) → `meeting_log_xlsx.py` 를 월별 경로로 개정 + `all_titles()` 스캔 헬퍼. 회의록 작성 흐름: 부트스트랩에서 **근거자료(과제제안서·보고서) 를 `project_report\` 에 복사 요청** → 건마다 **사용자에게 회의 주제를 먼저 묻고** Claude 가 제안서 근거로 회의내용 작성(과거와 중복 금지). 시연 지적 반영: kk-pay 부트스트랩은 **RPA 업로드 사용 여부를 먼저** 묻고 토큰·행정원은 예일 때만, 참여과제 파악을 명시 / kk-inspect 개인정보 질문에 "config 에만 저장" 안내 / kk-meeting 면제 판정에 9개 부처 목록 표시. CLAUDE Step 5 의 한글·Office 안내 문구 삭제.
- **2026-09-24**: **fresh-install 격리 검증**(`tools/fresh-test.sh` + 갱신한 `evaluator_prompt.md`, kiki 를 모르는 sub-agent가 배포본만으로 Step 0~6 수행) — overall 80/100, HIGH 막힘 0, 깨진 링크 0, install.ps1/sh 산출물 전부 정상. 지적 반영: **install.ps1 UTF-8 BOM**(Windows PowerShell 5.1 에서 한국어 메시지 깨짐 실측 → 수정) / CLAUDE.md: 권장모델 문구 정합, skill 별 런타임 표, 설치 후 PATH 재시작, winget 동의 플래그, macOS brew·Xcode CLT, 작업 루트 전환법, 무-CLI `.claude.json` 등록 구체화, 토큰 형식, 재시작 전 kk-* 요청 응답 규칙, docs/tools 성격 / INSTALL.md: 무-CLI 등록, 방법 B 데이터 폴더 / install.sh `.bak` 정리.
- **2026-09-23 (v0.2.3)**: **회의록 파일 = hwpx 로 통일, 아래아한글 불요**(사용자 결정: hwp 는 안 쓰는 추세) — `kk-meeting/scripts/make_meetinglog_hwpx.py`(표준 라이브러리, 모든 OS: 양식 `assets/minutes_template.hwpx` 의 값 셀 XML 치환, 줄바꿈=단락, XML 이스케이프, mimetype 무압축 유지; **한글 COM 으로 열기·재저장 라운드트립·PDF 내보내기까지 검증**) + 템플릿 중립값으로 교체. 구형 hwp COM 경로(`make_meetinglog.py`·`popup_watcher.py`·`hwp_automation.md`)는 legacy 표기·미사용. HOP 은 **열람용으로만** 안내(작성엔 미사용, CLI/API 없음). 권장 모델 표에서 Haiku 언급 삭제.
- **2026-09-23 (v0.2.2)**: **설치·환경 안내 전면 정비**(사용자 피드백 반영) — ① git 불요(ZIP/동료 폴더), 설치 시 **kiki 폴더 위치 질문**(기본 `C:\kiki`/`~/kiki`; `kiki_root` 를 kiki.config 에 기록, 하위 `budget/ meeting/ inspect/ _tmp/`) ② **Python 3·Node.js 는 패키지 설치 때 확인·설치**, Python 패키지는 skill 별 필요 시점에 ③ Claude in Chrome(웹스토어 링크·Desktop/CLI 연결법)·**chrome-devtools-mcp**(`claude mcp add --scope user …`, Desktop 도 같은 등록 공유; Node 필요)를 일반인용으로 풀어 씀 ④ **로그인 창 표**(평소 Chrome vs Claude 전용 새 창 — inspect·meeting·세금계산서 직접작성만 새 창+재로그인, 카드 RPA·budget·mail 은 기존 창) ⑤ **`token.txt`**(`<kiki_root>/token.txt`, `Dooray token:` 다음 줄)로 토큰 입력 표준화 + 채팅 붙여넣기 경고 상시, 로더는 token.txt/kiki.env/`~/.codex` 모두 탐색(Codex 토큰 경로 불일치 수정) ⑥ 팝업 허용(`p.kist.re.kr`)은 트러블슈팅으로 이동 ⑦ 한글/Office 없으면 LibreOffice·**HOP**(Open HWP, github.com/golbin/hop — rhwp 기반 데스크톱 앱, Windows/macOS/Linux, CLI/API 없음) 설치를 **묻고**, kk-meeting 은 hwp 저장 여부를 먼저 질문 ⑧ **권장 모델 표**(설치·첫 사용 Opus 5, 이후 mail/budget Sonnet 5, meeting·세금계산서 Opus 유지) ⑨ **KIST 사내망/VPN 명시** ⑩ macOS/Linux: `convert.py`(LibreOffice fallback·OS별 휴지통·`--check`)·`rename_evidence.py` 크로스플랫폼, hwp 스크립트 Windows 가드, config 경로 `{kiki_root}` ⑪ 누락 기재: `requests` 패키지, kk-meeting 첨부는 chrome-devtools(Claude in Chrome `file_upload` 는 채팅 첨부 파일만), `kiki.env.example` 옛 이름 `kk-rpa` 수정, `upload_file` cwd 제약 안내 ⑫ **kk-budget**(별도 세션 2026-09-18 확립분 통합): 집행내역 팝업을 **셀클릭 핸들러 직접 호출**로 여는 `scripts/exec_detail.js`(`window.kkExe` init/cats/open/parse/close — 바인딩 컬럼으로 그리드 식별·셀 인덱스 조회·`set_rowposition` 선행·금액컬럼 자동판별·합계행 제외·이름 경계검증, 🔴 닫기는 팝업 `btn_close` 만) + `budget_fetch_spec.md`·`_shared/kist_portal.md`·`DEVELOPMENT.md` 25·26 / **인건비(내부1·학생)는 개인 귀속 불가** 실측.
- **2026-09-18 (v0.2.1)**: **KIST wiki 반년(2026-03~09) 변경 조사·반영** — 공식 API 재크롤(373p) vs 4월 베이스라인 diff(신규 15·본문변경 50).
  - 「2. 지급신청 매뉴얼」 **2026-09-15 개정** 반영(스냅샷 교체 + 빠른참조): 회의비 **사전내부결재 폐지(26.8.1 사용분~)·과제 미참여자 참석 필수·타기관 참여연구원=내부참석자** 명문화 / **시험분석결과서 첨부 필수**(전 과제) / **장비이용료=외부기자재임차료** / **사례비 5만원 초과 시 주민번호·주소 + 소득세 20%**(종전 12.5만·8%).
  - 기획예산팀 **실행예산 변경 RPA**(경상운영비 계정, 양식 메일 → 13/17시 반영) / 구매·자산팀: 구매요구 소요 45일·1천만↑ 연구계획서, 용역계약 해넘김 시 기획예산팀 협조, 검수 담당·50만원 정보화기기 / 인사경영팀 **해외출장 FAQ 신설**(항공권 과제카드 → 카드 결제일 전 지급신청) / 국내전문가 1시간 상한 100만원 / 데이터정보팀 **HTTPS 적용 안내**(e.kist.re.kr 공식 URL, `p.kist.re.kr` 팝업 허용 — chrome-devtools 프로필 포함).
  - 변경 없음 확인: 「7. RPA 지급신청 안내」(2025-11)·세금계산서 처리·법인/연구비카드·계정대체·수입의뢰·자산의 등록(7-1).
- **2026-09-17 (v0.2.0 배포)**: 6~9월 누적 반영.
  - **포탈 주소 변경(2026-07)**: 로그인/포탈 = `e.kist.re.kr`, NEXACRO 업무화면은 `p.kist.re.kr:8081` 유지. **업무화면 딥링크 전 `e.kist.re.kr` 로그인 확인**을 표준 절차로(세션 만료 시 `Your session has expired` + 무한 로딩 → e.kist.re.kr 경유로 복구). CLAUDE/CODEX/INSTALL/README/environment_setup/각 SKILL 반영.
  - **NEXACRO 파일첨부 자동화** `_shared/nexacro_file_upload.md`: A(popupframe 임시버튼)·B(별도 page 실제버튼)·C(`extUp._input_node` 직접) 3패턴 + **chrome-devtools-mcp 단일채널**(§4-6, workspace root 제약·개수 검증·alert 후 uid 재생성). 첨부 있는 작업은 처음부터 chrome-devtools 로.
  - **kk-pay 세금계산서 직접작성 end-to-end**(2026-07-08): 계좌 실명검증 통과법(`btn_accCstm00` 을 `import2` divForm 컨텍스트로, `TRANSFERSTAT_DESC='정상처리'`), fam_0702 별도 page dialog 처리, 정오 세션 리셋 대응, 참고사항 지연사유(발급+1개월), `bt_reset` 유실 금지, 적요=구매자 본인, 검수 기준 VAT 포함 합계, 배치 통합 패턴(4건 ~15턴), 업로드 결과 dooray 웹 확인·신청완료 보존.
  - **kk-meeting**: fam_0703_02 연구비카드 절차서(DESP_LIST 오염 검증·goRow 행전환) + 회의록 엑셀 백필 + 2026-08-01 식비안내 개정 + 해외 회의비.
  - **kk-budget**: 개인집계 **적요+신청인 합산**(활동비2 누락 방지) + DOM 팝업 연쇄 안정화(async `{}`·throttle·재오픈 빈 grid).
  - **kk-inspect**: 검수일=내일(다음 영업일), 첨부 개수 검증, 특수문자 파일명 거부·input 재생성, 물품사진 파일명 규칙.
  - **kk-mail**: 걸러낸 메일 confirm 전 본문 표, async `{}` 2-스텝 우회.
  - **설치·문서**: `CLAUDE.md`(Claude 설치 지침)·`CODEX.md`·`install.sh`(OS 분기)·`.gitattributes`·`tools/`(fresh-test·sync-check). 배포 전 개인정보 재스캔·익명화(과제번호·실명·거래처·문서번호·개인경로 0건). MCP **도구 이름 표기 규칙**(문서는 짧은 도구명, 서버 접두어는 버전·설치방식별 상이) 을 environment_setup 에 명시.
- **2026-08-07**: kk-meeting — **2026-08-01 참여연구원 규정변경 반영**. 내부 참석자는 해당 계정 참여연구원만 가능(서버검증·거부 시 행 삭제), 미참여 KIST 인원은 외부/미참여자에 회사명 `한국과학기술연구원`. `ds_datagrid2.PROJJOINYN` 필수선택 신설(코드표 `ds_codeFAM006`: `N`=미참여/`Y`=참여). 내부 등록은 `ds_datagrid1_oncolumnchanged` 를 `nexacro.DSColChangeEventInfo(obj,id,row,col,colid,**newvalue,oldvalue**)` 순서로 호출해야 이름→사번 조회가 동작(인자 순서 뒤바꾸면 행이 조용히 삭제되는 함정). 첨부는 회의록 `저장` 만으로 서버 반영되지 않아 `gfn_upload` 호출 필수(`tmHeader` I→S 확인). 실사용 7건 처리로 실증.
- **2026-06-06**: 통합 관리 — 위 '공통화 정리' (rename / 공통 추출 / 환경 통일 / 문서 분리 / 개인정보 제거).
- **2026-06-05**: kk-meeting v2 — fam_0704_02 직접 자동작성·결재상신(옛 hwp 양산·두레이 업로드 폐기). 회의록 엑셀 master. NEXACRO 부모탭 JS 완전자동(→ DEVELOPMENT §4).
- **2026-06-05**: kk-inspect — 소액검수 `mcs_0003` form 직접제어(7건 실증). 자산 보수판정(wiki 7-1)·외화 `fam_0711` USEAMT.
- **2026-06-04**: kk-pay — 좌표탈피 fetch 코어(카드·과제·사번) + dooray drive 업로드 + 비목 3단조회. 명명 정책(영어 식별자) 확정.
- **2026-06-04**: kk-meeting 초판 — 카드 회의비 + 사전결재 `fam_0100` 매칭. 토큰 `kiki.env` 공유 정책 신설.
- **2026-06-04**: kk-mail — 스팸/폴더분류/자연어 규칙 + 권장 23규칙 + 폴더 자동생성·삭제(`create-path` 배열).
- **2026-06-02**: kk-budget 초판 — 순수 fetch 예실대비표(`BUDGYEAR=9999`+`ACCCLSCD` → LEV1 카테고리) + 직접비 소계 + 개인지분. 조회 전용.
