// kiki 브라우저 코어 5종 오프라인 결함 주입 시험 (tools/selftest.sh 가 부른다) — 주입본(.min.js)을 그대로 불러 시험. 자리표시 데이터만, 네트워크·실데이터 없음.
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
  ok('budget inject 1.3', load('kk-budget/scripts/portal_ops.min.js') === 'kk-budget-portal/1.3 =^.^=');
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

  console.log(`\n${n - fail}/${n} PASS` + (fail ? ` — ${fail} FAIL` : ''));
  process.exit(fail ? 1 : 0);
})();
