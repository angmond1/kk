# kk-pay 통합정보 fetch — 보조 메모

> 공통 fetch 패턴·인증(authTk·SSV·parseRows)·**endpoint 상세**(fam_0711 카드내역 · rdm_2011 과제목록 · chkPopup 이름→사번)·함정은 **`../_shared/kist_portal.md`** 에 통합돼 있다(`scripts/portal_ops.js` 의 근거). 여기는 kk-pay 고유 보조만.

## 카드 조회 좌표 fallback (fetch 실패 시 "어떻게든 성공" 2차)
fetch 가 빈 응답 / authTk 없음 / HTTP 에러면 포기 말고 카드영수증조회(fam_0711) 화면을 **좌표로 재시도**. 해상도가 달라도 매번 `zoom`/`screenshot` 으로 위치를 산출(고정 좌표 금지):
1. 화면 로드 9초 → `screenshot` 으로 검색조건 영역 확인 → `zoom` 으로 각 칸 좌표 산출.
2. **카드책임자 칸** 클릭 → 이름 입력 → **Enter**(사번 자동매핑). ⛔ `Ctrl+A` 금지('a' 가 입력됨) → 기존값은 `End`+`Backspace`.
3. (연구비카드면) 검색구분 라디오 클릭. 사용일자 기본값(직전 1달)은 손대지 말 것(마스크가 꼬여 옆 칸 오염).
4. **우상단 조회 버튼** 클릭 — ⚠️ Enter 만으론 결과 안 나옴.
5. 결과 grid 읽기: `get_page_text` / `read_page` 또는 `screenshot`+`zoom`(승인번호 등 작은 글씨 확대)으로 사용일·거래처·금액·승인번호 추출.

> 시도 순서 = **fetch → 좌표**. 둘 다 실패할 때만 화면을 캡처해 사용자에게 구체적 상황을 안내(조용히 멈추지 말 것). 과제목록(rdm_2011)도 동일.

## 검색조건 참고 (값만 바꿔 fetch)
법인(`CARDTYPECD=5`) / 연구비(`3`) 구분 · 기간(FROM_DT~TO_DT) · 거래처(CUSTNM 부분일치) 조합 가능. ⚠️ 2026-09-27 실측: fetch 에 `CARDRESPEREMPNO`·`SEARCHID`(카드책임자 사번)를 주면 그 책임자 건만 온다(60일 8건). 사번 없이 부르면 회사 전체 수천 건 반환 → 응답에서 클라이언트 필터(`../_shared/kist_portal.md` 함정 참조).
