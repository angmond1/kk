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
  global.document = { getElementById: () => null, createElement: () => ({ style: {}, remove() {}, click() { clicked.push(this.download); } }), body: { appendChild() {} }, documentElement: {} };
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

  // ================= kk-meeting / kk-pay =================
  dom();
  ok('meeting inject 1.3', load('kk-meeting/scripts/portal_ops.min.js') === 'kk-meeting-portal/1.3 =^.^=');
  ok('pay inject 1.2', load('kk-pay/scripts/portal_ops.min.js') === 'kk-pay-portal/1.2 =^.^=');
  const M = window.kkmeeting, P = window.kkPay;
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
  ok('mail inject 1.9', load('kk-mail/scripts/kk_mail_ops.min.js') === 'kk-mail-ops/1.9 =^.^=');
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
  global.DOMParser = class { parseFromString(h) { return { body: { textContent: String(h).replace(/<[^>]+>/g, '') }, querySelectorAll: () => [] }; } };
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

  // ================= kk-dooray (2026-09-29 신설) — 업무·드라이브 서버 검색 + 파일 내용 읽기 =================
  dom();
  global.Blob = require('buffer').Blob;   // dom() 의 가짜 Blob 대신 진짜(압축 해제에 stream() 필요)
  const zlib = require('zlib');
  // 합성 ZIP(docx·pptx·xlsx·hwpx) — deflate 압축, CRC 는 파서가 보지 않아 0
  const makeZip = (files) => {
    const parts = [], cen = []; let off = 0;
    for (const [name, content] of Object.entries(files)) {
      const nb = Buffer.from(name, 'utf8'), raw = Buffer.from(content, 'utf8'), comp = zlib.deflateRawSync(raw);
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
  const hwpOf = (flags, body = true) => {
    const fh = Buffer.alloc(256); fh.write('HWP Document File', 0, 'latin1'); fh.writeUInt32LE(0x05000300, 32); fh.writeUInt32LE(flags, 36);
    const sec = Buffer.concat([rec(66, Buffer.alloc(22)), rec(67, w16([...cc('시험 문단 R&D 가나다'), 13])), rec(67, w16([...cc('A'), ...ctl(9), ...cc('B'), ...ctl(11), ...cc('표안글'), 13])), rec(67, w16([...cc('긴'.repeat(2100)), 13]))]);
    const st = { FileHeader: fh, PrvText: w16(cc('미리보기 글')) };
    if (body) st['BodyText/Section0'] = (flags & 1) ? zlib.deflateRawSync(sec) : sec;
    return makeCfb(st);
  };
  let dmode = 'ok'; const dcalls = [];
  const T1 = { id: '4100000000000000001', projectId: '3300000000000000001', number: 7, subject: '가나다 과제 보고서 작성', workflowId: 'W1', workflowClass: 'working', users: { from: { type: 'member', member: { name: '김키키' } }, to: [{ type: 'member', member: { name: '이키키' } }], cc: [] }, createdAt: '2026-09-01T10:00:00+09:00', updatedAt: '2026-09-20T10:00:00+09:00', fileIdList: ['F1'], subPostCount: 1 };
  const T2 = Object.assign({}, T1, { id: '4100000000000000002', number: 3, subject: '옛 보고서', updatedAt: '2026-03-01T10:00:00+09:00', fileIdList: [] });
  const T3 = Object.assign({}, T1, { id: '4100000000000000003', number: 9, subject: '같은 프로젝트 다른 업무', updatedAt: '2026-05-01T10:00:00+09:00', fileIdList: [] });
  const TREFS = { projectMap: { '3300000000000000001': { code: '○○-공동연구' } }, workflowMap: { W1: { name: '진행' } } };
  const DC = (id, name, type, upd, extra) => Object.assign({ id, driveId: 'D1', projectId: '3300000000000000009', name, type, createdAt: upd, updatedAt: upd, size: 2048, createOrganizationMemberId: 'M1', lastUpdateOrganizationMemberId: 'M1', isTrashed: false, downloadUrl: '/drive/v1/downloads/D1/' + id }, extra || {});
  const DREFS = { driveMap: { D1: { name: '연구실-공지', projectId: '3300000000000000009', type: 'project' } }, organizationMemberMap: { M1: { name: '박키키' } } };
  const J = (o) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
  global.fetch = async (url, opts) => {
    dcalls.push({ url, body: opts && opts.body });
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
    if (url.includes('/events?')) return J({ header: { isSuccessful: true }, totalCount: 2, result: [{ createdAt: '2026-09-19T09:00:00+09:00', creator: { type: 'member', member: { name: '이키키' } }, body: { mimeType: 'text/x-markdown', content: '수정본 올렸습니다' }, fileIdList: ['F2'] }, { createdAt: '2026-09-10T09:00:00+09:00', creator: { type: 'member', member: { name: '김키키' } }, body: { mimeType: 'text/html', content: '<p>검토 부탁</p>' } }], references: { fileMap: { F2: { id: 'F2', name: '보고서_수정.docx', size: 9000, createdAt: '2026-09-19T09:00:00+09:00', downloadUrl: '/files/F2' } } } });
    if (url.startsWith('/v2/wapi/drives/search')) {
      if (dmode === 'driveReject') return J({ header: { isSuccessful: false, resultMessage: 'search failed' } });
      if (dmode === 'unsorted') return J({ header: { isSuccessful: true }, result: { totalCount: 2, contents: [DC('5100000000000000008', '2025', 'folder', '2025-01-01T12:00:00+09:00'), DC('5100000000000000009', '260610_○○_발표.pptx', 'file', '2026-06-10T12:00:00+09:00')], references: DREFS } });
      return J({ header: { isSuccessful: true }, result: { totalCount: 3, contents: [DC('5100000000000000001', '260610_○○_발표.pptx', 'file', '2026-06-10T12:00:00+09:00'), DC('5100000000000000002', '2026-06', 'folder', '2026-06-01T12:00:00+09:00'), DC('5100000000000000003', '옛 보고서.hwp', 'file', '2026-05-01T12:00:00+09:00', { isTrashed: true })], references: DREFS } });
    }
    if (url.startsWith('/v2/wapi/drives/D1/files/')) return J({ header: { isSuccessful: true }, result: { content: { parentFile: { id: '5100000000000000002', path: 'root/2026/2026-06' } } } });
    return { ok: false, status: 404, text: async () => '{}' };
  };
  ok('dooray inject 1.3', load('kk-dooray/scripts/kk_dooray_ops.min.js') === 'kk-dooray-ops/1.3 =^.^=');
  const DR = window.kkDooray;
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
  ok('dooray fmtLinks: 주소 그대로 / {hy:true} 하이픈 번호', lk.includes('0 | https://kist.gov-dooray.com/task/3300000000000000001/4100000000000000001') && lkd.includes('https://kist.gov-dooray.com/drive/3300000000000000009/views/5100000000000000001') && lkh.includes('P 3300-0000-0000-0000-009 | F 5100-0000-0000-0000-001'), lk + ' // ' + lkh);
  ok('dooray fmtLinks 항목 1건', DR.fmtLinks(t1).includes('/task/3300000000000000001/4100000000000000001'), DR.fmtLinks(t1));
  const on = DR.only(fd.drive, { ext: 'pptx' }), ow = DR.only(fd.tasks, { who: '이키키' }), ox = DR.only(fd.tasks, { text: '수정본' });
  ok('dooray only: 확장자·사람·본문/댓글 글', on.items.length === 1 && on.items[0].ext === 'pptx' && ow.items.length === 1 && ox.items.length === 1 && DR.only(fd.tasks, { text: '없는말' }).items.length === 0);
  // 서버 순서가 수정일 순이 아니어도(드라이브는 폴더 먼저, 업무는 postUpdatedAt 순) 기간 안 항목을 놓치지 않는다 — 2026-09-29 실사용에서 6월 파일을 놓친 초판 결함
  dmode = 'unsorted';
  const us = await DR.searchTasks('x', { since: '2026-04-01' }), ud = await DR.searchDrive('x', { since: '2026-04-01' });
  ok('dooray 뒤섞인 순서 + since → 기간 안 항목 모두(멈추지 않음)', us.items.length === 1 && us.items[0].id === T1.id && us.end === 'all' && ud.items.length === 1 && ud.items[0].ext === 'pptx', JSON.stringify([us.items.map(x => x.id), us.end, ud.items.map(x => x.name)]));
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
  ok('dooray showItems(only 결과) 줄 제한 없이', DR.showItems(DR.only(DR.last().tasks, { who: '이키키' })).startsWith('shown') && shownText.startsWith('■ 목록 3건'), shownText.slice(0, 80));
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

  console.log(`\n${n - fail}/${n} PASS` + (fail ? ` — ${fail} FAIL` : ''));
  process.exit(fail ? 1 : 0);
})();
