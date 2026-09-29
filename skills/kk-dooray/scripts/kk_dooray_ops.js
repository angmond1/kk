// ============================================================
// kk-dooray 코어 — KIST Dooray 업무·드라이브 찾기 (window.kkDooray)
// ------------------------------------------------------------
// 동작 원리: kist.gov-dooray.com 탭의 "세션 쿠키"로 Dooray 검색창과 같은 서버 검색(internal wapi)을 부른다.
//   → API 토큰·비번·Python 불필요. 본인 로그인 세션으로 본인이 볼 수 있는 것만 보인다. 이 코어는 조회 전용(쓰기 호출 없음) —
//   업무 글·댓글·첨부 올리기, 드라이브 올리기, 파일을 PC 폴더로 받기는 scripts/dooray_io.py(공식 API·토큰, 미리보기 → --yes).
// 사용법: 이 파일(주입은 .min.js)을 Read → Claude in Chrome javascript_tool 로 1회 inject →
//   이후 window.kkDooray.<함수>() 호출. (개인정보·하드코딩 식별자 없음)
// 출력 제약: javascript_tool 반환은 ~1,000자에서 잘리고 `a=b&c=d` 꼴이 섞이면 통째로 가려진다 → 결과는 window 에 두고 fmt* 로 조각 회수.
// 실측(2026-09-29): 업무 검색 = 제목·본문·댓글, 낱말 AND(순서 무관), 0.5초 / 드라이브 검색 = 파일·폴더 이름과 올린 사람 이름
//   (파일 속 글은 색인 안 됨), 낱말 AND, 약 3초 / 드라이브 파일은 같은 탭에서 받아 브라우저 메모리에서 읽을 수 있다.
// ============================================================
(function () {
  const BASE = 'https://kist.gov-dooray.com';
  const E = encodeURIComponent;

  // 응답 판독 — kk-mail 과 같은 규칙: 로그인이 풀리면 JSON 대신 로그인 화면(HTML)이 온다 → 원인과 다음 행동을 담은 DOORAY: 오류.
  async function dfetch(url, { method = 'GET', body = null } = {}) {
    const headers = { Accept: 'application/json' };
    const opts = { method, credentials: 'include', headers };
    if (body != null) { headers['Content-Type'] = 'application/json'; opts.body = typeof body === 'string' ? body : JSON.stringify(body); }
    const r = await fetch(url, opts);
    if (r.status === 401 || r.status === 403) throw new Error(`DOORAY: 권한 없음(HTTP ${r.status}) — kist.gov-dooray.com 로그인 확인 → 탭 새로고침 → 코어 재주입`);
    const t = await r.text();
    if (r.status === 404) throw new Error('DOORAY: 요청 주소가 없습니다(HTTP 404) — Dooray 화면·API 가 바뀌었을 수 있음(코어 갱신 필요, 로그인 문제 아님)');
    if (r.status >= 500) throw new Error(`DOORAY: 서버 오류(HTTP ${r.status}) — 잠시 뒤 1회 다시`);
    let d;
    try { d = JSON.parse(t); }
    catch (e) { throw new Error(`DOORAY: 응답이 JSON 이 아닙니다(HTTP ${r.status}) — 로그인이 풀렸을 수 있습니다. kist.gov-dooray.com 로그인 확인 → 탭 새로고침 → 코어 재주입`); }
    if (!r.ok && d && typeof d === 'object' && !d.header) d.header = { isSuccessful: false, resultCode: r.status, resultMessage: String(d.error || d.message || 'HTTP ' + r.status) };
    return d;
  }
  function apiErr(d) {
    if (!d || typeof d !== 'object') return 'no response';
    const h = d.header || {};
    return h.isSuccessful === false ? String(h.resultMessage || h.resultCode || 'isSuccessful false') : '';
  }
  const errText = (e) => String((e && e.message) || e);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // n 개씩 동시에(서버 부담·rate limit 을 넘지 않게). 항목별 실패는 { error } 로 남기고 나머지는 계속.
  async function pool(items, n, fn) {
    const out = new Array(items.length); let i = 0;
    async function worker() { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: errText(e) }; } } }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return out;
  }
  // 'YYYY-MM-DD' 는 한국시간 기준
  const kst = (d, end) => new Date(/T/.test(d) ? d : d + (end ? 'T23:59:59.999+09:00' : 'T00:00:00+09:00')).getTime();
  function period(opt) {
    return { since: opt.since ? kst(opt.since, false) : (opt.sinceDays ? Date.now() - opt.sinceDays * 86400000 : 0), until: opt.until ? kst(opt.until, true) : Infinity };
  }
  const tsOf = (s) => { const t = new Date(s).getTime(); return isNaN(t) ? 0 : t; };
  // 검색어 묶음 정규화: '○○사업' → [['○○사업']] / ['○○사업','보고서'] → [['○○사업','보고서']](한 묶음 = AND) / [['○○사업'],['영문 사업명']] → 그대로(묶음끼리 합침)
  function groupsOf(q) {
    if (q == null) return [];
    if (!Array.isArray(q)) q = [q];
    if (!q.length) return [];
    const gs = q.some(Array.isArray) ? q.map(g => [].concat(g)) : [q];
    return gs.map(g => g.map(w => String(w == null ? '' : w).trim()).filter(Boolean)).filter(g => g.length);
  }
  const label = (g) => g.join(' ');

  // ---------- 1. 업무(프로젝트 task) 검색 ----------
  // GET /wapi/task/v1/projects/*/tasks?size&page&order=-postUpdatedAt&all=<낱말들>&projectScope=in_project_member (업무 화면 검색창과 같은 호출, 2026-09-29 캡처·실측)
  //   all 은 한 칸에 띄어쓰기로(서버가 낱말 AND, 순서 무관). all 을 두 번 주면 둘째는 무시된다(실측) → 동의어는 묶음을 따로(searchTasksMany).
  //   대상 = 내가 속한 프로젝트 전체의 제목·본문·댓글(실측: 본문에만 있는 낱말 5/5, 댓글에만 있는 낱말 4/4 hit). size 100 OK.
  //   opt = { size?:100, maxPages?:3, since?, until?, sinceDays?, dateField?:'updated'|'created', projectId?, scope?, order? }
  // 반환 { total, fetched, pages, items:[taskItem](수정일 최신순으로 다시 정렬), end:'all'|'cap'|'error', truncated?, error? }
  function nameOf(u, refs) {
    if (!u) return '';
    if (u.member) return u.member.name || '';
    if (u.emailUser) return u.emailUser.name || u.emailUser.emailAddress || '';
    if (u.group) { const g = ((refs && refs.projectMemberGroupMap) || {})[u.group.projectMemberGroupId || u.group.id] || {}; return g.code ? '그룹 ' + g.code : '그룹'; }
    return '';
  }
  function taskItem(t, refs) {
    const pm = ((refs && refs.projectMap) || {})[t.projectId] || {};
    const wf = ((refs && refs.workflowMap) || {})[t.workflowId] || t.workflow || {};
    const u = t.users || {};
    return {
      kind: 'task', id: String(t.id), projectId: String(t.projectId || ''), project: pm.code || '', number: t.number,
      subject: t.subject || '', status: wf.name || t.workflowClass || '', cls: t.workflowClass || '',
      from: nameOf(u.from, refs), to: (u.to || []).map(x => nameOf(x, refs)).filter(Boolean), cc: (u.cc || []).map(x => nameOf(x, refs)).filter(Boolean),
      created: t.createdAt || '', updated: t.updatedAt || '', due: t.dueDate || '',
      files: (t.fileIdList || []).length, sub: t.subPostCount || 0, parentId: t.parent && t.parent.id ? String(t.parent.id) : '',
      url: `${BASE}/task/${t.projectId}/${t.id}`,
    };
  }
  // 한 프로젝트만: opt.projectId → /projects/!{id}/tasks (번호 앞 '!' 필수 — 없으면 SERVICE_RESOURCE_PROJECT_NOT_FOUND, 2026-09-29 실측).
  //   이때는 검색어 없이도 된다 → 그 프로젝트 업무 전체 목록(이름 검색은 글 속 이름만 찾으므로, 찾은 업무의 프로젝트를 통째로 볼 때).
  async function searchTasks(terms, opt = {}) {
    const words = groupsOf(terms)[0] || [];
    const out = { q: label(words), total: null, fetched: 0, pages: 0, items: [], end: 'cap' };
    if (!words.length && !opt.projectId) { out.error = '검색어가 없습니다'; out.end = 'error'; return out; }
    const size = opt.size || 100, maxPages = opt.maxPages || 3, P = period(opt);
    const created = opt.dateField === 'created';
    const path = opt.projectId ? `/wapi/task/v1/projects/!${String(opt.projectId).replace(/^!/, '')}/tasks` : '/wapi/task/v1/projects/*/tasks';
    const q = (words.length ? `&all=${E(words.join(' '))}` : '') + (opt.projectId ? '' : `&projectScope=${opt.scope || 'in_project_member'}`);
    for (let p = 0; p < maxPages; p++) {
      const d = await dfetch(`${path}?size=${size}&page=${p}&order=${opt.order || '-postUpdatedAt'}${q}`);
      if (!Array.isArray(d.result)) { out.error = 'DOORAY 업무 검색 실패: ' + (apiErr(d) || 'no result'); out.end = 'error'; break; }
      const refs = d.references || {};
      if (out.total == null) out.total = d.totalCount;
      out.fetched += d.result.length; out.pages++;
      // 기간은 받은 뒤 거른다 — 결과는 postUpdatedAt 순이라 수정일(updatedAt)과 순서가 다르다(실측 16건 중 역전 4) → '기간 밖이 나오면 멈춤' 금지
      for (const t of d.result) {
        const it = taskItem(t, refs), ts = tsOf(created ? it.created : it.updated);
        if (ts >= P.since && ts <= P.until) out.items.push(it);
      }
      if (d.result.length < size || (out.total != null && out.fetched >= out.total)) { out.end = 'all'; break; }
    }
    if (out.end === 'cap') out.truncated = true;
    out.items.sort((a, b) => tsOf(b.updated) - tsOf(a.updated));
    return out;
  }

  // ---------- 2. 드라이브 검색 ----------
  // POST /v2/wapi/drives/search?size&page  body { query:'all=<낱말>&all=…', page, order:'-updatedAt', all:[낱말…], searchType:'drive', driveIds?:[…] }
  //   (드라이브 화면 검색창과 같은 호출, 2026-09-29 캡처·실측) driveIds 를 빼면 내가 볼 수 있는 모든 드라이브. all 배열 원소끼리 AND,
  //   한 원소 안 띄어쓰기는 구절(실측 0건) → 낱말은 원소를 나눠서. 대상 = 파일·폴더 이름과 올린·고친 사람 이름. 파일 속 글은 색인되지 않는다(실측).
  //   응답 result { totalCount, contents[], references{ driveMap{name,projectId,type}, organizationMemberMap{name…} } } — result 가 배열이 아니다(주의).
  //   경로(parentFile.path)는 검색 결과에 없고 파일 상세 GET 에만 있다 → drivePaths.
  //   opt = { size?:100, maxPages?:3, since?, until?, sinceDays?, driveIds?, projectId?, kind?:'file'|'folder', ext?:'pptx|hwp'(정규식 문자열), includeTrashed? }
  function extOf(name) { const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function driveItem(c, refs) {
    const dm = ((refs && refs.driveMap) || {})[c.driveId] || {}, om = (refs && refs.organizationMemberMap) || {};
    const folder = c.type === 'folder';
    return {
      kind: folder ? 'folder' : 'file', id: String(c.id), driveId: String(c.driveId || ''), projectId: String(c.projectId || dm.projectId || ''),
      drive: dm.name || '', name: c.name || '', ext: folder ? '' : extOf(c.name), mime: c.mimeType || '', size: c.size || 0,
      created: c.createdAt || '', updated: c.updatedAt || '', by: (om[c.createOrganizationMemberId] || {}).name || '', upd: (om[c.lastUpdateOrganizationMemberId] || {}).name || '',
      trashed: !!c.isTrashed, dl: c.downloadUrl || '', path: '',
      url: `${BASE}/drive/${c.projectId || dm.projectId}/views/${c.id}`,   // 드라이브에서 그 파일·폴더가 선택되고 오른쪽에 경로·미리보기(실측)
    };
  }
  async function searchDrive(terms, opt = {}) {
    const words = (groupsOf(terms)[0] || []).flatMap(w => w.split(/\s+/)).filter(Boolean);   // 띄어쓰기 원소는 구절 매칭(0건)이라 낱말로 나눈다
    const out = { q: label(words), total: null, fetched: 0, pages: 0, items: [], end: 'cap' };
    if (!words.length) { out.error = '검색어가 없습니다'; out.end = 'error'; return out; }
    const size = opt.size || 100, maxPages = opt.maxPages || 3, P = period(opt);
    const extRe = opt.ext ? new RegExp('^(?:' + opt.ext + ')$', 'i') : null;
    const body = { query: words.map(w => 'all=' + E(w)).join('&'), page: 0, order: opt.order || '-updatedAt', all: words, searchType: 'drive' };
    if (opt.driveIds && opt.driveIds.length) body.driveIds = [].concat(opt.driveIds).map(String);
    for (let p = 0; p < maxPages; p++) {
      body.page = p;
      const d = await dfetch(`/v2/wapi/drives/search?size=${size}&page=${p}`, { method: 'POST', body });
      const R = d.result;
      if (!R || !Array.isArray(R.contents)) { out.error = 'DOORAY 드라이브 검색 실패: ' + (apiErr(d) || 'no result'); out.end = 'error'; break; }
      if (out.total == null) out.total = R.totalCount;
      out.fetched += R.contents.length; out.pages++;
      // 기간은 받은 뒤 거른다 — order:'-updatedAt' 를 줘도 폴더가 먼저 오고 수정일 순이 아니다(실측 57건 중 역전 3) → '기간 밖이 나오면 멈춤' 금지
      for (const c of R.contents) {
        const it = driveItem(c, R.references), ts = tsOf(it.updated);
        if (ts < P.since || ts > P.until) continue;
        if (it.trashed && !opt.includeTrashed) continue;
        if (opt.projectId && it.projectId !== String(opt.projectId)) continue;
        if (opt.kind && it.kind !== opt.kind) continue;
        if (extRe && !extRe.test(it.ext)) continue;
        out.items.push(it);
      }
      if (R.contents.length < size || (out.total != null && out.fetched >= out.total)) { out.end = 'all'; break; }
    }
    if (out.end === 'cap') out.truncated = true;
    out.items.sort((a, b) => tsOf(b.updated) - tsOf(a.updated));
    return out;
  }
  // 드라이브 파일·폴더 1건의 경로: GET /v2/wapi/drives/{driveId}/files/{id} → content.parentFile{id, path:'root/…'} (실측)
  async function drivePath(it) {
    const d = await dfetch(`/v2/wapi/drives/${it.driveId}/files/${it.id}`);
    const c = d.result && d.result.content;
    if (!c) throw new Error('DOORAY 파일 정보 조회 실패: ' + (apiErr(d) || 'no content'));
    const pf = c.parentFile || {};
    it.path = String(pf.path || '').replace(/^root\/?/, '/');
    it.folderId = pf.id ? String(pf.id) : '';
    return it.path;
  }
  async function drivePaths(x, n = 10) {
    const list = listOf(x).filter(it => it.kind === 'file' || it.kind === 'folder').slice(0, n).filter(it => !it.path);
    const r = await pool(list, 3, drivePath);
    return list.length - r.filter(v => v && v.error).length;
  }

  // ---------- 동의어 묶음 합치기 (업무·드라이브 공통) ----------
  async function searchMany(kind, groups, opt = {}) {
    const gs = groupsOf(groups), fn = kind === 'drive' ? searchDrive : searchTasks;
    const seen = new Map(), errors = [], cut = []; let totalSum = 0, fetched = 0;
    const rs = await pool(gs, 3, (g) => fn(g, opt));
    rs.forEach((r, k) => {
      const lb = label(gs[k]);
      if (!r || r.error) { errors.push(lb + ': ' + ((r && r.error) || 'no result')); return; }
      totalSum += r.total || 0; fetched += r.fetched;
      if (r.truncated) cut.push(lb + ' ' + r.fetched + '/' + r.total);
      for (const it of r.items) {
        const o = seen.get(it.id);
        if (o) { if (!o.hits.includes(lb)) o.hits.push(lb); } else { it.hits = [lb]; seen.set(it.id, it); }
      }
    });
    const out = { groups: gs.map(label), totalSum, fetched, items: Array.from(seen.values()).sort((a, b) => tsOf(b.updated) - tsOf(a.updated)) };
    if (errors.length) out.error = errors.join(' / ');
    if (cut.length) { out.truncated = true; out.truncatedGroups = cut; }
    return out;
  }
  const searchTasksMany = (groups, opt) => searchMany('task', groups, opt);
  // 한 프로젝트의 업무 전체(검색어 없이) — 목록 컨테이너. 이어서 getTasks(결과, {n}) 로 본문·댓글.
  const projectTasks = (projectId, opt = {}) => searchTasks([], Object.assign({}, opt, { projectId }));
  const searchDriveMany = (groups, opt) => searchMany('drive', groups, opt);

  // ---------- 3. 업무 자세히 — 본문·첨부·댓글 ----------
  // 본문: GET /wapi/task/v1/tasks/{id}?fields=me,body → result(업무 그대로) .body{mimeType:'text/x-markdown'|'text/html', content} + references.fileMap{name,size,downloadUrl,creator}
  // 댓글: GET /wapi/task/v1/projects/!{projectId}/tasks/{number}/events?size&order=-createdAt&fields=me&direction=:&eventType=comment → result[] 최신순(실측, size 100 OK)
  function htmlToText(html) {
    if (!html) return '';
    if (typeof DOMParser === 'undefined') return String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style,script,head,title').forEach(e => e.remove());
    doc.querySelectorAll('br,p,div,tr,li,h1,h2,h3,h4,h5,h6,blockquote').forEach(e => e.insertAdjacentText('afterend', '\n'));
    return (doc.body ? doc.body.textContent : '').replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }
  function mdToText(md) {
    return String(md || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '[이미지]').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/(\*\*|__|~~)/g, '')
      .replace(/[ \t\u00a0]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  const bodyText = (b) => !b ? '' : (/html/i.test(b.mimeType || '') ? htmlToText(b.content) : mdToText(b.content));
  function fileOf(f) {
    return { name: f.name || '', size: f.size || 0, ext: extOf(f.name), created: f.createdAt || '', by: nameOf(f.creator), dl: f.downloadUrl || '', id: String(f.id || '') };
  }
  async function getTask(x, { comments = 20, bodyChars = 20000 } = {}) {
    const id = String(x && x.id ? x.id : x).replace(/-/g, '');
    const d = await dfetch(`/wapi/task/v1/tasks/${id}?fields=me%2Cbody`);
    const t = d.result;
    if (apiErr(d) || !t || !t.id) throw new Error('DOORAY 업무 조회 실패: ' + (apiErr(d) || 'no result'));
    const refs = d.references || {}, fm = refs.fileMap || {};
    const it = Object.assign(taskItem(t, refs), x && x.hits ? { hits: x.hits } : {});
    const text = bodyText(t.body).slice(0, bodyChars);
    const det = { text, textLen: text.length, fileList: (t.fileIdList || []).map(fid => fm[fid]).filter(Boolean).map(fileOf), comments: [], commentTotal: 0 };
    if (comments > 0 && t.number != null) {
      try {
        const c = await dfetch(`/wapi/task/v1/projects/!${t.projectId}/tasks/${t.number}/events?size=${comments}&order=-createdAt&fields=me&direction=%3A&eventType=comment`);
        if (!Array.isArray(c.result)) throw new Error(apiErr(c) || 'no result');
        const cfm = (c.references && c.references.fileMap) || {};
        det.commentTotal = c.totalCount != null ? c.totalCount : c.result.length;
        det.comments = c.result.map(e => ({ date: e.createdAt || '', who: nameOf(e.creator), text: bodyText(e.body).slice(0, 3000),
          files: (e.fileIdList || []).map(fid => cfm[fid]).filter(Boolean).map(fileOf) }));
      } catch (e) { det.commentError = 'DOORAY 댓글 조회 실패: ' + errText(e); }
    }
    it.detail = det;
    return it;
  }
  // 여러 건 자세히(2개씩 동시). 목록 컨테이너나 배열의 항목에 .detail 을 채운다(실패는 .detail = { error }).
  async function getTasks(x, { n = 5, comments = 20 } = {}) {
    const list = listOf(x).filter(it => it.kind === 'task').slice(0, n);
    const r = await pool(list, 2, (it) => getTask(it, { comments }));
    r.forEach((v, k) => { list[k].detail = v && v.detail ? v.detail : { error: (v && v.error) || 'no result' }; });
    return list;
  }

  // ---------- 4. 한 번에 찾기 (대화형 검색의 기본 호출) ----------
  // find(groups, opt) — 업무·드라이브를 동의어 묶음별로 동시에 검색 → 합치기 → 위쪽 업무 detail 건 본문·첨부·댓글, 드라이브 paths 건 경로까지.
  //   groups: '○○사업' | ['○○사업','보고서'](AND) | [['○○사업'],['영문 사업명'],['○○사업','보고서']](묶음끼리 합침)
  //   opt: { tasks?:true, drive?:true, detail?:5, paths?:10, comments?:10, since?, until?, sinceDays?, projectId?, kind?, ext?, maxPages? }
  //   2-스텝: window.__d=null; kkDooray.find([...]).then(r=>window.__d=r, e=>window.__d={error:String(e)}); 'started' → 다음 호출 fmtFind(window.__d)
  let progress = '';
  async function find(groups, opt = {}) {
    const t0 = Date.now(), gs = groupsOf(groups);
    if (!gs.length) return { error: '검색어가 없습니다', ms: 0 };
    const doT = opt.tasks !== false, doD = opt.drive !== false;
    const nd = opt.detail != null ? opt.detail : 5, np = opt.paths != null ? opt.paths : 10;
    progress = `검색 중(업무 ${doT ? gs.length : 0}·드라이브 ${doD ? gs.length : 0}묶음)`;
    const [tasks, drive] = await Promise.all([
      doT ? searchTasksMany(gs, opt).catch(e => ({ error: errText(e), items: [] })) : null,
      doD ? searchDriveMany(gs, opt).catch(e => ({ error: errText(e), items: [] })) : null,
    ]);
    progress = `자세히 읽는 중(업무 ${tasks ? Math.min(nd, tasks.items.length) : 0}건·경로 ${drive ? Math.min(np, drive.items.length) : 0}건)`;
    await Promise.all([
      tasks && nd > 0 ? getTasks(tasks, { n: nd, comments: opt.comments != null ? opt.comments : 10 }).catch(() => null) : null,
      drive && np > 0 ? drivePaths(drive, np).catch(() => null) : null,
    ]);
    progress = '';
    const out = { groups: gs.map(label), tasks, drive, ms: Date.now() - t0 };
    if (opt.since || opt.until || opt.sinceDays) out.period = [opt.since || (opt.sinceDays ? opt.sinceDays + '일' : ''), opt.until || ''].join('~');
    return out;
  }

  // ---------- 5. 파일 내용 읽기 (사용자 허락 후에만 — 파일명·크기를 먼저 알리고) ----------
  // 드라이브 항목(dl) 또는 업무 첨부(getTask 의 detail.fileList 항목)를 같은 탭에서 받아 브라우저 메모리에서만 글을 뽑는다(디스크 저장 없음).
  //   지원: docx·pptx·xlsx·hwpx(ZIP+XML) / hwp(한글 5.0, OLE) / txt·md·csv·json·xml·html·log. 미지원: pdf·ppt·doc·xls(옛 형식)·그림·압축 → unsupported.
  //   opt = { maxMB?:30, notes?:false(pptx 발표자 메모 포함) }. 반환 { name, fmt, size, text, textLen, parts, note? } 또는 { unsupported, reason } / { error }.
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  async function inflateRaw(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const dec8 = (u8) => new TextDecoder('utf-8').decode(u8);
  const dec16 = (u8) => new TextDecoder('utf-16le').decode(u8);
  function zipEntries(b) {
    let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('ZIP 끝 표시를 못 찾음(파일 손상 또는 ZIP 아님)');
    const n = u16(b, e + 10), off = u32(b, e + 16);
    if (off === 0xFFFFFFFF || n === 0xFFFF) throw new Error('ZIP64(아주 큰 파일) 미지원');
    const out = {}; let p = off;
    for (let k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) throw new Error('ZIP 목록 손상');
      const nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32);
      const name = dec8(b.subarray(p + 46, p + 46 + nl));
      out[name] = { method: u16(b, p + 10), csize: u32(b, p + 20), lho: u32(b, p + 42) };
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  async function zipText(b, ents, name) {
    const en = ents[name]; if (!en) return '';
    const p = en.lho;
    if (u32(b, p) !== 0x04034b50) throw new Error('ZIP 항목 손상: ' + name);
    const s = p + 30 + u16(b, p + 26) + u16(b, p + 28), data = b.subarray(s, s + en.csize);
    if (en.method === 0) return dec8(data);
    if (en.method === 8) return dec8(await inflateRaw(data));
    throw new Error('ZIP 압축 방식 ' + en.method + ' 미지원');
  }
  const XENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, g) => g[0] === '#' ? String.fromCodePoint(g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : (XENT[g] != null ? XENT[g] : m));
  // XML 안 문단(<*:p>)마다 글(<*:t>)을 모은다 — docx(w:), pptx(a:), hwpx(hp:) 공통. 글 요소 안의 탭·줄바꿈 요소는 띄어쓰기로.
  function xmlParas(xml) {
    const out = [];
    for (const chunk of String(xml).split(/<\/(?:[\w-]+:)?p>/)) {
      let s = '', m; const re = /<((?:[\w-]+:)?)t(?:\s[^>]*)?>([\s\S]*?)<\/\1t>/g;
      while ((m = re.exec(chunk)) !== null) s += unxml(m[2].replace(/<[^>]+>/g, ' '));
      if (s.trim()) out.push(s.replace(/[ \t]+/g, ' ').trim());
    }
    return out;
  }
  const numSort = (re) => (a, b) => (+(re.exec(a) || [0, 0])[1]) - (+(re.exec(b) || [0, 0])[1]);
  // _rels 파일 → { rId: Target }
  function relMap(xml) {
    const tgt = {}; let m; const rr = /<Relationship\b[^>]*>/g;
    while ((m = rr.exec(String(xml))) !== null) { const id = /\bId="([^"]+)"/.exec(m[0]), t = /\bTarget="([^"]+)"/.exec(m[0]); if (id && t) tgt[id[1]] = t[1]; }
    return tgt;
  }
  const tTexts = (xml) => { let s = '', t; const tr = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; while ((t = tr.exec(xml)) !== null) s += unxml(t[1]); return s; };
  // xlsx: 시트 순서대로 행마다 셀 값(공유 문자열·인라인 글자·숫자)을 ' | ' 로 — 수식은 계산된 값(v)만, 날짜는 일련번호 그대로
  async function readXlsx(b, ents) {
    const wb = await zipText(b, ents, 'xl/workbook.xml'), tgt = relMap(await zipText(b, ents, 'xl/_rels/workbook.xml.rels'));
    const sheets = []; let m; const r = /<sheet\b[^>]*>/g;
    while ((m = r.exec(wb)) !== null) {
      const nm = /\bname="([^"]*)"/.exec(m[0]), id = /\br:id="([^"]+)"/.exec(m[0]);
      sheets.push({ name: unxml(nm ? nm[1] : '?'), path: id && tgt[id[1]] ? 'xl/' + tgt[id[1]].replace(/^\/?xl\//, '') : '' });
    }
    const ss = String(await zipText(b, ents, 'xl/sharedStrings.xml')).split(/<\/si>/).map(tTexts);
    const lines = []; let total = 0, cut = false;
    for (const sh of sheets) {
      lines.push(`[시트 ${sh.name}]`);
      if (!sh.path || !ents[sh.path]) continue;
      for (const row of String(await zipText(b, ents, sh.path)).split(/<\/row>/)) {
        const cells = []; let c; const cr = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        while ((c = cr.exec(row)) !== null) {
          const tt = /\bt="(\w+)"/.exec(c[1]), inner = c[2] || '', v = /<v>([\s\S]*?)<\/v>/.exec(inner);
          const val = tt && tt[1] === 's' ? (v ? ss[+v[1]] || '' : '') : tt && tt[1] === 'inlineStr' ? tTexts(inner) : (v ? unxml(v[1]) : '');
          if (String(val).trim() !== '') cells.push(String(val).trim());
        }
        if (cells.length) { const l = cells.join(' | '); lines.push(l); total += l.length; if (total > 300000) { cut = true; break; } }
      }
      if (cut) break;
    }
    return { fmt: 'xlsx', text: lines.join('\n'), parts: `시트 ${sheets.length}`, note: '셀 값만(수식은 계산값, 날짜는 일련번호)' + (cut ? ' · 30만 자에서 자름' : '') };
  }
  async function readOoxml(b, ext, opt) {
    const ents = zipEntries(b), names = Object.keys(ents);
    if (ext === 'docx' || (!ext && ents['word/document.xml'])) {
      return { fmt: 'docx', text: xmlParas(await zipText(b, ents, 'word/document.xml')).join('\n'), parts: '' };
    }
    if (ext === 'pptx' || (!ext && ents['ppt/presentation.xml'])) {
      // 슬라이드 순서는 presentation.xml 의 sldId 순서(파일 번호와 다를 수 있음)
      let order = [];
      try {
        const pres = await zipText(b, ents, 'ppt/presentation.xml'), tgt = relMap(await zipText(b, ents, 'ppt/_rels/presentation.xml.rels'));
        let m; const sr = /<p:sldId\b[^>]*\br:id="([^"]+)"/g;
        while ((m = sr.exec(pres)) !== null) if (tgt[m[1]]) order.push('ppt/' + tgt[m[1]].replace(/^\/?ppt\//, '').replace(/^\.\.\//, ''));
        order = order.filter(p => ents[p]);
      } catch (e) { order = []; }
      if (!order.length) order = names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(numSort(/slide(\d+)\.xml$/));
      const lines = [];
      for (let i = 0; i < order.length; i++) {
        const paras = xmlParas(await zipText(b, ents, order[i]));
        let note = [];
        if (opt.notes) {
          const rel = order[i].replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'), rx = ents[rel] ? await zipText(b, ents, rel) : '';
          const nm = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rx);
          if (nm) note = xmlParas(await zipText(b, ents, 'ppt/notesSlides/' + nm[1])).filter(t => !/^\d+$/.test(t));
        }
        lines.push(`[슬라이드 ${i + 1}] ` + paras.join(' / ') + (note.length ? ' (메모: ' + note.join(' / ') + ')' : ''));
      }
      return { fmt: 'pptx', text: lines.join('\n'), parts: `슬라이드 ${order.length}` };
    }
    if (ext === 'xlsx' || (!ext && ents['xl/workbook.xml'])) return readXlsx(b, ents);
    if (ext === 'hwpx' || (!ext && names.some(n => /^Contents\/section\d+\.xml$/i.test(n)))) {
      const secs = names.filter(n => /^Contents\/section\d+\.xml$/i.test(n)).sort(numSort(/section(\d+)\.xml$/i));
      const paras = [];
      for (const s of secs) paras.push(...xmlParas(await zipText(b, ents, s)));
      return { fmt: 'hwpx', text: paras.join('\n'), parts: `구역 ${secs.length}` };
    }
    throw new Error('ZIP 안에 문서 본문이 없음(지원: docx·pptx·xlsx·hwpx)');
  }
  // OLE 복합 파일(CFB) 읽기 — 한글 5.0(.hwp)용 최소 구현(MS-CFB: 헤더·DIFAT·FAT·디렉터리·미니 스트림)
  function cfbOpen(b) {
    if (u32(b, 0) !== 0xE011CFD0 || u32(b, 4) !== 0xE11AB1A1) throw new Error('OLE 형식 아님');
    const ss = 1 << u16(b, 0x1E), ms = 1 << u16(b, 0x20), END = 0xFFFFFFFA, cutoff = u32(b, 0x38);
    const at = (s) => b.subarray((s + 1) * ss, (s + 2) * ss);
    const difat = [];
    for (let i = 0; i < 109; i++) { const s = u32(b, 0x4C + i * 4); if (s < END) difat.push(s); }
    let dsec = u32(b, 0x44), nd = u32(b, 0x48);
    while (nd-- > 0 && dsec < END) { const x = at(dsec); for (let i = 0; i < ss / 4 - 1; i++) { const s = u32(x, i * 4); if (s < END) difat.push(s); } dsec = u32(x, ss - 4); }
    const per = ss / 4, fat = new Uint32Array(difat.length * per);
    difat.forEach((s, k) => { const x = at(s); for (let i = 0; i < per && i * 4 + 3 < x.length; i++) fat[k * per + i] = u32(x, i * 4); });
    const chain = (start, tbl) => { const out = [], seen = new Set(); let s = start; while (s < END) { if (seen.has(s) || s >= tbl.length) throw new Error('OLE 체인 손상'); seen.add(s); out.push(s); s = tbl[s]; } return out; };
    const readBig = (start, size) => { const cs = chain(start, fat), buf = new Uint8Array(cs.length * ss); cs.forEach((s, i) => buf.set(at(s), i * ss)); return size == null ? buf : buf.subarray(0, size); };
    const dir = readBig(u32(b, 0x30)), ents = [];
    for (let i = 0; i + 128 <= dir.length; i += 128) {
      const nl = u16(dir, i + 0x40);
      ents.push({ name: nl >= 2 ? dec16(dir.subarray(i, i + nl - 2)) : '', type: dir[i + 0x42], left: u32(dir, i + 0x44), right: u32(dir, i + 0x48), child: u32(dir, i + 0x4C), start: u32(dir, i + 0x74), size: u32(dir, i + 0x78) });
    }
    const root = ents[0]; if (!root) throw new Error('OLE 디렉터리 없음');
    let mini = null, minifat = null;
    const readMini = (start, size) => {
      if (!mini) {
        mini = root.start < END ? readBig(root.start, root.size) : new Uint8Array(0);
        const mf = u32(b, 0x3C) < END ? readBig(u32(b, 0x3C)) : new Uint8Array(0);
        minifat = new Uint32Array(mf.length / 4); for (let i = 0; i < minifat.length; i++) minifat[i] = u32(mf, i * 4);
      }
      const cs = chain(start, minifat), buf = new Uint8Array(cs.length * ms);
      cs.forEach((s, i) => buf.set(mini.subarray(s * ms, (s + 1) * ms), i * ms));
      return buf.subarray(0, size);
    };
    const paths = {}, seen = new Set();
    (function walk(id, prefix) {
      if (id >= ents.length || seen.has(id)) return; seen.add(id);
      const e = ents[id]; walk(e.left, prefix); walk(e.right, prefix);
      const p = prefix + e.name; paths[p] = e;
      if (e.type === 1) walk(e.child, p + '/');
    })(root.child, '');
    return { paths, read: (p) => { const e = paths[p]; if (!e || e.type !== 2) return null; return e.size < cutoff ? readMini(e.start, e.size) : readBig(e.start, e.size); } };
  }
  // 한글 5.0 문단 글(HWPTAG_PARA_TEXT=67): UTF-16LE, 제어 문자 중 1칸짜리(0·10·13·24~31) 말고는 8칸(16바이트) 차지
  function hwpParaText(d) {
    let s = '';
    for (let i = 0; i + 1 < d.length; i += 2) {
      const c = d[i] | (d[i + 1] << 8);
      if (c >= 32) { s += String.fromCharCode(c); continue; }
      if (c === 13) break;
      if (c === 10) { s += '\n'; continue; }
      if (c === 9) { s += '\t'; i += 14; continue; }
      if (c === 0 || (c >= 24 && c <= 31)) { if (c === 30 || c === 31) s += ' '; continue; }
      i += 14;
    }
    return s;
  }
  function hwpRecords(d, out) {
    let o = 0;
    while (o + 4 <= d.length) {
      const h = u32(d, o); o += 4;
      const tag = h & 0x3FF; let size = (h >>> 20) & 0xFFF;
      if (size === 0xFFF) { if (o + 4 > d.length) break; size = u32(d, o); o += 4; }
      if (o + size > d.length) break;
      if (tag === 67 && size > 0) { const t = hwpParaText(d.subarray(o, o + size)).replace(/[ \t]+/g, ' ').trim(); if (t) out.push(t); }
      o += size;
    }
  }
  async function readHwp(b) {
    const cf = cfbOpen(b), fh = cf.read('FileHeader');
    if (!fh || !/^HWP Document File/.test(new TextDecoder('latin1').decode(fh.subarray(0, 17)))) return { unsupported: true, reason: '옛 Office 형식(doc·xls·ppt) 또는 알 수 없는 OLE 파일 — 브라우저 안 읽기 미지원' };
    const flags = u32(fh, 36);
    if (flags & 2) return { unsupported: true, reason: '암호가 걸린 hwp' };
    const secs = Object.keys(cf.paths).filter(p => /^BodyText\/Section\d+$/.test(p)).sort(numSort(/Section(\d+)$/));
    const paras = [];
    if (!(flags & 4)) for (const p of secs) { let d = cf.read(p); if (!d) continue; if (flags & 1) d = await inflateRaw(d); hwpRecords(d, paras); }
    if (paras.length) return { fmt: 'hwp', text: paras.join('\n'), parts: `구역 ${secs.length}` };
    const pv = cf.read('PrvText');   // 배포용 문서·본문 없음 → 한글이 남긴 미리보기 글(앞부분만)
    if (pv) return { fmt: 'hwp', text: dec16(pv).replace(/\u0000+$/, '').trim(), parts: '미리보기', note: (flags & 4) ? '배포용 문서 — 한글이 남긴 미리보기 글(앞부분)만' : '본문 구역을 못 읽어 미리보기 글(앞부분)만' };
    return { fmt: 'hwp', text: '', parts: '', note: '글을 찾지 못함' };
  }
  const TEXT_EXT = /^(txt|md|csv|tsv|json|xml|html?|log)$/;
  const NO_EXT = { pdf: 'PDF 는 브라우저 안 글 추출 미지원 — 링크로 열어 Dooray 미리보기로 보거나 내려받아 PDF 프로그램으로', ppt: '옛 PowerPoint(ppt)', doc: '옛 Word(doc)', xls: '옛 Excel(xls)', zip: '압축 파일', '7z': '압축 파일', png: '그림', jpg: '그림', jpeg: '그림', gif: '그림', mp4: '동영상' };
  async function readBytes(name, u8, opt = {}) {
    const ext = extOf(name);
    if (NO_EXT[ext]) return { unsupported: true, reason: NO_EXT[ext] + (ext === 'pdf' ? '' : ' — 브라우저 안 읽기 미지원') };
    let r;
    if (u8[0] === 0x50 && u8[1] === 0x4B) r = await readOoxml(u8, /^(docx|pptx|xlsx|hwpx)$/.test(ext) ? ext : '', opt);
    else if (u32(u8, 0) === 0xE011CFD0) r = await readHwp(u8);
    else if (TEXT_EXT.test(ext)) {
      let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { t = new TextDecoder('euc-kr').decode(u8); }
      r = { fmt: ext, text: /^html?$/.test(ext) ? htmlToText(t) : t, parts: '' };
    } else return { unsupported: true, reason: (ext || '확장자 없음') + ' 형식 — 브라우저 안 읽기 미지원' };
    if (r.unsupported) return r;
    const text = String(r.text || '').replace(/\r\n?/g, '\n');
    return Object.assign({ name, size: u8.length, textLen: text.length }, r, { text });
  }
  async function readFile(f, opt = {}) {
    const name = String((f && (f.name || f.fileName)) || ''), size = +(f && f.size) || 0, maxMB = opt.maxMB || 30;
    const dl = f && (f.dl || f.downloadUrl);
    if (!dl) return { name, error: '내려받기 주소 없음(폴더이거나 목록 항목이 아님)' };
    if (size > maxMB * 1048576) return { name, error: `파일이 ${(size / 1048576).toFixed(0)}MB — 기본 한도 ${maxMB}MB 초과(사용자가 원하면 {maxMB:${Math.ceil(size / 1048576) + 5}})` };
    const pre = extOf(name);
    if (NO_EXT[pre]) return { name, unsupported: true, reason: NO_EXT[pre] + (pre === 'pdf' ? '' : ' — 브라우저 안 읽기 미지원') };
    const r = await fetch(dl, { credentials: 'include' });
    if (!r.ok) return { name, error: `DOORAY: 파일 받기 실패(HTTP ${r.status})` };
    const u8 = new Uint8Array(await r.arrayBuffer());
    if (!/^(html?|xml)$/.test(pre) && /^\s*<(!doctype|html)/i.test(dec8(u8.subarray(0, 64)))) return { name, error: 'DOORAY: 파일 대신 웹 화면이 왔습니다 — 로그인이 풀렸을 수 있습니다' };
    try { return Object.assign({ name }, await readBytes(name, u8, opt)); }
    catch (e) { return { name, error: '읽기 실패: ' + errText(e) }; }
  }

  // ---------- 6. 브라우저로 내려받기 (토큰이 없을 때만 — ⚠️ 파일마다 사용자 허락 후: 이름·크기·출처를 먼저 알린다) ----------
  // 토큰이 있으면 dooray_io.py task-download·drive-download 를 쓴다(폴더 지정·여러 파일·덮어쓰기 없음). 이 길은 Chrome 의 다운로드 폴더로 한 파일씩.
  //   같은 탭에서 자동 다운로드를 연달아 하면 Chrome 이 두 번째부터 막는다(kiki 실측) → 여러 파일이면 사용자에게 주소창의 '여러 파일 다운로드' [허용]을 부탁.
  async function saveFile(f, { maxMB = 200 } = {}) {
    const name = String((f && (f.name || f.fileName)) || 'file'), size = +(f && f.size) || 0, dl = f && (f.dl || f.downloadUrl);
    if (!dl) return { name, error: '내려받기 주소 없음(폴더이거나 목록 항목이 아님)' };
    if (size > maxMB * 1048576) return { name, error: `파일이 ${(size / 1048576).toFixed(0)}MB — 브라우저 받기 한도 ${maxMB}MB 초과(토큰 경로 dooray_io.py 권장)` };
    const r = await fetch(dl, { credentials: 'include' });
    if (!r.ok) return { name, error: `DOORAY: 파일 받기 실패(HTTP ${r.status})` };
    const blob = await r.blob();
    if (/text\/html/i.test(blob.type || '') && !/\.html?$/i.test(name)) return { name, error: 'DOORAY: 파일 대신 웹 화면이 왔습니다 — 로그인이 풀렸을 수 있습니다' };
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { name, size: blob.size, saved: 'Chrome 다운로드 폴더' };
  }
  function fmtSaved(r) {
    if (r == null) return notYet();
    if (r.error) return 'ERR ' + sanitize((r.name ? r.name + ': ' : '') + r.error);
    return sanitize(`받기 요청됨 ${r.name} (${kb(r.size)}) → ${r.saved} — Chrome 아래쪽·주소창의 다운로드 표시로 확인(여러 파일이면 '여러 파일 다운로드' 허용이 필요할 수 있음)`);
  }

  // ---------- 대화형 후속 질문용 거르기 (다시 검색하지 않고 들고 있는 결과로) ----------
  // only(x, { kind:'file'|'folder'|'task', ext:'pptx|hwp', name:/정규식/, who:/사람/, project:/프로젝트·드라이브/, text:/본문·댓글/, since, until })
  function only(x, c = {}) {
    const rx = (v) => v == null ? null : (v instanceof RegExp ? new RegExp(v.source, v.flags.replace('g', '')) : new RegExp(String(v), 'i'));
    const nm = rx(c.name), who = rx(c.who), pj = rx(c.project), tx = rx(c.text), ext = c.ext ? new RegExp('^(?:' + c.ext + ')$', 'i') : null;
    const P = period(c);
    const items = listOf(x).filter(it => {
      if (c.kind && it.kind !== c.kind) return false;
      if (ext && !ext.test(it.ext || '')) return false;
      if (nm && !nm.test(it.name || it.subject || '')) return false;
      if (who && ![it.by, it.upd, it.from].concat(it.to || [], it.cc || []).some(v => v && who.test(v))) return false;
      if (pj && !pj.test(it.project || it.drive || '')) return false;
      const ts = tsOf(it.updated);
      if ((c.since || c.until) && (ts < P.since || ts > P.until)) return false;
      if (tx) { const d = it.detail || {}; const all = [it.subject || it.name || '', d.text || ''].concat((d.comments || []).map(v => v.text)).join('\n'); if (!tx.test(all)) return false; }
      return true;
    });
    return { items, total: items.length, filtered: true };
  }

  // ---------- 출력 도우미 ----------
  // 출력 필터(2026-09-29 실측): `size=100&page=0` 같은 쿼리·쿠키 꼴이 있으면 결과 전체가 [BLOCKED: Cookie/query string data].
  //   URL·19자리 id·날짜 숫자·/ & ; ? 는 그대로 통과(kk-mail 을 만든 09-24 보다 완화됨). → '=' 만 전각 '＝' 로 바꾼다(읽는 데 지장 없음).
  //   링크는 fmtLinks 가 주소 그대로 준다. 가려져 보이면 fmtLinks(x, 0, 12, {hy:true}) 의 하이픈 번호로 주소를 조합.
  function sanitize(s) { return String(s == null ? '' : s).replace(/=/g, '＝'); }
  function hyId(id) { return String(id).replace(/(\d{4})(?=\d)/g, '$1-'); }
  const NOT_YET = '(결과 없음 — 비동기 조회가 아직이면 2~3초 뒤 다시. 계속 이러면 .then(r=>…, e=>window.__d={error:String(e)}) 로 오류까지 저장했는지 확인)';
  const notYet = () => progress ? `(아직 — ${progress}. 2~3초 뒤 다시)` : NOT_YET;
  function listOf(x) { return Array.isArray(x) ? x : (x && x.items) || []; }
  function errOf(x) { return (x && !Array.isArray(x) && x.error) ? String(x.error) : ''; }
  function fitRows(rows, reserve = 150) { const out = []; let n = reserve; for (const r of rows) { n += r.length + 1; if (n > 960) break; out.push(r); } return out; }
  const d8 = (s) => String(s || '').slice(2, 10);
  function kb(n) { n = +n || 0; return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : n >= 1024 ? Math.round(n / 1024) + 'KB' : n + 'B'; }
  function cutNote(x) {
    if (!x || Array.isArray(x)) return '';
    if (x.truncatedGroups) return ' ⚠ 잘림(' + x.truncatedGroups.length + '묶음 — maxPages 늘려 다시)';
    return x.truncated ? ` ⚠ 잘림(전체 ${x.total} 중 ${x.fetched} — maxPages 늘려 다시)` : '';
  }
  const taskRow = (it, i, subj = 40) => sanitize(`${i} | ${d8(it.updated)} | ${it.status.slice(0, 6)} | ${it.project.slice(0, 14)} | ${it.subject.slice(0, subj)} | ${it.from.slice(0, 6)}`
    + (it.files ? ` | 첨부${it.files}` : '') + (it.detail && it.detail.commentTotal ? ` 댓글${it.detail.commentTotal}` : '') + (it.sub ? ` 하위${it.sub}` : ''));
  const driveRow = (it, i, nlen = 44) => sanitize(`${i} | ${d8(it.updated)} | ${it.kind === 'folder' ? '폴더' : (it.ext || '파일')} | ${it.drive.slice(0, 14)}${it.path ? ' ' + it.path.slice(-30) : ''} | ${it.name.slice(0, nlen)}`
    + (it.kind === 'file' ? ` | ${kb(it.size)}` : '') + (it.by ? ` | ${it.by.slice(0, 6)}` : '') + (it.trashed ? ' | 휴지통' : ''));
  // 업무 목록 조각: idx | 수정일 | 상태 | 프로젝트 | 제목 | 작성자 | 첨부·댓글·하위 [| 본문 앞 pv자]
  function fmtTasks(x, from = 0, to = 12, { subj = 40, pv = 0 } = {}) {
    if (x == null) return notYet();
    const items = listOf(x), err = errOf(x);
    if (err && !items.length) return 'ERR ' + sanitize(err);
    const rows = fitRows(items.slice(from, to).map((it, k) => taskRow(it, from + k, subj) + (pv && it.detail && it.detail.text ? ' | ' + sanitize(it.detail.text.slice(0, pv)) : '')));
    const end = from + rows.length;
    return `[업무 ${from}-${end} of ${items.length}${x.totalSum != null ? ', 서버 합계 ' + x.totalSum : ''}]` + (end < Math.min(to, items.length) ? ` ▶ 다음 조각 ${end}` : '') + (err ? ' ⚠ 일부 오류: ' + sanitize(err).slice(0, 80) : '') + cutNote(x) + '\n' + rows.join('\n');
  }
  // 드라이브 목록 조각: idx | 수정일 | 종류 | 드라이브 [경로] | 이름 | 크기 | 올린 사람
  function fmtDrive(x, from = 0, to = 12, { name = 44 } = {}) {
    if (x == null) return notYet();
    const items = listOf(x), err = errOf(x);
    if (err && !items.length) return 'ERR ' + sanitize(err);
    const rows = fitRows(items.slice(from, to).map((it, k) => driveRow(it, from + k, name)));
    const end = from + rows.length;
    return `[드라이브 ${from}-${end} of ${items.length}${x.totalSum != null ? ', 서버 합계 ' + x.totalSum : ''}]` + (end < Math.min(to, items.length) ? ` ▶ 다음 조각 ${end}` : '') + (err ? ' ⚠ 일부 오류: ' + sanitize(err).slice(0, 80) : '') + cutNote(x) + '\n' + rows.join('\n');
  }
  // find 결과 첫 화면: 머리줄(건수·시간·오류·잘림) + 업무 위 rows 줄 + 드라이브 위 rows 줄
  function fmtFind(x, { rows = 6 } = {}) {
    if (x == null) return notYet();
    if (x.error && !x.tasks && !x.drive) return 'ERR ' + sanitize(x.error);
    const T = x.tasks, D = x.drive, parts = [];
    const cnt = (c, nm) => !c ? '' : c.error && !listOf(c).length ? `${nm} ERR` : `${nm} ${listOf(c).length}건`;
    let head = `[찾기 ${(x.ms / 1000).toFixed(1)}초 | ${[cnt(T, '업무'), cnt(D, '드라이브')].filter(Boolean).join(' · ')}${x.period ? ' | 기간 ' + x.period : ''}]`;
    if (T && T.error) head += '\n⚠ 업무: ' + sanitize(T.error).slice(0, 120);
    if (D && D.error) head += '\n⚠ 드라이브: ' + sanitize(D.error).slice(0, 120);
    if ((T && T.truncated) || (D && D.truncated)) head += '\n⚠ 잘림 — ' + [T && T.truncated ? '업무' + cutNote(T) : '', D && D.truncated ? '드라이브' + cutNote(D) : ''].filter(Boolean).join(' / ');
    let used = head.length + 40;
    const add = (title, list, rowFn) => {
      if (!list.length) { parts.push(title + ' 없음'); used += title.length + 4; return; }
      const rs = [];
      for (const [k, it] of list.slice(0, rows).entries()) { const r = rowFn(it, k); if (used + r.length + 1 > 960) break; rs.push(r); used += r.length + 1; }
      parts.push(title + (list.length > rs.length ? ` (${rs.length}/${list.length} — 더 보기 fmt${title === '업무' ? 'Tasks' : 'Drive'})` : '') + '\n' + rs.join('\n'));
      used += title.length + 30;
    };
    if (T) add('업무', listOf(T), (it, k) => taskRow(it, k, 34));
    if (D) add('드라이브', listOf(D), (it, k) => driveRow(it, k, 36));
    return head + '\n' + parts.join('\n');
  }
  // 업무 1건 자세히: 머리(제목·프로젝트·상태·작성→담당·날짜·첨부·댓글 수) + 본문 chars 자(offset 으로 이어 읽기)
  function fmtTask(it, chars = 600, offset = 0) {
    if (it == null) return notYet();
    if (it.error) return 'ERR ' + sanitize(it.error);
    const d = it.detail;
    if (!d) return '(자세히 없음 — 먼저 kkDooray.getTasks([항목]) 로 본문·첨부·댓글을 읽을 것. 목록 항목에 그대로 채워진다)';
    if (d.error) return 'ERR ' + sanitize(d.error);
    const fs = filesOf(it), files = fs.length ? ` (${fs.slice(0, 3).map(f => f.name).join(', ').slice(0, 90)})` : '';
    const head = `${it.subject.slice(0, 50)} | ${it.project} | ${it.status} | ${it.from}→${it.to.slice(0, 3).join(',')}${it.to.length > 3 ? ' 외' + (it.to.length - 3) : ''} | 작성 ${d8(it.created)} 수정 ${d8(it.updated)} | 첨부 ${fs.length}${files} | 댓글 ${d.commentTotal}${d.commentError ? ' ⚠' + d.commentError.slice(0, 40) : ''} | 본문 ${d.textLen}자`;
    return sanitize(head + '\n' + d.text.slice(offset, offset + chars));
  }
  // 댓글 조각(최신순): idx | 날짜 시각 | 누가 | 내용 chars 자 [| 첨부 이름]
  function fmtComments(it, from = 0, to = 8, { chars = 160 } = {}) {
    if (it == null) return notYet();
    const d = it.detail;
    if (!d) return '(자세히 없음 — getTask 먼저)';
    if (d.error || d.commentError) return 'ERR ' + sanitize(d.error || d.commentError);
    const rows = fitRows(d.comments.slice(from, to).map((c, k) => sanitize(`${from + k} | ${String(c.date).slice(2, 16).replace('T', ' ')} | ${c.who.slice(0, 8)} | ${c.text.replace(/\s+/g, ' ').slice(0, chars)}` + (c.files.length ? ` | 첨부 ${c.files.map(f => f.name).join(', ').slice(0, 60)}` : ''))));
    const end = from + rows.length;
    return `[댓글 ${from}-${end} of ${d.comments.length}, 전체 ${d.commentTotal}]` + (end < Math.min(to, d.comments.length) ? ` ▶ 다음 조각 ${end}` : '') + (d.comments.length < d.commentTotal ? ' (더 오래된 댓글은 getTask(항목,{comments:100}))' : '') + '\n' + rows.join('\n');
  }
  // 업무 첨부 목록(본문+댓글) — 내용 읽기 전에 파일명·크기를 사용자에게 알리는 용도: idx | 이름 | 크기 | 올린 사람 | 날짜 | 어디
  // 댓글에 단 파일은 업무 첨부(fileIdList)에도 함께 들어 있다(실측) → 같은 파일은 한 번만, 댓글에서 온 것은 '댓글 날짜'로 표시
  function filesOf(it) {
    const d = (it && it.detail) || {};
    const fromC = [].concat(...(d.comments || []).map(c => c.files.map(f => Object.assign({ where: '댓글 ' + String(c.date).slice(2, 10) }, f))));
    const seen = new Set(fromC.map(f => f.id).filter(Boolean));
    return (d.fileList || []).filter(f => !f.id || !seen.has(f.id)).map(f => Object.assign({ where: '본문' }, f)).concat(fromC);
  }
  // {ids:true} 면 줄 끝에 첨부 id — 받기(dooray_io.py task-download <업무 링크> --file <id>)에 그대로 넘긴다
  function fmtFiles(it, from = 0, to = 15, { ids = false } = {}) {
    if (it == null) return notYet();
    if (!it.detail) return '(자세히 없음 — getTask 먼저)';
    const fs = filesOf(it), rows = fitRows(fs.slice(from, to).map((f, k) => sanitize(`${from + k} | ${f.name.slice(0, 50)} | ${kb(f.size)} | ${f.by.slice(0, 6)} | ${d8(f.created)} | ${f.where}` + (ids ? ` | id ${f.id}` : ''))));
    const end = from + rows.length;
    return `[첨부 ${from}-${end} of ${fs.length}]` + (end < Math.min(to, fs.length) ? ` ▶ 다음 조각 ${end}` : '') + '\n' + rows.join('\n');
  }
  // 링크: idx | 주소 — 업무 https://kist.gov-dooray.com/task/{프로젝트}/{업무} · 드라이브 https://kist.gov-dooray.com/drive/{프로젝트}/views/{파일}
  //   {hy:true} 면 주소 대신 하이픈 번호(P 프로젝트 | T 업무 또는 F 파일) — 출력 필터가 주소를 가릴 때만. '-' 를 지워 위 형식으로 조합.
  //   x = 목록 컨테이너·배열 또는 항목 1건. idx 는 그 목록의 번호(fmtTasks·fmtDrive 와 같다).
  function fmtLinks(x, from = 0, to = 12, { hy = false } = {}) {
    if (x == null) return notYet();
    const one = x && x.kind && x.id, items = one ? [x] : listOf(x), err = one ? '' : errOf(x);
    if (err && !items.length) return 'ERR ' + sanitize(err);
    const rows = fitRows(items.slice(from, to).map((it, k) => `${from + k} | ` + (hy ? `P ${hyId(it.projectId)} | ${it.kind === 'task' ? 'T' : 'F'} ${hyId(it.id)}` : it.url)), 80);
    const end = from + rows.length;
    return `[링크 ${from}-${end} of ${items.length}]` + (end < Math.min(to, items.length) ? ` ▶ 다음 조각 ${end}` : '') + '\n' + rows.join('\n');
  }
  // 파일 내용 조각: 머리(이름·형식·글자 수·쪽수) + 글 chars 자(offset 으로 이어 읽기)
  function fmtText(r, chars = 800, offset = 0) {
    if (r == null) return notYet();
    if (r.error) return 'ERR ' + sanitize((r.name ? r.name + ': ' : '') + r.error);
    if (r.unsupported) return '읽기 미지원 ' + sanitize((r.name ? r.name + ': ' : '') + r.reason);
    const head = `${r.name.slice(0, 50)} | ${r.fmt} | ${kb(r.size)} | 글 ${r.textLen}자${r.parts ? ' | ' + r.parts : ''}${r.note ? ' | ' + r.note : ''}` + (offset ? ` | ${offset}자부터` : '');
    return sanitize(head + '\n' + r.text.slice(offset, offset + chars));
  }

  window.kkDooray = {
    dfetch, apiErr,
    searchTasks, searchTasksMany, projectTasks, getTask, getTasks,
    searchDrive, searchDriveMany, drivePath, drivePaths,
    find, only, filesOf, readFile, readBytes, saveFile,
    fmtFind, fmtTasks, fmtDrive, fmtTask, fmtComments, fmtFiles, fmtLinks, fmtText, fmtSaved, sanitize, hyId,
    _version: 'kk-dooray-ops/1.2',
  };
  return window.kkDooray._version + ' =^.^=';
})();
