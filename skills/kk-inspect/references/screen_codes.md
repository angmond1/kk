# 화면 한글이름 ↔ 코드 (kk-inspect)

사용자와 대화할 때는 **한글이름(코드)** 형식으로 화면을 부른다 — 예: "소액검수신청(mcs_0003)", "카드영수증조회(fam_0711)". 내부 코드만 단독으로 쓰지 않는다.

> 전체 화면코드 표·직접접근 URL·endpoint 상세(fetch)는 **`../../_shared/kist_portal.md`** 참조.

## kk-inspect 주요 화면
- **소액검수신청**(검수신청관리) `mis.mcs::mcs_0003` — 이 skill 의 메인 화면(제출은 NEXACRO form 직접제어).
- **카드영수증조회** `mis.fam::fam_0711` — 법인/연구비카드 사용내역·**확정 원화금액(USEAMT)** 조회.
- **프로젝트**(연구관리, 참여 과제 수집): `http://p.kist.re.kr:8081/cus/index.do?cls=proj`
