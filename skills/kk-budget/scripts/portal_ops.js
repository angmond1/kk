// ============================================================
// kk-budget 코어 — KIST 통합정보 예실대비표 조회 (window.kkBudget)
// ------------------------------------------------------------
// 동작 원리: p.kist.re.kr:8081 (NEXACRO) 탭의 "세션 쿠키 + window.application.authTk"
//   로 backend 를 fetch 직접 호출. → 화면 클릭·좌표 0, 해상도/모니터 무관.
//   (2026-06-02 실증: 과제목록 / 예실대비표 카테고리 A·집행·계류·잔액 전부 fetch 성공,
//    화면 스크린샷과 1:1 대조 검증.)
// 사용법: 통합정보 NEXACRO 화면 1개 연 뒤(아무 화면이나, authTk 확보용) 이 파일을
//   Read -> javascript_tool 로 inject -> window.kkBudget.* 호출.
// credential 없음(세션 쿠키 + 페이지 authTk). 개인 식별자 하드코딩 없음.
// 상세 endpoint·컬럼 매핑은 references/budget_fetch_spec.md.
// ============================================================
(function () {
  // ---- 공통 (shared/kist_portal.md 준용) ----
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

  function decodeEnt(s) {
    return String(s)
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }

  function parseRows(xml) {
    var out = [], rowRe = /<Row[^>]*>([\s\S]*?)<\/Row>/g, m;
    while ((m = rowRe.exec(xml))) {
      var o = {}, cr = /<Col id="([^"]+)">([\s\S]*?)<\/Col>/g, cm;
      while ((cm = cr.exec(m[1]))) o[cm[1]] = decodeEnt(cm[2]);
      out.push(o);
    }
    return out;
  }

  // '12,345' / '1234.00' / {hi,lo} 모두 정수 원으로 (소수점 문자열에서 점만 지우면 100배가 되는 함정 방지)
  function num(s) {
    if (s && typeof s === 'object') return s.hi || 0;
    var n = parseFloat(String(s == null ? '0' : s).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : Math.round(n);
  }

  // 예산항목 코드(BUDGITEMCD) -> 표시명
  var CAT_MAP = {
    '15': '재료비', '11': '시설장비비', '33': '활동비1', '34': '활동비2',
    '05': '내부인건비2', '31': '학생인건비', '01': '내부인건비1',
    '30': '간접비(통합)', '61': '간접비(주요사업)', '07': '지식재산권관리비',
    '19': '위탁연구개발비', '29': '연구수당',
  };

  // ---- 수행과제 조회 (rdm_2011 / doSearchMain) ----
  // 반환: [{acccd, name, pi, projType}]  ※ projType=과제유형(주관/공동), 본인역할은 pi==본인 비교로.
  async function queryProjects() {
    var xml = await post('/mis/rdm/rdm2011/doSearchMain.do',
      nexBody('rdm_2011', 'doSearchMain', ds('ds_search', ['SRCHKND', 'SRCHVAL', 'SRCHPROCESS'], { SRCHKND: 'anyThing', SRCHPROCESS: '0' })));
    return parseRows(xml).filter(function (o) { return o.ACCCD; })
      .map(function (o) { return { acccd: o.ACCCD, name: o.PROJNM, pi: o.KORNM, projType: o.PROJTYPE }; });
  }

  // ---- 예실대비표 (bdg_2030: getBdgInfo -> getMainList) ----
  // 반환: {acccd, totBudg, categories:{표시명:{code,clsName,A,first,carry,exec,pendingDone,pendingProg,D,rate}}, direct:{A,D}}
  //  - A=최종예산 first=최초 carry=이월 exec=집행(B) pendingDone=계류결재완료 pendingProg=계류결재진행 D=잔액
  //  - direct = 직접비 분류(LEV1) 전체 합산 (= 화면 "소계 [직접비]")
  //  검산: A == D + exec + pendingDone + pendingProg
  async function queryBudgetTable(acccd) {
    // 1) getBdgInfo -> ACCCLSCD (getMainList 필수 파라미터) + 과제 총예산
    var biXml = await post('/bdg/bdg2030/getBdgInfo.do',
      nexBody('bdg_2030', 'getBdgInfo', ds('ds_search', ['BUDGSBJCD', 'BUDGYEAR'], { BUDGSBJCD: acccd, BUDGYEAR: '9999' })));
    var meta = parseRows(biXml)[0] || {};
    var accls = meta.ACCCLSCD || '6';
    // 2) getMainList (BUDGYEAR=9999 + acccd + ACCCLSCD -> 카테고리 LEV1 A/집행/계류/잔액)
    var mlXml = await post('/bdg/bdg2030/getMainList.do',
      nexBody('bdg_2030', 'getMainList', ds('ds_main', ['BUDGYEAR', 'BUDGSBJCD', 'ACCCLSCD'], { BUDGYEAR: '9999', BUDGSBJCD: acccd, ACCCLSCD: accls })));
    var rows = parseRows(mlXml);
    var cats = {}, dA = 0, dD = 0;
    rows.forEach(function (r) {
      if (r.LEV !== '1' || !r.BUDGITEMCD) return;            // 카테고리 행만 (세부 LEV2/소계 제외)
      var nm = (r.BUDGITEMNM || '').replace(/&#32;/g, ' ');
      if (!/^\d+\s*:/.test(nm)) return;
      var label = CAT_MAP[r.BUDGITEMCD] || nm;
      var it = {
        code: r.BUDGITEMCD, clsName: r.BUDGITEMCLSNM,
        A: num(r.LASTBUDGAMT), first: num(r.FRSTBUDGAMT), carry: num(r.BF_BALAMT),
        exec: num(r.CTRLPERFAMT), pendingDone: num(r.CTRLCAUSAMT), pendingProg: num(r.TEMPAMT),
        D: num(r.BALNAMT), rate: r.BAL_RATE,
      };
      cats[label] = it;
      if (r.BUDGITEMCLSNM === '직접비') { dA += it.A; dD += it.D; }
    });
    return { acccd: acccd, totBudg: num(meta.TOTBUDGAMT), categories: cats, direct: { A: dA, D: dD } };
  }

  // ---------- 한 번에 수집·다운로드 (LLM 이 과제마다 조회하고 숫자를 옮겨 적지 않게, 2026-09-27) ----------
  //   collectAll({acccds?, userName?, roles?, categories?}) → snapshot(window.kkBudget.snapshot) / collectStatus() 진행 / downloadSnapshot() 파일로 /
  //   fmtBudget() 채팅용 표(백만원). 다운로드한 JSON 은 `python scripts/make_report.py --from-downloads` 가 그대로 엑셀로 만든다.
  var snapshot = null;
  var collectProgress = { phase: 'idle', done: 0, total: 0, err: '', run: '' };
  var DEFAULT_CATS = ['재료비', '시설장비비', '활동비1', '활동비2', '내부인건비2', '학생인건비'];
  function pad2(n) { return String(n).padStart(2, '0'); }
  function localStamp(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function clean(v) { return String(v == null ? '' : v).replace(/https?:\S+/g, '[url]').replace(/[=&?;]/g, ' '); }
  // 상태(2026-09-27 전체 흐름 검수): 시작하면 이전 snapshot 을 먼저 비운다(진행 중·실패 때 옛 결과가 새 결과처럼 읽히던 문제).
  //   phase: run → done(과제 1건 이상 성공) | error(과제목록 조회 실패·대상 0건·전부 실패 — err 에 원인). collectStatus() 끝의 ' | OK' 가 합격 표시.
  async function collectAll(opt) {
    opt = opt || {};
    var run = Math.random().toString(36).slice(2, 6);
    snapshot = null;
    collectProgress = { phase: 'run', done: 0, total: 0, err: '', run: run };
    var mine = function () { return collectProgress.run === run; };   // 도중에 collectAll 을 다시 부르면 옛 실행은 상태를 건드리지 않는다
    try {
      var cats = opt.categories || DEFAULT_CATS;
      var projs = await queryProjects();
      var want = opt.acccds && opt.acccds.length ? projs.filter(function (p) { return opt.acccds.indexOf(p.acccd) >= 0; }) : projs;
      var missing = (opt.acccds || []).filter(function (a) { return !projs.some(function (p) { return p.acccd === a; }); });
      if (mine()) collectProgress.total = want.length;
      var now = localStamp(new Date());
      var snap = { run_id: run, collected_at: now, snapshot_date: now.slice(0, 10), track_categories: cats,
                   user_name: opt.userName || '', projects: [], not_found: missing, warnings: [] };
      for (var i = 0; i < want.length; i++) {
        var p = want[i];
        try {
          var t = await queryBudgetTable(p.acccd);
          var cs = {};
          cats.forEach(function (c) { if (t.categories[c]) cs[c] = t.categories[c]; });
          var bad = Object.keys(t.categories).filter(function (c) { var x = t.categories[c]; return x.A !== x.D + x.exec + x.pendingDone + x.pendingProg; });
          if (bad.length) snap.warnings.push(p.acccd + ' 검산 불일치: ' + bad.join(','));
          var role = (opt.roles && opt.roles[p.acccd]) || (opt.userName ? (p.pi === opt.userName ? '주관' : '참여') : '');
          snap.projects.push({ acccd: p.acccd, name: p.name, pi: p.pi, role: role, projType: p.projType, totBudg: t.totBudg, direct: t.direct, categories: cs, all_categories: t.categories });
        } catch (e) { snap.warnings.push(p.acccd + ' 조회 실패: ' + String(e).slice(0, 120)); }
        if (mine()) collectProgress.done = i + 1;
      }
      if (!mine()) return snap;
      snapshot = snap;
      if (!want.length) { collectProgress.phase = 'error'; collectProgress.err = missing.length ? '요청한 과제가 참여 과제 목록에 없음: ' + missing.join(', ') : '참여 과제 0건'; }
      else if (!snap.projects.length) { collectProgress.phase = 'error'; collectProgress.err = '모든 과제 조회 실패 — ' + snap.warnings[0]; }
      else collectProgress.phase = 'done';
      return snap;
    } catch (e) {
      if (mine()) { collectProgress.phase = 'error'; collectProgress.err = String(e).slice(0, 160); }
      throw e;
    }
  }
  function collectStatus() {
    var p = collectProgress, s = snapshot, line = p.phase + ' ' + p.done + '/' + p.total + (p.run ? ' | run ' + p.run : '');
    if (s) {
      line += ' | projects ' + s.projects.length + ', warnings ' + s.warnings.length + (s.not_found.length ? ', 목록에 없음 ' + s.not_found.length : '');
      if (p.phase === 'done' && !s.warnings.length && !s.not_found.length && s.projects.length === p.total) line += ' | OK';
    }
    if (p.err) line += ' | ERR ' + p.err;
    return clean(line);
  }
  function notReady() {
    var p = collectProgress;
    if (p.phase === 'run') return '수집 중 ' + p.done + '/' + p.total + ' — 2~3초 뒤 collectStatus()';
    if (p.phase === 'error') return 'ERR ' + clean(p.err);
    return 'collectAll() 먼저';
  }
  function downloadSnapshot(filename) {
    if (collectProgress.phase !== 'done' || !snapshot) return notReady();
    var name = filename || ('kiki_budget_' + snapshot.snapshot_date + '_' + snapshot.run_id + '.json');
    var text = JSON.stringify(snapshot, null, 1);
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return 'download ' + name + ' (' + Math.round(text.length / 1024) + ' KB, ' + snapshot.projects.length + ' projects) → python scripts/make_report.py --from-downloads --expect ' + snapshot.run_id + ' --save-snapshot';
  }
  // fmtBudget() — collectAll 을 부른 뒤에는 코어 상태가 기준이다(진행 중이면 '수집 중', 실패면 ERR, 끝나면 이번 실행 표).
  //   2-스텝 변수(window.__r)에는 겹친 옛 실행의 결과가 늦게 들어올 수 있어 인자는 무시한다. collectAll 없이 보관 JSON 을 다시 그릴 때만 인자를 쓴다.
  // 반환 문자열은 1,000자에서 잘린다(실측) → 줄 수가 아니라 글자 수로 끊고 머리줄에 다음 조각 번호를 적는다
  function fitRows(rows, reserve) { var out = [], n = reserve || 150; for (var i = 0; i < rows.length; i++) { n += rows[i].length + 1; if (n > 960) break; out.push(rows[i]); } return out; }
  function fmtBudget(snap, from) {
    from = from || 0;
    if (collectProgress.run) {
      if (collectProgress.phase !== 'done') return notReady();
      snap = snapshot;
    } else {
      if (snap && snap.error && !snap.projects) return 'ERR ' + clean(snap.error);
      if (!snap || !snap.projects) return notReady();
    }
    var mm = function (v) { return (Math.round((v || 0) / 100000) / 10).toFixed(1); };
    var rows = snap.projects.slice(from).map(function (p) {
      var cells = snap.track_categories.map(function (c) { var x = p.categories[c]; return x ? mm(x.D) : '-'; });
      return p.acccd + ' (' + (p.pi || '') + (p.role ? '·' + p.role : '') + ') | ' + cells.join(' | ') + ' | ' + mm(p.direct.D) + ' / ' + mm(p.direct.A);
    });
    var tail = (snap.warnings || []).map(function (w) { return '⚠ ' + String(w).slice(0, 160); });
    if (snap.not_found && snap.not_found.length) tail.push('⚠ 참여 과제 목록에 없음: ' + snap.not_found.join(', '));
    var shown = fitRows(rows.concat(tail), 150), end = from + Math.min(shown.length, rows.length);
    var head = '[' + snap.snapshot_date + (snap.run_id ? ' run ' + snap.run_id : '') + ' | 과제 ' + (from + 1) + '-' + end + ' of ' + snap.projects.length + (shown.length < rows.length + tail.length ? ' ▶ 다음 조각 fmtBudget(null, ' + end + ')' : '') + '] 과제 | ' + snap.track_categories.join(' | ') + ' | 직접비 잔액/총액 (백만원)';
    return clean([head].concat(shown).join('\n'));
  }
  window.kkBudget = {
    authTk: authTk, ready: ready, nexBody: nexBody, ds: ds, post: post,
    parseRows: parseRows, decodeEnt: decodeEnt, num: num, CAT_MAP: CAT_MAP, esc: esc,
    queryProjects: queryProjects, queryBudgetTable: queryBudgetTable,
    collectAll: collectAll, collectStatus: collectStatus, downloadSnapshot: downloadSnapshot, fmtBudget: fmtBudget, get snapshot() { return snapshot; },
    _version: 'kk-budget-portal/1.3',
  };
  return window.kkBudget._version + ' =^.^=';
})();
