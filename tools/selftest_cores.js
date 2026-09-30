// kiki 브라우저 코어 6종 오프라인 결함 주입 시험 (tools/selftest.sh 가 부른다) — 주입본(.min.js)을 그대로 불러 시험. 자리표시 데이터만, 네트워크·실데이터 없음.
// 2026-09-27 전체 흐름 검수에서 만듦: 세션 만료·API 거절·진행 중·빈 결과가 '0건'·'없음'으로 보이지 않고 ERR/진행 중으로 보이는가.
//   실패 경로: 세션 만료(HTML)·API 거절·진행 중·빈 결과가 '0건'·'없음'으로 보이지 않고 ERR/진행 중으로 보이는가
const fs = require('fs');
const S = require('path').join(__dirname, '..', 'skills') + '/';
let fail = 0, n = 0;
const ok = (name, cond, info) => { n++; if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ← ' + String(info).slice(0, 300))); };
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
let clicked = [];
function dom() {
  global.window = { application: { authTk: 'TK' } };
  // 작은 DOM 흉내 — appendChild 한 자식들의 글을 textContent 로 이어 준다(kk-dry show() 가 결과를 칸 나눠 붙임, 2026-09-30)
  const mkEl = () => ({ style: {}, kids: [], _t: null, remove() {}, click() { clicked.push(this.download); }, appendChild(c) { this.kids.push(c); return c; },
    get textContent() { return this._t != null ? this._t : this.kids.map(k => k.textContent).join(''); }, set textContent(v) { this._t = String(v); } });
  global.document = { getElementById: () => null, createElement: mkEl, createTextNode: (t) => ({ textContent: String(t) }), body: { appendChild() {} }, documentElement: {} };
  global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  global.Blob = class { constructor(p) { this.text = p.join(''); } };
}
const load = (p) => eval(fs.readFileSync(S + p, 'utf8'));
const row = (cols) => '<Row>' + Object.entries(cols).map(([k, v]) => `<Col id="${k}">${v}</Col>`).join('') + '</Row>';
const xml = (rows) => '<Root><Parameters><Parameter id="ErrorCode" type="int">0</Parameter></Parameters><Dataset id="ds"><Rows>' + rows.join('') + '</Rows></Dataset></Root>';
const HTML = '<html><body>login</body></html>';
const clean = (s) => !/\d{8}/.test(s) && !/[=&?;]/.test(s);

(async () => {
  // ================= kk-budget =================
  dom();
  let mode = 'ok';
  global.fetch = async (path) => ({ ok: true, status: 200, text: async () => {
    if (mode === 'html') return HTML;
    if (path.includes('rdm2011')) return xml([row({ ACCCD: '2E11111', PROJNM: 'A', KORNM: '김키키', PROJTYPE: '주관' }), row({ ACCCD: '2N22222', PROJNM: 'B', KORNM: '이키키', PROJTYPE: '공동' })]);
    if (mode === 'bdgfail') return HTML;
    if (path.includes('getBdgInfo')) return xml([row({ ACCCLSCD: '6', TOTBUDGAMT: '1000000' })]);
    return xml([row({ LEV: '1', BUDGITEMCD: '15', BUDGITEMNM: '15 : 재료비', BUDGITEMCLSNM: '직접비', LASTBUDGAMT: '500000', CTRLPERFAMT: '100000', CTRLCAUSAMT: '50000', TEMPAMT: '0', BALNAMT: '350000', BAL_RATE: '70' })]);
  } });
  ok('budget inject 1.5', load('kk-budget/scripts/portal_ops.min.js') === 'kk-budget-portal/1.5 =^.^=');
  const B = window.kkBudget;
  // 정상
  let snap = await B.collectAll({ acccds: ['2E11111', '2N22222'], userName: '김키키' });
  ok('budget 정상 → | OK', /^done 2\/2 \| run \w{4} \| projects 2, warnings 0 \| OK$/.test(B.collectStatus()), B.collectStatus());
  ok('budget run_id 가 스냅샷 맨 앞', Object.keys(snap)[0] === 'run_id' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(snap.collected_at), JSON.stringify(Object.keys(snap)));
  const dl = B.downloadSnapshot();
  ok('budget download 이름·명령에 run', dl.includes('kiki_budget_' + snap.snapshot_date + '_' + snap.run_id + '.json') && dl.includes('--expect ' + snap.run_id) && clicked.pop() === 'kiki_budget_' + snap.snapshot_date + '_' + snap.run_id + '.json', dl);
  ok('budget fmt 출력 필터 안전', clean(B.fmtBudget()) && B.fmtBudget(snap).includes('run ' + snap.run_id), B.fmtBudget());
  ok('budget fmt 머리줄 과제 범위', /\| 과제 1-2 of 2\]/.test(B.fmtBudget()), B.fmtBudget().split('\n')[0]);
  // 진행 중: 옛 결과를 보이지 않는다
  let release; global.fetch = async (path) => { await new Promise(r => (release = r)); return { ok: true, status: 200, text: async () => xml([row({ ACCCD: '2E11111', PROJNM: 'A', KORNM: '김키키' })]) }; };
  window.__r = null; B.collectAll({}).then(r => window.__r = r, e => window.__r = { error: String(e) }); await tick();
  ok('budget 진행 중 fmtBudget → 수집 중(옛 결과 X)', B.fmtBudget(window.__r).startsWith('수집 중'), B.fmtBudget(window.__r));
  ok('budget 진행 중 download → 거부', B.downloadSnapshot().startsWith('수집 중'), B.downloadSnapshot());
  release();
  // 세션 만료(HTML) → ERR 가 세 출력 모두에
  global.fetch = async () => ({ ok: true, status: 200, text: async () => HTML });
  window.__r = null; B.collectAll({}).then(r => window.__r = r, e => window.__r = { error: String(e) }); await tick(80);
  ok('budget 세션 만료 → status ERR PORTAL', /^error 0\/0 \| run \w+ \| ERR .*PORTAL/.test(B.collectStatus()), B.collectStatus());
  ok('budget 세션 만료 → fmtBudget(__r) ERR', B.fmtBudget(window.__r).startsWith('ERR ') && B.fmtBudget().startsWith('ERR '), B.fmtBudget(window.__r));
  // 과제 조회 전부 실패
  mode = 'bdgfail';
  global.fetch = async (path) => ({ ok: true, status: 200, text: async () => path.includes('rdm2011') ? xml([row({ ACCCD: '2E11111', PROJNM: 'A', KORNM: '김키키' })]) : HTML });
  await B.collectAll({});
  ok('budget 전부 실패 → error + 첫 원인', /^error 1\/1 .*projects 0, warnings 1 \| ERR 모든 과제 조회 실패/.test(B.collectStatus()), B.collectStatus());
  // 목록에 없는 과제만 요청
  global.fetch = async (path) => ({ ok: true, status: 200, text: async () => xml([row({ ACCCD: '2E11111', PROJNM: 'A', KORNM: '김키키' })]) });
  await B.collectAll({ acccds: ['2X99999'] });
  ok('budget 없는 과제만 → error 목록에 없음', /^error 0\/0 .*목록에 없음 1 \| ERR 요청한 과제가 참여 과제 목록에 없음/.test(B.collectStatus()), B.collectStatus());

  // ================= kk-meet / kk-pay =================
  dom();
  ok('meet inject 1.4', load('kk-meet/scripts/portal_ops.min.js') === 'kk-meet-portal/1.4 =^.^=');
  ok('pay inject 1.2', load('kk-pay/scripts/portal_ops.min.js') === 'kk-pay-portal/1.2 =^.^=');
  const M = window.kkmeet, P = window.kkPay;
  const rows = [{ date: '20260901', custnm: '○○순대', amount: '123456', apprno: '12345678', status: '영수증함', cardKind: '법인' },
                { date: '20260902', custnm: '○○호프', amount: '80000', apprno: '22345678', status: '영수증함', cardKind: '법인' },
                { date: '20260903', custnm: '○○업체', amount: '600000', apprno: '32345678', status: '영수증함', cardKind: '연구비' },
                { date: '20260904', custnm: '○○식당', amount: '50000', apprno: '42345678', status: '결의서완성', cardKind: '법인' },
                { date: '20260905', custnm: '○○카페', amount: '9000', apprno: '52345678', status: '승인취소', cardKind: '법인' }];
  const fm = M.fmtMeeting(rows);
  ok('meeting 기본은 영수증함만 + 원래 idx', fm.startsWith('[영수증함 0-3 of 3 | 조회 5건 중 영수증함 3]') && /\n0 \| 2026-09-01 \| ○○순대/.test(fm) && /\n2 \| 2026-09-03/.test(fm), fm);
  ok('meeting 업종 판정 안 함(★·식당아님? 없음)', !/★|식당·카페 아님|명세서 jpg|카드전표 갈음/.test(fm), fm);
  ok('meeting 인원 하한·50만 초과', fm.includes('| 4명↑ |') && fm.includes('50만↑ 일상감사'), fm);
  // 1,000자 제한: 긴 목록은 글자 수로 끊고 다음 조각 번호를 준다
  const many = Array.from({ length: 40 }, (_, i) => ({ date: '20260901', custnm: '○○아주긴거래처이름가나다라마바사' + i, amount: '1234567', apprno: String(10000000 + i), status: '영수증함', cardKind: '연구비' }));
  const fm40 = M.fmtMeeting(many), fc40 = P.fmtCards(many);
  ok('meeting 40건 → 1,000자 안 + 다음 조각', fm40.length <= 1000 && /▶ 다음 조각 \d+/.test(fm40), fm40.length + ' ' + fm40.split('\n')[0]);
  ok('cards 40건 → 1,000자 안 + 다음 조각', fc40.length <= 1000 && /▶ 다음 조각 \d+/.test(fc40), fc40.length + ' ' + fc40.split('\n')[0]);
  const nx = +(/▶ 다음 조각 (\d+)/.exec(fm40)[1]);
  ok('meeting 다음 조각은 이어서', M.fmtMeeting(many, nx).startsWith('[영수증함 ' + nx + '-'), M.fmtMeeting(many, nx).split('\n')[0]);
  const fa = M.fmtMeeting(rows, 0, 15, { all: true });
  ok('meeting all → 처리됨·취소 표시', fa.includes('처리됨') && fa.includes('취소·삭제') && fa.startsWith('[전체 0-5 of 5'), fa);
  ok('meeting 출력 필터 안전', clean(fm) && clean(fa), fm);
  ok('meeting null → 결과 없음(0건 아님)', M.fmtMeeting(null).startsWith('(결과 없음') && P.fmtCards(null).startsWith('(결과 없음'), M.fmtMeeting(null));
  ok('meeting {error} → ERR', M.fmtMeeting({ error: 'Error: PORTAL: 세션' }).startsWith('ERR Error: PORTAL') && P.fmtCards({ error: 'Error: PORTAL ErrorCode -1: x' }).startsWith('ERR '), M.fmtMeeting({ error: 'x' }));
  ok('meeting [] → 0건(정상 빈 결과)', M.fmtMeeting([]).startsWith('[영수증함 0-0 of 0 | 조회 0건'), M.fmtMeeting([]));
  ok('meeting headcount', [M.headcount(123456), M.headcount('100,000'), M.headcount({ hi: 50001 }), M.headcount(0)].join() === '4,3,3,1');
  // 2-스텝 그대로: 세션 만료 → __c 에 {error}
  global.fetch = async () => ({ ok: true, status: 200, text: async () => HTML });
  window.__c = null; M.queryCardsBoth({ fromDt: '20260901', toDt: '20260927', empno: '00XXXX' }).then(r => window.__c = r, e => window.__c = { error: String(e) }); await tick(80);
  ok('meeting 2-스텝 세션 만료 → ERR PORTAL', M.fmtMeeting(window.__c).startsWith('ERR Error: PORTAL: 통합정보 응답이 XML 이 아닙니다'), M.fmtMeeting(window.__c));

  // ================= kk-budget 집행내역 헬퍼(exec_detail) — 2026-09-28 인건비성 세부내역 거부 알림 =================
  dom();
  let alerted = 0, opened = 0;
  const dsRows = [{ LEV: '1', BUDGITEMCD: '05', BUDGITEMNM: '05 : 내부인건비2', EXPITEMKORNM: '내부인건비2', CTRLPERFAMT: '100', CTRLCAUSAMT: '0', TEMPAMT: '0' },
                  { LEV: '1', BUDGITEMCD: '15', BUDGITEMNM: '15 : 연구재료비', EXPITEMKORNM: '연구재료비', CTRLPERFAMT: '50', CTRLCAUSAMT: '0', TEMPAMT: '0' }];
  const xgrid = { _type_name: 'Grid', name: 'Grid10', getBindCellIndex: (b, col) => ({ CTRLPERFAMT: 8, CTRLCAUSAMT: 9, TEMPAMT: 10, BALNAMT: 11 })[col] ?? -1, setCellPos() {} };
  const xform = { name: 'bdg_2030', components: [xgrid], ds_datagrid1: { getRowCount: () => dsRows.length, getColumn: (r, c) => dsRows[r][c], set_rowposition(r) { this.pos = r; } },
    Tab00_tabpage1_Grid01_oncellclick() { if (/인건비/.test(dsRows[xform.ds_datagrid1.pos].EXPITEMKORNM)) window.alert('인건비성 항목이 포함된 상세내역은 계정책임자및 계정책임자가 지정한 계정관리자에 한해서만 조회가능합니다.'); else opened++; } };
  window.application = { mainframe: { all: [{ form: xform }] }, popupframes: { length: 0, getItem() { return null; } } };
  window.alert = () => { alerted++; };
  ok('exec_detail inject 1.4', load('kk-budget/scripts/exec_detail.min.js') === 'kk-budget-exec-detail/1.4 =^.^=');
  const XE = window.kkExe; XE.init();
  const xc = XE.cats(), xd1 = XE.open(0, 'exec'), xd2 = XE.open(1, 'exec');
  window.alert(); 
  ok('exec_detail 인건비성 표시 + 거부 알림은 가로채 DENIED(탭 안 멈춤) + 끝나면 alert 원복', xc[0].personnel && !xc[1].personnel && xd1.startsWith('DENIED: 인건비성') && xd2.startsWith('ok') && opened === 1 && alerted === 1, [xd1, xd2, opened, alerted].join(' | '));
  // collectMine: 인건비성은 열지 않고, 금액 있는 칸만 열어 본인 건 합산 + 검산(상세합 == 화면값)
  let popupOpen = false;
  const prow = [['2026-09-01', '김키키]○○ 시약', '30'], ['2026-09-02', '이키키 ○○ 부품', '20']], pcol = ['RESOLYMD', 'COMDSCCONT', 'RESOLAMT'];
  const popForm = { name: 'popBdgExeList', btn_close: { click() { popupOpen = false; } },
    ds_datagrid1: { getRowCount: () => prow.length, getColCount: () => pcol.length, getColID: (c) => pcol[c], getColumn: (r, c) => prow[r][typeof c === 'number' ? c : pcol.indexOf(c)] } };
  window.application.popupframes = { get length() { return popupOpen ? 1 : 0; }, getItem() { return { form: popForm }; } };
  xform.Tab00_tabpage1_Grid01_oncellclick = function () { if (/인건비/.test(dsRows[xform.ds_datagrid1.pos].EXPITEMKORNM)) window.alert('인건비성 항목'); else popupOpen = true; };
  window.__mm = null; XE.collectMine(['김키키'], { waitTicks: 4, gapMs: 10 }).then(r => window.__mm = r, e => window.__mm = { error: String(e) });
  await tick(2600);
  const fmm = XE.fmtMine(), fmr = XE.fmtMineRows();
  ok('exec_detail collectMine: 인건비성 건너뜀 + 본인 30원 + 검산 일치 + 확인 표본', XE.mineStatus().startsWith('done 1/1') && fmm.includes('검산 전부 일치') && fmm.includes('연구재료비 | 30 (1건) | 0 (0건) | 30') && fmm.includes('인건비성 제외(개인별 파악 불가): 내부인건비2') && fmr.includes('2026-09-01 | 30 | 김키키]○○ 시약') && !popupOpen, fmm + ' // ' + fmr);
  // ================= kk-mail =================
  dom();
  let mm = 'ok';
  const mailObj = (i, from, subj) => ({ id: String(4400000000000000000n + BigInt(i)), createdAt: '2026-09-2' + (i % 7) + 'T10:00:00+09:00', subject: subj, users: { from: { emailUser: { name: 'N' + i, emailAddress: from } } }, mailSummary: { flags: { read: true } } });
  global.fetch = async (url, opts) => {
    if (mm === 'html') return { ok: true, status: 200, text: async () => HTML };
    if (mm === '401') return { ok: false, status: 401, text: async () => '' };
    if (mm === 'reject') return { ok: true, status: 200, text: async () => JSON.stringify({ header: { isSuccessful: false, resultCode: -100, resultMessage: 'not allowed' } }) };
    if (url.startsWith('/v2/wapi/mails?')) return { ok: true, status: 200, text: async () => JSON.stringify({ header: { isSuccessful: true }, result: { totalCount: 3, contents: [mailObj(1, 'a@kist.re.kr', '[결재] 알림'), mailObj(2, 'x@predatory-journal.com', 'Submit Your Research'), mailObj(3, 'y@univ.ac.kr', 'Re: 공동연구')] } }) };
    if (url.startsWith('/v2/wapi/mail-folders')) return { ok: true, status: 200, text: async () => JSON.stringify({ result: { contents: [{ id: 'S1', name: 'inbox', totalCount: 3 }] } }) };
    if (url.startsWith('/v2/wapi/mail-rules')) return { ok: true, status: 200, text: async () => JSON.stringify({ result: { contents: [] } }) };
    if (url.startsWith('/v2/wapi/mails/report-spam')) { global.__spamBody = JSON.parse(opts.body); return { ok: true, status: 200, text: async () => JSON.stringify({ header: { isSuccessful: true } }) }; }
    return { ok: true, status: 200, text: async () => '' };
  };
  ok('mail inject 1.13', load('kk-mail/scripts/kk_mail_ops.min.js') === 'kk-mail-ops/1.13 =^.^=');
  const K = window.kkMail;
  ok('mail 점수 규칙 제거', typeof K.spamHints === 'undefined' && typeof K.fmtSpam === 'undefined');
  const inbox = await K.listInbox({ days: 3650 });
  const fe = K.fmtExternal(inbox);
  ok('mail fmtExternal 사내 제외·외부만', fe.startsWith('[외부 발신 0-2 of 2 | 전체 3, 사내 1 제외]') && fe.includes('predatory-journal.com') && !fe.includes('kist.re.kr'), fe);
  ok('mail fmtExternal 출력 필터 안전', clean(fe.replace(/\d{4}-\d{4}-\d{4}-\d{4}-\d{3}/g, '')), fe);
  ok('mail fmtList 컨테이너 직접', K.fmtList(inbox).startsWith('[0-3 of 3]'), K.fmtList(inbox));
  const big = { recent: Array.from({ length: 60 }, (_, i) => ({ id: String(4400000000000000000n + BigInt(i)), date: '2026-09-20 10:00', fromEmail: 'x' + i + '@predatory-journal-long-domain.com', fromName: 'N', subject: 'Invitation to contribute to Special Issue on Advanced Materials Research ' + i, read: true, fileCount: 0 })) };
  const fe60 = K.fmtExternal(big), fl60 = K.fmtList(big, 0, 60);
  ok('mail fmtExternal 60통 → 1,000자 안 + 다음 조각 + id 없음', fe60.length <= 1000 && /▶ 다음 조각 \d+/.test(fe60) && !/\d{4}-\d{4}-\d{4}/.test(fe60), fe60.length + ' ' + fe60.split('\n')[0]);
  ok('mail fmtList 60통 → 1,000자 안', fl60.length <= 1000 && /▶ 다음 조각 \d+/.test(fl60), fl60.length);
  ok('mail externalOf 번호로 가리키기', K.externalOf(big)[5].id === String(4400000000000000005n));
  const rules = Array.from({ length: 30 }, (_, i) => ({ condition: { from: { value: ['someone' + i + '@long-domain-name.example.org'] } }, action: { toFolder: { name: '학회' } }, applyOrder: i }));
  const ov = K.fmtOverview({ folders: { system: [{ name: 'inbox', total: 3 }], user: Array.from({ length: 40 }, (_, i) => ({ name: '폴더' + i, total: i })) }, rules });
  ok('mail overview 폴더 40·규칙 30 → 1,000자 안 + 폴더별 요약 + 다음 조각', ov.length <= 1000 && ov.includes('규칙 30개(대상별): 학회 30') && /▶ 다음 조각 \d+/.test(ov), ov.length + ' ' + ov);
  ok('mail 휴지통 규칙 표시', K.fmtRules([{ condition: { from: { value: ['x@y.z'] } }, action: { toTrash: true, version: 1 } }]).includes('→ 휴지통'), K.fmtRules([{ condition: {}, action: { toTrash: true } }]));
  const rq = K.fmtRules(rules, 0, { q: 'someone7@' });
  ok('mail fmtRules 검색(q) — 원래 번호 유지', rq.startsWith('[규칙 0-1 of 1 (검색 someone7@, 전체 30)]') && rq.includes('\n7 | 발신 someone7@'), rq);
  ok('mail overview 정상', K.fmtOverview(await K.overview()) === '사용자 폴더 1: inbox(3)\n시스템: inbox(3)\n자동분류 규칙 없음(조회 성공, 0개)', K.fmtOverview(await K.overview()));
  // 하이픈 id 로 스팸 신고해도 서버엔 숫자 id
  await K.reportSpam(['4400-0000-0000-0000-002', { id: '4400000000000000003' }]);
  ok('mail reportSpam 하이픈 id 정규화', JSON.stringify(global.__spamBody.idList) === JSON.stringify(['4400000000000000002', '4400000000000000003']), JSON.stringify(global.__spamBody.idList));
  // 로그인 풀림(HTML)
  mm = 'html'; window.__f = null; K.overview().then(r => window.__f = r, e => window.__f = { error: String(e) }); await tick(50);
  ok('mail HTML → ERR DOORAY 로그인', K.fmtOverview(window.__f).startsWith('ERR Error: DOORAY: 응답이 JSON 이 아닙니다'), K.fmtOverview(window.__f));
  mm = '401'; window.__x = null; K.searchMany([['x']], {}).then(r => window.__x = r, e => window.__x = { error: String(e) }); await tick(300);
  ok('mail 401 → ERR 권한 없음', K.fmtList(window.__x).startsWith('ERR Error: DOORAY: 권한 없음(HTTP 401)'), K.fmtList(window.__x));
  // API 거절: '폴더 0개'·'규칙 없음'·'0통' 으로 보이지 않는다
  mm = 'reject';
  let e1 = ''; try { await K.findAllFolders(); } catch (e) { e1 = String(e); }
  ok('mail 폴더 거절 → throw', /DOORAY 폴더 조회 실패: not allowed/.test(e1), e1);
  let e2 = ''; try { await K.listMailRules(); } catch (e) { e2 = String(e); }
  ok('mail 규칙 거절 → throw', /DOORAY 규칙 조회 실패: not allowed/.test(e2), e2);
  const rj = await K.listInbox({ days: 7 });
  ok('mail 목록 거절 → ERR(0통 아님)', K.fmtList(rj).startsWith('ERR DOORAY 목록 조회 실패') && K.fmtExternal(rj).startsWith('ERR '), K.fmtList(rj));
  ok('mail null → 결과 없음', K.fmtList(null).startsWith('(결과 없음') && K.fmtExternal(null).startsWith('(결과 없음') && K.fmtOverview(null).startsWith('(결과 없음'));
  // Dooray 는 없는 주소·오류를 JSON 으로 준다(실측 {status:404,error:'Not Found'}) — 성공으로 오인하지 않는다
  global.fetch = async () => ({ ok: false, status: 404, text: async () => JSON.stringify({ timestamp: 1, status: 404, error: 'Not Found', path: '/v2/x' }) });
  let e404 = ''; try { await K.findAllFolders(); } catch (e) { e404 = String(e); }
  ok('mail 404 JSON → 요청 주소 없음(폴더 0개 아님)', /DOORAY: 요청 주소가 없습니다\(HTTP 404\)/.test(e404), e404);
  global.fetch = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ status: 400, error: 'Bad Request' }) });
  let e400 = ''; try { await K.findAllFolders(); } catch (e) { e400 = String(e); }
  ok('mail 400 JSON(header 없음) → 실패로', /DOORAY 폴더 조회 실패: Bad Request/.test(e400), e400);
  global.fetch = async () => ({ ok: false, status: 502, text: async () => '<html>bad gateway</html>' });
  let e502 = ''; try { await K.listMailRules(); } catch (e) { e502 = String(e); }
  ok('mail 5xx → 서버 오류', /DOORAY: 서버 오류\(HTTP 502\)/.test(e502), e502);
  // 2026-09-27 Codex 점검: 본문 거절을 빈 본문으로 / 안 읽음 복원 실패를 성공으로 / 상한 도달을 전부로 보이지 않는다
  global.DOMParser = class { parseFromString(h) { return { body: { textContent: String(h).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') }, querySelectorAll: () => [] }; } };
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ header: { isSuccessful: false, resultMessage: 'denied' } }) });
  let eg = ''; try { await K.getMail('1', { wasRead: true }); } catch (e) { eg = String(e); }
  ok('mail 본문 거절 → throw(빈 본문 아님)', /DOORAY 본문 조회 실패: denied/.test(eg), eg);
  global.fetch = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(url.endsWith('/unread') ? { header: { isSuccessful: false, resultMessage: 'restore rejected' } } : { header: { isSuccessful: true }, result: { content: { subject: 'S', body: { content: 'hello' }, users: {} } } }) });
  let er = null; try { await K.getMail('1', { wasRead: false }); } catch (e) { er = e; }
  ok('mail 안 읽음 복원 거절 → throw + 본문 보존', er && /안 읽음 복원 실패/.test(er.message) && er.mail && er.mail.text === 'hello' && er.mail.restoredUnread === false, er && er.message);
  const gm = await K.getMails([{ id: '1', read: false }], { delayMs: 0 });
  ok('mail getMails 복원 거절 → 본문 + ⚠ 머리줄', K.fmtBody(gm[0]).includes('안 읽음 복원 실패') && K.fmtBody(gm[0]).includes('hello'), K.fmtBody(gm[0]));
  const one = { id: '1', createdAt: '2026-09-27T12:00:00+09:00', subject: 'S', users: {}, folderId: 'inbox', mailSummary: { flags: { read: true } } };
  global.fetch = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(url.startsWith('/v2/wapi/mails/search') ? { header: { isSuccessful: true }, result: { totalCount: 2, contents: [{ id: '1' }], references: { mailMap: { 1: one }, folderMap: { inbox: { name: 'inbox', type: 'system' } } } } } : { header: { isSuccessful: true }, result: { totalCount: 2, contents: [one] } }) });
  const lm = await K.listMails({ size: 1, maxPages: 1 }), sm = await K.searchMails(['S'], { size: 1, maxPages: 1 }), sy = await K.searchMany([['S']], { size: 1, maxPages: 1 });
  ok('mail 상한 도달 → truncated(목록·검색·묶음 검색) + 머리줄', lm.truncated === true && sm.truncated === true && sy.truncated === true && K.fmtList(lm).includes('⚠ 목록 잘림(전체 2 중 1)') && K.fmtList(sy).includes('⚠ 목록 잘림'), JSON.stringify([lm.truncated, sm.truncated, sy.truncated, K.fmtList(lm).split('\n')[0]]));
  const lm2 = await K.listMails({ size: 5, maxPages: 3 }), sm2 = await K.searchMails(['S'], { size: 5, maxPages: 3 });
  ok('mail 끝까지 읽음 → 잘림 아님', !lm2.truncated && lm2.end === 'all' && !sm2.truncated && sm2.end === 'all', JSON.stringify([lm2.end, sm2.end]));
  // 기능 5 메일 보내기(2026-09-30) — 미리보기는 서버에 아무것도 만들지 않고, 보내기는 초안 → 보내기 한 번씩, 같은 준비물은 두 번 못 보낸다, 보낸 메일함으로 확인
  const MJ = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) }), MOK = { isSuccessful: true };
  const mcalls = []; let smode = 'ok', sentList = [], dseq = 0; const srvDrafts = {};
  const addrPage = (q, page) => {   // 주소 검색 가짜: many = 45명(2쪽), huge = 500건(쪽마다 30), same = 같은 주소만 200건, one = 1명
    const mem = (i) => ({ type: 'member', member: { name: '박키키', emailAddress: `park${i}@kist.re.kr`, rank: '연구원', departments: [{ name: '○○팀', primaryFlag: true }] } });
    if (q === 'many') return { totalCount: 45, contents: Array.from({ length: page === 0 ? 30 : page === 1 ? 15 : 0 }, (_, i) => mem(page * 30 + i)) };
    if (q === 'huge') return { totalCount: 500, contents: Array.from({ length: 30 }, (_, i) => mem(page * 30 + i)) };
    if (q === 'same') return { totalCount: 200, contents: Array.from({ length: 30 }, () => mem(0)) };
    if (q === 'one') return { totalCount: 1, contents: [mem(7)] };
    return null;
  };
  global.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET', b = opts && opts.body ? JSON.parse(opts.body) : null;
    mcalls.push([m, url.replace(/[?].*/, ''), b]);
    if (url.startsWith('/v2/wapi/search-email-addresses') && addrPage(b.all, +(/page=(\d+)/.exec(url) || [0, 0])[1])) return MJ({ header: MOK, result: addrPage(b.all, +(/page=(\d+)/.exec(url) || [0, 0])[1]) });
    if (url.startsWith('/v2/wapi/search-email-addresses')) return MJ({ header: MOK, result: { totalCount: 3, contents: [
      { type: 'member', member: { name: '김키키', emailAddress: 'kiki@kist.re.kr', rank: '책임연구원', departments: [{ name: '○○연구센터', primaryFlag: true }], employeeNumber: '009999', tel: '02-000-0000' } },
      { type: 'member', member: { name: '김키키', emailAddress: 'kiki2@kist.re.kr', rank: '선임연구원', departments: [{ name: '△△연구단', primaryFlag: true }] } },
      { type: 'recent', recent: { name: '김키키', emailAddress: 'KIKI@kist.re.kr', company: null } }] } });
    if (url.includes('mail.write-from')) return MJ({ header: MOK, result: { content: { value: { selectedEmailAddress: 'me@kist.re.kr', selectedName: '나키키' } } } });
    if (url.includes('mail.signature')) return MJ({ header: MOK, result: { content: { value: { enabled: true, options: { new: true, reply: false }, useIndex: 0, signatures: [{ name: '기본', content: '<div>SIG</div>' }] } } } });
    if (url.includes('mail.write')) return MJ({ header: MOK, result: { content: { value: { format: { font: 'Arial', fontSize: 16 } } } } });
    if (url.startsWith('/v2/wapi/mail-drafts')) { if (smode === 'draftfail') return MJ({ header: { isSuccessful: false, resultMessage: 'draft denied' } }); const id = '443200000000000000' + (++dseq); srvDrafts[id] = JSON.parse(JSON.stringify(b[0])); return MJ({ header: MOK, result: [{ id, version: 0, mimeSize: 100 }] }); }
    if (url.startsWith('/v2/wapi/mails/send')) return smode === 'sendfail' ? MJ({ header: { isSuccessful: false, resultMessage: 'send denied' } }) : MJ({ header: MOK });
    if (url.startsWith('/v2/wapi/mails?folderName=sent')) return MJ({ header: MOK, result: { totalCount: sentList.length, contents: sentList } });
    if (/^\/v2\/wapi\/mails\/\d+$/.test(url)) { const d = srvDrafts[url.split('/').pop()]; if (d) return MJ({ header: MOK, result: { content: { subject: d.subject, body: d.body, users: d.users } } }); return MJ({ header: { isSuccessful: false, resultMessage: 'no mail' } }); }
    return MJ({ header: MOK });
  };
  const fa1 = await K.findAddress('김키키'), ff1 = K.fmtAddress(fa1);
  ok('mail findAddress: 같은 주소는 한 번(대소문자 무관) + 사번·전화번호 안 꺼냄', fa1.list.length === 2 && fa1.list[0].dept === '○○연구센터' && fa1.list[0].rank === '책임연구원' && !JSON.stringify(fa1).includes('009999') && !JSON.stringify(fa1).includes('02-000-0000'), JSON.stringify(fa1));
  ok('mail fmtAddress: 이름·주소·부서·직급·종류(동명이인 2명)', ff1.startsWith("[주소 검색 '김키키' 0-2 of 2 | 검색 3건 다 읽음]") && K.onlyAddress(fa1) === null && ff1.includes('0 | 김키키 | kiki@kist.re.kr | ○○연구센터 | 책임연구원 | 조직도') && ff1.includes('1 | 김키키 | kiki2@kist.re.kr | △△연구단'), ff1);
  mcalls.length = 0;
  // Codex 검토 4: 주소 검색은 쪽을 넘겨 끝까지 — 다 못 읽었으면 한 명으로 고르지 않는다
  const fMany = await K.findAddress('many'), fHuge = await K.findAddress('huge'), fSame = await K.findAddress('same'), fOne = await K.findAddress('one');
  ok('mail findAddress: 둘째 쪽까지 읽음(45명, 다 읽음)', fMany.complete && fMany.list.length === 45 && fMany.fetched === 45 && K.fmtAddress(fMany).includes('검색 45건 다 읽음'), JSON.stringify([fMany.complete, fMany.list.length, fMany.fetched]));
  ok('mail findAddress: 끝까지 못 읽으면 ⚠ + 자동 선택 막음', !fHuge.complete && fHuge.fetched === 150 && K.fmtAddress(fHuge).includes('⚠ 검색 500건 중 앞 150건만 읽음') && K.onlyAddress(fHuge) === null, K.fmtAddress(fHuge).split('\n')[0]);
  ok('mail findAddress: 한 주소만 보여도 다 못 읽었으면 고르지 않음', !fSame.complete && fSame.list.length === 1 && K.onlyAddress(fSame) === null && K.onlyAddress(fOne) && K.onlyAddress(fOne).email === 'park7@kist.re.kr', JSON.stringify([fSame.complete, fSame.list.length]));
  mcalls.length = 0;
  const pbad = await K.prepareMail({ to: ['김키키'], subject: 'S', text: 'T' });
  ok('mail prepareMail: 이름만(주소 없음)이면 보내지 않고 findAddress 로 정하라고', pbad.error && /findAddress/.test(pbad.error) && !mcalls.some(c => /mail-drafts|mails\/send/.test(c[1])), JSON.stringify(pbad));
  const pp = await K.prepareMail({ to: ['김키키 <kiki@kist.re.kr>', 'kiki@kist.re.kr'], cc: [{ name: '이키키', email: 'lee@kist.re.kr' }], bcc: ['x@example.org'], subject: '회의 일정', text: '안녕하세요.\n\n다음 주 <목요일> 회의입니다.' });
  const fpp = K.fmtPrepared(pp);
  ok('mail prepareMail: 서버에 아무것도 만들지 않음(설정 조회만) + 받는 사람 중복 한 번', !mcalls.some(c => /mail-drafts|mails\/send/.test(c[1])) && pp.to.length === 1 && pp.cc[0].email === 'lee@kist.re.kr' && pp.signature === true && JSON.stringify(pp.external) === '["x@example.org"]', JSON.stringify(pp));
  ok('mail fmtPrepared: 아직 안 보냄·보내는 사람·받는 사람·참조·숨은 참조·외부 주소 경고·본문, 출력 필터 안전', fpp.startsWith('[보낼 메일 미리보기 — 아직 보내지 않음') && fpp.includes('보내는 사람: 나키키 <me@kist.re.kr>') && fpp.includes('받는 사람: 김키키 <kiki@kist.re.kr>') && fpp.includes('참조: 이키키 <lee@kist.re.kr>') && fpp.includes('숨은 참조: x@example.org') && fpp.includes('⚠ 외부 주소 1개') && fpp.includes('다음 주 <목요일> 회의입니다.') && fpp.includes('본문 전체(서명·원문 인용 포함)') && fpp.includes('SIG') && !/=/.test(fpp), fpp);
  // Codex 검토 3: 긴 본문도 조각으로 끝까지(서명까지) — 조각마다 1,000자 안, 이어 붙이면 실제로 나갈 본문 전체
  const pLong = await K.prepareMail({ to: ['kiki@kist.re.kr'], subject: '긴 본문', text: Array.from({ length: 150 }, (_, i) => '가나다라마바사아자차 ' + i).join('\n') });
  let offL = 0, gotL = '', maxLen = 0, nChunk = 0;
  for (;;) {
    const t = K.fmtPrepared(pLong, 900, offL); nChunk++; maxLen = Math.max(maxLen, t.length);
    const mk = /▶ 다음 조각 fmtPrepared\(p, 900, (\d+)\)/.exec(t), hi = t.indexOf(':\n', t.indexOf('본문 전체')) + 2;
    gotL += t.slice(hi, mk ? t.lastIndexOf('\n▶') : t.length);
    if (!mk || nChunk > 20) break;
    offL = +mk[1];
  }
  ok('mail fmtPrepared: 긴 본문을 조각으로 끝까지(서명 포함), 조각마다 1,000자 안', gotL === pLong.fullText && pLong.fullText.endsWith('SIG') && maxLen <= 1000 && nChunk > 1, JSON.stringify([gotL.length, pLong.fullText.length, maxLen, nChunk]));
  const fhm = K.fmtPreparedHtml(pLong, 900, 0);
  ok('mail fmtPreparedHtml: 실제로 나갈 HTML(서명 표시 포함) 조각, = 는 ＝', fhm.startsWith('[보낼 HTML ') && fhm.includes('font-family') && !/=/.test(fhm), fhm.slice(0, 120));
  mcalls.length = 0;
  const sr = await K.sendPrepared(pp.key);
  const dcall = mcalls.find(c => c[1] === '/v2/wapi/mail-drafts'), scall = mcalls.find(c => c[1] === '/v2/wapi/mails/send');
  const dr = dcall && dcall[2][0];
  ok('mail sendPrepared: 초안(POST 배열) → 보내기({draftId}) 순서, 주소 모양·본문 줄·서명', sr.ok && mcalls.map(c => c[1]).join() === '/v2/wapi/mail-drafts,/v2/wapi/mails/send' && Array.isArray(dcall[2]) && dr.id === null && dr.users.from.emailUser.emailAddress === 'me@kist.re.kr'
    && dr.users.to[0].type === 'emailUser' && dr.users.to[0].emailUser.emailAddress === 'kiki@kist.re.kr' && dr.users.cc[0].emailUser.name === '이키키' && dr.users.bcc[0].emailUser.emailAddress === 'x@example.org'
    && dr.body.content === '<div style="font-family: Arial; font-size: 16px"><div>안녕하세요.</div><div><br></div><div>다음 주 &lt;목요일&gt; 회의입니다.</div><div><br></div><!-- begin signature --><div>SIG</div><!-- end signature --></div>'
    && JSON.stringify(scall[2]) === '{"draftId":"4432000000000000001"}', JSON.stringify(mcalls).slice(0, 600));
  let edup = ''; try { await K.sendPrepared(pp.key); } catch (e) { edup = String(e); }
  ok('mail sendPrepared: 같은 준비물은 두 번 보내지 않음', /이미 보낸/.test(edup) && mcalls.filter(c => c[1] === '/v2/wapi/mails/send').length === 1, edup);
  const p2 = await K.prepareMail({ to: ['kiki@kist.re.kr'], subject: 'S2', text: 'T', signature: false });
  smode = 'draftfail'; mcalls.length = 0;
  let edf = ''; try { await K.sendPrepared(p2); } catch (e) { edf = String(e); }
  ok('mail 초안 만들기 실패 → 보내지 않음(보내기 호출 없음)', /초안 만들기 실패\(보내지 않음\): draft denied/.test(edf) && !mcalls.some(c => c[1] === '/v2/wapi/mails/send'), edf);
  const p3 = await K.prepareMail({ to: ['kiki@kist.re.kr'], subject: 'S3', text: 'T', signature: false });
  smode = 'sendfail';
  let esf = null; try { await K.sendPrepared(p3.key); } catch (e) { esf = e; }
  ok('mail 보내기 실패 → 오류 + 초안 번호(임시 보관함에 남음)', esf && /보내기 실패 — 초안은 임시 보관함에 남음: send denied/.test(esf.message) && esf.draftId === '4432000000000000002', esf && esf.message);
  smode = 'ok'; mcalls.length = 0;
  const p4 = await K.prepareMail({ to: ['kiki@kist.re.kr'], subject: 'S4', text: '줄', signature: false });
  const r4 = await K.sendPrepared(p4.key);
  ok('mail signature:false → 서명 없음', !mcalls.find(c => c[1] === '/v2/wapi/mail-drafts')[2][0].body.content.includes('begin signature'), '');
  // 보낸 메일함 확인: 같은 제목·보낸 뒤 시각 + 받는 사람 대조 / 아직 없음 / 옛 메일은 섞지 않음
  const kstNow = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16), kstOld = new Date(Date.now() - 3600000 + 9 * 3600000).toISOString().slice(0, 16);
  const sentMail = (id, subject, t) => ({ id, subject, createdAt: t + ':30+09:00', users: { from: { emailUser: { name: '나키키', emailAddress: 'me@kist.re.kr' } } }, mailSummary: { flags: { read: true } } });
  sentList = [];
  const c0 = await K.checkSent(sr);
  ok('mail checkSent: 보낸 메일함에 아직 없으면 found false(보냄으로 적지 않음)', c0.found === false && K.fmtSent(c0).startsWith('보낸 메일함에 이 메일(초안 번호 4432-0000-0000-0000-001)이 아직 없음'), K.fmtSent(c0));
  sentList = [sentMail('4432000000000000009', '회의 일정', kstOld)];
  const c1 = await K.checkSent(sr);
  ok('mail checkSent: 한 시간 전 같은 제목 메일은 이번 것으로 치지 않음', c1.found === false, JSON.stringify(c1));
  // Codex 검토 2: 초안 번호가 있으면 방금 보낸 같은 제목의 다른 메일도 성공으로 치지 않는다
  sentList = [sentMail('4432000000000000010', '회의 일정', kstNow)];
  const c1b = await K.checkSent(sr);
  ok('mail checkSent: 초안 번호가 다른 같은 제목 메일은 성공이 아님', c1b.found === false && !K.fmtSent(c1b).includes('✓'), K.fmtSent(c1b));
  sentList = [sentMail('4432000000000000010', '회의 일정', kstNow), sentMail('4432000000000000001', '회의 일정', kstNow)];
  const c2 = await K.checkSent(sr), fs2 = K.fmtSent(c2);
  ok('mail checkSent: 초안 번호의 메일만 + 받는 사람·참조·숨은 참조·제목·본문·링크 주소가 확인받은 내용과 같음', c2.found && c2.ok && c2.mail.id === '4432000000000000001' && fs2.startsWith('보낸 메일함 확인 ✓') && fs2.includes('받는 사람·참조·숨은 참조·제목·본문·링크 주소가 확인받은 내용과 같음') && fs2.includes('4432-0000-0000-0000-001') && !/=/.test(fs2), fs2);
  const c3 = await K.checkSent(Object.assign({}, sr, { approved: Object.assign({}, sr.approved, { to: sr.approved.to.concat('park@kist.re.kr').sort() }) }));
  ok('mail checkSent: 빠진 받는 사람이 있으면 ⚠', c3.found && !c3.ok && K.fmtSent(c3).includes('받는 사람 빠짐: park@kist.re.kr') && !K.fmtSent(c3).includes('✓'), K.fmtSent(c3));
  const keep1 = JSON.parse(JSON.stringify(srvDrafts['4432000000000000001']));
  srvDrafts['4432000000000000001'].users.to.push({ type: 'emailUser', emailUser: { name: '', emailAddress: 'extra@example.org' } });
  srvDrafts['4432000000000000001'].users.bcc.push({ type: 'emailUser', emailUser: { name: '', emailAddress: 'hidden@example.org' } });
  srvDrafts['4432000000000000001'].subject = '회의 일정(수정)';
  srvDrafts['4432000000000000001'].body = { mimeType: 'text/html', content: '<div>다른 본문</div>' };
  const c4 = await K.checkSent(sr), fs4 = K.fmtSent(c4);
  ok('mail checkSent: 더해진 받는 사람·숨은 참조, 다른 제목·본문 → ⚠(같다고 적지 않음)', c4.found && !c4.ok && fs4.startsWith('⚠ 보낸 메일함에 있지만 확인받은 내용과 다름') && fs4.includes('받는 사람 더해짐: extra@example.org') && fs4.includes('숨은 참조 더해짐: hidden@example.org') && fs4.includes('제목 다름') && fs4.includes('본문 다름') && !fs4.includes('같음'), fs4);
  srvDrafts['4432000000000000001'] = keep1; delete srvDrafts['4432000000000000001'].users.bcc;
  const c5 = await K.checkSent(sr);
  ok('mail checkSent: 보낸 메일에 숨은 참조 칸이 없으면 대조 못 함이라고 적음(나머지는 확인)', c5.ok && c5.bccUnknown && K.fmtSent(c5).includes('숨은 참조는 보낸 메일에 안 보여 대조 못 함'), K.fmtSent(c5));
  srvDrafts['4432000000000000001'] = keep1;
  // Codex 검토(v0.7.8) 1: 초안의 링크 주소만 바꾸고 보이는 글자는 그대로 — 미리보기에 실제 주소, 보내기 직전 대조·보낸 메일함 확인에서 잡는다(가짜 서버, 실제 발송 없음)
  {
    const chunks = (p) => { let off = 0, all = ''; for (let i = 0; i < 20; i++) { const t = K.fmtPrepared(p, 900, off); all += t + '\n'; const mk = /▶ 다음 조각 fmtPrepared\(p, 900, (\d+)\)/.exec(t); if (!mk) break; off = +mk[1]; } return all; };
    const LH = '<div>자료는 <a href="https://files.example.org/report.pdf?id=7&amp;v=2">여기</a>에 있습니다.</div><div><a href="https://www.kist.re.kr/">https://www.kist.re.kr</a></div>';
    mcalls.length = 0;
    const pl = await K.prepareMail({ to: ['kiki@kist.re.kr'], subject: '링크 시험', html: LH, signature: false });
    const fpl = chunks(pl);
    ok('mail fmtPrepared: 링크는 보이는 글자와 실제로 열리는 주소를 함께(본문 끝 목록, = 는 ＝)', fpl.includes('링크 2개 — 보이는 글자와 실제로 열리는 주소는 본문 끝 목록에서 확인') && fpl.includes('1) 여기 → https://files.example.org/report.pdf?id＝7&v＝2') && fpl.includes('2) https://www.kist.re.kr → https://www.kist.re.kr/') && !fpl.includes('⚠ 글자') && !/=/.test(fpl), fpl);
    const pw = await K.prepareMail({ to: ['kiki@kist.re.kr'], subject: '피싱 모양', html: '<a href="https://evil.example.net/login">https://www.kist.re.kr/login</a>', signature: false });
    ok('mail fmtPrepared: 글자에 보이는 주소와 실제 주소의 도메인이 다르면 ⚠', chunks(pw).includes('⚠ 글자와 주소의 도메인이 다른 링크 1개') && chunks(pw).includes('⚠ 글자에 보이는 주소와 실제 주소가 다름'), chunks(pw));
    const slk = await K.saveDraft(pl.key), lid = slk.draftId;
    srvDrafts[lid].body.content = srvDrafts[lid].body.content.replace('https://files.example.org/report.pdf?id=7&amp;v=2', 'https://evil.example.net/report.pdf');   // 글자 '여기' 는 그대로, 주소만
    mcalls.length = 0;
    let elk = null; try { await K.sendPrepared(pl.key); } catch (e) { elk = e; }
    ok('mail sendPrepared: 링크 주소만 바뀐 초안(글자 같음)도 보내지 않음 — 바뀐 주소를 알림, 보내기 호출 없음', elk && elk.changed && elk.changed.length === 1 && /^링크 주소 다름/.test(elk.changed[0]) && elk.changed[0].includes('evil.example.net') && !mcalls.some(c => /mails\/send/.test(c[1])), elk && elk.message);
    const rfl = await K.refreshPrepared(pl.key), frl = chunks(rfl);
    ok('mail refreshPrepared: 바뀐 링크 주소를 미리보기에 다시(확인받은 뒤에만 보냄)', frl.includes('1) 여기 → https://evil.example.net/report.pdf') && frl.includes('임시 보관함의 지금 내용(다시 확인 필요)'), frl);
    mcalls.length = 0;
    const slr = await K.sendPrepared(pl.key);
    ok('mail sendPrepared: 다시 확인한 뒤에는 그 초안을 보냄(가짜 서버)', slr.ok && mcalls.some(c => /mails\/send/.test(c[1])) && slr.approved.links[0] === 'https://evil.example.net/report.pdf', JSON.stringify(slr.approved));
    sentList = [sentMail(lid, '링크 시험', kstNow)];
    const cl1 = await K.checkSent(slr);
    srvDrafts[lid].body.content = srvDrafts[lid].body.content.replace('https://evil.example.net/report.pdf', 'https://other.example.com/x');   // 보낸 메일의 링크가 확인받은 것과 다르면
    const cl2 = await K.checkSent(slr), fcl2 = K.fmtSent(cl2);
    ok('mail checkSent: 링크 주소까지 확인받은 내용과 같으면 ✓ / 주소만 달라도 ⚠', cl1.ok && K.fmtSent(cl1).includes('본문·링크 주소가 확인받은 내용과 같음') && !cl2.ok && fcl2.includes('링크 주소 다름') && fcl2.includes('other.example.com') && !fcl2.includes('✓') && !/=/.test(fcl2), K.fmtSent(cl1) + ' // ' + fcl2);
  }
  // 답장(2026-09-30) — 답장 안 한 메일 찾기 → 답장 미리보기(서버에 안 씀) → 임시 보관함 저장(원래 메일과 연결) → 그 초안 보내기 → 보낸 메일함·답장함 표시 확인
  const RID = '4432000000000000077', RID2 = '4432000000000000078', RDRAFT = '4432000000000000055';
  const rcalls = []; let rInbox = [], rSent = [], rDraft = null;
  const inboxMail = (id, from, subj, replied, read) => ({ id, subject: subj, createdAt: kstNow + ':00+09:00', users: { from: { emailUser: { name: 'N', emailAddress: from } }, to: [{ emailUser: { emailAddress: 'me@kist.re.kr' } }] }, mailSummary: { flags: { read, replied } } });
  global.fetch = async (url, opts) => {
    const m = (opts && opts.method) || 'GET', b = opts && opts.body ? JSON.parse(opts.body) : null;
    rcalls.push([m, url.replace(/[?].*/, ''), b]);
    if (url === '/v2/wapi/mails/' + RID) return MJ({ header: MOK, result: { content: { subject: '두레이 테스트', createdAt: '2026-09-30T01:06:45+09:00',
      users: { from: { emailUser: { name: '이키키', emailAddress: 'lee@example.org' } }, to: [{ emailUser: { name: '나키키 책임연구원', emailAddress: 'me@kist.re.kr' } }], cc: [] },
      body: { mimeType: 'text/html', content: '<div dir="ltr">본문</div>' } } } });
    if (url === '/v2/wapi/mails/' + RID2) return MJ({ header: MOK, result: { content: { subject: 'Re: 이전 논의', createdAt: '2026-09-29T10:00:00+09:00', users: { from: { emailUser: { name: '박키키', emailAddress: 'park@kist.re.kr' } }, to: [], cc: [] }, body: { content: 'x' } } } });
    if (url === '/v2/wapi/mails/' + RDRAFT) return rDraft ? MJ({ header: MOK, result: { content: { subject: rDraft.subject, body: rDraft.body, users: rDraft.users } } }) : MJ({ header: { isSuccessful: false, resultMessage: 'no draft' } });
    if (url === '/v2/wapi/mails/unread') return MJ({ header: MOK });
    if (url.startsWith('/v2/wapi/mail-drafts')) { rDraft = JSON.parse(JSON.stringify(b[0])); return MJ({ header: MOK, result: [{ id: RDRAFT, version: 0, mimeSize: 10 }] }); }
    if (url.startsWith('/v2/wapi/mails/send')) return MJ({ header: MOK });
    if (url.startsWith('/v2/wapi/mails?folderName=inbox')) return MJ({ header: MOK, result: { totalCount: rInbox.length, contents: rInbox } });
    if (url.startsWith('/v2/wapi/mails?folderName=sent')) return MJ({ header: MOK, result: { totalCount: rSent.length, contents: rSent } });
    return MJ({ header: MOK });
  };
  rInbox = [inboxMail('4432000000000000081', 'a@kist.re.kr', '[결재] 알림', true, true), inboxMail(RID, 'lee@example.org', '두레이 테스트', false, false), inboxMail('4432000000000000083', 'kim@kist.re.kr', '자료 부탁드립니다', false, true)];
  rSent = [Object.assign(sentMail('4432000000000000090', 'RE: 자료 부탁드립니다', kstNow), { users: { from: { emailUser: { emailAddress: 'me@kist.re.kr' } }, to: [{ emailUser: { emailAddress: 'kim@kist.re.kr' } }] } })];
  const ury = await K.unrepliedMails({ days: 7 }), fury = K.fmtUnreplied(ury);
  ok('mail unrepliedMails: 답장함 표시 꺼진 것만 + 다른 곳에서 답한 것 표시', ury.mails.length === 2 && ury.repliedCount === 1 && !ury.mails[0].repliedElsewhere && ury.mails[1].repliedElsewhere === true
    && fury.startsWith('[답장 안 한 받은 메일 0-2 of 2 | 최근 7일 받은 3통 중 답장함 1통 제외]') && fury.includes('보낸 메일함에 답장 있음') && !/[=&?;]/.test(fury), fury);
  rcalls.length = 0;
  const rpy = await K.prepareReply(ury.mails[0], { text: '안녕하세요.\n\n잘 받았습니다.\n\n감사합니다.' });
  const frpy = K.fmtPrepared(rpy);
  ok('mail prepareReply: 서버에 안 씀(원래 메일 읽기 + 안 읽음 복원만) + RE: 제목·받는 사람 = 원래 보낸 사람', !rcalls.some(c => /mail-drafts|mails\/send/.test(c[1])) && rcalls.some(c => c[1] === '/v2/wapi/mails/unread')
    && rpy.subject === 'RE: 두레이 테스트' && rpy.to.length === 1 && rpy.to[0].email === 'lee@example.org' && rpy.reply.mailId === RID && rpy.signature === false, JSON.stringify(rpy).slice(0, 300));
  ok('mail fmtPrepared(답장): 답장할 메일·원문 인용 표시', frpy.startsWith('[답장 미리보기 — 아직 보내지 않음') && frpy.includes('답장할 메일: 2026-09-30 01:06 | lee@example.org | 두레이 테스트 (원문 인용 붙음)') && frpy.includes('⚠ 외부 주소 1개') && !/=/.test(frpy), frpy);
  rcalls.length = 0;
  const sdy = await K.saveDraft(rpy.key);
  const rdy = rcalls.find(c => c[1] === '/v2/wapi/mail-drafts')[2][0];
  ok('mail saveDraft: 임시 보관함에 답장 초안(원래 메일과 연결 relation reply) + 화면과 같은 원문 인용', sdy.ok && sdy.draftId === RDRAFT && rpy.draftId === RDRAFT && JSON.stringify(rdy.relation) === JSON.stringify({ type: 'reply', mailId: RID }) && rdy.subject === 'RE: 두레이 테스트'
    && rdy.body.content === '<div style="font-family: Arial; font-size: 16px"><div>안녕하세요.</div><div><br></div><div>잘 받았습니다.</div><div><br></div><div>감사합니다.</div><div><br></div><!-- begin signature --><!-- end signature --></div>'
      + '<br><br>-----Original Message-----<br>From:  "이키키" &lt;lee@example.org&gt;<br>To:     "나키키 책임연구원" &lt;me@kist.re.kr&gt;; <br>Cc:    <br>Sent:  2026-09-30 (수) 01:06:45 (UTC+09:00)<br>Subject: 두레이 테스트<br><br><div dir="ltr">본문</div>'
    && !rcalls.some(c => /mails\/send/.test(c[1])), rdy && rdy.body && rdy.body.content);
  ok('mail fmtPrepared: 저장 뒤 임시 보관함 표시', K.fmtPrepared(rpy).includes('임시 보관함에 저장됨') && K.fmtPrepared(rpy).includes('초안 id 4432-0000-0000-0000-055'), K.fmtPrepared(rpy));
  rcalls.length = 0;
  const sd2y = await K.saveDraft(rpy.key);
  ok('mail saveDraft 두 번 → 다시 저장하지 않음', sd2y.already === true && !rcalls.length, JSON.stringify(sd2y));
  const keepR = JSON.parse(JSON.stringify(rDraft));
  rDraft.users.cc = [{ type: 'emailUser', emailUser: { name: '최키키', emailAddress: 'choi@kist.re.kr' } }];   // 사용자가 Dooray 에서 참조를 더하고
  rDraft.subject = 'RE: 두레이 테스트(수정)';                                                                 // 제목과
  rDraft.body = { mimeType: 'text/html', content: rDraft.body.content.replace('잘 받았습니다.', '잘 받았고 내일 연락드리겠습니다.') };   // 본문을 고침
  rcalls.length = 0;
  let ech = null; try { await K.sendPrepared(rpy.key); } catch (e) { ech = e; }
  ok('mail sendPrepared: 임시 보관함 초안을 Dooray 에서 고쳤으면 보내지 않음(바뀐 것 알림, 키 유지)', ech && /확인받은 미리보기와 다릅니다 — 보내지 않았습니다/.test(ech.message) && ech.changed.includes('참조 더해짐: choi@kist.re.kr') && ech.changed.some(x => /^제목 다름/.test(x)) && ech.changed.includes('본문 다름') && !rcalls.some(c => /mails\/send/.test(c[1])), ech && ech.message);
  const rfy = await K.refreshPrepared(rpy.key), frfy = K.fmtPrepared(rfy);
  ok('mail refreshPrepared: 지금 내용으로 미리보기를 다시(다시 확인 필요 표시, 고친 참조·제목·본문)', rfy.refreshed && frfy.includes('임시 보관함의 지금 내용(다시 확인 필요)') && frfy.includes('참조: 최키키 <choi@kist.re.kr>') && frfy.includes('제목: RE: 두레이 테스트(수정)') && frfy.includes('내일 연락드리겠습니다'), frfy);
  rcalls.length = 0;
  const rsy = await K.sendPrepared(rpy.key);
  ok('mail sendPrepared(저장된 답장 초안, 다시 확인 뒤) → 서버 초안을 읽어 대조한 뒤 그 초안을 보냄', rsy.ok && rsy.replyTo === RID && rcalls.map(c => c[1]).join() === '/v2/wapi/mails/' + RDRAFT + ',/v2/wapi/mails/send' && JSON.stringify(rcalls[1][2]) === JSON.stringify({ draftId: RDRAFT }), JSON.stringify(rcalls).slice(0, 300));
  rSent = [Object.assign(sentMail(RDRAFT, 'RE: 두레이 테스트', kstNow), {})];
  const rcy = await K.checkSent(rsy);
  ok('mail checkSent: 보낸 메일 id = 초안 id 로 찾고 다시 확인받은 내용과 같음', rcy.found && rcy.mail.id === RDRAFT && rcy.ok, K.fmtSent(rcy));
  rInbox[1].mailSummary.flags.replied = true; rcalls.length = 0;
  const rry = await K.checkReplied(rsy);
  ok('mail checkReplied: 원래 메일 답장함 표시(목록에서 — 원래 메일을 열지 않음)', rry.found && rry.replied === true && !rcalls.some(c => c[1] === '/v2/wapi/mails/' + RID), JSON.stringify(rry));
  const rp2y = await K.prepareReply(RID2, { text: '네' });
  ok('mail prepareReply: 이미 Re: 로 시작하는 제목은 RE: 를 겹치지 않음', rp2y.subject === 'Re: 이전 논의' && rp2y.to[0].email === 'park@kist.re.kr' && rp2y.external.length === 0, rp2y.subject);
  const rp3y = await K.prepareReply(RID, { text: '' });
  ok('mail prepareReply: 본문 없으면 ERR', rp3y.error && K.fmtPrepared(rp3y).startsWith('ERR '), JSON.stringify(rp3y));

  // ================= kk-wiki =================
  dom();
  let wmode = 'ok';
  const PAGE = { header: { isSuccessful: true }, result: { content: { version: 3, subject: '시험 페이지', lastUpdate: { dateTime: '2026-09-01T10:00:00+09:00' }, body: { content: '본문' } } } };
  global.fetch = async (url) => {
    if (wmode === 'reject') return { ok: true, status: 200, text: async () => JSON.stringify({ header: { isSuccessful: false, resultMessage: 'no permission' } }) };
    if (wmode === 'html') return { ok: true, status: 200, text: async () => '<html>login</html>' };
    if (/pages\?parentPageId/.test(url)) {
      if (/parentPageId=B/.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ header: { isSuccessful: false, resultMessage: 'denied' } }) };
      if (/parentPageId=H/.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ result: { contents: [{ pageId: 'A', subject: '가', hasChildren: false }, { pageId: 'B', subject: '나', hasChildren: true }] } }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(PAGE) };
  };
  ok('wiki inject 1.7', load('kk-wiki/scripts/kk_wiki_ops.min.js') === 'kk-wiki-ops/1.7 =^.^=');
  const W = window.kkWiki;
  ok('wiki fmtFresh 하나뿐(문서대로 인자 없이)', W.fmtFresh() === 'checkFresh 먼저 (비동기, 2~3초)', W.fmtFresh());
  await W.checkFresh({ '4205337049771501801': 3, '4204039839946242290': 2 });
  const ff = W.fmtFresh();
  ok('wiki SAME/CHANGED 표시', ff.startsWith('[최신 확인 2쪽, CHANGED 1]') && ff.includes('| SAME |') && ff.includes('CHANGED 로컬 v2'), ff);
  ok('wiki fmtFresh 출력 필터 안전', clean(ff), ff);
  await W.checkFresh(['4205337049771501801']);
  ok('wiki 배열 인자(로컬 없음) → 수정일·버전만', /^\[최신 확인 1쪽\]\n4205-3370-4977-1501-801 \| 2026-09-01T10:00:00 \| v3 \| 시험 페이지$/.test(W.fmtFresh()), W.fmtFresh());
  ok('wiki {error} → ERR', W.fmtFresh({ error: 'x' }) === 'ERR x');
  ok('wiki staffDownload 데이터 없음', W.staffDownload() === 'no staff data');
  wmode = 'reject'; await W.checkFresh(['4205337049771501801']);
  ok('wiki API 거절 → ERR(빈 페이지로 넘기지 않음)', /ERR 1\]/.test(W.fmtFresh()) && W.fmtFresh().includes('no permission'), W.fmtFresh());
  wmode = 'html'; await W.checkFresh(['4205337049771501801']);
  ok('wiki 로그인 풀림 → ERR DOORAY', W.fmtFresh().includes('DOORAY: 응답이 JSON 이 아닙니다'), W.fmtFresh());
  wmode = 'ok'; W.crawlAll({ space: 'S', home: 'H', delayMs: 0 });
  for (let i = 0; i < 50 && !/phase (done|error)/.test(W.status()); i++) await tick(20);
  ok('wiki 가지 목록 실패 → 기록·계속(수집은 끝남)', /phase done .*errors 1 \(하위 목록 실패 1\)/.test(W.status()) && W.pages.length === 3, W.status());
  W.exportSnapshot(); ok('wiki export 에 walk_errors', clicked.length > 0);

  // ================= kk-dry (2026-09-29 신설) — 업무·드라이브 서버 검색 + 파일 내용 읽기 =================
  dom();
  global.Blob = require('buffer').Blob;   // dom() 의 가짜 Blob 대신 진짜(압축 해제에 stream() 필요)
  const zlib = require('zlib');
  // 합성 ZIP(docx·pptx·xlsx·hwpx) — deflate 압축, CRC 는 파서가 보지 않아 0
  const makeZip = (files) => {
    const parts = [], cen = []; let off = 0;
    for (const [name, content] of Object.entries(files)) {
      const nb = Buffer.from(name, 'utf8'), raw = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content), comp = zlib.deflateRawSync(raw);   // 그림 등 바이너리도
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
      parts.push(lh, nb, comp); cen.push(ch, nb); off += 30 + nb.length + comp.length;
    }
    const cd = Buffer.concat(cen), eo = Buffer.alloc(22), k = Object.keys(files).length;
    eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(k, 8); eo.writeUInt16LE(k, 10); eo.writeUInt32LE(cd.length, 12); eo.writeUInt32LE(off, 16);
    return new Uint8Array(Buffer.concat([...parts, cd, eo]));
  };
  // 합성 OLE(CFB v3, 512바이트 섹터, 작은 스트림은 미니 스트림) — 한글 5.0 hwp 구조(FileHeader·BodyText/Section0·PrvText)
  const makeCfb = (streams) => {
    const SS = 512, MS = 64, ents = [{ name: 'Root Entry', type: 5, left: -1, right: -1, child: -1, start: 0, size: 0 }], kids = { 0: [] }, stor = {};
    for (const p of Object.keys(streams)) {
      const segs = p.split('/'); let parent = 0;
      segs.forEach((s, i) => {
        const key = segs.slice(0, i + 1).join('/');
        if (i < segs.length - 1) { if (stor[key] == null) { ents.push({ name: s, type: 1, left: -1, right: -1, child: -1, start: 0, size: 0 }); stor[key] = ents.length - 1; (kids[parent] = kids[parent] || []).push(stor[key]); } parent = stor[key]; }
        else { ents.push({ name: s, type: 2, left: -1, right: -1, child: -1, start: 0, size: 0, data: Buffer.from(streams[p]) }); (kids[parent] = kids[parent] || []).push(ents.length - 1); }
      });
    }
    for (const [p, ks] of Object.entries(kids)) { if (!ks.length) continue; ents[+p].child = ks[0]; for (let i = 0; i < ks.length - 1; i++) ents[ks[i]].right = ks[i + 1]; }
    let mini = Buffer.alloc(0); const mf = [];
    for (const e of ents) if (e.data && e.data.length < 4096) { const ns = Math.ceil(e.data.length / MS) || 1; e.start = mini.length / MS; e.size = e.data.length; for (let i = 0; i < ns; i++) mf.push(i === ns - 1 ? 0xFFFFFFFE : e.start + i + 1); const pad = Buffer.alloc(ns * MS); e.data.copy(pad); mini = Buffer.concat([mini, pad]); }
    const dS = Math.ceil(ents.length * 128 / SS), mfS = Math.ceil(mf.length * 4 / SS) || 1, msS = Math.ceil(mini.length / SS) || 1;
    const fat = new Array(SS / 4).fill(0xFFFFFFFF); fat[0] = 0xFFFFFFFD;
    const setChain = (st, n) => { for (let i = 0; i < n; i++) fat[st + i] = i === n - 1 ? 0xFFFFFFFE : st + i + 1; };
    const dSt = 1, mfSt = 1 + dS, msSt = mfSt + mfS; setChain(dSt, dS); setChain(mfSt, mfS); setChain(msSt, msS);
    ents[0].start = msSt; ents[0].size = mini.length;
    let nxt = msSt + msS; const bigs = [];   // 4KB 이상 스트림은 일반 섹터(FAT 체인) — 파서의 두 경로 모두 시험
    for (const e of ents) if (e.data && e.data.length >= 4096) { const ns = Math.ceil(e.data.length / SS); e.start = nxt; e.size = e.data.length; setChain(nxt, ns); nxt += ns; const pad = Buffer.alloc(ns * SS); e.data.copy(pad); bigs.push(pad); }
    const hdr = Buffer.alloc(512); Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]).copy(hdr, 0);
    hdr.writeUInt16LE(0x3E, 0x18); hdr.writeUInt16LE(3, 0x1A); hdr.writeUInt16LE(0xFFFE, 0x1C); hdr.writeUInt16LE(9, 0x1E); hdr.writeUInt16LE(6, 0x20);
    hdr.writeUInt32LE(1, 0x2C); hdr.writeUInt32LE(dSt, 0x30); hdr.writeUInt32LE(4096, 0x38); hdr.writeUInt32LE(mfSt, 0x3C); hdr.writeUInt32LE(mfS, 0x40); hdr.writeUInt32LE(0xFFFFFFFE, 0x44);
    for (let i = 0; i < 109; i++) hdr.writeUInt32LE(i === 0 ? 0 : 0xFFFFFFFF, 0x4C + i * 4);
    const fb = Buffer.alloc(SS); fat.forEach((v, i) => fb.writeUInt32LE(v >>> 0, i * 4));
    const db = Buffer.alloc(dS * SS);
    ents.forEach((e, i) => { const o = i * 128, nb = Buffer.from(e.name + '\u0000', 'utf16le'); nb.copy(db, o); db.writeUInt16LE(nb.length, o + 0x40); db[o + 0x42] = e.type; db[o + 0x43] = 1; db.writeUInt32LE(e.left >>> 0, o + 0x44); db.writeUInt32LE(e.right >>> 0, o + 0x48); db.writeUInt32LE(e.child >>> 0, o + 0x4C); db.writeUInt32LE(e.start >>> 0, o + 0x74); db.writeUInt32LE(e.size >>> 0, o + 0x78); });
    const mfb = Buffer.alloc(mfS * SS, 0xFF); mf.forEach((v, i) => mfb.writeUInt32LE(v >>> 0, i * 4));
    const msb = Buffer.alloc(msS * SS); mini.copy(msb);
    return new Uint8Array(Buffer.concat([hdr, fb, db, mfb, msb, ...bigs]));
  };
  const rec = (tag, data) => { const n = data.length; if (n < 0xFFF) { const h = Buffer.alloc(4); h.writeUInt32LE((tag | (n << 20)) >>> 0, 0); return Buffer.concat([h, data]); } const h = Buffer.alloc(8); h.writeUInt32LE((tag | (0xFFF << 20)) >>> 0, 0); h.writeUInt32LE(n, 4); return Buffer.concat([h, data]); };
  const w16 = (codes) => { const b = Buffer.alloc(codes.length * 2); codes.forEach((c, i) => b.writeUInt16LE(c, i * 2)); return b; };
  const cc = (s) => Array.from(s).map(ch => ch.charCodeAt(0));
  const ctl = (c) => [c, 0, 0, 0, 0, 0, 0, c];   // 8칸 제어 문자(코드 + 6칸 + 코드)
  // junk: 압축 본문 끝 뒤에 붙는 바이트(실제 hwp 에서 Chrome 압축 해제가 멈추던 경우, 2026-09-29) / raw: 본문 구역 바이트를 그대로(손상 시험)
  const hwpOf = (flags, body = true, junk = 0, raw = null) => {
    const fh = Buffer.alloc(256); fh.write('HWP Document File', 0, 'latin1'); fh.writeUInt32LE(0x05000300, 32); fh.writeUInt32LE(flags, 36);
    const sec = Buffer.concat([rec(66, Buffer.alloc(22)), rec(67, w16([...cc('시험 문단 R&D 가나다'), 13])), rec(67, w16([...cc('A'), ...ctl(9), ...cc('B'), ...ctl(11), ...cc('표안글'), 13])), rec(67, w16([...cc('긴'.repeat(2100)), 13]))]);
    const st = { FileHeader: fh, PrvText: w16(cc('미리보기 글')) };
    if (body) st['BodyText/Section0'] = raw || ((flags & 1) ? Buffer.concat([zlib.deflateRawSync(sec), Buffer.alloc(junk, 0x55)]) : sec);
    return makeCfb(st);
  };
  let dmode = 'ok'; const dcalls = [];
  const T1 = { id: '4100000000000000001', projectId: '3300000000000000001', number: 7, subject: '가나다 과제 보고서 작성', workflowId: 'W1', workflowClass: 'working', users: { from: { type: 'member', member: { name: '김키키' } }, to: [{ type: 'member', member: { name: '이키키' } }], cc: [] }, createdAt: '2026-09-01T10:00:00+09:00', updatedAt: '2026-09-20T10:00:00+09:00', fileIdList: ['F1'], subPostCount: 1 };
  const T2 = Object.assign({}, T1, { id: '4100000000000000002', number: 3, subject: '옛 보고서', updatedAt: '2026-03-01T10:00:00+09:00', fileIdList: [] });
  const T3 = Object.assign({}, T1, { id: '4100000000000000003', number: 9, subject: '같은 프로젝트 다른 업무', updatedAt: '2026-05-01T10:00:00+09:00', fileIdList: [] });
  const TREFS = { projectMap: { '3300000000000000001': { code: '○○-공동연구' } }, workflowMap: { W1: { name: '진행' } } };
  const DC = (id, name, type, upd, extra) => Object.assign({ id, driveId: 'D1', projectId: '3300000000000000009', name, type, createdAt: upd, updatedAt: upd, size: 2048, createOrganizationMemberId: 'M1', lastUpdateOrganizationMemberId: 'M1', isTrashed: false, downloadUrl: '/drive/v1/downloads/D1/' + id }, extra || {});
  const DREFS = { driveMap: { D1: { name: '연구실-공지', projectId: '3300000000000000009', type: 'project' } }, organizationMemberMap: { M1: { name: '박키키' } } };
  // 첨부·댓글이 아주 많은 업무(2026-09-29 실사용: 첨부 67·86·132개 업무가 섞여 결과 10.7만 자 → get_page_text 가 5만 자에서 잘림) — 'big' 12건 / 'bigger' 150건
  const bigTask = (i) => Object.assign({}, T1, { id: String(4200000000000000000n + BigInt(i)), number: 100 + i, subject: '큰 업무 ' + i + ' 첨부 많은 과제 보고서', updatedAt: new Date(Date.UTC(2026, 8, 20) - i * 3600000).toISOString(), fileIdList: Array.from({ length: 120 }, (_, j) => 'BF' + j), subPostCount: 0 });
  const bigFiles = () => { const m = {}; for (let j = 0; j < 120; j++) m['BF' + j] = { id: 'BF' + j, name: '아주 긴 파일 이름을 가진 보고서 초안 버전 ' + j + '_v' + j + (j % 3 ? '.pptx' : '.hwp'), size: 1048576 * (j + 1), createdAt: '2026-08-' + String(1 + (j % 28)).padStart(2, '0') + 'T09:00:00+09:00', downloadUrl: '/files/BF' + j, creator: { type: 'member', member: { name: j % 2 ? '김키키' : '이키키' } } }; return m; };
  const bigComments = () => Array.from({ length: 60 }, (_, c) => ({ createdAt: '2026-08-' + String(1 + (c % 28)).padStart(2, '0') + 'T12:00:00+09:00', creator: { type: 'member', member: { name: '이키키' } }, body: { mimeType: 'text/x-markdown', content: '검토 의견 ' + c + ' ' + '가나다라마바사 '.repeat(120) }, fileIdList: ['CF' + c] }));
  const bigCFiles = () => { const m = {}; for (let c = 0; c < 60; c++) m['CF' + c] = { id: 'CF' + c, name: '댓글 첨부 수정본 ' + c + '.docx', size: 2048 * (c + 1), createdAt: '2026-08-' + String(1 + (c % 28)).padStart(2, '0') + 'T12:00:00+09:00', downloadUrl: '/files/CF' + c }; return m; };
  const isBig = () => dmode === 'big' || dmode === 'bigger';
  const J = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
  global.fetch = async (url, opts) => {
    dcalls.push({ url, body: opts && opts.body });
    if (isBig() && url.startsWith('/wapi/task/v1/projects/*/tasks?')) { const n = dmode === 'big' ? 12 : 150; return J({ header: { isSuccessful: true }, result: Array.from({ length: n }, (_, i) => bigTask(i)), totalCount: n, references: TREFS }); }
    if (isBig() && url.startsWith('/wapi/task/v1/tasks/')) { const i = Number(BigInt(/tasks\/(\d+)/.exec(url)[1]) - 4200000000000000000n); return J({ header: { isSuccessful: true }, result: Object.assign({}, bigTask(i), { body: { mimeType: 'text/x-markdown', content: '본문 내용 '.repeat(500) } }), references: { fileMap: bigFiles() } }); }
    if (isBig() && url.includes('/events?')) return J({ header: { isSuccessful: true }, totalCount: 60, result: bigComments(), references: { fileMap: bigCFiles() } });
    if (dmode === 'html') return { ok: true, status: 200, text: async () => HTML };
    if (dmode === '401') return { ok: false, status: 401, text: async () => '' };
    if (dmode === 'reject') return J({ header: { isSuccessful: false, resultCode: -1, resultMessage: 'not allowed' } });
    if (/^\/wapi\/task\/v1\/projects\/!\d+\/tasks\?/.test(url)) return J({ header: { isSuccessful: true }, result: [T1, T3], totalCount: 2, references: TREFS });   // 한 프로젝트 목록('!' 필수) — T3 는 검색에 안 걸리는 같은 프로젝트 업무
    if (url.startsWith('/wapi/task/v1/projects/*/tasks?')) {
      if (dmode === 'unsorted') return J({ header: { isSuccessful: true }, result: [T2, T1], totalCount: 2, references: TREFS });
      if (dmode === 'many') return J({ header: { isSuccessful: true }, result: Array.from({ length: 100 }, (_, i) => Object.assign({}, T1, { id: String(4100000000000000100n + BigInt(i)), subject: '아주 긴 업무 제목 ○○○○ 과제 보고서 초안 검토 요청 ' + i })), totalCount: 250, references: TREFS });
      return J({ header: { isSuccessful: true }, result: [T1, T2], totalCount: 2, references: TREFS });
    }
    if (url.startsWith('/wapi/task/v1/tasks/')) return J({ header: { isSuccessful: true }, result: Object.assign({}, T1, { fileIdList: ['F1', 'F2'], body: { mimeType: 'text/x-markdown', content: '## 할 일\n**초안** 작성 [양식](https://example.org/x?a=1&b=2) ![그림](/files/9)\n마감 9/30' } }), references: { fileMap: { F1: { id: 'F1', name: '보고서_초안.hwp', size: 4096, createdAt: '2026-09-02T10:00:00+09:00', downloadUrl: '/files/F1', creator: { type: 'member', member: { name: '김키키' } } }, F2: { id: 'F2', name: '보고서_수정.docx', size: 9000, createdAt: '2026-09-19T09:00:00+09:00', downloadUrl: '/files/F2' } } } });   // 댓글 첨부(F2)도 업무 첨부 목록에 함께 온다(실측)
    if (url.includes('/events?')) return J({ header: { isSuccessful: true }, totalCount: 2, result: [{ id: '4400000000000000001', createdAt: '2026-09-19T09:00:00+09:00', creator: { type: 'member', member: { name: '이키키' } }, body: { mimeType: 'text/x-markdown', content: '수정본 올렸습니다' }, fileIdList: ['F2'] }, { createdAt: '2026-09-10T09:00:00+09:00', creator: { type: 'member', member: { name: '김키키' } }, body: { mimeType: 'text/html', content: '<p>검토 부탁</p>' } }], references: { fileMap: { F2: { id: 'F2', name: '보고서_수정.docx', size: 9000, createdAt: '2026-09-19T09:00:00+09:00', downloadUrl: '/files/F2' } } } });
    if (url.startsWith('/v2/wapi/drives/search')) {
      if (dmode === 'driveReject') return J({ header: { isSuccessful: false, resultMessage: 'search failed' } });
      if (dmode === 'unsorted') return J({ header: { isSuccessful: true }, result: { totalCount: 2, contents: [DC('5100000000000000008', '2025', 'folder', '2025-01-01T12:00:00+09:00'), DC('5100000000000000009', '260610_○○_발표.pptx', 'file', '2026-06-10T12:00:00+09:00')], references: DREFS } });
      return J({ header: { isSuccessful: true }, result: { totalCount: 3, contents: [DC('5100000000000000001', '260610_○○_발표.pptx', 'file', '2026-06-10T12:00:00+09:00'), DC('5100000000000000002', '2026-06', 'folder', '2026-06-01T12:00:00+09:00'), DC('5100000000000000003', '옛 보고서.hwp', 'file', '2026-05-01T12:00:00+09:00', { isTrashed: true })], references: DREFS } });
    }
    if (url.startsWith('/v2/wapi/drives/D1/files/')) return J({ header: { isSuccessful: true }, result: { content: { parentFile: { id: '5100000000000000002', path: 'root/2026/2026-06' } } } });
    return { ok: false, status: 404, text: async () => '{}' };
  };
  ok('dry inject 2.12', load('kk-dry/scripts/kk_dry_ops.min.js') === 'kk-dry-ops/2.12 =^.^=');
  const DR = window.kkDry;
  const noQ = (s) => !/=/.test(s) && !/\w=\w*&/.test(s);
  window.__d = null; DR.find([['가나다'], ['가나다', '보고서']], { since: '2026-04-01' }).then(r => window.__d = r, e => window.__d = { error: String(e) });
  ok('dooray find 진행 중 → 아직(0건 아님)', /^\(아직 — |^\(결과 없음/.test(DR.fmtFind(window.__d)), DR.fmtFind(window.__d));
  await tick(200);
  const fd = window.__d, ff2 = DR.fmtFind(fd);
  ok('dooray find: 업무 기간 필터(T1만)·드라이브 휴지통 제외(2건)', fd.tasks.items.length === 1 && fd.tasks.items[0].id === T1.id && fd.drive.items.length === 2 && !fd.drive.items.some(x => x.trashed), JSON.stringify([fd.tasks.items.length, fd.drive.items.length]));
  ok('dooray find: 두 묶음 hit 기록 + 상세·경로 채움', JSON.stringify(fd.tasks.items[0].hits) === JSON.stringify(['가나다', '가나다 보고서']) && fd.tasks.items[0].detail.commentTotal === 2 && fd.drive.items[0].path === '/2026/2026-06', JSON.stringify([fd.tasks.items[0].hits, fd.drive.items[0].path]));
  const tq = dcalls.filter(c => c.url.startsWith('/wapi/task/v1/projects/*/tasks?')).map(c => c.url);
  ok('dooray 업무 검색: 낱말은 all 한 칸에 띄어쓰기(두 번 주면 둘째 무시되므로)', tq.some(u => u.includes('all=' + encodeURIComponent('가나다 보고서') + '&')) && tq.every(u => (u.match(/all=/g) || []).length === 1), tq.join(' , '));
  const db = dcalls.filter(c => c.url.startsWith('/v2/wapi/drives/search')).map(c => JSON.parse(c.body)).find(b => b.all.length === 2);
  ok('dooray 드라이브 검색: all 배열 AND + query all=…&all=… + searchType', db && db.all.join() === '가나다,보고서' && db.query === 'all=' + encodeURIComponent('가나다') + '&all=' + encodeURIComponent('보고서') && db.searchType === 'drive', JSON.stringify(db));
  ok('dooray fmtFind 머리줄·1,000자·= 없음', ff2.startsWith('[찾기 ') && ff2.includes('업무 1건 · 드라이브 2건') && ff2.includes('기간 2026-04-01') && ff2.length <= 1000 && noQ(ff2), ff2);
  const t1 = fd.tasks.items[0], ft = DR.fmtTask(t1), fc = DR.fmtComments(t1), fl = DR.fmtFiles(t1);
  ok('dooray fmtTask: 마크다운 정리(링크 글자만·그림 표시)·첨부(중복 없이)·댓글 수', ft.includes('초안 작성 양식 [이미지]') && ft.includes('첨부 2 (보고서_초안.hwp, 보고서_수정.docx)') && ft.includes('댓글 2') && !ft.includes('https') && noQ(ft), ft);
  ok('dooray fmtComments 최신순 + 댓글 첨부 + html 본문', /\n0 \| 26-09-19 09:00 \| 이키키 \| 수정본 올렸습니다 \| 첨부 보고서_수정\.docx/.test(fc) && fc.includes('검토 부탁'), fc);
  ok('dooray fmtFiles 본문·댓글 첨부 — 댓글 파일은 한 번만(댓글 날짜로)', fl.startsWith('[첨부 0-2 of 2]') && /보고서_초안\.hwp .*\| 본문/.test(fl) && /보고서_수정\.docx .*\| 댓글 26-09-19/.test(fl), fl);
  const lk = DR.fmtLinks(fd.tasks), lkd = DR.fmtLinks(fd.drive), lkh = DR.fmtLinks(fd.drive, 0, 12, { hy: true });
  ok('dooray fmtLinks: 주소 그대로 / {hy:true} 하이픈 번호', lk.includes('0 | https://kist.gov-dooray.com/task/3300000000000000001/4100000000000000001') && lkd.includes('https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002/views/5100000000000000001') && lkh.includes('P 3300-0000-0000-0000-009 | F 5100-0000-0000-0000-001'), lk + ' // ' + lkh);
  ok('dooray fmtLinks 항목 1건', DR.fmtLinks(t1).includes('/task/3300000000000000001/4100000000000000001'), DR.fmtLinks(t1));
  const on = DR.only(fd.drive, { ext: 'pptx' }), ow = DR.only(fd.tasks, { who: '이키키' }), ox = DR.only(fd.tasks, { text: '수정본' });
  ok('dooray only: 확장자·사람·본문/댓글 글', on.items.length === 1 && on.items[0].ext === 'pptx' && ow.items.length === 1 && ox.items.length === 1 && DR.only(fd.tasks, { text: '없는말' }).items.length === 0);
  // 서버 순서가 수정일 순이 아니어도(드라이브는 폴더 먼저, 업무는 postUpdatedAt 순) 기간 안 항목을 놓치지 않는다 — 2026-09-29 실사용에서 6월 파일을 놓친 초판 결함
  dmode = 'unsorted';
  const us = await DR.searchTasks('x', { since: '2026-04-01' }), ud = await DR.searchDrive('x', { since: '2026-04-01' });
  ok('dooray 뒤섞인 순서 + since → 기간 안 항목 모두(멈추지 않음)', us.items.length === 1 && us.items[0].id === T1.id && us.end === 'all' && ud.items.length === 1 && ud.items[0].ext === 'pptx', JSON.stringify([us.items.map(x => x.id), us.end, ud.items.map(x => x.name)]));
  // 드라이브 링크(2026-09-29 사용자 지적 "링크를 누르니 폴더만 보인다"): 파일 = 부모 폴더/views/파일(선택된 채 열림), 폴더 = 그 폴더, 부모를 모르면 검색어 붙인 대안
  ok('dooray 드라이브 링크: 파일은 부모 폴더/views · 폴더는 그 폴더 · 부모 모르면 ?query 대안', fd.drive.items[0].version === 0 && fd.drive.items[0].url === 'https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002/views/5100000000000000001'
    && fd.drive.items[1].kind === 'folder' && fd.drive.items[1].url === 'https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002'
    && ud.items[0].url === 'https://kist.gov-dooray.com/drive/3300000000000000009/views/5100000000000000009?query=' + encodeURIComponent('all=' + encodeURIComponent('260610_○○_발표.pptx')), JSON.stringify([fd.drive.items.map(x => x.url), ud.items[0].url]));
  // 한 프로젝트 전체 목록: 주소 번호 앞 '!' + 검색어·projectScope 없이 (2026-09-29 실사용 시험에서 '!' 빠진 결함 발견)
  dmode = 'ok'; dcalls.length = 0;
  const pt = await DR.projectTasks('3300000000000000001'), ptu = dcalls.map(c => c.url).find(u => u.includes('/projects/!')) || '';
  ok('dooray projectTasks → /projects/!{id}/tasks, 검색어·projectScope 없음', pt.items.length === 2 && pt.end === 'all' && ptu.startsWith('/wapi/task/v1/projects/!3300000000000000001/tasks?') && !/all=|projectScope/.test(ptu), ptu);
  // 빠른 길 report(): 작업 탭(robots.txt)에만 글로 펼침 — 찾기 + 프로젝트 전체(expand) + 본문·댓글(오래된 순)·첨부·드라이브 경로를 한 번에
  let shownText = ''; document.body.appendChild = (el) => { shownText = el.textContent; };
  global.location = { pathname: '/task/to' };
  ok('dooray show: 작업 탭이 아니면 거부(쓰던 화면 보호)', DR.show('x').startsWith('ERR 작업 탭') && shownText === '', DR.show('x'));
  global.location = { pathname: '/robots.txt' };
  const rp = await DR.report([['가나다'], ['가나다', '보고서']], { expand: true });
  const iOld = shownText.indexOf('2026-09-10 09:00 김키키'), iNew = shownText.indexOf('2026-09-19 09:00 이키키');
  ok('dooray report: 업무 3건(프로젝트 전체로 1건 더함)·드라이브·링크·댓글 오래된 순·요약 반환', /업무 3건 · 드라이브 2건/.test(rp.summary) && shownText.includes("+ 프로젝트 '○○-공동연구' 업무 2건 중 검색에 안 걸린 1건을 더함") && shownText.includes('| 같은 프로젝트') && shownText.includes('https://kist.gov-dooray.com/task/3300000000000000001/4100000000000000003') && shownText.includes('[F0]') && iOld > 0 && iNew > iOld && rp.chars === shownText.length, rp.summary + ' // ' + shownText.slice(0, 300));
  ok('dooray last(): 후속 질문용 결과 보관', DR.last().tasks.items.length === 3 && DR.last().drive.items.length === 2);
  { const d0 = DR.last().drive.items[0], d1 = DR.last().drive.items[1], lo = await DR.linkOf(d1.name.slice(0, 4)), ln = await DR.linkOf(1), lx = await DR.linkOf('없는파일이름');
    ok('dooray linkOf: 이름 조각·번호 → 그 파일 이름과 주소가 한 줄(옆 파일 주소 아님)', lo.split(String.fromCharCode(10)).some(l => l.includes(d1.name) && (l.split('→ ')[1] || '').split(' ')[0] === d1.url) && !lo.split(String.fromCharCode(10)).some(l => l.includes(d1.name) && (l.split('→ ')[1] || '').split(' ')[0] === d0.url) && ln.includes(d1.url) && lx.startsWith('ERR'), lo + ' // ' + ln);
    ok('dooray fmtLinks: 주소 옆에 이름', DR.fmtLinks(DR.last().drive).includes(d1.url + ' | ' + d1.name.slice(0, 30)), DR.fmtLinks(DR.last().drive)); }
  { // checkLinks — 답의 링크가 같은 줄 이름의 것인지 결정적 대조(2026-09-30 옆 파일 링크 실수)
    const L = DR.last(), f = L.drive.items.find(it => it.kind === 'file'), t0 = L.tasks.items[0], NL = String.fromCharCode(10);
    const a1 = DR.checkLinks([`**${f.name}** — [Dooray 에서 열기](${f.url})`]);
    const a2 = DR.checkLinks([`**${f.name}** — [Dooray 에서 열기](${t0.url})`]);
    const a3 = DR.checkLinks(['그 파일 — https://kist.gov-dooray.com/task/1/999']);
    const a4 = DR.checkLinks([`**${f.name}** https://kist.gov-dooray.com/drive/${f.projectId}/views/${f.id}`]);
    const a5 = DR.checkLinks(`**${f.name}** (2026-06-10)` + NL + `[Dooray 에서 열기](${f.url})`);
    const a6 = DR.checkLinks(['링크 없는 답']);
    const A = { kind: 'file', id: '5100000000000000077', projectId: '3300000000000000009', name: '260713 - PEOR_Kiki.pptx', url: 'https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002/views/5100000000000000077' };
    const B = { kind: 'file', id: '5100000000000000078', projectId: '3300000000000000009', name: '260623 - PEOR_Kiki.pptx', url: 'https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002/views/5100000000000000078' };
    L.drive.items.push(A, B);
    const a7 = DR.checkLinks([`**260623 - PEOR_Kiki.pptx, 슬라이드 9** — [Dooray 에서 열기](${A.url})`]);
    const a8 = DR.checkLinks([`**260623 - PEOR_Kiki.pptx, 슬라이드 9** — [Dooray 에서 열기](${B.url})`, `260713 - PEOR_Kiki.pptx 에는 없음 — [열기](${A.url})`]);
    const a9 = DR.checkLinks([`**260623 - PEOR_Kiki.pptx** — [열기](https://kist.gov-dooray.com/drive/3300000000000000009/views/5100000000000000077?query=all%3D260713%26all%3DPEOR_Kiki.pptx)`]);   // 실측 실수: 주소 속 ?query= 의 이름에 속지 않기
    // Codex 검토(v0.7.8): 한 줄에 비슷한 이름이 둘 — 줄 전체로 보면 틀린 링크도 OK 였다
    const C = { kind: 'file', id: '5100000000000000079', projectId: '3300000000000000009', name: 'report.pptx', url: 'https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002/views/5100000000000000079' };
    const D = { kind: 'file', id: '5100000000000000080', projectId: '3300000000000000009', name: 'report_v2.pptx', url: 'https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002/views/5100000000000000080' };
    L.drive.items.push(C, D);
    const b1 = DR.checkLinks([`**260623 - PEOR_Kiki.pptx** (260713 - PEOR_Kiki.pptx 와 비교) — [열기](${A.url})`]);   // 이름 둘 + 한쪽 주소 → OK 아님
    const b2 = DR.checkLinks([`**report_v2.pptx** — [열기](${C.url})`]);                                            // 긴 이름 줄에 짧은 이름(report) 주소 → ✗
    const b3 = DR.checkLinks([`**report_v2.pptx** — [열기](${D.url})`, `**report.pptx** — [열기](${C.url})`]);       // 맞으면 OK(짧은 이름은 긴 이름의 일부)
    const b4 = DR.checkLinks([`260623 - PEOR_Kiki.pptx → ${B.url} · 260713 - PEOR_Kiki.pptx → ${A.url}`]);            // 한 줄에 둘, 각자 링크 → OK
    const b5 = DR.checkLinks([`260623 - PEOR_Kiki.pptx → ${A.url} · 260713 - PEOR_Kiki.pptx → ${B.url}`]);            // 한 줄에 둘, 링크가 서로 바뀜 → ✗ 2곳
    L.drive.items.splice(L.drive.items.indexOf(A), 4);
    ok('dooray checkLinks(Codex v0.7.8): 한 줄에 비슷한 이름 둘 — 모호하면 OK 아님 · 긴 이름 줄의 짧은 이름 주소 ✗ · 맞으면 OK · 한 줄 두 링크도 링크마다 앞 이름으로',
      !b1.startsWith('OK') && b1.includes('이름이 둘') && b2.startsWith('✗') && b2.includes('report_v2') && b3.startsWith('OK 링크 2개') && b4.startsWith('OK 링크 2개') && b5.startsWith('✗ 링크 2개 중 2곳'), [b1, b2, b3, b4, b5].join(' // '));
    ok('dooray checkLinks: 맞는 링크 OK · 다른 항목 주소 ✗ · 모르는 주소 ? · 최상위 주소 △ · 이름이 윗줄이면 OK · 링크 없으면 ERR',
      a1.startsWith('OK 링크 1개') && a2.startsWith('✗') && a2.includes('✗ 1줄') && a3.includes('? 1줄') && a4.includes('최상위') && a5.startsWith('OK') && a6.startsWith('ERR'), [a1, a2, a3, a4, a5, a6].join(' // '));
    ok('dooray checkLinks: 이름이 비슷한 두 파일(260623 줄에 260713 주소)도 ✗ / 맞으면 OK, 출력에 주소·= 없음',
      a7.startsWith('✗') && a7.includes('260713') && a7.includes('260623') && a8.startsWith('OK 링크 2개') && !/https?:|=/.test(a7) && a9.startsWith('✗'), a7 + ' // ' + a8 + ' // ' + a9); }
  { // 댓글(답글)에 단 첨부는 그 댓글을 가리키는 주소로(2026-09-30 사용자 요청 — 업무 전체가 아니라 첨부가 있는 글로)
    const L = DR.last(), t0 = L.tasks.items[0], NL = String.fromCharCode(10), CU = 'https://kist.gov-dooray.com/project/tasks/' + t0.id + '#comment-4400000000000000001';
    const fs = DR.filesOf(t0), fB = fs.find(f => f.name === '보고서_초안.hwp'), fC = fs.find(f => f.name === '보고서_수정.docx');
    const lk = await DR.linkOf('보고서_수정');
    const c1 = DR.checkLinks([`**보고서_수정.docx** — [열기](${CU})`]), c2 = DR.checkLinks([`**보고서_초안.hwp** — [열기](${CU})`]);
    const c3 = DR.checkLinks([`**보고서_수정.docx** — [열기](${t0.url})`]), c4 = DR.checkLinks([`**보고서_초안.hwp** — [열기](${t0.url})`]);   // 댓글 첨부에 업무 주소 △ · 본문 첨부에 업무 주소 OK
    DR.showFiles(0);
    ok('dooray 댓글 첨부: filesOf 에 댓글 id · linkOf 는 그 댓글 주소 · 본문 첨부는 업무 주소 · checkLinks 댓글 주소 OK/다른 파일 ✗ · showFiles 줄에 댓글 주소',
      fC && fC.cid === '4400000000000000001' && /^댓글/.test(fC.where) && fB && !fB.cid && fB.where === '본문'
      && lk.split(NL).some(l => l.includes('보고서_수정.docx') && l.endsWith(CU)) && c1.startsWith('OK') && c2.startsWith('✗') && c3.startsWith('✗') && c3.includes('댓글에 단 파일') && c4.startsWith('OK')
      && shownText.split(NL).some(l => l.includes('보고서_수정.docx') && l.includes(CU)) && !shownText.split(NL).some(l => l.includes('보고서_초안.hwp') && l.includes('#comment-')),
      [JSON.stringify(fC), lk, c1, c2, c3, c4].join(' // ')); }
  { // quick 처럼 댓글을 안 읽어도(comments:0) 첨부가 있으면 첨부 → 댓글을 맞추고, 검색 항목이면 업무 조회와 동시에 받는다
    const bfC = global.fetch, calls = [];
    global.fetch = async (url) => {
      const s = String(url); calls.push(s.includes('/events?') ? 'ev' : 'task');
      if (s.startsWith('/wapi/task/v1/tasks/')) return J({ header: { isSuccessful: true }, result: Object.assign({}, T1, { fileIdList: ['F1', 'F2'] }), references: { fileMap: { F1: { id: 'F1', name: 'a.hwp', size: 1, createdAt: '2026-09-02T10:00:00+09:00', downloadUrl: '/files/F1' }, F2: { id: 'F2', name: 'b.hwp', size: 1, createdAt: '2026-09-03T10:00:00+09:00', downloadUrl: '/files/F2' } } } });
      if (s.includes('/events?')) return J({ header: { isSuccessful: true }, totalCount: 1, result: [{ id: '4400000000000000009', createdAt: '2026-09-03T10:00:00+09:00', fileIdList: ['F2'], body: { mimeType: 'text/x-markdown', content: 'x' } }], references: {} });
      return { ok: false, status: 404, text: async () => '{}' };
    };
    const q0 = await DR.getTask({ id: T1.id, projectId: T1.projectId, number: T1.number, files: 2 }, { comments: 0 });
    global.fetch = async (url) => String(url).includes('/events?') ? { ok: false, status: 500, text: async () => '{}' } : J({ header: { isSuccessful: true }, result: Object.assign({}, T1, { fileIdList: ['F1'] }), references: { fileMap: { F1: { id: 'F1', name: 'a.hwp', size: 1, createdAt: '2026-09-02T10:00:00+09:00', downloadUrl: '/files/F1' } } } });
    const q1 = await DR.getTask({ id: T1.id }, { comments: 0 });   // 댓글 목록 실패 → 어느 글인지 모름(본문·댓글), 링크는 업무
    global.fetch = bfC;
    const g = DR.filesOf(q0), g1 = DR.filesOf(q1);
    ok('dooray comments:0 첨부 → 댓글 대응: 댓글 첨부만 cid · 동시 요청(업무·댓글 둘 다 첫 요청 전에 시작) · 실패하면 본문·댓글(링크 업무)',
      g.find(f => f.name === 'b.hwp').cid === '4400000000000000009' && g.find(f => f.name === 'a.hwp').where === '본문' && q0.detail.comments.length === 0 && calls.slice(0, 2).sort().join() === 'ev,task'
      && !g1[0].cid && g1[0].where === '본문·댓글' && !q1.detail.commentError,
      JSON.stringify([g, g1, calls])); }
  ok('dooray showItems(only 결과) 줄 제한 없이', DR.showItems(DR.only(DR.last().tasks, { who: '이키키' })).startsWith('shown') && shownText.startsWith('■ 목록 3건'), shownText.slice(0, 80));
  // 결과가 5만 자를 넘지 않게 스스로 줄이기 + 첨부 전체 목록(showFiles) — 2026-09-29 실사용 결함(10.7만 자 → get_page_text 5만 자 잘림)
  await DR.report([['가나다']]);   // 작은 결과는 그대로(줄임 없음·첨부 이름 전부)
  ok('dooray report: 작은 결과는 줄이지 않음(머리줄 ※ 줄임 없음·첨부 이름 전부)', !/줄임/.test(shownText) && DR.last().reduced === false && shownText.includes('첨부(2): 보고서_초안.hwp (4KB, 김키키, 2026-09-02, 본문) / 보고서_수정.docx'), shownText.slice(0, 200));
  dmode = 'big';
  const rb = await DR.report([['큰']]), bigText = shownText;
  ok('dooray report: 첨부·댓글이 아주 많아도 4.5만 자 안 + 줄였다는 머리줄 + 잘린 첨부는 showFiles 안내', bigText.length <= 45000 && rb.reduced === true && rb.chars === bigText.length && /※ 글이 4\.5만 자.*줄임/.test(bigText) && /… 외 \d+개 \(전체 목록: showFiles\(\d+\)\)/.test(bigText), bigText.length + ' ' + bigText.slice(0, 200));
  dmode = 'bigger';
  const rg = await DR.report([['큰']]), hugeText = shownText;
  ok('dooray report: 업무 150건·첨부 수백 개도 끝까지 안(뒤쪽 업무는 줄만·업무 80줄까지) + 머리줄에 몇 건만 읽었는지', hugeText.length <= 49000 && rg.reduced === true && /본문·댓글·첨부는 앞 \d+건만/.test(hugeText) && /… 외 업무 \d+건/.test(hugeText) && hugeText.includes('(글이 길어 본문·댓글·첨부는 생략'), hugeText.length + ' ' + hugeText.slice(0, 260));
  const sf0 = DR.showFiles(0), sfLines = shownText.split('\n');
  const nAll0 = DR.filesOf(DR.last().tasks.items[0]).length;
  ok('dooray showFiles(k): 그 업무 첨부 전부(본문 120 + 댓글 60)·업무 머리줄·오래된 순', sf0.startsWith('shown') && nAll0 === 180 && sfLines[0].startsWith('■ 첨부 파일 180개 · 읽은 업무 1건') && /^\[T0\] 2026-09-20 \| .+ #100 \| 큰 업무 0 /.test(sfLines[2]) && sfLines.length === 2 + 1 + 180 && sfLines[3].includes('| 2026-08-01 |'), sfLines.slice(0, 5).join(' // '));
  DR.showFiles('all', { name: '_v1\\d\\.', ext: 'hwp' });
  ok('dooray showFiles(all, 이름·확장자): 조건에 맞는 것만 + 읽지 않은 업무 알림', /^■ 첨부 파일 90개 · 읽은 업무 30건 \| 조건 name _v1\\d\\., ext hwp/.test(shownText) && shownText.includes('※ 첨부를 읽지 않은 업무 120건') && shownText.split('\n').filter(s => /^ {3}\S/.test(s)).every(s => /_v1\d\.hwp \|/.test(s)), shownText.split('\n').slice(0, 4).join(' // '));
  DR.showFiles(0, { by: '김키키', ids: true });
  ok('dooray showFiles: 올린 사람 조건·받기용 id', /^■ 첨부 파일 60개/.test(shownText) && shownText.split('\n').filter(s => /^ {3}\S/.test(s)).every(s => / \| 김키키 \| .* \| id BF\d+$/.test(s)), shownText.split('\n').slice(0, 4).join(' // '));
  const expSince = DR.filesOf(DR.last().tasks.items[0]).filter(f => f.created >= '2026-08-20').length;
  DR.showFiles(0, { since: '2026-08-20' });
  ok('dooray showFiles: 올린 날 조건(since)', new RegExp('^■ 첨부 파일 ' + expSince + '개').test(shownText) && expSince > 0 && expSince < 180, shownText.split('\n')[0] + ' exp ' + expSince);
  DR.showFiles(0, { sort: 'new' });
  const nl = shownText.split('\n').filter(s => /^ {3}\S/.test(s)), dOf = (s) => s.split(' | ')[3];
  ok('dooray showFiles: 최신순', shownText.split('\n')[0].endsWith('| 최신순') && dOf(nl[0]) >= dOf(nl[nl.length - 1]) && dOf(nl[0]) !== dOf(nl[nl.length - 1]), nl[0] + ' // ' + nl[nl.length - 1]);
  ok('dooray showFiles: 없는 번호는 ERR(빈 목록 아님)', DR.showFiles(999).startsWith('shown') && shownText.startsWith('ERR 파일을 볼 업무가 없습니다'), shownText.slice(0, 80));
  dmode = 'ok';
  // 잘림: 전체 250 중 maxPages 1 → ⚠ 잘림
  dmode = 'many'; const mt = await DR.searchTasks(['보고서'], { maxPages: 1 });
  ok('dooray 상한 도달 → truncated + ⚠ 잘림', mt.truncated === true && DR.fmtTasks(mt).includes('⚠ 잘림(전체 250 중 100'), DR.fmtTasks(mt).split('\n')[0]);
  const ft60 = DR.fmtTasks(mt, 0, 60), lk60 = DR.fmtLinks(mt, 0, 60);
  ok('dooray 100건 목록·링크 → 1,000자 안 + 다음 조각', ft60.length <= 1000 && /▶ 다음 조각 \d+/.test(ft60) && lk60.length <= 1000 && /▶ 다음 조각 \d+/.test(lk60), ft60.length + ' ' + lk60.length);
  // 실패 경로: 로그인 풀림·권한·API 거절이 '0건'으로 보이지 않는다
  dmode = 'html'; window.__d = null; DR.find('보고서').then(r => window.__d = r, e => window.__d = { error: String(e) }); await tick(100);
  const fh = DR.fmtFind(window.__d);
  ok('dooray HTML → 업무·드라이브 모두 ERR DOORAY 로그인', fh.includes('업무 ERR · 드라이브 ERR') && fh.includes('⚠ 업무: 보고서: DOORAY: 응답이 JSON 이 아닙니다') && fh.includes('⚠ 드라이브: 보고서: DOORAY:'), fh);
  dmode = '401'; const t401 = await DR.searchTasksMany([['x']]);
  ok('dooray 401 → ERR 권한 없음', DR.fmtTasks(t401).startsWith('ERR x: DOORAY: 권한 없음(HTTP 401)'), DR.fmtTasks(t401));
  dmode = 'reject'; const trj = await DR.searchTasks('x'), drj = await DR.searchDrive('x');
  ok('dooray API 거절 → ERR(0건 아님)', DR.fmtTasks(trj).startsWith('ERR DOORAY 업무 검색 실패: not allowed') && DR.fmtDrive(drj).startsWith('ERR DOORAY 드라이브 검색 실패: not allowed'), DR.fmtTasks(trj) + ' / ' + DR.fmtDrive(drj));
  dmode = 'driveReject'; window.__d = null; await DR.find('보고서').then(r => window.__d = r);
  const fpart = DR.fmtFind(window.__d);
  ok('dooray 드라이브만 실패 → 업무는 보이고 ⚠ 드라이브', fpart.includes('업무 2건 · 드라이브 ERR') && fpart.includes('⚠ 드라이브: 보고서: DOORAY 드라이브 검색 실패'), fpart);
  ok('dooray null·{error} → 결과 없음 / ERR', DR.fmtFind(null).startsWith('(결과 없음') && DR.fmtTasks({ error: 'x' }) === 'ERR x' && DR.fmtText({ error: 'y', name: 'a.hwp' }) === 'ERR a.hwp: y' && DR.find([]).then && true);
  // 파일 내용 읽기 — 합성 파일
  const hw = await DR.readBytes('보고서.hwp', hwpOf(1));
  ok('dooray hwp(압축): 문단·탭·확장 제어 건너뜀·긴 레코드', hw.fmt === 'hwp' && hw.text.split('\n')[0] === '시험 문단 R&D 가나다' && hw.text.split('\n')[1] === 'A B표안글' && hw.text.split('\n')[2].length === 2100 && !/[\u0000-\u0008]/.test(hw.text), JSON.stringify(hw.text.slice(0, 40)));
  const hjk = await DR.readBytes('끝쓰레기.hwp', hwpOf(1, true, 16)), hbad = await DR.readBytes('손상.hwp', hwpOf(1, true, 0, Buffer.from('압축이 아닌 바이트 xxxxxxxxxxxxxxxx'))).then(() => 'no error', e => String(e));
  ok('dooray hwp: 압축 끝 뒤 남는 바이트는 무시하고 온전히 읽음 / 진짜 손상은 압축 풀기 실패(엉뚱한 Failed to fetch 아님)', hjk.text.split('\n')[0] === '시험 문단 R&D 가나다' && hjk.text.split('\n')[2].length === 2100 && /압축 풀기 실패/.test(hbad) && !/Failed to fetch/.test(hbad), JSON.stringify([hjk.text.slice(0, 20), hbad]));
  // 순수 JS inflate(끝 뒤 바이트가 있을 때 쓰는 길): 저장·고정·동적 블록, 끝 뒤 바이트 무시, 잘린 데이터는 오류
  const plain = Buffer.from(Array.from({ length: 4000 }, (_, i) => '문단 ' + i + ' 전압 ' + (i * 7919 % 1000) + ' FDCA\n').join(''), 'utf8');
  const eqB = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const junk8 = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  ok('dooray inflateJS: 저장(0)·고정(작은 글)·동적(큰 글) 블록 + 끝 뒤 바이트 무시', eqB(DR._inflate(Buffer.concat([zlib.deflateRawSync(plain, { level: 0 }), junk8])), plain) && eqB(DR._inflate(zlib.deflateRawSync(Buffer.from('가나다 abc'))), Buffer.from('가나다 abc'))
    && eqB(DR._inflate(Buffer.concat([zlib.deflateRawSync(plain, { level: 9 }), junk8])), plain));
  let trunc = ''; try { DR._inflate(zlib.deflateRawSync(plain).subarray(0, 500)); } catch (e) { trunc = String(e); }
  ok('dooray inflateJS: 잘린 압축은 오류(조용히 일부만 돌려주지 않음)', /압축 풀기 실패: 압축 데이터가 중간에 끝남/.test(trunc), trunc);
  // Chrome 처럼 '끝 뒤 쓰레기' 오류를 내며 출력을 버리는 압축 해제기를 흉내 → 순수 JS 로 다시 풀어 전부 읽는다(2026-09-29 실제 48MB 최종보고서가 37.6만 중 13.1만 바이트만 읽히던 결함)
  const RealDS = global.DecompressionStream;
  global.DecompressionStream = class { constructor() { const ts = new TransformStream({ transform(chunk, ctl) { ctl.error(new TypeError('Junk found after end of compressed data.')); } }); this.readable = ts.readable; this.writable = ts.writable; } };
  let hfb; try { hfb = await DR.readBytes('끝쓰레기2.hwp', hwpOf(1, true, 8)); } finally { global.DecompressionStream = RealDS; }
  ok('dooray hwp: 압축 해제기가 끝 뒤 바이트 오류로 출력을 버려도 순수 JS 로 전부 읽음', hfb && hfb.text.split('\n')[0] === '시험 문단 R&D 가나다' && hfb.text.split('\n')[2].length === 2100, JSON.stringify(hfb && hfb.text.slice(0, 30)));
  const hu = await DR.readBytes('a.hwp', hwpOf(0)), hd = await DR.readBytes('b.hwp', hwpOf(5, false)), he = await DR.readBytes('c.hwp', hwpOf(3));
  ok('dooray hwp: 비압축 / 배포용 → 미리보기 글 / 암호 → 미지원', hu.text.startsWith('시험 문단') && hd.text === '미리보기 글' && /배포용/.test(hd.note) && he.unsupported && /암호/.test(he.reason), JSON.stringify([hu.text.slice(0, 5), hd.text, hd.note, he.reason]));
  const W_ = (b) => '<w:document><w:body>' + b + '</w:body></w:document>';
  const dx = await DR.readBytes('계획.docx', makeZip({ 'word/document.xml': W_('<w:p><w:r><w:t>R&amp;D 계획</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">표 </w:t></w:r><w:r><w:tab/><w:t>칸</w:t></w:r></w:p></w:tc></w:tr></w:tbl>') }));
  ok('dooray docx: 문단·표·XML 문자 참조', dx.text === 'R&D 계획\n표 칸', JSON.stringify(dx.text));
  const px = await DR.readBytes('발표.pptx', makeZip({ 'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>', 'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>', 'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>첫파일</a:t></a:r></a:p></p:sld>', 'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>둘째파일</a:t></a:r></a:p><a:p><a:r><a:t>Cu</a:t></a:r></a:p></p:sld>', 'ppt/slides/_rels/slide2.xml.rels': '<Relationships><Relationship Id="rId1" Target="../notesSlides/notesSlide1.xml"/></Relationships>', 'ppt/notesSlides/notesSlide1.xml': '<p:notes><a:p><a:r><a:t>메모 내용</a:t></a:r></a:p><a:p><a:r><a:t>2</a:t></a:r></a:p></p:notes>' }), { notes: true });
  ok('dooray pptx: 발표 순서(presentation.xml)·메모', px.text === '[슬라이드 1] 둘째파일 / Cu (메모: 메모 내용)\n[슬라이드 2] 첫파일' && px.parts === '슬라이드 2', JSON.stringify(px.text));
  const xx = await DR.readBytes('표.xlsx', makeZip({ 'xl/workbook.xml': '<workbook><sheets><sheet name="예산" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst><si><t>재료비</t></si><si><r><t>여</t></r><r><t>비</t></r></si></sst>', 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1500</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="inlineStr"><is><t>없음</t></is></c><c r="C2" s="1"/></row></sheetData></worksheet>' }));
  ok('dooray xlsx: 시트·공유 문자열·인라인 글자·숫자', xx.text === '[시트 예산]\n재료비 | 1500\n여비 | 없음', JSON.stringify(xx.text));
  const hx = await DR.readBytes('회의.hwpx', makeZip({ 'Contents/section0.xml': '<hs:sec><hp:p><hp:run><hp:t>회의 목적</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>첫 줄<hp:lineBreak/>둘째 줄</hp:t></hp:run></hp:p></hs:sec>' }));
  ok('dooray hwpx: 문단·글 안 줄바꿈 요소', hx.text === '회의 목적\n첫 줄 둘째 줄', JSON.stringify(hx.text));
  const pd = await DR.readBytes('논문.pdf', new Uint8Array(Buffer.from('%PDF-1.7')));
  ok('dooray pdf → 미지원 안내(오류 아님)', pd.unsupported && /PDF/.test(pd.reason) && DR.fmtText(Object.assign({ name: '논문.pdf' }, pd)).startsWith('읽기 미지원 논문.pdf'), JSON.stringify(pd));
  // readFile: 크기 한도·로그인 화면·정상 받기
  global.fetch = async (url) => url === '/files/HTML' ? { ok: true, status: 200, arrayBuffer: async () => Buffer.from('<!DOCTYPE html><html>login</html>') } : { ok: true, status: 200, arrayBuffer: async () => Buffer.from(hwpOf(1)) };
  const big1 = await DR.readFile({ name: '큰.hwp', size: 90 * 1048576, dl: '/files/X' }), lg = await DR.readFile({ name: 'a.hwp', size: 10, dl: '/files/HTML' }), okf = await DR.readFile({ name: '보고서_초안.hwp', size: 4096, dl: '/files/F1' });
  ok('dooray readFile: 한도 초과 거부·로그인 화면 감지·정상', /기본 한도 30MB 초과/.test(big1.error) && /웹 화면이 왔습니다/.test(lg.error) && okf.fmt === 'hwp' && okf.textLen > 2000, JSON.stringify([big1.error, lg.error, okf.fmt]));
  // 첨부 id 표시(받기 명령에 그대로) + 토큰 없을 때 브라우저 받기(한 파일, 다운로드 폴더)
  ok('dooray fmtFiles {ids:true} → 줄 끝 첨부 id', /보고서_초안\.hwp .*\| id F1$/m.test(DR.fmtFiles(t1, 0, 15, { ids: true })) && !/\| id F1/.test(DR.fmtFiles(t1)), DR.fmtFiles(t1, 0, 15, { ids: true }));
  clicked = [];
  global.fetch = async (url) => url === '/files/LOGIN' ? { ok: true, status: 200, blob: async () => ({ type: 'text/html', size: 30 }) } : { ok: true, status: 200, blob: async () => ({ type: 'application/octet-stream', size: 5 }) };
  const sv = await DR.saveFile({ name: '보고서_초안.hwp', size: 5, dl: '/files/F1' }), sl = await DR.saveFile({ name: 'a.hwp', size: 5, dl: '/files/LOGIN' }), sb = await DR.saveFile({ name: 'big.zip', size: 500 * 1048576, dl: '/files/B' });
  ok('dooray saveFile: 받기 1회(파일 이름)·로그인 화면 거부·한도 초과 거부', clicked.length === 1 && clicked[0] === '보고서_초안.hwp' && DR.fmtSaved(sv).startsWith('받기 요청됨 보고서_초안.hwp') && /웹 화면/.test(sl.error) && /한도 200MB 초과/.test(sb.error) && DR.fmtSaved(sl).startsWith('ERR a.hwp'), JSON.stringify([clicked, sv, sl.error, sb.error]));
  const tx = DR.fmtText(okf, 60);
  ok('dooray fmtText 머리줄·조각·= 없음', tx.startsWith('보고서_초안.hwp | hwp | ') && tx.includes('시험 문단 R&D 가나다') && tx.length < 200 && noQ(DR.fmtText({ name: 'q.txt', fmt: 'txt', size: 9, textLen: 20, text: 'size=100&page=0 끝', parts: '' })), tx);

  // ---- 여러 파일 속 찾기(scanFiles) + 찾은 그림 띄우기(showFigures) — 2026-09-29 사용자 지시("스킬로 포함", "찾은 그림·글을 결과에 함께") ----
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const SLD = (body) => `<p:sld><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`, TXT = (t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const PIC = (rid, descr) => `<p:pic><p:nvPicPr><p:cNvPr id="4" name="그림 3" descr="${descr}"/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill></p:pic>`;
  const CHART = '<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Yield vs cell voltage</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>AA</c:v></c:pt></c:strCache></c:strRef></c:tx>'
    + '<c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>1.4 V</c:v></c:pt><c:pt idx="1"><c:v>1.5 V</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>0.1</c:v></c:pt><c:pt idx="1"><c:v>58.5</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart>'
    + '<c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>AA yield (%)</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx></c:plotArea></c:chart></c:chartSpace>';
  const deck = makeZip({
    'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/><Relationship Id="rId3" Target="slides/slide3.xml"/></Relationships>',
    'ppt/slides/slide1.xml': SLD(TXT('전압별 수율 비교') + PIC('rId2', '수율 &lt;그래프&gt;') + PIC('rId3', '')),
    'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Id="rId2" Target="../media/image1.png"/><Relationship Id="rId3" Target="../media/image2.emf"/></Relationships>',
    'ppt/slides/slide2.xml': SLD(TXT('온도 영향') + '<p:graphicFrame><a:graphic><a:graphicData><c:chart xmlns:c="x" r:id="rId4"/></a:graphicData></a:graphic></p:graphicFrame>'),
    'ppt/slides/_rels/slide2.xml.rels': '<Relationships><Relationship Id="rId4" Target="../charts/chart1.xml"/></Relationships>',
    'ppt/charts/chart1.xml': CHART, 'ppt/slides/slide3.xml': SLD(TXT('전압 조건 정리')), 'ppt/media/image1.png': PNG, 'ppt/media/image2.emf': Buffer.from('EMF!'),
  });
  const wdoc = makeZip({
    'word/document.xml': W_('<w:p><w:r><w:t>서론</w:t></w:r></w:p><w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="그림 1" descr="그래프"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:p><w:r><w:t>Figure 2. Yield at each cell voltage</w:t></w:r></w:p>'),
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId5" Target="media/image1.png"/></Relationships>', 'word/media/image1.png': PNG,
  });
  const sItem = (k, name, dl) => ({ kind: 'file', id: String(5200000000000000000n + BigInt(k)), projectId: '3300000000000000009', name, size: 1000, updated: '2026-06-2' + k + 'T10:00:00+09:00', dl, drive: '연구실-공지', path: '/2026/2026-06', by: '김키키', url: 'https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002/views/' + k });
  const SLIST = [sItem(0, '260623 - 발표 <b>.pptx', '/scan/deck'), sItem(1, '원고.docx', '/scan/doc'), sItem(2, '보고서.hwp', '/scan/hwp'), sItem(3, '깨짐.pptx', '/scan/bad'), sItem(4, '논문.pdf', '/scan/pdf'), sItem(5, '로그인.pptx', '/scan/login'), { kind: 'folder', id: '9', projectId: '1', name: '폴더' }];
  const BIN = { '/scan/deck': deck, '/scan/doc': wdoc, '/scan/hwp': hwpOf(1), '/scan/bad': new Uint8Array(Buffer.from('PK 손상된 파일')), '/scan/login': new Uint8Array(Buffer.from('<!DOCTYPE html><html>login</html>')) };
  global.fetch = async (url) => BIN[url] ? { ok: true, status: 200, arrayBuffer: async () => { const u = BIN[url]; return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); } } : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  global.location = { pathname: '/robots.txt' };
  const sc1 = await DR.scanFiles(SLIST, /전압|voltage/i, { figures: true }), st1 = shownText;
  ok('dooray scanFiles(figures): 그림 슬라이드·차트 제목·그림 뒤 설명 문단으로 찾고 그림 없는 슬라이드는 뺌', sc1.hits === 3 && st1.startsWith('■ 파일 속 찾기 — /전압|voltage/i | 파일 5개: 걸린 파일 2 · 없음 1 · 못 읽음 2 | 그림·차트·표 있는 곳만')
    && st1.includes('== [F0] 2026-06-20 | 260623 - 발표 <b>.pptx') && st1.includes('  S1 [그림2] 전압별 수율 비교 {그림 설명 수율 <그래프>}')
    && st1.includes('  S2 [그림0 차트1] 온도 영향 {차트(bar) "Yield vs cell voltage" 축 AA yield (%) 계열 AA[1.4 V,1.5 V]}') && !/\n  S3 /.test(st1)
    && st1.includes('== [F1]') && /\n  ¶2 \[그림1\] \{그림 설명 그래프\} \{다음 문단 Figure 2\. Yield at each cell voltage\}/.test(st1), st1.slice(0, 900));
  ok('dooray scanFiles: 못 읽은 파일은 없음이 아니라 ⚠ 로(손상·로그인 화면) + 안 본 형식·그림 위치 모르는 형식 알림 + 걸린 곳 없는 파일', st1.includes('⚠ 못 읽음(없음이 아님): [F3] 깨짐.pptx — 읽기 실패: ZIP 끝 표시를 못 찾음') && st1.includes('[F5] 로그인.pptx — DOORAY: 파일 대신 웹 화면이 왔습니다')
    && st1.includes('※ 읽을 수 없는 형식 1개(안 봄): 논문.pdf(PDF 는 브라우저 안 글 추출 미지원)') && st1.includes('※ 그림 위치를 알 수 없는 형식(hwp·xlsx·글 파일) 1개는 figures:true 에서 걸리지 않음') && st1.includes('■ 걸린 곳 없음 1개: [F2] 보고서.hwp') && DR.scanned().files.length === 5, st1);
  const sc2 = await DR.scanFiles(SLIST, ['전압', 'VOLTAGE']), st2 = shownText;
  ok('dooray scanFiles(글 배열 = 하나라도, 대소문자 무시): 그림 없는 슬라이드·설명 문단도', sc2.hits === 5 && /\n  S3 \[그림0\] 전압 조건 정리/.test(st2) && /\n  ¶3 \[그림0\] Figure 2\. Yield at each cell voltage/.test(st2), st2.slice(0, 600));
  const sc3 = await DR.scanFiles(SLIST, '가나다', { ext: 'hwp' }), st3 = shownText;
  ok('dooray scanFiles(ext hwp): 한글 문단 — 그림 위치를 모르는 형식은 [그림0] 표시 안 함', sc3.hits === 1 && /파일 1개: 걸린 파일 1 · 없음 0/.test(st3) && /\n  ¶1 시험 문단 R&D 가나다/.test(st3), st3);
  ok('dooray scanFiles: 찾을 말 없으면 ERR', (await DR.scanFiles(SLIST, '')).summary === 'ERR 찾을 말이 없습니다');
  const fr = await DR.showFigures([[0, [1, 2], '전압별 수율'], [1, [2]], [0, [9]], [99, [1]]], { title: '시험 결과' }), FH = document.body.innerHTML;
  ok('dooray showFigures: 파일마다 한 묶음(이름·링크 한 번) 아래 그림(원본)·차트 값 표·설명, 이름·설명은 글자로(HTML 아님)', fr === 'shown 3 units, 2 images' && FH.includes('<h2>시험 결과</h2>') && FH.includes('<h3>① 260623 - 발표 &lt;b&gt;.pptx</h3>') && FH.includes('<h4>슬라이드 1</h4>') && !FH.includes('<b>.pptx')
    && FH.includes('<div class="memo">전압별 수율</div>') && (FH.match(/<img src="blob:x"/g) || []).length === 2 && FH.includes('alt="수율 &lt;그래프&gt;"') && FH.includes('[emf 그림 — 브라우저에서 표시 못 함]')
    && FH.includes('<td>58.5</td>') && FH.indexOf('<h4>슬라이드 2</h4>') > FH.indexOf('<h4>슬라이드 1</h4>') && FH.indexOf('<h4>슬라이드 2</h4>') < FH.indexOf('<h3>② 원고.docx</h3>') && FH.includes('<h4>문단 2</h4>') && FH.includes('— S9 없음(전체 3슬라이드)') && FH.includes('ERR 파일 번호 99')
    && (FH.match(/>Dooray 에서 열기/g) || []).length === 3 && FH.includes('href="https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000002/views/0" target="_blank">Dooray 에서 열기') && document.title === '👉 kk-dry 결과 — 3곳' && !FH.includes('kkwait'), fr + ' // ' + document.title + ' // ' + FH.slice(0, 400));
  // 모든 슬라이드에 되풀이되는 로고는 빼고, 한 슬라이드에 같은 그림을 두 번 쓴 것은 한 번만
  const LOGO = PIC('rId9', '로고'), sl5 = {};
  for (let i = 1; i <= 5; i++) { sl5[`ppt/slides/slide${i}.xml`] = SLD(TXT('쪽 ' + i) + LOGO + (i === 3 ? PIC('rId2', '') + PIC('rId2', '') : '')); sl5[`ppt/slides/_rels/slide${i}.xml.rels`] = '<Relationships><Relationship Id="rId9" Target="../media/logo.png"/><Relationship Id="rId2" Target="../media/g.png"/></Relationships>'; }
  BIN['/scan/deck2'] = makeZip(Object.assign({ 'ppt/presentation.xml': '<p:presentation><p:sldIdLst>' + [1, 2, 3, 4, 5].map(i => `<p:sldId id="${255 + i}" r:id="rId${i}"/>`).join('') + '</p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships>' + [1, 2, 3, 4, 5].map(i => `<Relationship Id="rId${i}" Target="slides/slide${i}.xml"/>`).join('') + '</Relationships>', 'ppt/media/logo.png': PNG, 'ppt/media/g.png': PNG }, sl5));
  const fr2 = await DR.showFigures([[{ kind: 'file', name: '로고.pptx', size: 10, dl: '/scan/deck2', url: 'u' }, [3]]]), FH2 = document.body.innerHTML;
  ok('dooray showFigures: 되풀이 로고 생략 + 같은 그림 두 번은 한 번만', fr2 === 'shown 1 units, 1 images' && (FH2.match(/<img /g) || []).length === 1 && FH2.includes('[여러 슬라이드에 되풀이되는 로고·장식 그림 1개 생략]'), fr2 + ' // ' + FH2.slice(-300));
  global.location = { pathname: '/task/to' };
  ok('dooray showFigures: 작업 탭이 아니면 거부(쓰던 화면 보호)', (await DR.showFigures([[0, [1]]])).startsWith('ERR 작업 탭'));
  global.location = { pathname: '/robots.txt' };
  const hxu = await DR.unitsOf('보고.hwpx', makeZip({ 'Contents/content.hpf': '<opf:package><opf:manifest><opf:item id="image1" href="BinData/image1.png" media-type="image/png"/></opf:manifest></opf:package>',
    'Contents/section0.xml': '<hs:sec><hp:p><hp:run><hp:pic id="1"><hc:img binaryItemIDRef="image1"/></hp:pic></hp:run></hp:p><hp:p><hp:run><hp:t>그림 1. 전압별 수율</hp:t></hp:run></hp:p></hs:sec>', 'BinData/image1.png': PNG }));
  // 업무 첨부 훑기: 업무 목록 → 그 첨부(본문·댓글), 같은 이름·크기 첨부는 한 번, 이름으로 좁히기, 첨부를 안 읽은 업무는 알림, 링크·결과 화면에 그 업무
  const TKI = (id, subject, files) => ({ kind: 'task', id, projectId: '3300000000000000001', subject, url: 'https://kist.gov-dooray.com/task/3300000000000000001/' + id, detail: files ? { text: '', textLen: 0, fileList: files, comments: [], commentTotal: 0 } : undefined });
  const ATT = (name, dl, id) => ({ name, size: 1000, ext: name.split('.').pop(), created: '2026-06-01T10:00:00+09:00', by: '이키키', dl, id });
  const tA = TKI('4100000000000000011', '발표 자료 공유', [ATT('260623 - 발표 <b>.pptx', '/scan/deck', 'A1'), ATT('260623 - 발표 <b>.pptx', '/scan/deck', 'A2'), ATT('원고.docx', '/scan/doc', 'A3')]), tB = TKI('4100000000000000012', '안 읽은 업무', null);
  const sct = await DR.scanFiles([tA, tB], /전압|voltage/i, { name: /발표/ }), stt = shownText;
  ok('dooray scanFiles(업무 목록 → 첨부): 같은 첨부 한 번·이름으로 좁히기·안 읽은 업무 알림·업무 링크', sct.hits === 3 && /파일 1개: 걸린 파일 1/.test(stt) && stt.includes('| 업무 발표 자료 공유 |') && stt.includes(' → https://kist.gov-dooray.com/task/3300000000000000001/4100000000000000011')
    && stt.includes('※ 첨부를 읽지 않은 업무 1건은 빠짐') && DR.scanned().list.length === 3 && stt.includes('※ 내용이 똑같은 파일 1개는 한 번만 보임: [F1]=F0'), stt.slice(0, 500));
  await DR.showFigures([[0, [1]]]);
  ok('dooray showFigures(업무 첨부): 결과 화면에 그 업무 제목·업무 링크', document.body.innerHTML.includes('업무 발표 자료 공유') && document.body.innerHTML.includes('href="https://kist.gov-dooray.com/task/3300000000000000001/4100000000000000011"'), document.body.innerHTML.slice(0, 300));
  // Dooray 미리보기(서버 변환 — 업무 첨부의 🔍 버튼과 같은 호출): PDF 첨부는 미리보기 글(쪽 단위)로 훑고, 쪽 그림을 띄우고, pptx 슬라이드·docx 문단도 미리보기 쪽 그림으로
  // 실측 제약 흉내: 미리보기 키는 가장 최근 것 하나만 산다(새 키를 만들면 앞 키는 403 HTML)
  const pvXml = ['<document><page><paragraph><text>표지</text><text> 제목</text></paragraph></page></document>', '<document><page><paragraph><text>셀 전압별</text><text> 수율 비교</text></paragraph><paragraph><text>1.5 V 최대</text></paragraph></page></document>', '<document><page><paragraph><text>Figure 2. Yield at each cell voltage</text></paragraph></page></document>'];
  let pvN = 0, pvLive = '', pvDown = false;
  const thumbs = [], pvReqs = [], baseFetch = global.fetch;
  global.fetch = async (url, o) => {
    const s = String(url);
    if (s.startsWith('/v2/wapi/preview/services/') && pvDown) return { ok: false, status: 503, text: async () => '{}' };
    if (s.startsWith('/v2/wapi/preview/services/')) { pvReqs.push(s); pvN++; pvLive = pvN.toString(16).padStart(32, '0'); return J({ header: { isSuccessful: true }, result: { content: { redirectUrl: '/SynapDocViewServer/viewer/doc.html?key=' + pvLive + '&convType=img' } } }); }
    const ms = /^\/SynapDocViewServer\/(status|thumbnailxml|thumbnail)\/([0-9a-f]+)(?:\/(\d+))?/.exec(s);
    if (ms) {
      if (ms[2] !== pvLive) return { ok: false, status: 403, text: async () => '<!DOCTYPE html><html>403</html>', blob: async () => ({ type: 'text/html', size: 30 }) };
      if (ms[1] === 'status') return { ok: true, status: 200, text: async () => JSON.stringify({ pageNum: 3, format: 'PDF' }) };
      if (ms[1] === 'thumbnailxml') return { ok: true, status: 200, text: async () => pvXml[+ms[3]] };
      thumbs.push(s); return { ok: true, status: 200, blob: async () => ({ type: 'image/png', size: 100 }) };
    }
    return baseFetch(url, o);
  };
  const pvFetch = global.fetch;
  const tP = TKI('4100000000000000021', 'PDF 업무', [ATT('논문.pdf', '/scan/pdf', 'P1'), ATT('부록.pdf', '/scan/pdf2', 'P2')]);
  const scp = await DR.scanFiles([tP], /전압|voltage/i), stp = shownText;
  ok('dooray scanFiles: PDF 업무 첨부는 Dooray 미리보기 글로 쪽 단위로(파일을 받지 않음) — 두 개를 함께 훑어도 키가 서로 막지 않음', scp.hits === 4 && !/못 읽음/.test(stp) && /\n  p2 셀 전압별 수율 비교 \/ 1\.5 V 최대/.test(stp) && /\n  p3 Figure 2\. Yield at each cell voltage/.test(stp) && /\| 쪽 3\(/.test(stp), stp.slice(0, 600));
  const spg = await DR.showPages([[0, [2], '전압별 수율']]), SPH = document.body.innerHTML;
  ok('dooray showPages: 미리보기 쪽 그림(받아 둔 blob)·쪽 글·설명(쪽 번호로)', spg === 'shown 1 units, 1 images' && SPH.includes('<h3>① 논문.pdf</h3>') && SPH.includes('<h4>2쪽</h4>') && SPH.includes('<img src="blob:x"') && thumbs.some(u => /\/1\?dpi=150$/.test(u)) && SPH.includes('셀 전압별 수율 비교 / 1.5 V 최대') && SPH.includes('<div class="memo">전압별 수율</div>'), spg + ' // ' + SPH.slice(0, 600));
  thumbs.length = 0;
  const sfp = await DR.showFigures([[{ kind: 'file', name: '발표.pptx', size: 10, dl: '/scan/deck', url: 'u', taskId: '4100000000000000031', id: 'D1' }, [1]], [{ kind: 'file', name: '원고.docx', size: 10, dl: '/scan/doc', url: 'u', taskId: '4100000000000000032', id: 'W1' }, [2]]]), SFH = document.body.innerHTML;
  ok('dooray showFigures(업무 첨부 둘): pptx 슬라이드 = 미리보기 쪽 그림(EMF 도), docx 문단 → 그 글이 나오는 쪽 — 다음 파일 키가 나와도 앞 그림이 안 깨짐', sfp === 'shown 2 units, 2 images' && (SFH.match(/<img src="blob:x"/g) || []).length === 2 && thumbs.length === 2 && /\/0\?dpi=150$/.test(thumbs[0]) && /\/2\?dpi=150$/.test(thumbs[1]) && SFH.includes('[이 문단이 있는 미리보기 3쪽]') && !SFH.includes('[emf'), sfp + ' // ' + JSON.stringify(thumbs) + ' // ' + SFH.slice(0, 400));
  const sdr = await DR.showPages([[{ kind: 'file', name: '어디서 온지 모름.pptx', size: 10, dl: '/scan/deck', url: 'u', id: 'X9' }, [1]]]);
  ok('dooray showPages: 업무 첨부도 드라이브 파일도 아닌 항목은 ERR 로(빈 화면 아님)', sdr === 'shown 0 units, 0 images' && document.body.innerHTML.includes('Dooray 미리보기를 만들 수 없는 항목'), document.body.innerHTML.slice(-200));
  // 드라이브 파일 미리보기(2026-09-29 실측: 파일 두 번 누르기 → /preview-pages/drives/…) — {드라이브}-{파일}-{version} + 받기 주소(없으면 서버 오류)
  const dItem = { kind: 'file', id: '5100000000000000077', driveId: 'D1', projectId: '3300000000000000009', folderId: '5100000000000000002', version: 2, name: '드라이브 발표.pptx', size: 10, dl: '/scan/deck', url: 'u' };
  pvReqs.length = 0;
  const sdp = await DR.showPages([[dItem, [1], '드라이브 미리보기']]);
  const wantReq = '/v2/wapi/preview/services/drive/files/D1-5100000000000000077-2?convert=external&redirectUrl=' + encodeURIComponent('/preview-pages/drives/D1/5100000000000000077?folderId=5100000000000000002') + '&downloadUrl=' + encodeURIComponent('/drive/v1/downloads/3300000000000000009/5100000000000000077?disposition=attachment&action=download');
  ok('dooray showPages(드라이브 파일): 드라이브 미리보기 주소로 쪽 그림', sdp === 'shown 1 units, 1 images' && pvReqs[0] === wantReq && document.body.innerHTML.includes('<img src="blob:x"'), JSON.stringify(pvReqs) + ' // ' + sdp);
  // ---- quick: 찾기 → 파일 속 찾기 → 파일별 주요 곳(순위) → 결과 화면을 한 번에 + more(다음 순위) + 다시 좁히기(파일을 다시 받지 않음) — 2026-09-29 사용자 요청 ----
  const QC = (id, name, dl, type) => ({ id, driveId: 'QD', projectId: '3300000000000000009', name, type: type || 'file', createdAt: '2026-06-20T10:00:00+09:00', updatedAt: '2026-06-20T10:00:00+09:00', size: 3000, version: 1, createOrganizationMemberId: 'M1', lastUpdateOrganizationMemberId: 'M1', isTrashed: false, downloadUrl: dl });
  const QREFS = { driveMap: { QD: { name: '연구실', projectId: '3300000000000000009', type: 'project' } }, organizationMemberMap: { M1: { name: '박키키' } } };
  BIN['/scan/qdeck'] = deck; BIN['/scan/qdoc'] = wdoc;
  let qDl = 0, qSearch = null, m3fail = false, m3n = 0; const qPaths = [];
  global.fetch = async (url, o) => {
    const s = String(url);
    if (s.startsWith('/v2/wapi/drives/search') && qSearch === 'ERR') return J({ header: { isSuccessful: false, resultMessage: '로그인 필요' } });
    if (s.startsWith('/v2/wapi/drives/search')) return J({ header: { isSuccessful: true }, result: { totalCount: 3, contents: qSearch || [QC('5300000000000000001', '발표.pptx', '/scan/qdeck'), QC('5300000000000000002', '원고.docx', '/scan/qdoc'), QC('5300000000000000003', '자료', '', 'folder')], references: QREFS } });
    if (s.startsWith('/v2/wapi/drives/QD/files/')) { qPaths.push(s); return J({ header: { isSuccessful: true }, result: { content: { parentFile: { id: '5100000000000000005', path: 'root/2026/발표' } } } }); }
    if (s.startsWith('/scan/q')) qDl++;
    if (s === '/scan/m3deck' && m3fail && ++m3n > 1) return { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) };
    return pvFetch(url, o);
  };
  thumbs.length = 0;
  ok('dooray quick: 찾을 말(q) 없으면 ERR', (await DR.quick({ find: [['발표']] })).summary.startsWith('ERR 파일 속 찾을 말'));
  const qk = await DR.quick({ find: [['발표'], ['원고']], tasks: false, q: /전압|voltage/i, top: 2, title: '시험 quick' }), QH = document.body.innerHTML;
  // 발표(pptx) = Chrome 화면: S1(그림+제목 줄) > S2(차트 — 값 '1.4 V' 숫자·단위 +1) = S3(제목 줄) → 위 2곳 S1·S2 / 원고(docx) = 채팅 글: ¶3(그림 설명, 바로 위 ¶2 그림) 한 곳
  ok('dooray quick: 한 번에 찾기·훑기 — 슬라이드는 Chrome 화면(미리보기 쪽 그림), 워드 문서는 채팅 글 · 파일은 한 번씩만 받음', /^■ kk-dry quick — 읽은 파일 2 · 걸린 2 · Chrome 화면 파일 1개 2곳 · 채팅 글 파일 1개 1곳 \| shown 2 units, 2 images/.test(qk.summary) && qDl === 2 && thumbs.length === 2
    && QH.includes('<h2>시험 quick</h2>') && QH.includes('<h3>① 발표.pptx <span class="meta">— 걸린 곳 3 · 보인 곳 S1 S2</span></h3>') && QH.indexOf('<h4>슬라이드 1</h4>') < QH.indexOf('<h4>슬라이드 2</h4>') && !QH.includes('<h4>슬라이드 3</h4>')
    && !QH.includes('<h3>② 원고.docx') && (QH.match(/<img src="blob:x"/g) || []).length === 2 && !QH.includes('kkwait') && document.title === '👉 kk-dry 결과 — 2곳'
    && QH.includes('<h3>■ 글 결과</h3>') && QH.includes('② [F1] 원고.docx | 2026-06-20 | 걸린 곳 2 · 보인 곳 ¶3 · 남은 0 | 연구실 /2026/발표 | 박키키') && QH.includes('   ▸ ¶3 [바로 위 그림 1 — ¶2, 보려면 그림으로]: Figure 2. Yield at each cell voltage')
    && QH.includes('문서(한글·워드·엑셀·PDF 등)에서 찾은 글·표는 <b>대화창</b>에') && !QH.includes('Claude'), qk.summary + ' // ' + qDl + ' // ' + JSON.stringify(thumbs) + ' // ' + document.title + ' // ' + QH.slice(QH.indexOf('<h3>■ 글'), QH.indexOf('<h3>■ 글') + 600));
  ok('dooray quick: 걸린 드라이브 파일의 폴더 경로를 채워 파일이 선택된 채 열리는 링크 + 끝에 ■ 파일 목록(이름과 주소 한 줄·보인 곳·어디에·남은 곳·시간)', qPaths.length === 2
    && QH.includes('href="https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000005/views/5300000000000000001"') && QH.includes('<h3>■ 파일 목록</h3>')
    && QH.includes('① [F0] 2026-06-20 | 발표.pptx | 걸린 곳 3 · 보인 곳 S1 S2 (Chrome 화면) · 남은 1 | 연구실 /2026/발표 | 박키키 → https://kist.gov-dooray.com/drive/3300000000000000009/5100000000000000005/views/5300000000000000001')
    && QH.includes('② [F1] 2026-06-20 | 원고.docx | 걸린 곳 2 · 보인 곳 ¶3 (채팅 글) · 남은 0') && QH.indexOf('<h3>■ 글 결과</h3>') < QH.indexOf('<h3>■ 파일 목록</h3>')
    && /읽은 파일 2 · 걸린 2 · 없음 0 \| 찾기 \d+\.\d초 · 파일 속 \d+\.\d초 · 그림 \d+\.\d초 · 합계/.test(QH), QH.slice(QH.indexOf('<h3>■ 파일'), QH.indexOf('<h3>■ 파일') + 700));
  { // done: 도는 quick 이 끝나면 바로 같은 요약(고정 대기 없이) · 결과 화면 카드에 파일 id·곳 번호(goto 스크롤용) · goto 없는 번호는 ERR
    const dn = await DR.done(5);
    ok('dooray done: 끝난 quick 의 요약을 바로 · 카드에 data-id·data-n · goto 없는 번호 ERR', dn === qk.summary && QH.includes('<section class="file" data-id="5300000000000000001">') && QH.includes('<div class="unit" data-n="1">')
      && DR.goto(99).startsWith('ERR 결과에 그 파일이 없습니다'), dn + ' // ' + DR.goto(99)); }
  ok('dooray 결과 화면 여백: 파일 카드(테두리·아래 여백)·곳마다 점선·목록은 항목마다 칸', /section\{border:1px solid [^}]*margin:0 0 28px/.test(QH) && QH.includes('.unit{margin-top:18px')
    && QH.includes('<h3>■ 파일 목록</h3><div class="blks"><div class="blk') && !QH.includes('<pre>'), QH.slice(QH.indexOf('<h3>■ 파일'), QH.indexOf('<h3>■ 파일') + 200));
  { const T = '머리 줄\n⚠ 경고\n\n[T0] 업무 가\n  본문\n\n[T1] 업무 나\n     https://x\n■ 드라이브\n[F0] 파일'; DR.show(T);
    ok('dooray show 칸 나누기: 글(textContent)은 원래와 한 글자도 같음', shownText === T, JSON.stringify(shownText)); }
  const mo = await DR.more(), MH = document.body.innerHTML;
  ok('dooray more: 다음 순위 곳만(발표 S3) — 파일은 다시 받지 않음', /^■ kk-dry more — .* Chrome 화면 파일 1개 1곳 · 채팅 글 파일 0개 0곳 \| shown 1 units, 1 images/.test(mo.summary) && qDl === 2 && MH.includes('<h4>슬라이드 3</h4>') && !MH.includes('<h4>슬라이드 1</h4>')
    && MH.includes('이번 S3 (Chrome 화면) · 남은 0') && document.title === '👉 kk-dry 결과 — 1곳', mo.summary + ' // ' + MH.slice(MH.indexOf('<h3>'), MH.indexOf('<h3>') + 300));
  ok('dooray more: 다 보였으면 알림(ERR 아님) · 걸린 파일이 아닌 번호는 ERR', (await DR.more()).summary.startsWith('더 보일 곳이 없습니다') && (await DR.more(7)).summary.startsWith('ERR 그 F번호'));
  const qr = await DR.quick({ q: /온도/ }), RH = document.body.innerHTML;
  ok('dooray quick 다시 좁히기(find 없이): 들고 있는 파일 글로 — 파일 받기·경로 조회 없음', /걸린 1 · Chrome 화면 파일 1개 1곳/.test(qr.summary) && qDl === 2 && qPaths.length === 2 && RH.includes('<h4>슬라이드 2</h4>') && RH.includes('<h2>kk-dry 결과 — &#39;온도&#39; 파일 속 찾기</h2>'), qr.summary + ' // ' + RH.slice(0, 300));
  const thN = thumbs.length, qc = await DR.quick({ q: /Figure/ }), CH = document.body.innerHTML;
  ok('dooray quick: 글 위주 문서만 걸리면 Chrome 결과 화면을 만들지 않음(미리보기·그림 없음, 탭 제목 조용히) — 글은 ■ 글 결과로 채팅에', /Chrome 화면 파일 0개 0곳 · 채팅 글 파일 1개 1곳 \| shown 0 units/.test(qc.summary) && thumbs.length === thN && qDl === 2
    && document.title === 'kk-dry 작업 — 글 결과 1곳(채팅에)' && !CH.includes('<img') && CH.includes('▸ ¶3 [바로 위 그림 1 — ¶2, 보려면 그림으로]: Figure 2.') && CH.includes('찾은 글·표는 <b>대화창</b>에 보여 드립니다'), qc.summary + ' // ' + document.title + ' // ' + CH.slice(-500));
  const qn = await DR.quick({ q: { all: [/전압/, /없는말/] } }), NH = document.body.innerHTML;
  ok('dooray quick: 걸린 곳이 없으면 그렇게 적은 화면(탭 제목 조용히) + 걸린 곳 없는 파일 목록', /걸린 0 · Chrome 화면 파일 0개 0곳 · 채팅 글 파일 0개 0곳 \| shown 0 units/.test(qn.summary) && NH.includes('찾을 말이 나오는 곳이 없습니다') && NH.includes('— 걸린 곳 없음 2개: 발표.pptx · 원고.docx') && document.title === 'kk-dry 작업 — 0곳', qn.summary + ' // ' + NH.slice(-400));
  // 표 — 워드·한글(hwpx·hwp)·엑셀의 표는 칸 구조를 살려 채팅 표(| 칸 |)로. 찾을 말이 든 칸은 굵게, 큰 표는 머리 행 + 걸린 행 둘레
  const TR = (cells) => '<w:tr>' + cells.map(c => `<w:tc><w:tcPr/><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`).join('') + '</w:tr>';
  const wtab = makeZip({ 'word/document.xml': W_('<w:p><w:r><w:t>표 1. 조건별 결과</w:t></w:r></w:p><w:tbl><w:tblPr/>' + TR(['구분', '2024', '2025']) + TR(['FDCA 수율', '80 %', '92 %']) + TR(['셀 전압', '1.4 V', '1.5 V']) + '</w:tbl><w:p><w:r><w:t>표 뒤 문단</w:t></w:r></w:p>') });
  const tu = await DR.unitsOf('결과.docx', wtab);
  ok('dooray docx 표: 칸 문단에 표 번호·행·열, 표마다 칸 글', tu.units.length === 11 && tu.units[0].tb == null && tu.units[4].text === 'FDCA 수율' && tu.units[4].tb === 0 && JSON.stringify(tu.units[4].rc) === '[1,0]' && tu.units[10].tb == null
    && JSON.stringify(tu.tables[0].rows) === JSON.stringify([['구분', '2024', '2025'], ['FDCA 수율', '80 %', '92 %'], ['셀 전압', '1.4 V', '1.5 V']]), JSON.stringify([tu.units.map(u => [u.n, u.text, u.tb, u.rc]), tu.tables]));
  const HP = (t) => `<hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p>`, HC = (t, r, c, rs) => `<hp:tc name=""><hp:subList>${HP(t)}</hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="${rs || 1}"/></hp:tc>`;
  const htu = await DR.unitsOf('보고.hwpx', makeZip({ 'Contents/content.hpf': '<opf:package/>', 'Contents/section0.xml': '<hs:sec>' + HP('표 앞') + '<hp:p><hp:run><hp:tbl id="1"><hp:tr>' + HC('항목', 0, 0) + HC('값', 0, 1) + '</hp:tr><hp:tr>' + HC('수율', 1, 0) + HC('92', 1, 1) + '</hp:tr></hp:tbl></hp:run></hp:p>' + HP('표 뒤') + '</hs:sec>' }));
  ok('dooray hwpx 표: 칸 문단에 표 번호·행·열', JSON.stringify(htu.tables[0].rows) === JSON.stringify([['항목', '값'], ['수율', '92']]) && htu.units.find(u => u.text === '92').tb === 0 && JSON.stringify(htu.units.find(u => u.text === '92').rc) === '[1,1]' && htu.units.find(u => u.text === '표 뒤').tb == null, JSON.stringify([htu.units.map(u => [u.text, u.tb, u.rc]), htu.tables]));
  const recL = (tag, lv, data) => { const n = data.length, h = Buffer.alloc(4); h.writeUInt32LE((tag | (lv << 10) | (n << 20)) >>> 0, 0); return Buffer.concat([h, data]); };
  const u16b = (...v) => { const b = Buffer.alloc(v.length * 2); v.forEach((x, i) => b.writeUInt16LE(x, i * 2)); return b; };
  const cellRec = (r, c, text) => Buffer.concat([recL(72, 2, Buffer.concat([u16b(1, 0), Buffer.alloc(4), u16b(c, r, 1, 1), Buffer.alloc(18)])), recL(66, 2, Buffer.alloc(22)), recL(67, 3, w16([...cc(text), 13]))]);
  const tblSec = Buffer.concat([recL(66, 0, Buffer.alloc(22)), recL(67, 1, w16([...cc('표 앞 문단'), 13])), recL(66, 0, Buffer.alloc(22)), recL(67, 1, w16([...ctl(11), 13])),
    recL(71, 1, Buffer.concat([Buffer.from([0x20, 0x6C, 0x62, 0x74]), Buffer.alloc(40)])), recL(77, 2, Buffer.concat([Buffer.alloc(4), u16b(2, 2), Buffer.alloc(20)])),
    cellRec(0, 0, '항목'), cellRec(0, 1, '값'), cellRec(1, 0, 'FDCA 수율'), cellRec(1, 1, '92 %'), recL(66, 0, Buffer.alloc(22)), recL(67, 1, w16([...cc('표 뒤 문단'), 13]))]);
  const fhT = Buffer.alloc(256); fhT.write('HWP Document File', 0, 'latin1'); fhT.writeUInt32LE(0x05000300, 32); fhT.writeUInt32LE(0, 36);
  const hwu = await DR.unitsOf('보고서.hwp', makeCfb({ FileHeader: fhT, 'BodyText/Section0': tblSec }));
  ok('dooray hwp 표(레코드 수준·칸 주소): 칸 문단에 표 번호·행·열, 표 끝 뒤 문단은 표 밖', hwu.fmt === 'hwp' && JSON.stringify(hwu.units.map(u => [u.text, u.tb, u.rc])) === JSON.stringify([['표 앞 문단', undefined, undefined], ['항목', 0, [0, 0]], ['값', 0, [0, 1]], ['FDCA 수율', 0, [1, 0]], ['92 %', 0, [1, 1]], ['표 뒤 문단', undefined, undefined]])
    && JSON.stringify(hwu.tables[0].rows) === JSON.stringify([['항목', '값'], ['FDCA 수율', '92 %']]), JSON.stringify([hwu.units.map(u => [u.text, u.tb, u.rc]), hwu.tables]));
  const xu = await DR.unitsOf('표.xlsx', makeZip({ 'xl/workbook.xml': '<workbook><sheets><sheet name="예산" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst><si><t>비목</t></si><si><t>재료비</t></si></sst>', 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>금액</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>1500</v></c></row></sheetData></worksheet>' }));
  ok('dooray xlsx: 시트 = 표(행마다 칸), 행 단위에 시트·행 번호', xu.tables[0].name === '예산' && JSON.stringify(xu.tables[0].rows) === JSON.stringify([['비목', '금액'], ['재료비', '1500']]) && xu.units[2].text === '재료비 | 1500' && JSON.stringify(xu.units[2].rc) === '[1,-1]', JSON.stringify([xu.units.map(u => [u.n, u.text, u.tb, u.rc]), xu.tables]));
  BIN['/scan/qtab'] = wtab; BIN['/scan/qhwp'] = makeCfb({ FileHeader: fhT, 'BodyText/Section0': tblSec });
  qSearch = [QC('5300000000000000011', '결과.docx', '/scan/qtab'), QC('5300000000000000012', '보고서.hwp', '/scan/qhwp')];
  const qt = await DR.quick({ find: [['결과']], tasks: false, q: /수율/, title: '표 시험' }), TH = document.body.innerHTML;
  ok('dooray quick 표: 워드·한글 표 안 찾을 말 → 채팅 표(머리 행 + 칸 구조, 찾은 칸 굵게)', /채팅 글 파일 2개 2곳/.test(qt.summary) && TH.includes('▸ 표 1 (3행×3열) — 걸린 칸 ¶5') && TH.includes('     | 구분 | 2024 | 2025 |\n     | --- | --- | --- |\n     | **FDCA 수율** | 80 % | 92 % |\n     | 셀 전압 | 1.4 V | 1.5 V |')
    && TH.includes('     | 항목 | 값 |\n     | --- | --- |\n     | **FDCA 수율** | 92 % |'), qt.summary + ' // ' + TH.slice(TH.indexOf('<h3>■ 글'), TH.indexOf('<h3>■ 글') + 900));
  const bigT = Array.from({ length: 20 }, (_, i) => i === 0 ? ['구분', '값'] : ['행' + i, i === 10 ? '수율 92' : String(i)]), tm = DR._tableMd(bigT, [10], { any: (x) => /수율/.test(x) });
  ok('dooray 큰 표(20행): 머리 행 + 걸린 행 둘레만, 사이는 …', tm.note === '20행×2열 중 4행' && JSON.stringify(tm.lines) === JSON.stringify(['| 구분 | 값 |', '| --- | --- |', '| … | |', '| 행9 | 9 |', '| 행10 | **수율 92** |', '| 행11 | 11 |']), JSON.stringify(tm));
  const longCell = DR._tableMd([['구분', '내용'], ['목표', '가'.repeat(100) + ' FDCA 수율 95% 달성']], [1], { any: (x) => /수율/.test(x), first: (x) => x.search(/수율/) });
  ok('dooray 표 칸: 찾을 말이 뒤에 있는 긴 칸은 그 둘레를 굵게(앞 60자로 자르면 안 보임)', longCell.lines[2].includes('**…') && longCell.lines[2].includes('FDCA 수율 95% 달성**'), JSON.stringify(longCell.lines));
  BIN['/scan/qtab2'] = wtab;
  qSearch = [QC('5300000000000000021', '결과.docx', '/scan/qtab'), QC('5300000000000000022', '결과_v2 사본.docx', '/scan/qtab2')];
  const qd = await DR.quick({ find: [['결과']], tasks: false, q: /수율/ }), DH = document.body.innerHTML;
  ok('dooray quick: 내용이 똑같은 사본은 되풀이하지 않고 한 줄로 알림', /채팅 글 파일 1개 1곳/.test(qd.summary) && DH.includes('※ 내용이 똑같은 파일 1개는 한 번만 보임: [F1]=F0') && (DH.match(/FDCA 수율\*\*/g) || []).length === 1, qd.summary + ' // ' + DH.slice(DH.indexOf('<h3>■ 파일')));
  const mdup = await DR.more();
  ok('dooray more: 접은 사본은 "더 보여줘"에도 되풀이하지 않음', mdup.summary.startsWith('더 보일 곳이 없습니다'), mdup.summary);
  // ---- v0.7.0 정확도·속도 장치 ----
  // hwpx 세로 병합: 둘째 행은 첫 칸이 없다(위 칸이 두 행을 차지) — 칸 주소(cellAddr)로 열이 밀리지 않게
  const hmg = await DR.unitsOf('병합.hwpx', makeZip({ 'Contents/content.hpf': '<opf:package/>', 'Contents/section0.xml': '<hs:sec><hp:p><hp:run><hp:tbl id="1"><hp:tr>' + HC('촉매', 0, 0, 2) + HC('수율', 0, 1) + HC('선택도', 0, 2) + '</hp:tr><hp:tr>' + HC('95 %', 1, 1) + HC('90 %', 1, 2) + '</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>' }));
  ok('dry hwpx 세로 병합: 칸 주소대로(빠진 첫 칸 뒤 칸이 앞으로 밀리지 않음)', JSON.stringify(hmg.tables[0].rows[1]) === JSON.stringify([undefined, '95 %', '90 %'].map(x => x === undefined ? null : x)) || (hmg.tables[0].rows[1][1] === '95 %' && hmg.tables[0].rows[1][2] === '90 %' && hmg.tables[0].rows[1][0] == null), JSON.stringify(hmg.tables));
  // docx 가로 병합(gridSpan): 첫 칸이 두 열을 차지하면 다음 칸은 셋째 열
  const TC = (t, span) => `<w:tc><w:tcPr>${span ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const gsp = await DR.unitsOf('병합.docx', makeZip({ 'word/document.xml': W_('<w:tbl><w:tr>' + TC('구분', 2) + TC('값') + '</w:tr><w:tr>' + TC('가') + TC('나') + TC('다') + '</w:tr></w:tbl>') }));
  ok('dry docx 가로 병합(gridSpan): 다음 칸 열이 병합만큼 건너뜀', gsp.tables[0].rows[0][0] === '구분' && gsp.tables[0].rows[0][2] === '값' && gsp.tables[0].rows[0][1] == null && JSON.stringify(gsp.tables[0].rows[1]) === JSON.stringify(['가', '나', '다']), JSON.stringify(gsp.tables));
  // xlsx 빈 칸: 칸 위치(B·C 열) 그대로 — 머리 행과 열이 맞게
  const xgd = await DR.unitsOf('빈칸.xlsx', makeZip({ 'xl/workbook.xml': '<workbook><sheets><sheet name="결과" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst/>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>시료</t></is></c><c r="B1" t="inlineStr"><is><t>1차</t></is></c><c r="C1" t="inlineStr"><is><t>수율</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>S1</t></is></c><c r="C2"><v>92</v></c></row></sheetData></worksheet>' }));
  ok('dry xlsx 빈 칸: 칸 위치 그대로(표에서 수율 열에 92) · 글은 그대로', xgd.tables[0].rows[1][2] === '92' && xgd.tables[0].rows[1][1] == null && xgd.units[2].text === 'S1 | 92', JSON.stringify([xgd.tables, xgd.units.map(u => u.text)]));
  // 넓은 표: 찾은 칸이 있는 열(11번째)을 첫 열과 함께 보인다
  const wideRows = [Array.from({ length: 12 }, (_, c) => '열' + c), Array.from({ length: 12 }, (_, c) => c === 10 ? '수율 95' : 'x' + c)];
  const wtm = DR._tableMd(wideRows, [1], { any: (x) => /수율/.test(x), first: (x) => x.search(/수율/) });
  ok('dry 넓은 표: 첫 열 + 찾은 칸 열을 먼저(열 8개)', wtm.lines[0].startsWith('| 열0 | 열1 |') && wtm.lines[0].includes('| 열10 |') && wtm.lines[2].includes('**수율 95**') && /열 8개/.test(wtm.note), JSON.stringify(wtm));
  // NFKC·띄어쓰기: '㎃/㎠' 가 'mA/cm2' 로, 'FDCA 수율' 이 'FDCA수율' 에도
  const ndz = makeZip({ 'word/document.xml': W_('<w:p><w:r><w:t>전류밀도 30 ㎃/㎠ 에서 FDCA수율 95％</w:t></w:r></w:p><w:p><w:r><w:t>관계없는 문단</w:t></w:r></w:p>') });
  BIN['/scan/nfkc'] = ndz;
  const nItem = { kind: 'file', id: 'N1', name: '단위.docx', size: ndz.length, dl: '/scan/nfkc', updated: '2026-06-01T10:00:00+09:00' };
  const ns1 = await DR.scanFiles([nItem], /mA\/cm2/), ns2 = await DR.scanFiles([nItem], 'FDCA 수율'), ns3 = await DR.scanFiles([nItem], /95%/);
  ok('dry 글 맞추기: ㎃/㎠·％ 호환 글자(NFKC)와 띄어쓰기 차이에도 걸림 — 보여 주는 글은 원문', ns1.hits === 1 && ns2.hits === 1 && ns3.hits === 1 && DR.scanned().files[0].hits[0].text.includes('㎃/㎠'), JSON.stringify([ns1.hits, ns2.hits, ns3.hits]));
  // 가까이 붙은 낱말: 두 낱말이 붙은 문단이 멀리 떨어진 문단보다 위
  const farT = '가'.repeat(600);
  const pxz = makeZip({ 'word/document.xml': W_(`<w:p><w:r><w:t>구리 ${farT} 에폭시화 설명</w:t></w:r></w:p><w:p><w:r><w:t>본문 ${'나'.repeat(50)} 구리 에폭시화 결과</w:t></w:r></w:p>`) });
  BIN['/scan/near'] = pxz;
  await DR.scanFiles([{ kind: 'file', id: 'P9', name: '가까이.docx', size: pxz.length, dl: '/scan/near' }], { all: [/구리/, /에폭시/] });
  const pfs = DR.scanned().files[0], near1 = pfs.hits.find(u => u.n === 1), near2 = pfs.hits.find(u => u.n === 2);
  ok('dry 가까이 붙은 낱말(+2) — 멀리 떨어진 문단보다 점수가 높음', near2.score > near1.score, JSON.stringify(pfs.hits.map(u => [u.n, u.score])));
  // 같은 파일(이름·크기)이 드라이브와 업무 첨부에 함께 있으면 한 번만 읽음
  let dupDl = 0; const baseF2 = global.fetch;
  global.fetch = async (url, o) => { if (String(url).startsWith('/scan/nfkc')) dupDl++; return baseF2(url, o); };
  const tDup = TKI('4100000000000000091', '같은 파일 올린 업무', [Object.assign(ATT('단위.docx', '/scan/nfkc', 'N2'), { size: ndz.length })]);
  const sdd = await DR.scanFiles([nItem, tDup], /mA\/cm2/);
  global.fetch = baseF2;
  ok('dry 내용이 똑같은 파일(드라이브 = 업무 첨부)은 한 번만 보이고 결과 글에 표시', dupDl <= 1 && sdd.hits === 1 && DR.scanned().files.length === 1 && DR.scanned().same.length === 1 && shownText.includes('※ 내용이 똑같은 파일 1개는 한 번만 보임: [F1]=F0'), dupDl + ' // ' + shownText.slice(0, 400));
  // 시간 한도: 한도를 넘기면 새 파일을 시작하지 않고 알린다(없음이 아님)
  const slt = await DR.scanFiles([Object.assign({}, nItem, { id: 'N9' })], /mA/, { maxSec: -1 });   // 새 파일(기억에 없음)
  const sltText = shownText, scd = await DR.scanFiles([nItem], /mA/, { maxSec: -1 });   // 이미 읽어 둔 파일은 한도를 넘어도 그대로
  ok('dry 시간 한도(maxSec): 넘으면 새로 받을 파일은 시작하지 않고 ⏱ 로 알림 · 읽어 둔 파일은 그대로', scd.hits === 1 && slt.hits === 0 && sltText.includes('⏱ 시간 한도(-1초)로 1개는 안 봄'), sltText.slice(0, 300));
  // 같은 글(다른 판): 앞 판에 한 문장이 끼어든 판도 접음
  const baseTxt = '본 연구팀의 반응 조건 최적화 과정을 보면 같은 전압 조건에서 유속을 증가시키면 체류 시간이 감소되어 FDCA 수율이 99.3%에서 97.0%로 감소함.';
  const vz1 = makeZip({ 'word/document.xml': W_(`<w:p><w:r><w:t>${baseTxt}</w:t></w:r></w:p>`) }), vz2 = makeZip({ 'word/document.xml': W_(`<w:p><w:r><w:t>${baseTxt.replace('보면', '보면(표 16)')}</w:t></w:r></w:p>`) });
  BIN['/scan/v1'] = vz1; BIN['/scan/v2'] = vz2;
  qSearch = [QC('5300000000000000031', '연차보고서 v1.docx', '/scan/v1'), QC('5300000000000000032', '연차보고서 v2.docx', '/scan/v2')];
  const qvd = await DR.quick({ find: [['연차']], tasks: false, q: /수율/ }), VH = document.body.innerHTML;
  ok('dry 같은 글 접기: 한 문장이 끼어든 다른 판도(4글자 조각 70% 이상 겹침)', /채팅 글 파일 1개 1곳/.test(qvd.summary) && VH.includes('접음: [F1] 연차보고서 v2.docx(=F0)') || /채팅 글 파일 1개 1곳/.test(qvd.summary) && VH.includes('(=F1)'), qvd.summary + ' // ' + VH.slice(VH.indexOf('<h3>■ 파일')));
  // 앞 찾기가 도는 동안 또 부르면 겹쳐 돌리지 않음
  const pA = DR.quick({ q: /수율/ }), rB = await DR.quick({ q: /수율/ }); await pA;
  ok('dry quick: 앞 찾기가 도는 중이면 겹쳐 돌리지 않음(ERR 안내)', rB.summary.startsWith('ERR 앞 찾기가 아직 도는 중'), rB.summary);
  // ---- 코어 검토(2026-09-29, 읽기 전용 검토 19건) 고친 곳 ----
  ok('dry 옛 이름 window.kkDooray = window.kkDry', window.kkDooray === window.kkDry);
  const Mq = { any: (x) => /수율/.test(x), first: (x) => x.search(/수율/) };
  const holes = [['구분', '2024', '2025'], , ['FDCA 수율', '80 %', '92 %']];
  const th = DR._tableMd(holes, [2], Mq);
  ok('fix#1 빈 행이 있는 표: 열이 사라지지 않음(NaN 없음)', th.note === '2행×3열' && th.lines[2] === '| **FDCA 수율** | 80 % | 92 % |', JSON.stringify(th));
  const big16 = []; for (let i = 0; i < 16; i++) if (i !== 5) big16[i] = ['행' + i, i === 4 ? '수율 90' : 'x'];
  let tb16; try { tb16 = DR._tableMd(big16, [4], Mq); } catch (e) { tb16 = { err: String(e) }; }
  ok('fix#1 12행 넘는 표 — 걸린 행 옆이 빈 행이어도 오류 없음', !tb16.err && tb16.lines.some(l => l.includes('**수율 90**')), JSON.stringify(tb16));
  const xn = await DR.unitsOf('줄바꿈.xlsx', makeZip({ 'xl/workbook.xml': '<workbook><sheets><sheet name="결과" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst/>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>시료</t></is></c><c r="B1" t="inlineStr"><is><t>FDCA\n수율(%)</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>S1</t></is></c><c r="B2" t="inlineStr"><is><t>재측정\n필요</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>S2</t></is></c><c r="B3"><v>95</v></c></row></sheetData></worksheet>' }));
  const s2u = xn.units.find(u => /^S2/.test(u.text));
  ok('fix#2 엑셀 칸 안 줄바꿈 → " / " (한 행 = 한 줄, 행 번호 그대로)', xn.units.length === 4 && s2u && JSON.stringify(s2u.rc) === '[2,-1]' && xn.tables[0].rows[2][0] === 'S2' && xn.tables[0].rows[0][1] === 'FDCA / 수율(%)', JSON.stringify([xn.units.map(u => [u.text, u.rc]), xn.tables]));
  const emptyDoc = makeZip({ 'word/document.xml': W_('<w:p><w:r><w:t></w:t></w:r></w:p>') });
  BIN['/scan/empty'] = emptyDoc;
  await DR.scanFiles([{ kind: 'file', id: 'E1', name: '빈.docx', size: emptyDoc.length, dl: '/scan/empty' }], /수율/);
  ok('fix#5 글이 없는 파일 → ⚠ 못 읽음(글을 찾지 못함), 걸린 곳 없음이 아님', shownText.includes('⚠ 못 읽음(없음이 아님): [F0] 빈.docx — 글을 찾지 못함') && !shownText.includes('■ 걸린 곳 없음'), shownText.slice(0, 400));
  const hwpText = (tx) => { const fh = Buffer.alloc(256); fh.write('HWP Document File', 0, 'latin1'); fh.writeUInt32LE(0x05000300, 32); fh.writeUInt32LE(0, 36); return makeCfb({ FileHeader: fh, 'BodyText/Section0': Buffer.concat([recL(66, 0, Buffer.alloc(22)), recL(67, 1, w16([...cc(tx), 13]))]) }); };
  const hA = hwpText('보고서 초안 가나다라'), hB = hwpText('보고서 수정 수율99');
  BIN['/scan/hA'] = hA; BIN['/scan/hB'] = hB;
  const s6 = await DR.scanFiles([{ kind: 'file', id: 'H1', name: '보고서.hwp', size: hA.length, dl: '/scan/hA' }, { kind: 'file', id: 'H2', name: '보고서.hwp', size: hB.length, dl: '/scan/hB' }], /수율/);
  ok('fix#6 이름·크기가 같은 hwp 두 판 — 같은 파일로 보지 않고 둘 다 읽음', hA.length === hB.length && s6.hits === 1 && DR.scanned().files.length === 2 && DR.scanned().same.length === 0, JSON.stringify([hA.length, hB.length, s6.hits]));
  const capSec = Buffer.concat([recL(66, 0, Buffer.alloc(22)), recL(67, 1, w16([...ctl(11), 13])),
    recL(71, 1, Buffer.concat([Buffer.from([0x20, 0x6C, 0x62, 0x74]), Buffer.alloc(40)])),
    recL(72, 2, Buffer.concat([u16b(1, 0), Buffer.alloc(4), u16b(3, 0), Buffer.alloc(20)])), recL(66, 2, Buffer.alloc(22)), recL(67, 3, w16([...cc('표 1. 조건별 수율'), 13])),
    recL(77, 2, Buffer.concat([Buffer.alloc(4), u16b(1, 2), Buffer.alloc(20)])), cellRec(0, 0, '항목'), cellRec(0, 1, '값')]);
  const hc = await DR.unitsOf('캡션.hwp', makeCfb({ FileHeader: fhT, 'BodyText/Section0': capSec }));
  ok('fix#7 hwp 표 캡션은 칸이 아님(없는 열이 생기지 않음)', hc.units[0].text === '표 1. 조건별 수율' && hc.units[0].tb == null && JSON.stringify(hc.tables[0].rows) === JSON.stringify([['항목', '값']]), JSON.stringify([hc.units.map(u => [u.text, u.tb, u.rc]), hc.tables]));
  const hx8 = await DR.unitsOf('캡션.hwpx', makeZip({ 'Contents/content.hpf': '<opf:package><opf:manifest><opf:item id="image1" href="BinData/image1.png" media-type="image/png"/></opf:manifest></opf:package>',
    'Contents/section0.xml': '<hs:sec><hp:p><hp:run><hp:tbl id="1"><hp:caption><hp:subList>' + HP('표 1. 조건별 수율') + '</hp:subList></hp:caption><hp:tr>' + HC('항목', 0, 0) + HC('값', 0, 1) + '</hp:tr></hp:tbl></hp:run></hp:p>'
      + '<hp:p><hp:run><hp:pic id="2"><hc:img binaryItemIDRef="image1"/><hp:caption><hp:subList>' + HP('그림 1. 전압별 수율') + '</hp:subList></hp:caption></hp:pic></hp:run></hp:p></hs:sec>', 'BinData/image1.png': PNG }));
  const capU = hx8.units.find(u => u.text === '표 1. 조건별 수율'), picU = hx8.units.find(u => u.pics === 1);
  ok('fix#8 hwpx: 표 캡션은 표 앞 문단(칸에 안 섞임) · 캡션 달린 그림도 그림 1개(캡션 = 그림 설명)', !!capU && capU.tb == null && hx8.tables[0].rows[0][0] === '항목' && !!picU && picU.media.length === 1 && picU.ctx === '그림 1. 전압별 수율', JSON.stringify([hx8.units.map(u => [u.n, u.text, u.pics, u.tb, u.ctx]), hx8.tables]));
  const dx8 = await DR.unitsOf('묶음그림.docx', makeZip({ 'word/document.xml': W_('<w:p><w:r><w:drawing><wp:anchor><wp:docPr id="1" name="그룹"/><a:graphic><a:graphicData><wpg:wgp><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>(a) 1.5 V</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></wpg:wgp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p><w:p><w:r><w:t>Figure 3. 전압별 수율</w:t></w:r></w:p>'),
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId5" Target="media/image1.png"/></Relationships>', 'word/media/image1.png': PNG }));
  ok('fix#8 docx 글상자 라벨과 묶은 그림 — 그림 1개, 라벨은 그림 설명', dx8.units[0].pics === 1 && dx8.units[0].media.length === 1 && dx8.units[0].alt.includes('(a) 1.5 V') && dx8.units[0].ctx === 'Figure 3. 전압별 수율', JSON.stringify(dx8.units.map(u => [u.n, u.text, u.pics, u.alt, u.ctx])));
  const gb = await DR.unitsOf('앞빈칸.docx', makeZip({ 'word/document.xml': W_('<w:tbl><w:tr>' + TC('가') + TC('나') + TC('다') + '</w:tr><w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>' + TC('둘') + TC('셋') + '</w:tr></w:tbl>') }));
  ok('fix#19 docx gridBefore: 둘째 행 칸이 한 칸 뒤에서 시작', gb.tables[0].rows[1][1] === '둘' && gb.tables[0].rows[1][2] === '셋' && gb.tables[0].rows[1][0] == null, JSON.stringify(gb.tables));
  const s11 = makeZip({ 'word/document.xml': W_('<w:p><w:r><w:t>㈜키키 결과（요약） 전압 1.5 V</w:t></w:r></w:p>') });
  BIN['/scan/s11'] = s11;
  const it11 = { kind: 'file', id: 'R11', name: '호환.docx', size: s11.length, dl: '/scan/s11' };
  const r11a = await DR.scanFiles([it11], /㈜키키/), r11b = await DR.scanFiles([it11], /결과（/), r12 = await DR.scanFiles([it11], [/전압/, /voltage/i]);
  const r12b = await DR.quick({ q: { and: [/전압/] } });
  ok('fix#11·12 ㈜·전각 괄호 정규식, 배열 안 정규식은 찾고 · 알 수 없는 값은 ERR', r11a.hits === 1 && r11b.hits === 1 && r12.hits === 1 && r12b.summary.startsWith('ERR 파일 속 찾을 말'), JSON.stringify([r11a.hits, r11b.hits, r12.hits, r12b.summary]));
  const shortT = '3.2 전해 조건에 따른 FDCA 수율 변화', longT = shortT + '를 보면 새로 개발한 니켈 촉매가 기존 촉매보다 높은 수율을 보였고 반응 시간도 절반으로 줄어 공정 비용을 크게 낮출 수 있음을 확인함';
  const z14a = makeZip({ 'word/document.xml': W_(`<w:p><w:r><w:t>${shortT}</w:t></w:r></w:p>`) }), z14b = makeZip({ 'word/document.xml': W_(`<w:p><w:r><w:t>${longT}</w:t></w:r></w:p>`) });
  BIN['/scan/z14a'] = z14a; BIN['/scan/z14b'] = z14b;
  qSearch = [QC('5300000000000000041', '중간보고서.docx', '/scan/z14a'), QC('5300000000000000042', '최종보고서.docx', '/scan/z14b')];
  const q14 = await DR.quick({ find: [['보고서']], tasks: false, q: /수율/ });
  ok('fix#14 짧은 제목을 첫머리에 품은 다른 긴 글은 접지 않음', /채팅 글 파일 2개/.test(q14.summary) && !document.body.innerHTML.includes('접음'), q14.summary);
  qSearch = 'ERR';
  const q4 = await DR.quick({ find: [['아무거나']], tasks: false, q: /수율/ });
  qSearch = null;
  ok('fix#4 찾기 실패는 0곳이 아니라 ERR(없음이 아님) · 탭 제목 ⚠', q4.summary.startsWith('ERR 찾기 실패(없음이 아님) — 드라이브 검색:') && document.title === 'kk-dry 작업 — ⚠ 확인 필요', q4.summary + ' // ' + document.title);
  const pdfItem = { kind: 'file', id: 'P7', taskId: '4100000000000000099', name: '키.pdf', size: 10, dl: '/scan/pdf' };
  await DR.showPages([[pdfItem, [2]]]);
  const nReq = pvReqs.length; pvLive = 'f'.repeat(32);
  const k10 = await DR.showPages([[pdfItem, [2]]]);
  ok('fix#10 미리보기 키가 밖에서 바뀌면 새 키로 다시(그림을 받음)', pvReqs.length === nReq + 1 && k10 === 'shown 1 units, 1 images', nReq + ' ' + pvReqs.length + ' ' + k10);
  await DR.report([['가나다']]);
  ok('fix#9 새 찾기(report) 뒤 scanned() = null — F번호는 새 목록 기준', DR.scanned() === null, String(DR.scanned()));
  // ---- Codex 검토(2026-09-29) 고친 곳 ----
  // H1 이름·크기가 같아도 내용이 다르면 둘 다 읽는다(내용 지문이 같을 때만 한 번)
  BIN['/scan/sameA'] = new Uint8Array(Buffer.from('AAAA')); BIN['/scan/sameB'] = new Uint8Array(Buffer.from('BBBB'));
  const h1 = await DR.scanFiles([{ kind: 'file', id: 'S1a', name: 'same.txt', size: 4, dl: '/scan/sameA' }, { kind: 'file', id: 'S1b', name: 'same.txt', size: 4, dl: '/scan/sameB' }], 'BBBB');
  ok('codex H1 이름·크기가 같은 다른 파일 — 둘 다 읽어 뒤 파일에서 찾음', h1.hits === 1 && DR.scanned().files.length === 2 && DR.scanned().same.length === 0, JSON.stringify([h1.hits, DR.scanned().files.length, DR.scanned().same.length]));
  // H2 같은 크기로 새 판(버전·수정 시각이 바뀜) → 기억해 둔 옛 글을 쓰지 않고 다시 읽음
  BIN['/scan/ver'] = new Uint8Array(Buffer.from('AAAA'));
  const v1i = { kind: 'file', id: 'V1', name: 'n.txt', size: 4, dl: '/scan/ver', version: 1, updated: '2026-09-01T10:00:00+09:00' };
  await DR.scanFiles([v1i], 'AAAA');
  BIN['/scan/ver'] = new Uint8Array(Buffer.from('BBBB'));
  const h2a = await DR.scanFiles([Object.assign({}, v1i, { version: 2, updated: '2026-09-02T10:00:00+09:00' })], 'BBBB');
  const h2b = await DR.scanFiles([Object.assign({}, v1i, { version: 2, updated: '2026-09-02T10:00:00+09:00' })], 'BBBB');
  ok('codex H2 같은 크기 새 판 — 다시 읽어 새 글로 찾음(같은 판은 기억 재사용)', h2a.hits === 1 && h2b.hits === 1 && DR.scanned().files[0].cached === true, JSON.stringify([h2a.hits, h2b.hits]));
  // M1 API 응답 머리만 오고 본문이 멈추면 제한 시간 안에서 끊음
  const bf1 = global.fetch, tmo0 = DR._tmo.api; DR._tmo.api = 60;
  global.fetch = async (url, o) => ({ ok: true, status: 200, text: () => new Promise((res, rej) => { if (o && o.signal) o.signal.addEventListener('abort', () => rej(new Error('aborted'))); }) });
  let m1; try { await DR.dfetch('/fake'); m1 = 'no error'; } catch (e) { m1 = String(e.message); }
  global.fetch = bf1; DR._tmo.api = tmo0;
  ok('codex M1 본문이 멈춘 API 응답 → 제한 시간 뒤 DOORAY: 응답 없음', /^DOORAY: 응답 없음/.test(m1), m1);
  // M4 긴 업무 본문도 끝까지(2만 자에서 자르지 않음) — only 글 거르기에 걸림
  const bf4 = global.fetch;
  global.fetch = async (url) => String(url).startsWith('/wapi/task/v1/tasks/') ? J({ header: { isSuccessful: true }, result: Object.assign({}, T1, { fileIdList: [], body: { mimeType: 'text/x-markdown', content: 'a'.repeat(25000) + ' NEEDLE' } }), references: {} }) : { ok: false, status: 404, text: async () => '{}' };
  const lt = await DR.getTask({ id: T1.id }, { comments: 0 });
  global.fetch = bf4;
  ok('codex M4 긴 업무 본문도 끝까지 — 끝부분 낱말도 only 에 걸림', lt.detail.text.includes('NEEDLE') && !lt.detail.textCut && DR.only([lt], { text: 'NEEDLE' }).items.length === 1, JSON.stringify([lt.detail.textLen, lt.detail.textCut]));
  // 재검토 R1 — 20만 자 넘는 본문·5만 자 넘는 댓글·본문을 안 읽은 업무는 글 거르기(only text)에서 '확인 못 함'으로 센다(0건이 없음이 아님)
  const bfR1 = global.fetch, mkBody = (n) => 'a'.repeat(n - 6) + 'NEEDLE';
  let r1Body = mkBody(200000), r1Cmt = 'x';
  global.fetch = async (url) => {
    const s = String(url);
    if (s.startsWith('/wapi/task/v1/tasks/')) return J({ header: { isSuccessful: true }, result: Object.assign({}, T1, { fileIdList: [], body: { mimeType: 'text/x-markdown', content: r1Body } }), references: {} });
    if (s.includes('/events?')) return J({ header: { isSuccessful: true }, result: [{ createdAt: '2026-09-02T10:00:00+09:00', creator: { type: 'member', member: { name: '이키키' } }, body: { mimeType: 'text/x-markdown', content: r1Cmt } }], totalCount: 1, references: {} });
    return { ok: false, status: 404, text: async () => '{}' };
  };
  const r1a = await DR.getTask({ id: T1.id }, { comments: 0 });   // 딱 20만 자 — 끝까지 읽음
  r1Body = mkBody(200001);
  const r1b = await DR.getTask({ id: T1.id }, { comments: 0 });   // 20만 1자 — 앞 20만 자만
  r1Body = 'short'; r1Cmt = 'b'.repeat(49995) + 'NEEDLE';          // 댓글 5만 1자
  const r1c = await DR.getTask({ id: T1.id }, { comments: 5 });
  global.fetch = bfR1;
  const o1a = DR.only([r1a], { text: 'NEEDLE' }), o1b = DR.only([r1b], { text: 'NEEDLE' }), o1c = DR.only([r1c], { text: 'NEEDLE' });
  const o1d = DR.only([Object.assign({}, r1a, { detail: undefined, subject: '제목만' })], { text: 'NEEDLE' });   // 본문을 안 읽은 업무
  ok('재검토 R1 딱 20만 자 본문은 끝까지 걸리고, 20만 1자는 확인 못 함 1건', o1a.items.length === 1 && !r1a.detail.textCut && r1a.detail.textFull === 200000 && o1b.items.length === 0 && o1b.unchecked === 1 && r1b.detail.textCut, JSON.stringify([r1a.detail.textFull, o1a.items.length, r1b.detail.textFull, o1b.unchecked]));
  ok('재검토 R1 5만 1자 댓글·본문을 안 읽은 업무도 확인 못 함', o1c.items.length === 0 && o1c.unchecked === 1 && r1c.detail.comments[0].cut && o1d.unchecked === 1 && DR.only([r1a], { text: '없는말' }).unchecked === 0, JSON.stringify([o1c.unchecked, o1d.unchecked]));
  const f1b = DR.fmtTasks(o1b); DR.showItems(o1b); const s1b = shownText;
  ok('재검토 R1 0건 목록에도 확인 못 함 경고(fmtTasks·showItems)', /끝까지 못 본 업무 1건/.test(f1b) && /끝까지 못 본 업무 1건은 확인하지 못했습니다/.test(s1b), f1b + ' // ' + s1b.slice(0, 200));
  // M6 엑셀은 실제 행 번호(R100)로
  const x6 = makeZip({ 'xl/workbook.xml': '<workbook><sheets><sheet name="자료" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst/>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>head</t></is></c></row><row r="100"><c r="A100" t="inlineStr"><is><t>NEEDLE</t></is></c></row></sheetData></worksheet>' });
  BIN['/scan/x6'] = x6;
  const s6r = await DR.scanFiles([{ kind: 'file', id: 'X6', name: 's.xlsx', size: x6.length, dl: '/scan/x6' }], 'NEEDLE');
  const u6 = DR.scanned().files[0].hits[0];
  ok('codex M6 엑셀 걸린 행은 실제 행 번호 R100 (표 안 위치는 따로)', s6r.hits === 1 && u6.lab === 'R100' && JSON.stringify(u6.rc) === '[1,-1]' && /\n  R100 NEEDLE/.test(shownText), JSON.stringify([u6.lab, u6.rc]) + ' // ' + shownText.slice(0, 300));
  // M3 그림이 있어야 할 슬라이드가 일시 오류(미리보기·파일 받기 실패)로 비면 '보인 곳'으로 치지 않고 '더 보여줘'에서 다시
  qSearch = [QC('5300000000000000051', '일시오류.pptx', '/scan/m3deck')];
  BIN['/scan/m3deck'] = deck;
  pvDown = true; m3fail = true; m3n = 0;   // 훑기 때 파일 받기는 성공, 그릴 때는 미리보기·파일 받기 모두 실패
  const q3 = await DR.quick({ find: [['일시오류']], tasks: false, q: /전압|voltage/i, top: 1 });
  ok('codex M3 그림을 못 받은 곳은 보인 곳이 아님 — 요약에 알림', /Chrome 화면 파일 0개 0곳\(그림을 못 받은 1곳은/.test(q3.summary) && document.body.innerHTML.includes('[그림을 받지 못함'), q3.summary);
  pvDown = false; m3fail = false;
  const q3c = await DR.more();
  ok('codex M3 오류가 풀리면 더 보여줘가 같은 슬라이드를 다시 보임', /Chrome 화면 파일 1개 1곳/.test(q3c.summary) && document.body.innerHTML.includes('<h4>슬라이드 1</h4>'), q3c.summary);
  // Codex 실계정 검토(2026-09-30): quick 요약의 '읽은 파일'은 읽기에 성공한 파일만 — 못 읽은 파일은 따로 센다
  qSearch = [QC('5300000000000000061', '좋은.pptx', '/scan/okdeck'), QC('5300000000000000062', '깨진.pptx', '/scan/baddeck')];
  BIN['/scan/okdeck'] = deck; BIN['/scan/baddeck'] = new Uint8Array(Buffer.from('not a zip file'));
  const qrd = await DR.quick({ find: [['좋은']], tasks: false, q: /전압|voltage/i, top: 1 });
  const QRD = document.body.innerHTML;
  ok('실계정 검토: quick 요약의 읽은 파일은 성공한 것만(못 읽음 따로)', /^■ kk-dry quick — 읽은 파일 1\(못 읽음 1\) · 걸린 1 /.test(qrd.summary) && /⚠ 못 읽은 파일 1개/.test(qrd.summary)
    && QRD.includes('파일 1개를 읽어 <b>1개</b>에서 찾았습니다') && /읽은 파일 1 · 걸린 1 · 없음 0 · 못 읽음 1/.test(QRD), qrd.summary);
  qSearch = null;
  global.location = { pathname: '/task/to' };
  ok('dooray quick·more: 작업 탭이 아니면 거부', (await DR.quick({ q: /x/ })).summary.startsWith('ERR 작업 탭') && (await DR.more()).summary.startsWith('ERR 작업 탭'));
  global.location = { pathname: '/robots.txt' };
  global.fetch = baseFetch;
  ok('dooray unitsOf hwpx: 그림 문단 → BinData 위치 + 다음 문단(그림 설명)', hxu.fmt === 'hwpx' && hxu.units.length === 2 && hxu.units[0].pics === 1 && hxu.units[0].media[0].part === 'BinData/image1.png' && hxu.units[0].ctx === '그림 1. 전압별 수율', JSON.stringify(hxu.units.map(u => [u.n, u.pics, u.media, u.ctx])));

  console.log(`\n${n - fail}/${n} PASS` + (fail ? ` — ${fail} FAIL` : ''));
  process.exit(fail ? 1 : 0);
})();
