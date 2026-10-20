// ============================================================
// kk-rdp 코어 — KIST 통합정보 원격접근도구 사용신청(etc_3030) (window.kkRdp)
// ------------------------------------------------------------
// 동작 원리: p.kist.re.kr:8081 의 etc_3030 화면(NEXACRO) 폼·데이터셋을 직접 다룬다.
//   목록 조회 = 검색 Div 의 날짜 + btn_search, 새 신청 = btn_registration → 안내 팝업(etc_3030_pop2) 확인
//   → 신청서 팝업(etc_3030_pop) 의 ds_main / ds_datagrid1 에 값 기록. 좌표 클릭 0.
// 🔴 저장(btn_save)·결재상신(btn_approval) 은 이 코어가 누르지 않는다 — 사용자 확인 뒤 사용자가 누르거나
//   Claude 가 확인받고 누른다(SKILL.md §5).
// 사용법: etc_3030 화면을 연 탭에서 이 파일(.min.js)을 Read → javascript_tool 로 inject → await window.kkRdp.*.
// credential 없음(세션 쿠키 + 페이지 authTk). 개인 식별자 하드코딩 없음. 화면 구조는 references/etc_3030.md.
// ============================================================
(function () {
  var VER = 'kk-rdp-portal/1.0 =^.^=';
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function app() { return window.application; }
  function main() {
    var a = app();
    var f = a && a.mainframe && a.mainframe.all && a.mainframe.all[0] && a.mainframe.all[0].form;
    if (!f || f.name !== 'etc_3030') throw new Error('PORTAL: etc_3030 화면이 아님 — 원격접근도구 사용신청 화면을 먼저 연다');
    return f;
  }
  function sub(div, n) { return (div.form && div.form[n]) || div[n] || (div.all && div.all[n]); }
  function pops() { var p = app().popupframes, out = []; for (var i = 0; p && i < p.length; i++) out.push(p[i]); return out; }
  function pop(name) { var ps = pops(); for (var i = ps.length - 1; i >= 0; i--) if (ps[i].name === name) return ps[i]; return null; }
  function form() { var p = pop('etc_3030_pop'); if (!p) throw new Error('신청서 팝업(etc_3030_pop)이 없음 — openNew() 먼저'); return p.form; }

  // ---- 날짜 (YYYYMMDD 문자열) ----
  function ymd(d) { return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  function parse(s) { s = String(s); return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  // 한 달 = 시작일 + 1개월 - 1일 (9/22→10/21, 10/22→11/21, 4/28→5/27 — 지난 신청들과 같은 길이)
  function monthEnd(s) {
    var d = parse(s), day = d.getDate();
    var e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    var last = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
    e.setDate(Math.min(day, last));
    e.setDate(e.getDate() - 1);
    return ymd(e);
  }

  // ---- 목록 ----
  async function list(from, to) {
    var f = main(), dv = f.div_Search;
    sub(dv, 'SDATE').set_value(from || '20200101');
    sub(dv, 'EDATE').set_value(to || addDays(ymd(new Date()), 400));
    f.ds_list.clearData && f.ds_list.clearData();
    f.btn_search.click();
    for (var i = 0; i < 20 && f.ds_list.rowcount === 0; i++) await sleep(300);
    await sleep(500);
    var d = f.ds_list, rows = [];
    for (var r = 0; r < d.rowcount; r++) rows.push({
      row: r, seq: d.getColumn(r, 'SEQ'), gubun: d.getColumn(r, 'GUBUN'),
      sdate: d.getColumn(r, 'USE_SDATE'), edate: d.getColumn(r, 'USE_EDATE'), program: d.getColumn(r, 'PRGNM')
    });
    // 세션이 끊기면 조회가 조용히 0건 + 화면이 영어 기본값으로 바뀐다(2026-10-20 실측)
    if (!rows.length && !/[가-힣]/.test(document.title || '')) throw new Error('PORTAL: 세션 만료로 보임 — e.kist.re.kr 로그인 확인 후 화면을 다시 연다');
    rows.sort(function (a, b) { return String(b.edate).localeCompare(String(a.edate)); });
    window.kkRdp.lastList = rows;
    return rows;
  }
  function fmtList(rows) {
    rows = rows || window.kkRdp.lastList || [];
    if (!rows.length) return '신청 이력 0건';
    return rows.map(function (x) { return x.seq + ' ' + (x.gubun === 'N' ? '신규' : '재신청') + ' ' + x.sdate + '~' + x.edate + ' ' + x.program; }).join('\n');
  }

  // ---- 다음 사용기간 ----
  // 재신청: 지난 신청 종료일 다음 날부터 / 신규(이력 없음): 내일부터. 끝 = 시작 + 1개월 - 1일.
  // 지난 종료일 다음 날이 내일보다 이르면(이미 끊김) 내일부터로 하고 lapsed:true 로 알린다.
  function nextPeriod(rows, today) {
    rows = rows || window.kkRdp.lastList || [];
    var tomorrow = addDays(today || ymd(new Date()), 1);
    if (!rows.length) return { gubun: 'N', sdate: tomorrow, edate: monthEnd(tomorrow), basis: '신규 — 내일부터' };
    var lastEnd = rows[0].edate, s = addDays(lastEnd, 1), lapsed = s < tomorrow;
    if (lapsed) s = tomorrow;
    return { gubun: 'R', sdate: s, edate: monthEnd(s), lastSeq: rows[0].seq, lastEnd: lastEnd, lapsed: lapsed,
             basis: lapsed ? '재신청 — 지난 종료일(' + lastEnd + ')이 지나 내일부터' : '재신청 — 지난 종료일(' + lastEnd + ') 다음 날부터' };
  }

  // ---- 지난 신청 상세 (읽기만, 닫고 끝) ----
  async function detail(row) {
    var f = main();
    f.ds_list.set_rowposition(row || 0);
    f.fn_dblClick();
    var p = null;
    for (var i = 0; i < 20 && !(p = pop('etc_3030_pop')); i++) await sleep(300);
    if (!p) throw new Error('상세 팝업이 안 열림');
    await sleep(1500);
    var m = p.form.ds_main, g = p.form.ds_datagrid1, fl = p.form.fileDiv1.ds_files, o = { targets: [], files: [] };
    ['SEQ', 'GUBUN', 'REREQ_REASON', 'USE_SDATE', 'USE_EDATE', 'USE_TIME', 'REQ_REASON', 'PRJINFO', 'PRGNM'].forEach(function (c) { o[c] = m.getColumn(0, c); });
    for (var r = 0; r < g.rowcount; r++) o.targets.push({ place: g.getColumn(r, 'PLACE'), os: g.getColumn(r, 'OS'), ip: g.getColumn(r, 'IP'), port: g.getColumn(r, 'PORT'), mac: g.getColumn(r, 'MAC') });
    for (var k = 0; k < fl.rowcount; k++) o.files.push(fl.getColumn(k, 'FLE_NM'));
    p.form.btn_close.click();
    return o;
  }

  // ---- 새 신청서 열기 (안내 팝업 확인까지) ----
  async function openNew() {
    var f = main();
    if (pop('etc_3030_pop')) throw new Error('신청서 팝업이 이미 열려 있음 — 닫고 다시');
    f.btn_registration.click();
    var p2 = null, p = null;
    for (var i = 0; i < 20 && !(p2 = pop('etc_3030_pop2')) && !(p = pop('etc_3030_pop')); i++) await sleep(300);
    if (p2) { await sleep(500); p2.form.btn_close.click(); }   // '필수 숙지사항' 안내 — 확인
    for (var j = 0; j < 30 && !(p = pop('etc_3030_pop')); j++) await sleep(300);
    if (!p) throw new Error('신청서 팝업(etc_3030_pop)이 안 열림');
    await sleep(1500);
    var m = p.form.ds_main;
    return { opened: true, dept: m.getColumn(0, 'DEPTCDNM'), grade: m.getColumn(0, 'FGRADECDNM'), deptSecurity: m.getColumn(0, 'DEPT_KORNM'), program: m.getColumn(0, 'PRGNM') };
  }

  // ---- 값 채우기 (저장 안 함) ----
  // v = {gubun:'R'|'N', rereq_reason, sdate, edate, use_time, reason, projects, targets:[{place,os,ip,port,mac}]}
  async function fill(v) {
    var f = form(), m = f.ds_main, g = f.ds_datagrid1;
    m.setColumn(0, 'GUBUN', v.gubun || 'R');
    if (f.Radio00_onitemchanged) f.Radio00_onitemchanged(f.Radio00, {});   // 재신청 사유 칸 활성/비움 — 화면 동작과 같게
    if ((v.gubun || 'R') === 'R') m.setColumn(0, 'REREQ_REASON', v.rereq_reason || '과제수행 지속');
    m.setColumn(0, 'USE_SDATE', v.sdate);
    m.setColumn(0, 'USE_EDATE', v.edate);
    m.setColumn(0, 'USE_TIME', v.use_time || '모든요일 00:00-24:00');
    m.setColumn(0, 'REQ_REASON', v.reason || '');
    m.setColumn(0, 'PRJINFO', v.projects || '');
    while (g.rowcount > 0) g.deleteRow(g.rowcount - 1);
    var ts = v.targets || [];
    for (var i = 0; i < ts.length; i++) {
      f.gridID_row_add.click();
      await sleep(400);
      var r = g.rowcount - 1;
      if (r < 0 || r < i) r = g.addRow();
      g.setColumn(r, 'PLACE', ts[i].place); g.setColumn(r, 'OS', ts[i].os); g.setColumn(r, 'IP', ts[i].ip);
      g.setColumn(r, 'PORT', String(ts[i].port)); g.setColumn(r, 'MAC', ts[i].mac);
    }
    return check();
  }
  function check() {
    var f = form(), m = f.ds_main, g = f.ds_datagrid1, o = {};
    ['GUBUN', 'REREQ_REASON', 'USE_SDATE', 'USE_EDATE', 'USE_TIME', 'PRJINFO', 'PRGNM', 'DEPT_KORNM'].forEach(function (c) { o[c] = m.getColumn(0, c); });
    o.REQ_REASON_len = String(m.getColumn(0, 'REQ_REASON') || '').length;
    o.targets = []; for (var r = 0; r < g.rowcount; r++) o.targets.push([g.getColumn(r, 'PLACE'), g.getColumn(r, 'OS'), g.getColumn(r, 'IP'), g.getColumn(r, 'PORT'), g.getColumn(r, 'MAC')].join(' / '));
    o.files = files();
    o.rereqEnabled = f.Edit03.enable;
    return o;
  }

  // ---- 첨부: 숨은 input 을 이 탭으로 옮겨 노출(신청서 팝업은 별도 창이라 input 이 다른 문서에 있다) ----
  function exposeInput() {
    var inp = form().fileDiv1.extUp._input_node;
    if (!inp) throw new Error('첨부 input 없음');
    if (!window.__kkRdpOrig) window.__kkRdpOrig = { id: inp.id, style: inp.getAttribute('style'), parent: inp.parentNode, next: inp.nextSibling };
    inp.id = 'kk_file_input';
    inp.setAttribute('aria-label', 'kk file upload');
    Object.assign(inp.style, { position: 'fixed', left: '20px', top: '20px', width: '260px', height: '40px', opacity: '1', display: 'block', zIndex: '2147483647', background: 'white' });
    if (!document.body.contains(inp)) document.body.appendChild(inp);
    window.__kkRdpInp = inp;
    return 'exposed — find("kk file upload") 로 ref 를 잡아 file_upload';
  }
  function restoreInput() {
    var o = window.__kkRdpOrig, inp = window.__kkRdpInp;
    if (!o || !inp) return 'nothing';
    if (o.next && o.next.parentNode === o.parent) o.parent.insertBefore(inp, o.next); else o.parent.appendChild(inp);
    inp.id = o.id;
    if (o.style === null) inp.removeAttribute('style'); else inp.setAttribute('style', o.style);
    inp.removeAttribute('aria-label');
    window.__kkRdpOrig = window.__kkRdpInp = null;
    return 'restored';
  }
  // tmHeader: I = 선택만(저장 때 서버로 올라감) / S = 서버 저장됨
  function files() {
    var p = pop('etc_3030_pop'); if (!p) return [];
    var D = p.form.fileDiv1.ds_files, out = [];
    for (var r = 0; r < D.rowcount; r++) out.push(D.getColumn(r, 'tmHeader') + ' ' + D.getColumn(r, 'FLE_NM'));
    return out;
  }
  function removeFile(row) { form().fileDiv1.removeFile(row); return files(); }

  window.kkRdp = { version: VER, list: list, fmtList: fmtList, nextPeriod: nextPeriod, monthEnd: monthEnd, detail: detail,
                   openNew: openNew, fill: fill, check: check, exposeInput: exposeInput, restoreInput: restoreInput,
                   files: files, removeFile: removeFile, lastList: null };
  return VER;
})();
