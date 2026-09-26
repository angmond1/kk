# 카드영수증조회(fam_0711) — 외화 결제 확정 원화 조회

## 왜 필요한가
외화 카드결제(해외 SW·클라우드 등)는 **카드명세서 앱의 원화 환산액이 잠정치**다("매입 시점 환율에 따라 달라질 수 있음"). 검수/지급의 **확정 원화액**은 카드영수증조회(fam_0711)의 `USEAMT`다. 카드명세서 값을 그대로 쓰면 매입확정액과 어긋난다(실제 9천원 이상 차이 사례 있음). **외화 건은 반드시 fam_0711 USEAMT를 쓴다.**

## 화면
- 진입: `http://p.kist.re.kr:8081/nxui/kistis/indexQ.jsp?target=mis.fam::fam_0711.xfdl&menuParam=sysCd%3DCUS` → 제목 "카드영수증조회및이관"
- 메인 화면(팝업 아님). form = `window.application.mainframe.ChildFrame.form`.
- 조회는 read-only라 Chrome MCP로 안전.

## Chrome MCP 조회 절차
```js
// 1) 검색조건 설정 + 조회
(() => {
  const form = window.application.mainframe.ChildFrame.form;
  const d = form.ds_search;
  d.setColumn(0,'FROM_DT','<조회 시작 YYYYMMDD>');   // 결제일 포함하게 넓게 (예 그 달 1일)
  d.setColumn(0,'TO_DT','<조회 끝 YYYYMMDD>');
  d.setColumn(0,'CARDTYPECD','5');   // 5=법인카드 → 못 찾으면 '3'(연구비카드)로 한 번 더 조회해 대조
  // SEARCHID: 로그인 사용자 사번 기본. 카드책임자가 본인이 아니면(예 연구실 카드 = PI 명의) CARDRESPEREMPNO 에 그 사번.
  form.bt_view.click();   // ⚠️ button1 은 '저장'이니 조회는 bt_view
  return 'search';
})()
// → wait 4s
// 2) 결과에서 거래처/날짜/금액으로 해당 건 찾기
(() => {
  const g = window.application.mainframe.ChildFrame.form.ds_datagrid1;
  const amt = v => (v && typeof v==='object' && 'hi' in v) ? v.hi : v;  // BigDecimal {hi,lo} → hi(정수원)
  const hits = [];
  for (let i=0;i<g.getRowCount();i++){
    const cust=String(g.getColumn(i,'CUSTNM')).toUpperCase(), date=String(g.getColumn(i,'CARDUSEYMD'));
    if (cust.includes('<거래처 키워드 대문자>') && date>= '<from>' && date<='<to>' && String(g.getColumn(i,'CARDRESPEREMPNM')).includes('<card_holder.name (없으면 user.name)>'))
      hits.push({date, appr:String(g.getColumn(i,'CARDAPPRNO')), cust:String(g.getColumn(i,'CUSTNM')),
                 useamt:amt(g.getColumn(i,'USEAMT')), resp:String(g.getColumn(i,'CARDRESPEREMPNM')),
                 stat:String(g.getColumn(i,'PRGRSSTATNM'))});
  }
  return JSON.stringify(hits);
})()
```

## 결과 컬럼 (`ds_datagrid1`)
| 컬럼 | 의미 |
|------|------|
| CARDUSEYMD | 사용일 |
| CARDAPPRNO | 승인번호 |
| CUSTNM | 거래처 |
| **USEAMT** | **확정 원화 사용금액** ({hi,lo} BigDecimal → 금액 = hi) |
| DCAMT | 취소금액 |
| PRGRSSTATNM | 상태 |
| CARDRESPEREMPNM | 카드책임자 |

## 주의 / 대조
- **카드책임자 필터 없이 조회하면 회사 전체(수천 건)** 가 뜬다 → 사용일 + 거래처 + 카드책임자명(kiki.config `card_holder.name`, 없으면 `user.name`)으로 필터해 본인 건을 특정. 흔한 거래처(클라우드·SW 구독)는 남의 건이 수십 행 나오므로 필터 없이 출력하지 말 것(출력 ~1,000자 제한).
- **법인카드와 연구비카드 둘 다 조회**해 폴더 증빙(금액·거래처·날짜)과 대조 → 어느 카드 건이 맞는지 확정.
- 같은 거래처에 여러 건/여러 사람이 있을 수 있으니 **반드시 사용일+금액+카드책임자로 본인 건 검증**.
- 확정한 USEAMT 를 검수창 `OBT_AMT` 에 입력.
