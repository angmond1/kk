// ============================================================
// kk-meet 코어 (1) — KIST 통합정보시스템 조회 (window.kkmeet)
// ------------------------------------------------------------
// 동작: p.kist.re.kr:8081 (NEXACRO) 탭의 세션쿠키 + window.application.authTk 로
//   backend 를 fetch 직접 호출. 화면 클릭·좌표 0, 해상도/모니터 무관.
//   (kk-pay/portal_ops.js 의 카드·과제 조회 패턴 재사용 + 사전결재 fam_0100 추가)
// 사용법: 통합정보 NEXACRO 화면 1개 연 뒤(아무 화면, authTk 확보용) inject → window.kkmeet.*
// credential 없음(세션쿠키 + 페이지 authTk). 개인 식별자 하드코딩 없음.
// ============================================================
(function () {
  function authTk() { return (window.application && window.application.authTk) || ''; }
  function ready() { return !!authTk(); }

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
    var r = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'text/xml; charset=UTF-8' }, body: body });
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
  function decodeEnt(s) {
    return String(s).replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }
  function parseRows(xml) {
    var out = [], rr = /<Row[^>]*>([\s\S]*?)<\/Row>/g, m;
    while ((m = rr.exec(xml))) {
      var o = {}, cr = /<Col id="([^"]+)">([\s\S]*?)<\/Col>/g, cm;
      while ((cm = cr.exec(m[1]))) o[cm[1]] = decodeEnt(cm[2]);
      out.push(o);
    }
    return out;
  }

  // ---------- 카드영수증 (fam_0711 / getList) — 단일 카드종류 ----------
  // cardType: '5'(법인) | '3'(연구비)
  async function queryCards(opt) {
    opt = opt || {};
    if (!opt.empno) throw new Error('queryCards: empno(카드책임자 사번)가 필요합니다 — kiki.config card_holder.empno, 없으면 fam_0711 화면 ds_search.SEARCHID');
    if (!opt.fromDt || !opt.toDt) throw new Error('queryCards: fromDt/toDt(YYYYMMDD) 가 필요합니다');
    var cols = ['FROM_DT', 'TO_DT', 'CARDTYPECD', 'CARDRESPEREMPNO', 'SEARCHID', 'CUSTNM', 'CARDNO'];
    var row = { FROM_DT: opt.fromDt, TO_DT: opt.toDt, CARDTYPECD: opt.cardType || '5', CARDRESPEREMPNO: opt.empno, SEARCHID: opt.empno };
    if (opt.custnm) row.CUSTNM = opt.custnm;
    if (opt.cardno) row.CARDNO = opt.cardno;
    var xml = await post('/mis/fam/fam0711/getList.do', nexBody('fam_0711', 'getList', ds('ds_search', cols, row)));
    var kind = (opt.cardType === '3') ? '연구비' : '법인';
    return parseRows(xml).filter(function (o) { return o.CARDAPPRNO; }).map(function (o) {
      // 카드번호 전체는 돌려주지 않는다(채팅 노출 방지) — 뒤 4자리(card4)만. holder = 카드책임자, cancel = 취소금액.
      return { date: o.CARDUSEYMD, custnm: o.CUSTNM, amount: o.USEAMT, apprno: o.CARDAPPRNO, status: o.PRGRSSTATNM, cardKind: kind,
               holder: o.CARDRESPEREMPNM, cancel: o.DCAMT, card4: String(o.CARDNO || '').slice(-4) };
    });
  }

  // ---------- 카드 법인+연구비 둘 다 (회의비 후보용) ----------
  // 반환 건마다 cardKind('법인'|'연구비') 포함 → 리스트업 시 구분 표시.
  // 기간 미지정 시 호출측에서 화면 기본(직전 1개월) 사용. 여기선 fromDt/toDt 받음.
  async function queryCardsBoth(opt) {
    var corp = await queryCards(Object.assign({}, opt, { cardType: '5' }));
    var rsch = await queryCards(Object.assign({}, opt, { cardType: '3' }));
    return corp.concat(rsch);
  }

  // ---------- 수행/참여 과제 (rdm_2011 / doSearchMain) ----------
  // 반환: [{acccd, name, pi, projCode(분류코드 1자), preApprovalExempt(I/S/B/F 원래 면제 코드 — 2026-08-01 사용분부터는 폐지 대상 부처 과제·주요사업도 사전결재 불필요, project_code.md)}]
  async function queryProjects() {
    var cols = ['SRCHKND', 'SRCHVAL', 'SRCHPROCESS'];
    var xml = await post('/mis/rdm/rdm2011/doSearchMain.do', nexBody('rdm_2011', 'doSearchMain', ds('ds_search', cols, { SRCHKND: 'anyThing', SRCHPROCESS: '0' })));
    return parseRows(xml).filter(function (o) { return o.ACCCD; }).map(function (o) {
      var mm = String(o.ACCCD).match(/\d+([A-Za-z])/);   // 숫자 뒤 첫 영문 = 분류코드 (2E11111 -> E, 2N11111 -> N)
      var code = mm ? mm[1].toUpperCase() : '';
      return { acccd: o.ACCCD, name: o.PROJNM, pi: o.KORNM, projCode: code, preApprovalExempt: ['I', 'S', 'B', 'F'].indexOf(code) >= 0 };
    });
  }

  // ---------- 회의비 사전내부결재 (fam_0100 / getList @ getListByBonbu.do) — 2026-08-01 사용분부터 남은 경우만 ----------
  // ⚠️ 본부 전체를 반환(발의자 서버필터 미적용) → 응답에서 acccd/date/발의자로 필터해야 함.
  //   opt: { fromDt, toDt, empName(발의자명), empno(발의자사번) }
  // 반환: [{date, purpose(회의목적=회의록제목), place, acccd, startTm, endTm, proposer(발의자), people}]
  async function queryPreApprovals(opt) {
    var cols = ['STRDNT', 'ENDDNT', 'KORNM', 'PAYNO', 'DEPTNM', 'DEPTCD', 'ACCPAYNO', 'ACCKORNM'];
    var row = { STRDNT: opt.fromDt, ENDDNT: opt.toDt };
    if (opt.empName) row.KORNM = opt.empName;
    if (opt.empno) row.PAYNO = opt.empno;
    var xml = await post('/mis/fam/fam0100/getListByBonbu.do', nexBody('fam_0100', 'getList', ds('ds_search', cols, row)));
    return parseRows(xml).filter(function (o) { return o.PRI_CONFER_DATE; }).map(function (o) {
      return {
        date: o.PRI_CONFER_DATE, purpose: o.PRI_CONFER_PERPOSE, place: o.PRI_CONFER_PLACE,
        acccd: o.PRI_CONFER_ACCCD, startTm: o.PRI_CONFER_STRTM, endTm: o.PRI_CONFER_ENDTM,
        proposer: o.KORNM, people: o.JOINPEOPLE,
      };
    });
  }

  // 사전결재 매칭: 카드건(date,acccd)에 맞는 사전결재 찾기.
  // 같은 과제(acccd) + 같은 날짜(date) 우선, 없으면 같은 과제+근접일.
  function matchPreApproval(list, cardDate, acccd) {
    var same = list.filter(function (p) { return p.acccd === acccd; });
    var exact = same.filter(function (p) { return p.date === cardDate; });
    if (exact.length) return exact[0];
    return null;   // 매칭 실패 → 호출측에서 회의제목 자동산출/확인
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
  // ---------- 회의비 후보 표 (2026-09-27 전체 흐름 검수로 다시 설계) ----------
  //   코드는 결정적인 것만 붙인다: 미처리(영수증함) 여부 · 인원 하한 ⌈금액÷5만⌉+1 · 50만 초과(일상감사·차상위자) · 취소/삭제.
  //   식당·카페·주점(주류·유흥 = 회의비 불가) 여부와 명세서(jpg) 필요 여부는 Claude 가 거래처명을 보고 판단한다 —
  //   상호 키워드 규칙은 실제 카드내역 70곳에서 식당·카페의 절반만 잡고(순대·치킨 체인·카츠·BBQ 누락) 호프·와인을 후보로 올려 폐기했다.
  //   meetingHints(rows) → 각 행에 pending·headcount·note / fmtMeeting(rows, from, to, {all}) → 기본은 영수증함 건만(idx 는 window.__c 의 원래 번호).
  function headcount(amount) {
    if (amount && typeof amount === 'object') amount = amount.hi;
    var n = parseFloat(String(amount == null ? '0' : amount).replace(/[^0-9.\-]/g, '')) || 0;
    return Math.ceil(n / 50000) + 1;
  }
  function amountOf(a) { if (a && typeof a === 'object') a = a.hi; return parseFloat(String(a == null ? '' : a).replace(/[^0-9.\-]/g, '')) || 0; }
  function meetingHints(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (r, i) {
      var st = String(r.status || ''), pending = !st || /영수증함/.test(st), notes = [];
      if (!pending) notes.push(/취소|삭제/.test(st) ? '취소·삭제' : '처리됨');
      if (pending && amountOf(r.amount) > 500000) notes.push('50만↑ 일상감사·차상위자');
      return Object.assign({}, r, { idx: i, pending: pending, headcount: headcount(r.amount), note: notes.join(', ') });
    });
  }
  function fmtMeeting(rows, from, to, opt) {
    if (rows == null) return NOT_YET;
    if (!Array.isArray(rows) && rows.error) return errLine(rows);
    opt = opt || {}; from = from || 0; to = to == null ? from + 15 : to;
    var all = meetingHints(rows), list = opt.all ? all : all.filter(function (c) { return c.pending; });
    var hy = function (x) { return String(x == null ? '' : x).replace(/(\d{4})(?=\d)/g, '$1-'); };
    var dt = function (d) { d = String(d || ''); return /^\d{8}$/.test(d) ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6) : d; };
    var won = function (a) { return Math.round(amountOf(a)).toLocaleString('en-US'); };
    var lines = fitRows(list.slice(from, to).map(function (c) {
      return [c.idx, dt(c.date), String(c.custnm || '').slice(0, 18), won(c.amount), c.cardKind || '', c.pending ? c.headcount + '명↑' : String(c.status || ''), c.note, '승인 ' + hy(c.apprno)].join(' | ').replace(/[=&?;]/g, ' ');
    }), 170);
    var nP = all.filter(function (c) { return c.pending; }).length, end = from + lines.length;
    return '[' + (opt.all ? '전체' : '영수증함') + ' ' + from + '-' + end + ' of ' + list.length + ' | 조회 ' + all.length + '건 중 영수증함 ' + nP + ']' + (end < Math.min(to, list.length) ? ' ▶ 다음 조각 ' + end : '') + ' 인원은 하한, 업종·명세서는 거래처명으로 판단\n' + lines.join('\n');
  }
  window.kkmeet = {
    authTk: authTk, ready: ready, nexBody: nexBody, ds: ds, post: post, parseRows: parseRows,
    queryCards: queryCards, queryCardsBoth: queryCardsBoth, queryProjects: queryProjects,
    queryPreApprovals: queryPreApprovals, matchPreApproval: matchPreApproval, fmtCards: fmtCards, esc: esc,
    meetingHints: meetingHints, fmtMeeting: fmtMeeting, headcount: headcount,
    _version: 'kk-meet-portal/1.4',
  };
  window.kkmeeting = window.kkmeet;   // 옛 이름(2026-09-29 kk-meeting → kk-meet 개명 전) — 같은 객체
  return window.kkmeet._version + ' =^.^=';
})();
