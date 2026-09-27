// ============================================================
// kk-budget 집행내역 헬퍼 — 셀클릭 핸들러 직접 호출 (window.kkExe)
// ------------------------------------------------------------
// 예실대비표(bdg_2030)의 집행/계류 내역 팝업을 "좌표 클릭 없이" 연다.
// 좌표 클릭은 과제마다 비목 구성이 달라 행 Y 가 밀리고 한 번 어긋나면
// 엉뚱한 팝업이 뜨거나 무반응이 된다. 그리드 셀클릭 핸들러를 코드로
// 직접 호출하면 해상도·스크롤·행 위치와 무관하다. (2026-09-18 확립)
//
// 사용법:
//   1) 예실대비표 화면(bdg_2030)에서 수행중 계정 목록의 과제번호를 클릭해 표가 뜬 상태에서(SKILL §4 '진입')
//   2) 이 파일을 Read -> javascript_tool 로 inject
//   3) kkExe.init()            // 폼·그리드 잡기 (셀 인덱스 자동 조회)
//      kkExe.cats()            // 카테고리 목록 [{dsRow, cd, nm, exec, pd, pp}]
//      kkExe.open(dsRow,'exec')// 팝업 열기 ('exec'|'pendDone'|'pendProg')
//      ... 4~7초 대기 ...
//      kkExe.parse(names)      // 이름별 집계 (names = 문자열 배열)
//      kkExe.close()           // 🔴 반드시 이걸로 닫기
//
// ⚠️ async 결과가 {} 로 오는 브라우저가 있으므로 모든 함수는 동기다.
//    팝업 로딩만 비동기라 open() 후 대기했다가 parse() 를 부른다.
// credential 없음. 개인 식별자 하드코딩 없음(이름은 호출 인자로).
// 상세 배경 → references/budget_fetch_spec.md
// ============================================================
(function () {
  var S = {};   // state: form, grid, cellIdx

  function num(v) {
    if (v && typeof v === 'object') return v.hi || 0;              // NEXACRO {hi,lo}
    var n = parseFloat(String(v == null ? '0' : v).replace(/[^0-9.\-]/g, ''));   // '1234.00' → 1234 (점만 지우면 100배)
    return isNaN(n) ? 0 : Math.round(n);
  }

  // 메인 폼: application.mainframe.all[0].form 이 화면 폼(ChildFrame).
  // mainframe.frames / components 로는 못 찾는다.
  function mainForm() {
    var cf = window.application.mainframe.all[0];
    return cf && cf.form;
  }

  // 그리드는 이름이 아니라 "바인딩 컬럼"으로 식별한다(화면마다 이름이 다름).
  function findGrid(form, probeCol) {
    var found = null;
    (function walk(o, d) {
      if (d > 6 || !o || found) return;
      var cs = null; try { cs = o.components; } catch (e) { }
      if (!cs) return;
      var n = 0; try { n = cs.length; } catch (e) { }
      for (var i = 0; i < n && !found; i++) {
        var cp = cs[i]; if (!cp) continue;
        if (/^Grid$/i.test(cp._type_name || '')) {
          try { if (cp.getBindCellIndex('body', probeCol) >= 0) { found = cp; return; } } catch (e) { }
        }
        walk(cp, d + 1);
      }
    })(form, 0);
    return found;
  }

  function init() {
    var f = mainForm();
    if (!f) return { err: 'no form' };
    var g = findGrid(f, 'CTRLPERFAMT');
    if (!g) return { err: 'no grid' };
    S.form = f; S.grid = g;
    // 셀 인덱스는 하드코딩하지 않고 매번 조회 (실측값 8/9/10/11)
    S.cell = {
      exec: g.getBindCellIndex('body', 'CTRLPERFAMT'),
      pendDone: g.getBindCellIndex('body', 'CTRLCAUSAMT'),
      pendProg: g.getBindCellIndex('body', 'TEMPAMT'),
      bal: g.getBindCellIndex('body', 'BALNAMT')
    };
    return { form: f.name, grid: g.name, cell: S.cell };
  }

  // 카테고리 = ds_datagrid1 의 LEV==='1' 행. 화면 표시 순서 != dataset 인덱스이므로
  // 반드시 여기서 얻은 dsRow 를 open() 에 넘긴다.
  function cats() {
    var ds = S.form.ds_datagrid1, out = [];
    for (var r = 0; r < ds.getRowCount(); r++) {
      if (String(ds.getColumn(r, 'LEV') || '') !== '1') continue;
      if (!String(ds.getColumn(r, 'BUDGITEMCD') || '')) continue;   // 소계/총계행(코드 없음) 제외
      out.push({
        dsRow: r,
        cd: String(ds.getColumn(r, 'BUDGITEMCD') || ''),
        nm: String(ds.getColumn(r, 'BUDGITEMNM') || '').replace(/&#32;/g, ' '),
        exec: num(ds.getColumn(r, 'CTRLPERFAMT')),
        pd: num(ds.getColumn(r, 'CTRLCAUSAMT')),
        pp: num(ds.getColumn(r, 'TEMPAMT')),
        // 인건비성(외부·내부인건비·학생인건비·연구수당): 세부내역은 계정책임자·지정 계정관리자만(포털 BDG_CHK_0143, 연구수당은 계정책임자만)
        personnel: /인건비|연구수당/.test(String(ds.getColumn(r, 'EXPITEMKORNM') || '') + String(ds.getColumn(r, 'BUDGITEMNM') || '')) || String(ds.getColumn(r, 'BUDGITEMCD') || '') === '29'
      });
    }
    return out;
  }

  // ★ 핸들러는 인자의 e.row 가 아니라 "그리드 현재 행"을 본다.
  //   set_rowposition 을 먼저 하지 않으면 무조건 첫 행 팝업이 열린다.
  // 2026-09-28 실측: 권한 없는 인건비성 항목을 누르면 포털이 네이티브 alert("인건비성 항목이 포함된 상세내역은 계정책임자및 …")를 띄우고,
  //   알림창이 떠 있는 동안 탭 전체가 멈춰 자동화 명령이 45초 시간초과로 끝난다(사용자가 '확인'을 눌러야 풀림).
  //   → 셀클릭 호출 동안만 window.alert 를 가로채 메시지를 받고 'DENIED …' 를 돌려준다. 팝업은 열리지 않는다.
  function open(dsRow, kind) {
    var c = S.cell[kind || 'exec'];
    if (c == null || c < 0) return 'ERR: bad kind';
    var msgs = [], orig = window.alert;
    try {
      close();                                  // 잔류 팝업 정리(정식 경로)
      S.form.ds_datagrid1.set_rowposition(dsRow);
      try { S.grid.setCellPos(c); } catch (e) { }
      window.alert = function (m) { msgs.push(String(m == null ? '' : m)); };
      S.form.Tab00_tabpage1_Grid01_oncellclick(S.grid, {
        row: dsRow, cell: c, col: c,
        fromobject: S.grid, fromreferenceobject: S.grid, eventid: 'oncellclick'
      });
    } catch (e) { return 'ERR:' + String(e).slice(0, 120); }
    finally { window.alert = orig; }
    if (msgs.length) return 'DENIED: ' + msgs[0].replace(/\s+/g, ' ').slice(0, 160);
    return 'ok r' + dsRow + ' c' + c;
  }

  // 팝업은 application.popupframes 최상단.
  // 집행 popBdgExeList / 계류완료 popPendList / 계류진행 popBdgCusExpList
  function pop() {
    var pf = window.application.popupframes;
    if (pf.length > 0) {
      var fr = pf.getItem(pf.length - 1);
      if (fr && fr.form) return fr.form;
    }
    return null;
  }

  // 🔴 닫기는 반드시 팝업 폼의 btn_close. form.close()/destroy 로 닫으면
  //    modalPopDiv_* Div 가 잔류해 이후 모든 셀클릭이 "already exists" 로 조용히 실패한다.
  //    (그 상태가 되면 페이지 navigate 리셋이 가장 빠른 복구)
  function close() {
    try {
      var fm = pop(); if (!fm) return 'none';
      var b = fm.btn_close;
      if (!b) { try { for (var i = 0; i < fm.components.length; i++) { var cp = fm.components[i]; if (/close|cls/i.test(cp.name)) { b = cp; break; } } } catch (e) { } }
      if (b && b.click) { b.click(); return 'closed'; }
      return 'nobtn';
    } catch (e) { return 'ERR:' + String(e).slice(0, 80); }
  }

  // 이름 경계 검증: 이름 뒤 글자가 한글/영숫자면 오탐 의심으로 표시
  function boundaryOk(s, nm) {
    var i = s.indexOf(nm); if (i < 0) return null;
    var a = s.charAt(i + nm.length);
    if (a === '') return true;
    return !/[가-힣A-Za-z0-9]/.test(a);
  }

  // names: ['김키키','이키키'] — 적요/신청인 등 행의 "모든 문자열 컬럼"을 합쳐 매칭.
  // 팝업별 컬럼명 차이(COMDSCCONT vs CONT, USERNM vs RQSTEMPNM)를 그대로 흡수한다.
  function parse(names, showAll, cap) {
    var fm = pop();
    if (!fm) return { err: 'no popup' };
    var ds = fm.ds_datagrid1;
    if (!ds) { for (var k in fm) { try { if (fm[k] && fm[k]._type_name === 'Dataset' && /grid|list/i.test(k) && fm[k].getRowCount() > 0) { ds = fm[k]; break; } } catch (e) { } } }
    if (!ds) return { form: fm.name, err: 'no dataset' };

    var rc = ds.getRowCount(), cc = ds.getColCount(), cols = [];
    for (var c = 0; c < cc; c++) cols.push(ds.getColID(c));
    var has = function (n) { return cols.indexOf(n) > -1; };

    // 금액 컬럼은 팝업마다 다르다 → 합계>0 인 첫 후보를 채택
    var pref = ['RESOLAMT', 'CTRLCHNGAMT', 'INVOICE_RQSTAMT'];
    var cand = pref.filter(has).concat(cols.filter(function (x) { return /AMT/i.test(x) && pref.indexOf(x) < 0; }));
    var amtCol = null;
    for (var i = 0; i < cand.length; i++) {
      var s = 0; for (var r = 0; r < rc; r++) s += num(ds.getColumn(r, cand[i]));
      if (s > 0) { amtCol = cand[i]; break; }
    }
    var ymdCol = has('RESOLYMD') ? 'RESOLYMD' : (has('BUDGCTLYMD') ? 'BUDGCTLYMD' : null);

    names = names || [];
    var by = {}; names.forEach(function (n) { by[n] = { n: 0, sum: 0 }; });
    var tot = 0, n = 0, hdr = 0, mine = 0, mineN = 0, susp = 0, multi = 0, rows = [], all = [];

    for (var r2 = 0; r2 < rc; r2++) {
      var a = amtCol ? num(ds.getColumn(r2, amtCol)) : 0;
      var strs = [];
      for (var c2 = 0; c2 < cc; c2++) { var v = ds.getColumn(r2, c2); if (typeof v === 'string' && v) strs.push(v); }
      // 날짜가 빈 행 = 합계행 → 제외 (상세합이 화면 소계와 일치해야 정상)
      var ymd = ymdCol ? String(ds.getColumn(r2, ymdCol) || '') : 'x';
      if (!ymd) { hdr += a; continue; }
      tot += a; n++;
      var hits = [];
      names.forEach(function (nm) {
        var ok = null;
        strs.forEach(function (s2) { var o = boundaryOk(s2, nm); if (o !== null) ok = (ok === true) || o; });
        if (ok !== null) hits.push({ nm: nm, ok: ok });
      });
      var desc = String(ds.getColumn(r2, has('COMDSCCONT') ? 'COMDSCCONT' : (has('CONT') ? 'CONT' : cols[1])) || '');
      var who = String(ds.getColumn(r2, has('USERNM') ? 'USERNM' : (has('RQSTEMPNM') ? 'RQSTEMPNM' : cols[0])) || '');
      if (hits.length) {
        mine += a; mineN++;
        hits.forEach(function (h) { by[h.nm].n++; by[h.nm].sum += a; });
        if (hits.length > 1) multi++;
        if (hits.some(function (h) { return !h.ok; })) susp++;
        if (rows.length < 12) rows.push({ w: hits.map(function (h) { return h.nm; }).join('/'), a: a, c: desc.slice(0, 28), u: who.slice(0, 16), d: ymd });
      }
      if (showAll && all.length < (cap || 20)) all.push({ a: a, c: desc.slice(0, 24), u: who.slice(0, 16), d: ymd });
    }
    var out = {
      form: fm.name, item: has('ITEMKORNM') ? String(ds.getColumn(0, 'ITEMKORNM') || '') : '',
      amtCol: amtCol, n: n, sum: tot, hdr: hdr,        // sum(상세합) 이 화면 소계와 같아야 함
      mineN: mineN, mine: mine, by: by,
      multi: multi,                                     // 한 건에 두 사람 이름 → 합산 시 중복 주의
      susp: susp,                                       // 이름 경계 의심(오탐 후보)
      rows: rows
    };
    if (showAll) out.all = all;
    return out;
  }

  window.kkExe = {
    init: init, cats: cats, open: open, parse: parse, close: close, pop: pop,
    _version: 'kk-budget-exec-detail/1.3'
  };
  return window.kkExe._version + ' =^.^=';
})();
