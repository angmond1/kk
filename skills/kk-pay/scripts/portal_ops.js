// ============================================================
// kk-pay 코어 (1) — KIST 통합정보시스템 조회 (window.kkPay)
// ------------------------------------------------------------
// 동작 원리: p.kist.re.kr:8081 (NEXACRO) 탭의 "세션 쿠키 + window.application.authTk"
//   로 backend 를 fetch 직접 호출. → 화면 클릭·좌표 0, 해상도/모니터 무관.
//   (2026-06-04 실증: 카드내역 11건 / 과제목록 / 검색조건 전부 fetch 성공)
// 사용법: 통합정보 NEXACRO 화면 1개 연 뒤(아무 화면이나, authTk 확보용) 이 파일을
//   Read → javascript_tool 로 inject → window.kkPay.* 호출.
// credential 없음(세션 쿠키 + 페이지 authTk). 개인 식별자 하드코딩 없음.
// ============================================================
(function () {
  // authTk: NEXACRO 가 매 요청 body 에 넣는 세션 토큰. 전역·쿠키 둘 다 존재, 세션 내 고정.
  function authTk() { return (window.application && window.application.authTk) || ''; }
  function ready() { return !!authTk(); }   // 통합정보 화면 로드(세션) 여부

  // NEXACRO SSV(XML) 요청 body 조립
  function nexBody(pgmId, svcId, datasetXml) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">\n'
      + '<Parameters>\n'
      + '<Parameter id="authTk">' + authTk() + '</Parameter>\n'
      + '<Parameter id="pgmId">' + pgmId + '</Parameter>\n'
      + '<Parameter id="svcId">' + svcId + '</Parameter>\n'
      + '</Parameters>\n' + datasetXml + '\n</Root>';
  }

  // XML 특수문자 이스케이프 — 거래처명 'H&M' 같은 값이 요청 XML 을 깨지 않게
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function ds(id, cols, row) {
    var ci = cols.map(function (c) { return '<Column id="' + c + '" type="STRING" size="256"/>'; }).join('');
    var rc = Object.keys(row).map(function (k) { return '<Col id="' + k + '">' + esc(row[k]) + '</Col>'; }).join('');
    return '<Dataset id="' + id + '"><ColumnInfo>' + ci + '</ColumnInfo><Rows><Row>' + rc + '</Row></Rows></Dataset>';
  }

  async function post(path, body) {
    var r = await fetch(path, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'text/xml; charset=UTF-8' }, body: body,
    });
    var t = await r.text();
    // 세션 만료·잘못된 경로면 XML 대신 HTML(로그인·오류 페이지)이 온다 → 빈 결과로 넘어가지 않게 throw (2026-09-27 실측: authTk 가 틀려도 200 XML, 세션이 없으면 HTML)
    if (!r.ok || t.indexOf('<Root') < 0) {
      if (r.status === 404) throw new Error('PORTAL: 요청 주소가 없습니다(HTTP 404 ' + path + ') — 통합정보 화면·주소가 바뀌었을 수 있음(코어 갱신 필요, 로그인 문제 아님)');
      if (r.status >= 500) throw new Error('PORTAL: 통합정보 서버 오류(HTTP ' + r.status + ') — 잠시 뒤 1회 다시');
      throw new Error('PORTAL: 통합정보 응답이 XML 이 아닙니다(HTTP ' + r.status + ') — 세션 만료 가능성. e.kist.re.kr 로그인 확인 → 통합정보 탭 새로고침 → 코어 재주입');
    }
    var ec = /<Parameter id="ErrorCode"[^>]*>(-?\d+)</.exec(t);
    if (ec && +ec[1] < 0) { var em = /<Parameter id="ErrorMsg"[^>]*>([\s\S]*?)</.exec(t); throw new Error('PORTAL ErrorCode ' + ec[1] + (em ? ': ' + decodeEnt(em[1]).slice(0, 200) : '')); }
    return t;
  }

  // NEXACRO 가 공백 등을 &#32; 로 인코딩 → decode
  function decodeEnt(s) {
    return String(s)
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }

  // 응답 XML → Row 객체 배열 (정규식; 네임스페이스 무관)
  function parseRows(xml) {
    var out = [], rowRe = /<Row[^>]*>([\s\S]*?)<\/Row>/g, m;
    while ((m = rowRe.exec(xml))) {
      var o = {}, cr = /<Col id="([^"]+)">([\s\S]*?)<\/Col>/g, cm;
      while ((cm = cr.exec(m[1]))) o[cm[1]] = decodeEnt(cm[2]);
      out.push(o);
    }
    return out;
  }

  // ---------- 카드영수증 조회 (fam_0711 / getList) ----------
  // opt: { fromDt:'YYYYMMDD', toDt:'YYYYMMDD', cardType:'5'(법인)|'3'(연구비),
  //        empno:'00XXXX'(카드책임자 사번), custnm?, cardno? }
  // 반환: [{date, custnm, amount(원화청구액), apprno(승인번호), cardno, status}]
  async function queryCards(opt) {
    opt = opt || {};
    if (!opt.empno) throw new Error('queryCards: empno(카드책임자 사번)가 필요합니다 — kiki.config card_holder.empno, 없으면 fam_0711 화면 ds_search.SEARCHID');
    if (!opt.fromDt || !opt.toDt) throw new Error('queryCards: fromDt/toDt(YYYYMMDD) 가 필요합니다');
    var cols = ['FROM_DT', 'TO_DT', 'CARDTYPECD', 'CARDRESPEREMPNO', 'SEARCHID', 'CUSTNM', 'CARDNO'];
    var row = {
      FROM_DT: opt.fromDt, TO_DT: opt.toDt,
      CARDTYPECD: opt.cardType || '5',
      CARDRESPEREMPNO: opt.empno, SEARCHID: opt.empno,
    };
    if (opt.custnm) row.CUSTNM = opt.custnm;
    if (opt.cardno) row.CARDNO = opt.cardno;
    var xml = await post('/mis/fam/fam0711/getList.do', nexBody('fam_0711', 'getList', ds('ds_search', cols, row)));
    return parseRows(xml).filter(function (o) { return o.CARDAPPRNO; }).map(function (o) {
      // 카드번호 전체는 돌려주지 않는다(채팅 노출 방지) — 뒤 4자리(card4)만. holder = 카드책임자, cancel = 취소금액.
      return { date: o.CARDUSEYMD, custnm: o.CUSTNM, amount: o.USEAMT, apprno: o.CARDAPPRNO, status: o.PRGRSSTATNM,
               holder: o.CARDRESPEREMPNM, cancel: o.DCAMT, card4: String(o.CARDNO || '').slice(-4) };
    });
  }

  // ---------- 수행과제 조회 (rdm_2011 / doSearchMain) ----------
  // 반환: [{acccd(과제번호), name(과제명), pi(책임자), type(주관/공동)}]
  async function queryProjects() {
    var cols = ['SRCHKND', 'SRCHVAL', 'SRCHPROCESS'];
    var xml = await post('/mis/rdm/rdm2011/doSearchMain.do', nexBody('rdm_2011', 'doSearchMain', ds('ds_search', cols, { SRCHKND: 'anyThing', SRCHPROCESS: '0' })));
    return parseRows(xml).filter(function (o) { return o.ACCCD; }).map(function (o) {
      return { acccd: o.ACCCD, name: o.PROJNM, pi: o.KORNM, type: o.PROJTYPE };
    });
  }

  // ---------- 카드책임자 이름 → 사번 (chkPopupValueSetting.do) ----------
  // 구조(2026-06-04 파악): 요청 Parameters UP_COMM_CD=이름·keyTableNm=VI_HRM_BAS_MGT·keyColNm=HOLD_OFFI·
  //   keyColVal=1·UP_COMM_COL_NM=EMP_NM·USE_RESNO=N·svcId=empSchPopup (Dataset 없음) /
  //   응답 Parameters EMP_NO(사번)·EMP_NM·DEPT_NM·result.
  // ⚠️ 미해결: 화면(NEXACRO) 에서 이름 Enter 로는 동작(응답에 EMP_NO 옴)하나, **동일 body 를 직접 fetch 하면
  //   빈 응답**(세션 상태/호출순서/referer 의존 추정). 아래 함수는 그대로 빈 결과일 수 있음 → referer 등 보강 후 활성.
  // → **현재 운용**: 카드책임자 사번은 kiki.config `card_holder.empno` 사용. 사번 모르면 첫 1회 fam_0711 화면에서
  //   카드책임자 칸에 이름 Enter → 옆에 뜨는 사번 확인 → config 저장. (skill 동작엔 지장 없음)
  async function nameToEmpno(name) {
    var body = '<?xml version="1.0" encoding="UTF-8"?>\n<Root xmlns="http://www.nexacroplatform.com/platform/dataset">\n<Parameters>\n'
      + '<Parameter id="authTk">' + authTk() + '</Parameter>\n'
      + '<Parameter id="keyTableNm">VI_HRM_BAS_MGT</Parameter>\n'
      + '<Parameter id="keyColNm">HOLD_OFFI</Parameter>\n'
      + '<Parameter id="keyColVal">1</Parameter>\n'
      + '<Parameter id="UP_COMM_COL_NM">EMP_NM</Parameter>\n'
      + '<Parameter id="UP_COMM_CD">' + esc(name) + '</Parameter>\n'
      + '<Parameter id="USE_RESNO">N</Parameter>\n'
      + '<Parameter id="pgmId">fam_0711</Parameter>\n'
      + '<Parameter id="svcId">empSchPopup</Parameter>\n'
      + '</Parameters>\n</Root>';
    var xml = await post('/popup/common/getRqstNoMgt/chkPopupValueSetting.do', body);
    function pick(id) { var m = xml.match(new RegExp('<Parameter id="' + id + '">([^<]*)</Parameter>')); return m ? m[1] : ''; }
    return { empno: pick('EMP_NO'), name: pick('EMP_NM'), dept: pick('DEPT_NM'), result: pick('result') };
  }

  // ---------- 출력 조각 (Claude in Chrome javascript_tool 제약: ~1,000자 truncation, 8자리 이상 숫자·URL 가림, a=b 꼴 차단) ----------
  // 카드 목록을 12~15줄씩 읽는다. 승인번호는 4자리마다 '-', 날짜는 YYYY-MM-DD, 금액은 천단위 콤마 → 8자리 연속 숫자가 없다. '=' 도 없다.
  //   idx | 날짜 | 거래처 | 금액 | 승인 XXXX-XXXX | 상태 | 카드책임자 | (법인/연구비)
  // 2-스텝 결과(window.__c) 그대로 넘긴다: null = 아직(또는 .then 에 오류 처리를 안 붙임) / {error} = 실패 / 배열 = 결과.
  var NOT_YET = '(결과 없음 — 조회가 아직이면 2~3초 뒤 다시. 계속 이러면 .then(r=>…, e=>window.__c={error:String(e)}) 로 오류까지 저장했는지 확인)';
  function errLine(x) { return 'ERR ' + String(x.error).replace(/https?:\S+/g, '[url]').replace(/[=&?;]/g, ' ').slice(0, 300); }
  // 반환 문자열은 1,000자에서 잘린다(실측) → 줄 수가 아니라 글자 수로 끊고 머리줄에 다음 조각 번호를 적는다
  function fitRows(rows, reserve) { var out = [], n = reserve || 150; for (var i = 0; i < rows.length; i++) { n += rows[i].length + 1; if (n > 960) break; out.push(rows[i]); } return out; }
  function fmtCards(rows, from, to) {
    if (rows == null) return NOT_YET;
    if (!Array.isArray(rows) && rows.error) return errLine(rows);
    rows = rows || []; from = from || 0; to = to == null ? from + 15 : to;
    var hy = function (x) { return String(x == null ? '' : x).replace(/(\d{4})(?=\d)/g, '$1-'); };
    var dt = function (d) { d = String(d || ''); return /^\d{8}$/.test(d) ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6) : d; };
    var won = function (a) { if (a && typeof a === 'object') a = a.hi; var n = parseFloat(String(a == null ? '' : a).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? String(a == null ? '' : a) : Math.round(n).toLocaleString('en-US'); };
    var lines = fitRows(rows.slice(from, to).map(function (c, k) {
      return [from + k, dt(c.date), String(c.custnm || '').slice(0, 16), won(c.amount), '승인 ' + hy(c.apprno), c.status || '', c.holder || '', c.cardKind || ''].join(' | ').replace(/[=&?;]/g, ' ');
    }));
    var end = from + lines.length;
    return '[' + from + '-' + end + ' of ' + rows.length + ']' + (end < Math.min(to, rows.length) ? ' ▶ 다음 조각 ' + end : '') + '\n' + lines.join('\n');
  }
  window.kkPay = {
    authTk: authTk, ready: ready, nexBody: nexBody, post: post, parseRows: parseRows, ds: ds,
    queryCards: queryCards, queryProjects: queryProjects, nameToEmpno: nameToEmpno, fmtCards: fmtCards, esc: esc,
    _version: 'kk-pay-portal/1.2',
  };
  return window.kkPay._version + ' =^.^=';
})();
