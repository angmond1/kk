// ============================================================
// kk-dry 코어 — KIST Dooray 업무·드라이브 찾기 (window.kkDry)
// ------------------------------------------------------------
// 동작 원리: kist.gov-dooray.com 탭의 "세션 쿠키"로 Dooray 검색창과 같은 서버 검색(internal wapi)을 부른다.
//   → API 토큰·비번·Python 불필요. 본인 로그인 세션으로 본인이 볼 수 있는 것만 보인다. 이 코어는 조회 전용(쓰기 호출 없음) —
//   업무 글·댓글·첨부 올리기, 드라이브 올리기, 파일을 PC 폴더로 받기는 scripts/dooray_io.py(공식 API·토큰, 미리보기 → --yes).
// 사용법: 이 파일(주입은 .min.js)을 Read → Claude in Chrome javascript_tool 로 1회 inject →
//   이후 window.kkDry.<함수>() 호출. (개인정보·하드코딩 식별자 없음)
// 출력 제약: javascript_tool 반환은 ~1,000자에서 잘리고 `a=b&c=d` 꼴이 섞이면 통째로 가려진다 → 결과는 window 에 두고 fmt* 로 조각 회수.
// 실측(2026-09-29): 업무 검색 = 제목·본문·댓글, 낱말 AND(순서 무관), 0.5초 / 드라이브 검색 = 파일·폴더 이름과 올린 사람 이름
//   (파일 속 글은 색인 안 됨), 낱말 AND, 약 3초 / 드라이브 파일은 같은 탭에서 받아 브라우저 메모리에서 읽을 수 있다.
// ============================================================
(function () {
  const BASE = 'https://kist.gov-dooray.com';
  const E = encodeURIComponent;

  // 요청 제한 시간 — 응답이 멈추면 ms 뒤 끊고 'DOORAY: 응답 없음' 오류(찾기·훑기가 한 요청에 붙잡히지 않게). read(r) 가 있으면 본문 읽기까지 제한 안에서.
  //   TMO: api 30초(Dooray 호출) · pv 15초(미리보기 상태) · page 30초(미리보기 쪽 글·그림) · fileMin 60초(파일 받기, 크기 1MB 당 2초씩 늘어남)
  const TMO = { api: 30000, pv: 15000, page: 30000, fileMin: 60000 };
  async function tfetch(url, opts = {}, ms = 30000, read = null) {
    if (typeof AbortController !== 'function') { const r0 = await fetch(url, opts); return read ? { r: r0, body: await read(r0) } : r0; }
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(url, Object.assign({}, opts, { signal: ac.signal }));
      return read ? { r, body: await read(r) } : r;
    } catch (e) {
      if (ac.signal.aborted) throw new Error(`DOORAY: 응답 없음(${Math.round(ms / 1000)}초) — 사내망·VPN 확인 후 다시`);
      throw e;
    } finally { clearTimeout(timer); }
  }
  // 응답 판독 — kk-mail 과 같은 규칙: 로그인이 풀리면 JSON 대신 로그인 화면(HTML)이 온다 → 원인과 다음 행동을 담은 DOORAY: 오류.
  async function dfetch(url, { method = 'GET', body = null } = {}) {
    const headers = { Accept: 'application/json' };
    const opts = { method, credentials: 'include', headers };
    if (body != null) { headers['Content-Type'] = 'application/json'; opts.body = typeof body === 'string' ? body : JSON.stringify(body); }
    const { r, body: t } = await tfetch(url, opts, TMO.api, (rr) => rr.text());   // 머리만 오고 본문이 멈춰도 제한 시간 안에서 끊는다(Codex 검토 M1)
    if (r.status === 401 || r.status === 403) throw new Error(`DOORAY: 권한 없음(HTTP ${r.status}) — kist.gov-dooray.com 로그인 확인 → 탭 새로고침 → 코어 재주입`);
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
  // 드라이브 링크 (2026-09-29 실측 — 사용자 지적 "링크를 누르니 그 파일은 안 보이고 폴더만 보인다"):
  //   /drive/{P}/views/{F} 만 주면 드라이브 최상위 폴더가 열리고 파일은 보이지 않는다(검색창 결과 화면에서 누를 때만 선택됨).
  //   파일 = /drive/{P}/{부모 폴더}/views/{F} — Dooray 에서 폴더 안 파일을 누르면 생기는 주소. 그 폴더가 열리고(왼쪽 트리 펼침) 파일이 선택되며
  //     오른쪽에 미리보기 그림·크기·경로·히스토리가 뜬다. 부모 폴더는 검색 결과에 없어 drivePath 가 채운다.
  //   부모 폴더를 아직 모르면 /drive/{P}/views/{F}?query=<all=이름 낱말&…> — 검색 결과 화면에서 그 파일이 선택된다(대안, 한글 이름도 됨).
  //   폴더 = /drive/{P}/{폴더} — 그 폴더를 연다.
  function driveUrl(it) {
    if (it.kind === 'folder') return `${BASE}/drive/${it.projectId}/${it.id}`;
    if (it.folderId) return `${BASE}/drive/${it.projectId}/${it.folderId}/views/${it.id}`;
    const words = String(it.name || '').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).slice(0, 6);
    return `${BASE}/drive/${it.projectId}/views/${it.id}` + (words.length ? '?query=' + E(words.map(w => 'all=' + E(w)).join('&')) : '');
  }
  function driveItem(c, refs) {
    const dm = ((refs && refs.driveMap) || {})[c.driveId] || {}, om = (refs && refs.organizationMemberMap) || {};
    const folder = c.type === 'folder';
    const it = {
      kind: folder ? 'folder' : 'file', id: String(c.id), driveId: String(c.driveId || ''), projectId: String(c.projectId || dm.projectId || ''),
      drive: dm.name || '', name: c.name || '', ext: folder ? '' : extOf(c.name), mime: c.mimeType || '', size: c.size || 0,
      created: c.createdAt || '', updated: c.updatedAt || '', by: (om[c.createOrganizationMemberId] || {}).name || '', upd: (om[c.lastUpdateOrganizationMemberId] || {}).name || '',
      trashed: !!c.isTrashed, dl: c.downloadUrl || '', path: '', version: c.version != null ? c.version : 0,
    };
    it.url = driveUrl(it);
    return it;
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
    it.url = driveUrl(it);   // 부모 폴더를 알았으니 파일이 선택된 채 열리는 링크로
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
  async function getTask(x, { comments = 20, bodyChars = 200000 } = {}) {   // 본문·댓글은 끝까지(20만·5만 자 넘을 때만 자르고 textCut·cut 로 표시 — Codex 검토 M4)
    const id = String(x && x.id ? x.id : x).replace(/-/g, '');
    const d = await dfetch(`/wapi/task/v1/tasks/${id}?fields=me%2Cbody`);
    const t = d.result;
    if (apiErr(d) || !t || !t.id) throw new Error('DOORAY 업무 조회 실패: ' + (apiErr(d) || 'no result'));
    const refs = d.references || {}, fm = refs.fileMap || {};
    const it = Object.assign(taskItem(t, refs), x && x.hits ? { hits: x.hits } : {});
    const fullText = bodyText(t.body), text = fullText.slice(0, bodyChars);
    const withTask = (f) => Object.assign(fileOf(f), { taskId: String(t.id) });   // 첨부 미리보기(서버 변환)에 업무 번호가 필요
    const det = { text, textLen: text.length, textFull: fullText.length, textCut: fullText.length > text.length, fileList: (t.fileIdList || []).map(fid => fm[fid]).filter(Boolean).map(withTask), comments: [], commentTotal: 0 };
    if (comments > 0 && t.number != null) {
      try {
        const c = await dfetch(`/wapi/task/v1/projects/!${t.projectId}/tasks/${t.number}/events?size=${comments}&order=-createdAt&fields=me&direction=%3A&eventType=comment`);
        if (!Array.isArray(c.result)) throw new Error(apiErr(c) || 'no result');
        const cfm = (c.references && c.references.fileMap) || {};
        det.commentTotal = c.totalCount != null ? c.totalCount : c.result.length;
        det.comments = c.result.map(e => ({ date: e.createdAt || '', who: nameOf(e.creator), text: bodyText(e.body).slice(0, 50000), cut: bodyText(e.body).length > 50000,
          files: (e.fileIdList || []).map(fid => cfm[fid]).filter(Boolean).map(withTask) }));
      } catch (e) { det.commentError = 'DOORAY 댓글 조회 실패: ' + errText(e); }
    }
    it.detail = det;
    return it;
  }
  // 여러 건 자세히(2개씩 동시). 목록 컨테이너나 배열의 항목에 .detail 을 채운다(실패는 .detail = { error }).
  async function getTasks(x, { n = 5, comments = 20 } = {}) {
    const list = listOf(x).filter(it => it.kind === 'task').slice(0, n);
    const r = await pool(list, 3, (it) => getTask(it, { comments }));
    r.forEach((v, k) => { list[k].detail = v && v.detail ? v.detail : { error: (v && v.error) || 'no result' }; });
    return list;
  }

  // ---------- 4. 한 번에 찾기 (대화형 검색의 기본 호출) ----------
  // find(groups, opt) — 업무·드라이브를 동의어 묶음별로 동시에 검색 → 합치기 → 위쪽 업무 detail 건 본문·첨부·댓글, 드라이브 paths 건 경로까지.
  //   groups: '○○사업' | ['○○사업','보고서'](AND) | [['○○사업'],['영문 사업명'],['○○사업','보고서']](묶음끼리 합침)
  //   opt: { tasks?:true, drive?:true, detail?:5, paths?:10, comments?:10, since?, until?, sinceDays?, projectId?, kind?, ext?, maxPages? }
  //   2-스텝: window.__d=null; kkDry.find([...]).then(r=>window.__d=r, e=>window.__d={error:String(e)}); 'started' → 다음 호출 fmtFind(window.__d)
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

  // ---------- 5. 파일 내용 읽기 (사용자가 시킨 찾기·질문에 필요하면 묻지 않고 읽는다 — 2026-09-29 사용자 지시. 그 밖에는 파일명·크기를 먼저 알리고) ----------
  // 드라이브 항목(dl) 또는 업무 첨부(getTask 의 detail.fileList 항목)를 같은 탭에서 받아 브라우저 메모리에서만 글을 뽑는다(디스크 저장 없음).
  //   지원: docx·pptx·xlsx·hwpx(ZIP+XML) / hwp(한글 5.0, OLE) / txt·md·csv·json·xml·html·log. 미지원: pdf·ppt·doc·xls(옛 형식)·그림·압축 → unsupported.
  //   opt = { maxMB?:30, notes?:false(pptx 발표자 메모 포함) }. 반환 { name, fmt, size, text, textLen, parts, note? } 또는 { unsupported, reason } / { error }.
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  // Chrome 의 DecompressionStream 은 압축 끝 뒤에 남는 바이트가 있으면 오류를 낸다(한글 5.0 hwp 본문 구역에서 실측, 2026-09-29).
  //   ① Response.arrayBuffer() 로 읽으면 그 오류가 엉뚱한 'Failed to fetch' 로 보이고 ② 그때 이미 푼 뒤쪽 출력을 버린다
  //   (실측: 48MB 최종보고서 본문 37.6만 바이트 중 13.1만만 남아 글이 문장 중간에서 끊김) → 그 오류면 순수 JS inflate 로 처음부터 다시 푼다.
  async function inflateRaw(u8) {
    const rd = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = []; let n = 0;
    try {
      for (;;) { const x = await rd.read(); if (x.done) break; parts.push(x.value); n += x.value.length; }
    } catch (e) {
      if (/junk|after end/i.test(errText(e))) return inflateJS(u8);
      throw new Error('압축 풀기 실패: ' + errText(e));
    }
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  // 순수 JS raw inflate(RFC 1951, zlib 의 puff 방식) — 마지막 블록에서 멈추고 뒤 바이트는 무시한다. 느리지만(수 MB/초) '끝 뒤 바이트' 경우에만 쓴다.
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function inflateJS(src) {
    let pos = 0, bb = 0, bc = 0, op = 0, out = new Uint8Array(Math.max(1024, src.length * 4));
    const bad = (why) => new Error('압축 풀기 실패: ' + why);
    const need = (k) => { if (op + k <= out.length) return; let m = out.length * 2; while (m < op + k) m *= 2; const o2 = new Uint8Array(m); o2.set(out.subarray(0, op)); out = o2; };
    const bits = (k) => { while (bc < k) { if (pos >= src.length) throw bad('압축 데이터가 중간에 끝남'); bb |= src[pos++] << bc; bc += 8; } const v = bb & ((1 << k) - 1); bb >>>= k; bc -= k; return v; };
    const build = (lens, k) => {
      const count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(k);
      for (let i = 0; i < k; i++) count[lens[i]]++;
      count[0] = 0;
      for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
      for (let i = 0; i < k; i++) if (lens[i]) sym[offs[lens[i]]++] = i;
      return { count, sym };
    };
    const decode = (h) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const c = h.count[len];
        if (code - c < first) return h.sym[index + (code - first)];
        index += c; first += c; first <<= 1; code <<= 1;
      }
      throw bad('허프만 코드 손상');
    };
    let fixL = null, fixD = null, last = 0;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bb = 0; bc = 0;   // 바이트 경계로
        if (pos + 4 > src.length) throw bad('압축 데이터가 중간에 끝남');
        const len = src[pos] | (src[pos + 1] << 8); pos += 4;
        if (pos + len > src.length) throw bad('압축 데이터가 중간에 끝남');
        need(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
        continue;
      }
      let lt, dt;
      if (type === 1) {
        if (!fixL) { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); fixL = build(l, 288); fixD = build(new Uint8Array(30).fill(5), 30); }
        lt = fixL; dt = fixD;
      } else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4, cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
        const ct = build(cl, 19), lens = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const s = decode(ct);
          if (s < 16) { lens[i++] = s; continue; }
          let rep, val = 0;
          if (s === 16) { if (!i) throw bad('길이 반복 손상'); val = lens[i - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
          if (i + rep > hlit + hdist) throw bad('길이 반복 손상');
          while (rep--) lens[i++] = val;
        }
        lt = build(lens.subarray(0, hlit), hlit); dt = build(lens.subarray(hlit), hdist);
      } else throw bad('블록 형식 손상');
      for (;;) {
        const s = decode(lt);
        if (s < 256) { need(1); out[op++] = s; continue; }
        if (s === 256) break;
        const li = s - 257; if (li >= 29) throw bad('길이 코드 손상');
        const len = LBASE[li] + bits(LEXT[li]), di = decode(dt); if (di >= 30) throw bad('거리 코드 손상');
        const dist = DBASE[di] + bits(DEXT[di]); if (dist > op) throw bad('거리 손상');
        need(len);
        for (let k = 0; k < len; k++) { out[op] = out[op - dist]; op++; }
      }
    } while (!last);
    return out.subarray(0, op);
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
  async function zipBytes(b, ents, name) {
    const en = ents[name]; if (!en) return null;
    const p = en.lho;
    if (u32(b, p) !== 0x04034b50) throw new Error('ZIP 항목 손상: ' + name);
    const s = p + 30 + u16(b, p + 26) + u16(b, p + 28), data = b.subarray(s, s + en.csize);
    if (en.method === 0) return data;
    if (en.method === 8) return inflateRaw(data);
    throw new Error('ZIP 압축 방식 ' + en.method + ' 미지원');
  }
  async function zipText(b, ents, name) { const d = await zipBytes(b, ents, name); return d ? dec8(d) : ''; }
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
  const colIdx = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;   // 'A' → 0, 'AA' → 26
  async function readXlsx(b, ents, full) {   // full = 시트마다 칸 위치를 살린 표(grids)도 — 파일 속 찾기의 채팅 표용
    const wb = await zipText(b, ents, 'xl/workbook.xml'), tgt = relMap(await zipText(b, ents, 'xl/_rels/workbook.xml.rels'));
    const sheets = []; let m; const r = /<sheet\b[^>]*>/g;
    while ((m = r.exec(wb)) !== null) {
      const nm = /\bname="([^"]*)"/.exec(m[0]), id = /\br:id="([^"]+)"/.exec(m[0]);
      sheets.push({ name: unxml(nm ? nm[1] : '?'), path: id && tgt[id[1]] ? 'xl/' + tgt[id[1]].replace(/^\/?xl\//, '') : '' });
    }
    const ss = String(await zipText(b, ents, 'xl/sharedStrings.xml')).split(/<\/si>/).map(tTexts);
    const lines = [], grids = []; let total = 0, cut = false;
    for (const sh of sheets) {
      lines.push(`[시트 ${sh.name}]`);
      const grid = [], rowNums = []; grids.push({ name: sh.name, rows: grid, rowNums });
      if (!sh.path || !ents[sh.path]) continue;
      for (const row of String(await zipText(b, ents, sh.path)).split(/<\/row>/)) {
        const cells = [], pos = [], rn = /<row\b[^>]*\br="(\d+)"/.exec(row); let c; const cr = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        while ((c = cr.exec(row)) !== null) {
          const tt = /\bt="(\w+)"/.exec(c[1]), inner = c[2] || '', v = /<v>([\s\S]*?)<\/v>/.exec(inner), ref = /\br="([A-Z]+)\d+"/.exec(c[1]);
          const val = tt && tt[1] === 's' ? (v ? ss[+v[1]] || '' : '') : tt && tt[1] === 'inlineStr' ? tTexts(inner) : (v ? unxml(v[1]) : '');
          const sv = String(val).trim().replace(/\s*[\r\n]+\s*/g, ' / ');   // 칸 안 줄바꿈 → ' / ' (한 행 = 한 줄 — 행 번호가 밀리지 않게)
          if (sv !== '') { cells.push(sv); pos[ref ? colIdx(ref[1]) : pos.length] = sv; }
        }
        if (cells.length) { const l = cells.join(' | '); lines.push(l); if (full) { grid.push(pos); rowNums.push(rn ? +rn[1] : grid.length); } total += l.length; if (total > 300000) { cut = true; break; } }
      }
      if (cut) break;
    }
    return Object.assign({ fmt: 'xlsx', text: lines.join('\n'), parts: `시트 ${sheets.length}`, note: '셀 값만(수식은 계산값, 날짜는 일련번호)' + (cut ? ' · 30만 자에서 자름' : '') }, full ? { grids } : {});
  }
  // 슬라이드 순서는 presentation.xml 의 sldId 순서(파일 번호와 다를 수 있음)
  async function pptxOrder(b, ents) {
    let order = [];
    try {
      const pres = await zipText(b, ents, 'ppt/presentation.xml'), tgt = relMap(await zipText(b, ents, 'ppt/_rels/presentation.xml.rels'));
      let m; const sr = /<p:sldId\b[^>]*\br:id="([^"]+)"/g;
      while ((m = sr.exec(pres)) !== null) if (tgt[m[1]]) order.push('ppt/' + tgt[m[1]].replace(/^\/?ppt\//, '').replace(/^\.\.\//, ''));
      order = order.filter(p => ents[p]);
    } catch (e) { order = []; }
    if (!order.length) order = Object.keys(ents).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(numSort(/slide(\d+)\.xml$/));
    return order;
  }
  async function readOoxml(b, ext, opt) {
    const ents = zipEntries(b), names = Object.keys(ents);
    if (ext === 'docx' || (!ext && ents['word/document.xml'])) {
      return { fmt: 'docx', text: xmlParas(await zipText(b, ents, 'word/document.xml')).join('\n'), parts: '' };
    }
    if (ext === 'pptx' || (!ext && ents['ppt/presentation.xml'])) {
      const order = await pptxOrder(b, ents);
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
      for (const s of secs) for (const x of xmlParas(await zipText(b, ents, s))) paras.push(x);
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
  // 본문 레코드 → 문단 [{ text, tb?, rc? }]. 레코드 머리 = 태그 10비트 · 수준 10비트 · 크기 12비트.
  //   표: CTRL_HEADER(71, 수준 L, 앞 4바이트 'tbl ') → TABLE(77, L+1: 행 수 @4 · 열 수 @6) → 칸마다 LIST_HEADER(72, L+1: 열 @8 · 행 @10)
  //   → 칸 문단(PARA_TEXT 67, L+2 이상). 수준이 L 이하인 레코드가 오면 그 표는 끝. 칸 글은 표마다 rows[행][열] 로 모은다(채팅에 작은 표로 보일 때).
  function hwpRecords(d, out, tables = []) {
    let o = 0; const stack = [];
    while (o + 4 <= d.length) {
      const h = u32(d, o); o += 4;
      const tag = h & 0x3FF, lv = (h >>> 10) & 0x3FF; let size = (h >>> 20) & 0xFFF;
      if (size === 0xFFF) { if (o + 4 > d.length) break; size = u32(d, o); o += 4; }
      if (o + size > d.length) break;
      const x = d.subarray(o, o + size);
      o += size;
      while (stack.length && lv <= stack[stack.length - 1].lv) stack.pop();
      const t = stack[stack.length - 1];
      if (tag === 71 && size >= 4 && u32(x, 0) === 0x74626C20) { const nt = { lv, id: tables.length, rows: [], nr: 0, nc: 0, cell: null }; tables.push(nt); stack.push(nt); }
      else if (t && tag === 77 && lv === t.lv + 1 && size >= 8) { t.nr = u16(x, 4); t.nc = u16(x, 6); }
      else if (t && tag === 72 && lv === t.lv + 1 && size >= 12) {
        if (!t.nc) { t.cell = null; continue; }   // TABLE 레코드 앞의 목록 = 표 캡션 — 칸이 아니라 보통 문단으로
        let c = u16(x, 8), r = u16(x, 10);
        if (t.nr && t.nc && (c >= t.nc || r >= t.nr)) { c = u16(x, 6); r = u16(x, 8); }   // 머리가 6바이트인 문서면 그쪽으로
        t.cell = [r, c];
      } else if (tag === 67 && size > 0) {
        const s = hwpParaText(x).replace(/[ \t]+/g, ' ').trim();
        if (!s) continue;
        const p = { text: s };
        if (t && t.cell && lv >= t.lv + 2) { p.tb = t.id; p.rc = t.cell.slice(); const row = t.rows[p.rc[0]] || (t.rows[p.rc[0]] = []); row[p.rc[1]] = row[p.rc[1]] ? row[p.rc[1]] + ' ' + s : s; }
        out.push(p);
      }
    }
  }
  async function readHwp(b, full) {   // full = 문단·표 구조까지(파일 속 찾기용)
    const cf = cfbOpen(b), fh = cf.read('FileHeader');
    if (!fh || !/^HWP Document File/.test(new TextDecoder('latin1').decode(fh.subarray(0, 17)))) return { unsupported: true, reason: '옛 Office 형식(doc·xls·ppt) 또는 알 수 없는 OLE 파일 — 브라우저 안 읽기 미지원' };
    const flags = u32(fh, 36);
    if (flags & 2) return { unsupported: true, reason: '암호가 걸린 hwp' };
    const secs = Object.keys(cf.paths).filter(p => /^BodyText\/Section\d+$/.test(p)).sort(numSort(/Section(\d+)$/));
    const paras = [], tables = [];
    if (!(flags & 4)) for (const p of secs) { let d = cf.read(p); if (!d) continue; if (flags & 1) d = await inflateRaw(d); hwpRecords(d, paras, tables); }
    if (paras.length) return Object.assign({ fmt: 'hwp', text: paras.map(p => p.text).join('\n'), parts: `구역 ${secs.length}` }, full ? { paras, tables: tables.map(t => ({ rows: t.rows })) } : {});
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

  // ---------- 5b. 여러 파일 속 찾기 + 찾은 그림 보여 주기 (2026-09-29 사용자 지시: "스킬로 포함", "검색을 시켰으면 그걸 위해 파일을 읽을 때는
  //   허락받지 않아도 된다", "찾은 데이터의 그림이나 글을 결과물에 함께") ----------
  // 파일을 '단위'로 나눈다 — pptx 슬라이드 / docx·hwpx 문단 / hwp 문단 / xlsx 행 / 글 파일 줄.
  //   pptx·docx·hwpx 는 단위마다 그림(pics)·차트(charts: 종류·제목·축·계열 이름·항목·값)·표(tables) 수, 그림 설명(alt), 그림 파일 위치(media).
  //   그림 속 글씨(그래프를 그림으로 붙인 경우의 축 글자 등)는 읽지 못한다 — 차트 개체(PowerPoint·Word 차트)만 글로 읽힌다.
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
  function partPath(from, target) {
    const t = String(target || '');
    if (t.startsWith('/')) return t.slice(1);
    const segs = String(from).split('/').slice(0, -1);
    for (const s of t.split('/')) { if (s === '..') segs.pop(); else if (s && s !== '.') segs.push(s); }
    return segs.join('/');
  }
  const relsOf = (part) => String(part).replace(/([^/]+)$/, '_rels/$1.rels');
  const relOfPart = async (b, ents, part) => relMap(ents[relsOf(part)] ? await zipText(b, ents, relsOf(part)) : '');
  function chartOf(xml) {
    xml = String(xml || '');
    const plot = xml.search(/<c:plotArea\b/), vs = (s) => [...String(s || '').matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map(m => unxml(m[1]).trim());
    const title = [...xml.matchAll(/<c:title>([\s\S]*?)<\/c:title>/g)].filter(m => plot < 0 || m.index < plot).map(m => xmlParas(m[1]).join(' ')).join(' ');
    const axes = [...xml.matchAll(/<c:(catAx|valAx|dateAx|serAx)>([\s\S]*?)<\/c:\1>/g)].map(m => { const t = /<c:title>([\s\S]*?)<\/c:title>/.exec(m[2]); return t ? xmlParas(t[1]).join(' ') : ''; }).filter(Boolean);
    const series = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map(m => {
      const s = m[1], tx = /<c:tx>([\s\S]*?)<\/c:tx>/.exec(s), cat = /<c:(cat|xVal)>([\s\S]*?)<\/c:\1>/.exec(s), val = /<c:(val|yVal)>([\s\S]*?)<\/c:\1>/.exec(s);
      return { name: tx ? (vs(tx[1])[0] || xmlParas(tx[1]).join(' ')) : '', cats: cat ? vs(cat[2]) : [], vals: val ? vs(val[2]) : [] };
    });
    return { type: (/<c:(\w+)Chart>/.exec(xml) || [])[1] || '', title, axes, series };
  }
  const chartStr = (c) => `차트${c.type ? '(' + c.type + ')' : ''}${c.title ? ' "' + c.title + '"' : ''}${c.axes.length ? ' 축 ' + c.axes.join(' / ') : ''}`
    + (c.series.length ? ' 계열 ' + c.series.slice(0, 6).map(s => (s.name || '?') + (s.cats.length ? '[' + s.cats.slice(0, 8).join(',') + (s.cats.length > 8 ? ',…' : '') + ']' : '')).join('; ') : '');
  const newUnit = (n, part, text) => ({ n, part, text, pics: 0, charts: 0, tables: 0, chart: [], alt: [], media: [] });
  const cleanAlt = (s) => unxml(String(s || '')).replace(/\s+/g, ' ').trim();
  async function pptxUnits(b, ents, opt) {
    const order = await pptxOrder(b, ents), units = [];
    for (let i = 0; i < order.length; i++) {
      const part = order[i], xml = await zipText(b, ents, part), rel = await relOfPart(b, ents, part);
      const u = newUnit(i + 1, part, xmlParas(xml).join(' / '));
      u.tables = (xml.match(/<a:tbl>/g) || []).length;
      for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
        u.pics++;
        const d = /\bdescr="([^"]*)"/.exec(m[1]), e = /r:embed="([^"]+)"/.exec(m[1]), alt = d ? cleanAlt(d[1]) : '';
        if (alt) u.alt.push(alt);
        if (e && rel[e[1]]) u.media.push({ part: partPath(part, rel[e[1]]), alt });
      }
      for (const m of xml.matchAll(/<c:chart\b[^>]*\br:id="([^"]+)"/g)) {
        u.charts++;
        if (rel[m[1]]) { try { u.chart.push(chartOf(await zipText(b, ents, partPath(part, rel[m[1]])))); } catch (e) { u.chart.push({ type: '', title: '(차트 읽기 실패)', axes: [], series: [] }); } }
      }
      if (opt.notes) { const nt = Object.values(rel).find(t => /notesSlide\d+\.xml$/.test(t)); if (nt) u.note = xmlParas(await zipText(b, ents, partPath(part, nt))).filter(t => !/^\d+$/.test(t)).join(' / '); }
      units.push(u);
    }
    return { fmt: 'pptx', unit: '슬라이드', tag: 'S', units };
  }
  // 그림만 있는 문단은 다음 문단(보통 'Figure N.' 같은 그림 설명)을 함께 본다(ctx)
  const withCaption = (units) => units.forEach((u, i) => { if ((u.pics || u.charts) && !u.ctx && units[i + 1]) u.ctx = units[i + 1].text.slice(0, 300); });
  // 표 추적 — 문단이 끝날 때 지금 어느 표의 몇 행·몇 열 안인지(중첩 표는 안쪽). 칸 글은 표마다 rows[행][열] 로 모은다(채팅에 작은 표로 보일 때).
  //   tok(m, addr): <(/?)접두:(tbl|tr|tc)…(/?)> 태그 — addr() 가 [행, 열] 을 주면(hwpx cellAddr) 그 주소, 아니면 세어서 / span(n): docx 가로 병합(gridSpan)
  //   put(u): 표 안 문단이면 u.tb·u.rc 를 달고 칸에 글을 더함
  function tblTrack() {
    const tables = [], stack = [];
    return {
      tok(m, addr) {
        const close = m[1] === '/', tag = m[2], self = m[3] === '/';
        if (tag === 'tbl') { if (close) stack.pop(); else if (!self) { const t = { id: tables.length, rows: [], r: -1, c: -1, sp: 1 }; tables.push(t); stack.push(t); } return; }
        const t = stack[stack.length - 1];
        if (!t || close || self) return;
        if (tag === 'tr') { t.r++; t.c = -1; t.sp = 1; if (!t.rows[t.r]) t.rows[t.r] = []; return; }
        const a = addr ? addr() : null;   // 칸: 주소를 알면 그 주소(세로 병합으로 칸이 빠진 행도 맞게), 모르면 앞 칸의 가로 병합만큼 건너뜀
        if (a) { t.r = a[0]; t.c = a[1]; if (!t.rows[t.r]) t.rows[t.r] = []; } else t.c += t.sp || 1;
        t.sp = 1;
      },
      span(n) { const t = stack[stack.length - 1]; if (t && n > 1) t.sp = n; },
      skip(n) { const t = stack[stack.length - 1]; if (t && n > 0) t.c += n; },   // docx 행 앞 빈 칸(gridBefore)
      put(u) {
        const t = stack[stack.length - 1];
        if (!t || !u.text || t.r < 0) return;   // 첫 행 전(표 캡션 등)은 칸이 아님
        const r = Math.max(0, t.r), c = Math.max(0, t.c), row = t.rows[r] || (t.rows[r] = []);
        row[c] = row[c] ? row[c] + ' ' + u.text : u.text;
        u.tb = t.id; u.rc = [r, c];
      },
      out: () => tables.map(t => ({ rows: t.rows })),
    };
  }
  async function docxUnits(b, ents) {
    const part = 'word/document.xml', xml = String(await zipText(b, ents, part)), rel = await relOfPart(b, ents, part), units = [], T = tblTrack();
    // 글상자(w:txbxContent — 그림과 묶은 라벨 등) 안의 문단 끝은 단위를 나누지 않는다: 그림(<w:drawing>)이 두 조각으로 갈리지 않게, 글상자 글은 그 그림의 설명(alt)으로
    const tok = /<(\/?)w:(tbl|tr|tc)\b[^>]*?(\/?)>|<w:gridSpan\b[^>]*\bw:val="(\d+)"[^>]*>|<w:gridBefore\b[^>]*\bw:val="(\d+)"[^>]*>|<(\/?)w:txbxContent\b[^>]*>|<\/w:p>/g;
    let m, last = 0, tx = 0;
    while ((m = tok.exec(xml)) !== null) {
      if (m[4] != null) { T.span(+m[4]); continue; }
      if (m[5] != null) { T.skip(+m[5]); continue; }
      if (m[6] != null) { tx += m[6] === '/' ? -1 : 1; if (tx < 0) tx = 0; continue; }
      if (m[0] !== '</w:p>') { if (!tx) T.tok(m); continue; }
      if (tx) continue;
      const chunk = xml.slice(last, m.index); last = tok.lastIndex;
      const boxes = [...chunk.matchAll(/<w:txbxContent\b[^>]*>([\s\S]*?)<\/w:txbxContent>/g)].map(b => xmlParas(b[1]).join(' ')).filter(Boolean);
      const u = newUnit(units.length + 1, part, xmlParas(chunk.replace(/<w:txbxContent\b[\s\S]*?<\/w:txbxContent>/g, '') + '</w:p>').join(' '));
      [...new Set(boxes)].forEach(b => u.alt.push(cleanAlt(b)));
      for (const m of chunk.matchAll(/<w:drawing>([\s\S]*?)<\/w:drawing>/g)) {
        const d = /<wp:docPr\b[^>]*\bdescr="([^"]*)"/.exec(m[1]), e = /r:embed="([^"]+)"/.exec(m[1]), c = /<c:chart\b[^>]*\br:id="([^"]+)"/.exec(m[1]), alt = d ? cleanAlt(d[1]) : '';
        if (alt) u.alt.push(alt);
        if (c) { u.charts++; if (rel[c[1]]) { try { u.chart.push(chartOf(await zipText(b, ents, partPath(part, rel[c[1]])))); } catch (x) { u.chart.push({ type: '', title: '(차트 읽기 실패)', axes: [], series: [] }); } } }
        else { u.pics++; if (e && rel[e[1]]) u.media.push({ part: partPath(part, rel[e[1]]), alt }); }
      }
      for (const m of chunk.matchAll(/<v:imagedata\b[^>]*\br:id="([^"]+)"/g)) { u.pics++; if (rel[m[1]]) u.media.push({ part: partPath(part, rel[m[1]]), alt: '' }); }   // 옛 VML 그림
      T.put(u);
      if (u.text || u.pics || u.charts) units.push(u);
    }
    withCaption(units);
    return { fmt: 'docx', unit: '문단', tag: '¶', units, tables: T.out() };
  }
  // hwpx 칸 주소 — <hp:tc> 안, 그 칸 글(subList) 뒤에 <hp:cellAddr colAddr rowAddr/> 가 온다. 안쪽 표의 칸 주소는 건너뛴다(깊이).
  function hwpxCellAddr(xml, from) {
    const re = /<(\/?)hp:tc\b[^>]*>|<hp:cellAddr\b([^>]*)>/g;
    re.lastIndex = from;
    let depth = 0, m, a = null;
    while ((m = re.exec(xml)) !== null) {
      if (m[2] != null) { if (depth === 0) a = m[2]; continue; }
      if (m[1] === '/') { if (depth === 0) break; depth--; } else depth++;
    }
    const c = a && /colAddr="(\d+)"/.exec(a), r = a && /rowAddr="(\d+)"/.exec(a);
    return c && r ? [+r[1], +c[1]] : null;
  }
  async function hwpxUnits(b, ents, names) {
    const secs = names.filter(n => /^Contents\/section\d+\.xml$/i.test(n)).sort(numSort(/section(\d+)\.xml$/i));
    const hpf = await zipText(b, ents, 'Contents/content.hpf'), bin = {};   // 그림 id(binaryItemIDRef) → 파일 위치(content.hpf 의 opf:item)
    for (const m of hpf.matchAll(/<opf:item\b[^>]*>/g)) { const id = /\bid="([^"]+)"/.exec(m[0]), h = /\bhref="([^"]+)"/.exec(m[0]); if (id && h) bin[id[1]] = h[1].replace(/^\//, ''); }
    const units = [], T = tblTrack();
    for (const s of secs) {
      const xml = String(await zipText(b, ents, s)), tok = /<(\/?)hp:(tbl|tr|tc)\b[^>]*?(\/?)>|<(\/?)hp:caption\b[^>]*>|<\/hp:p>/g;
      let m, last = 0, cap = 0;
      while ((m = tok.exec(xml)) !== null) {
        if (m[4] != null) { cap += m[4] === '/' ? -1 : 1; if (cap < 0) cap = 0; continue; }
        if (m[0] !== '</hp:p>') { if (!cap) { const at = tok.lastIndex; T.tok(m, () => hwpxCellAddr(xml, at)); } continue; }
        if (cap) continue;   // 캡션 안 문단 끝 — 그림·표와 한 조각으로
        const chunk = xml.slice(last, m.index); last = tok.lastIndex;
        const caps = [...chunk.matchAll(/<hp:caption\b[^>]*>([\s\S]*?)<\/hp:caption>/g)].map(c => xmlParas(c[1]).join(' ')).filter(Boolean).join(' / ');
        const body = chunk.replace(/<hp:caption\b[\s\S]*?<\/hp:caption>/g, '');
        const charts = (chunk.match(/<hp:chart\b/g) || []).length, pics = (chunk.match(/<hp:pic\b/g) || []).length;
        if (caps && !pics && !charts) units.push(newUnit(units.length + 1, s, caps));   // 표 캡션 등 — 표 앞 보통 문단으로(칸에 섞지 않음)
        const u = newUnit(units.length + 1, s, xmlParas(body + '</hp:p>').join(' '));
        u.charts = charts; u.pics = pics; u.tables = (chunk.match(/<hp:tbl\b/g) || []).length;
        for (const r of chunk.matchAll(/binaryItemIDRef="([^"]+)"/g)) if (bin[r[1]]) u.media.push({ part: bin[r[1]], alt: '' });
        if (caps && (pics || charts)) u.ctx = caps.slice(0, 300);   // 그림 캡션 = 그 그림의 설명
        T.put(u);
        if (u.text || u.pics || u.charts || u.tables) units.push(u);
      }
    }
    withCaption(units);
    return { fmt: 'hwpx', unit: '문단', tag: '¶', units, tables: T.out() };
  }
  async function unitsOf(name, u8, opt = {}) {
    const ext = extOf(name);
    if (NO_EXT[ext]) return { unsupported: true, reason: NO_EXT[ext] + (ext === 'pdf' ? '' : ' — 브라우저 안 읽기 미지원') };
    if (u8[0] === 0x50 && u8[1] === 0x4B) {
      const ents = zipEntries(u8), names = Object.keys(ents);
      if (ext === 'pptx' || (!ext && ents['ppt/presentation.xml'])) return pptxUnits(u8, ents, opt);
      if (ext === 'docx' || (!ext && ents['word/document.xml'])) return docxUnits(u8, ents);
      if (ext === 'hwpx' || (!ext && names.some(n => /^Contents\/section\d+\.xml$/i.test(n)))) return hwpxUnits(u8, ents, names);
      if (ext === 'xlsx' || (!ext && ents['xl/workbook.xml'])) {   // 행 단위, 시트 하나 = 표 하나(칸 위치 그대로 — 빈 칸이 있어도 열이 맞게)
        const x = await readXlsx(u8, ents, true), units = [];
        let si = -1, ri = 0;
        String(x.text || '').split('\n').forEach((t, i) => {
          if (!t.trim()) return;
          const u = Object.assign(newUnit(i + 1, '', t), { nofig: true });
          // 행 이름은 엑셀의 실제 행 번호(R100 — 빈 행이 있어도), 시트가 여럿이면 '시트!R100'. 표 안 위치(rc)는 따로
          if (/^\[시트 .*\]$/.test(t)) { si++; ri = 0; } else if (si >= 0 && x.grids[si]) { const G = x.grids[si]; u.lab = (x.grids.length > 1 ? G.name + '!' : '') + 'R' + (G.rowNums[ri] || ri + 1); u.tb = si; u.rc = [ri++, -1]; }
          units.push(u);
        });
        return { fmt: 'xlsx', unit: '행', tag: 'R', note: x.note || '', nofig: true, units, tables: x.grids };
      }
    }
    if (u32(u8, 0) === 0xE011CFD0) {   // hwp — 문단 단위, 표 안 문단은 표 번호·행·열(그림 위치는 모름)
      const h = await readHwp(u8, true);
      if (h.unsupported) return h;
      if (h.paras) return { fmt: 'hwp', unit: '문단', tag: '¶', note: h.note || '', nofig: true, tables: h.tables,
        units: h.paras.map((p, i) => Object.assign(newUnit(i + 1, '', p.text.replace(/\n+/g, ' / ')), { nofig: true }, p.tb != null ? { tb: p.tb, rc: p.rc } : {})) };
      if (h.fmt === 'hwp') return { fmt: 'hwp', unit: '문단', tag: '¶', note: h.note || '', nofig: true,   // 배포용 등 — 한글이 남긴 미리보기 글(다시 읽지 않음)
        units: String(h.text || '').split('\n').map((t, i) => Object.assign(newUnit(i + 1, '', t), { nofig: true })).filter(u => u.text.trim()) };
    }
    const r = await readBytes(name, u8, opt);   // 글 파일(txt·md·csv·json·html) — 줄 단위(그림 정보 없음)
    if (r.unsupported) return r;
    return { fmt: r.fmt, unit: '문단', tag: '¶', note: r.note || '', nofig: true,
      units: String(r.text || '').split('\n').map((t, i) => Object.assign(newUnit(i + 1, '', t), { nofig: true })).filter(u => u.text.trim()) };
  }
  // 같은 탭에서 파일을 받아 메모리에만(디스크 저장 없음). 로그인이 풀려 웹 화면이 오면 ERR.
  async function fetchBytes(f, maxMB) {
    const name = String((f && (f.name || f.fileName)) || ''), size = +(f && f.size) || 0, dl = f && (f.dl || f.downloadUrl), ext = extOf(name);
    if (!dl) return { name, error: '내려받기 주소 없음(폴더이거나 목록 항목이 아님)' };
    if (NO_EXT[ext]) return { name, unsupported: NO_EXT[ext].split(' —')[0] };
    if (size > maxMB * 1048576) return { name, error: `파일이 ${Math.round(size / 1048576)}MB — 한도 ${maxMB}MB 초과({maxMB:${Math.ceil(size / 1048576) + 5}} 로 다시)` };
    let got;
    try { got = await tfetch(dl, { credentials: 'include' }, Math.max(TMO.fileMin, size / 1048576 * 2000), (r) => r.ok ? r.arrayBuffer() : null); }
    catch (e) { return { name, error: errText(e).startsWith('DOORAY') ? errText(e) : 'DOORAY: 파일 받기 실패(' + errText(e) + ')' }; }
    if (!got.r.ok) return { name, error: `DOORAY: 파일 받기 실패(HTTP ${got.r.status})` };
    const u8 = new Uint8Array(got.body);
    if (!/^(html?|xml)$/.test(ext) && /^\s*<(!doctype|html)/i.test(dec8(u8.subarray(0, 64)))) return { name, error: 'DOORAY: 파일 대신 웹 화면이 왔습니다 — 로그인이 풀렸을 수 있습니다' };
    return { name, u8 };
  }
  const READABLE = /^(pptx|docx|hwpx|hwp|xlsx|txt|md|csv|tsv|json|xml|html?|log)$/i;
  // 찾기용 글 맞추기(2026-09-29 v0.7.0) — NFKC: 한글 보고서의 호환 글자(㎃·㎠·℃·％·²·①·전각 영숫자)를 보통 글자로 바꿔 'mA/cm2'·'°C'·'%' 검색에 걸리게,
  //   macOS 에서 만든 파일의 풀어 쓴 한글(NFD)도 합친다. 찾을 말과 파일 글 양쪽에 같이 적용(보여 주는 글은 원문 그대로).
  const NF = (s) => String(s == null ? '' : s).normalize('NFKC');
  // 정규식 원문도 NFKC — ASCII 가 아닌 글자만 하나씩 바꾸고, 바뀐 결과의 정규식 기호는 글자 그대로로 이스케이프
  //   (㈜ → \(주\), （ → \(, … → \.\.\. — 원문 정규식의 뜻은 그대로 두고 파일 글(NFKC)과 맞게)
  const nfSrc = (src) => String(src).replace(/[^\x00-\x7F]/g, (ch) => { const n = NF(ch); return n === ch ? ch : n.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); });
  function toRe(q) {
    if (q instanceof RegExp) return new RegExp(nfSrc(q.source), q.flags.replace(/[gy]/g, ''));
    const arr = [].concat(q == null ? [] : q);
    if (arr.some(w => w != null && typeof w === 'object' && !(w instanceof RegExp))) return null;   // 알 수 없는 값({and:…} 같은 오타)은 찾지 않고 ERR
    // 글 낱말 안의 띄어쓰기는 있어도 없어도(\s*) — '셀 전압' 이 '셀전압' 에도, 'FDCA 수율' 이 'FDCA수율' 에도 걸리게. 배열 안 정규식은 그 식 그대로(대소문자 무시로 합침)
    const parts = arr.map(w => w instanceof RegExp ? '(?:' + nfSrc(w.source) + ')' : NF(w).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')).filter(Boolean);
    return parts.length ? new RegExp(parts.join('|'), 'i') : null;
  }
  // 낱말들이 가장 가까이 모인 구간의 길이(각 낱말 위치 앞 12개까지로) — {all:[…]} 에서 한 문단 안에서도 붙어 나오는 곳을 위로
  const posOf = (r, h) => { const g = new RegExp(r.source, r.flags + 'g'), out = []; for (const m of h.matchAll(g)) { out.push(m.index); if (out.length >= 12 || m[0] === '') break; } return out; };
  function minSpan(lists) {
    const ev = []; lists.forEach((l, t) => l.forEach(x => ev.push([x, t]))); ev.sort((a, b) => a[0] - b[0]);
    const cnt = new Array(lists.length).fill(0); let have = 0, lo = 0, best = Infinity;
    for (let hi = 0; hi < ev.length; hi++) {
      if (cnt[ev[hi][1]]++ === 0) have++;
      while (have === lists.length) { best = Math.min(best, ev[hi][0] - ev[lo][0]); if (--cnt[ev[lo][1]] === 0) have--; lo++; }
    }
    return best;
  }
  // 숫자 + 단위(수율·전압·전류밀도·농도·시간 …) — 결과 수치가 적힌 곳을 조금 위로(+1)
  const NUMU = /\d(?:[.,]\d+)?\s*(?:%|wt\s*%|mA|mV|kV|V\b|A\b|cm2|cm-2|mM|μM|M\b|°C|K\b|h\b|hr|min|mg|kg|g\b|mL|L\b|mol|ppm|nm|μm|mm|시간|배)/;
  // 파일 글(찾기용, NFKC) — 단위마다 한 번만 만들어 둔다(다시 찾기·'더 보여줘'에서 재사용)
  const hayN = (u) => u._h != null ? u._h : (u._h = NF(hayOf(u)));
  // 찾을 말 → { label, test(글), score(글) }. q = 정규식·글·글 배열(하나라도) 또는 { all:[정규식…](한 곳에 모두), any:정규식(하나라도) }
  //   예 { all: [/Cu(?![a-z])|구리/, /epoxid|에폭시|\bEO\b|\bPO\b/i] } = Cu 와 에폭시화가 한 슬라이드·문단에 함께 나오는 곳만(각 낱말의 대소문자 규칙을 따로 둘 수 있다)
  const countOf = (re, h) => { const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let n = 0; for (const m of String(h).matchAll(g)) { if (m[0] === '' && n) break; if (++n >= 20) break; } return n; };
  function matcher(q) {
    const toR = toRe;
    if (q && typeof q === 'object' && !(q instanceof RegExp) && !Array.isArray(q) && (q.all || q.any)) {
      const all = [].concat(q.all || []).map(toR).filter(Boolean), any = q.any != null ? toR(q.any) : null;
      if (!all.length && !any) return null;
      const terms = all.concat(any ? [any] : []);
      return { label: (all.length ? '모두 ' + all.map(String).join(' & ') : '') + (any ? (all.length ? ' + ' : '') + '하나라도 ' + any : ''),
        test: (h) => all.every(r => r.test(h)) && (!any || any.test(h)), score: (h) => terms.reduce((s, r) => s + Math.min(5, countOf(r, h)), 0),
        any: (h) => terms.some(r => r.test(h)), first: (h) => firstOf(terms, h),
        near: (h) => { if (all.length < 2) return 0; const d = minSpan(all.map(r => posOf(r, h))); return d <= 120 ? 2 : d <= 400 ? 1 : 0; } };
    }
    const re = toRe(q);
    return re ? { label: String(re), test: (h) => re.test(h), score: (h) => Math.min(10, countOf(re, h)), any: (h) => re.test(h), first: (h) => firstOf([re], h) } : null;
  }
  const firstOf = (rs, h) => rs.reduce((b, r) => { const m = r.exec(String(h)); return m && (b < 0 || m.index < b) ? m.index : b; }, -1);
  const figOf = (u) => (u.pics || 0) + (u.charts || 0) + (u.tables || 0);
  const hayOf = (u) => [u.text, u.note || '', u.ctx || '', (u.alt || []).join(' '), (u.chart || []).map(chartStr).join(' ')].join(' ');
  // 순위: 찾을 말이 많이·제목(첫 줄)에 나오고 그림·차트·표가 있는 곳이 위, 표지(글만 있는 1쪽)·참고문헌 쪽은 아래
  const titleSeg = (u) => String(u.text || '').split(' / ')[0].slice(0, 200);
  const isRefUnit = (u) => /(^|\s)(references?|참고\s*문헌|bibliography)(\s|:|$)/i.test(titleSeg(u)) || (String(u.text || '').match(/\b10\.\d{4,}\/|doi/gi) || []).length >= 3;
  const rankScore = (u, unit) => (u.score || 0) - (isRefUnit(u) ? 4 : 0) - (unit === '슬라이드' && u.n === 1 && !figOf(u) ? 3 : 0);
  const ranked = (v) => v.hits.slice().sort((a, b) => rankScore(b, v.unit) - rankScore(a, v.unit) || a.n - b.n);
  // 한 번 읽은 파일의 단위(슬라이드·문단)는 기억해 두고 다시 받지 않는다 — '더 보여줘'·'그중 ○○만' 같은 후속 찾기가 파일 받기 없이 1~2초
  const unitCache = new Map();
  const ucKey = (f, opt) => String(f.id || f.dl || f.name) + (opt && opt.notes ? '|n' : '');
  // 같은 파일인지: 크기 + 드라이브 버전 + 수정 시각 + 받기 주소가 모두 같을 때만(같은 크기로 새 판을 올려도 다시 읽음 — Codex 검토 H2)
  const fileSig = (f) => [+f.size || 0, f.version != null ? f.version : '', f.updated || f.created || '', f.dl || ''].join('|');
  const cacheGet = (f, opt) => { const c = unitCache.get(ucKey(f, opt)); return c && c.sig === fileSig(f) ? c : null; };
  const cachedUnits = (f, opt) => { const c = cacheGet(f, opt); return c ? c.r : null; };
  const cacheUnits = (f, opt, r, hash) => { unitCache.set(ucKey(f, opt), { sig: fileSig(f), r, hash }); if (unitCache.size > 150) unitCache.delete(unitCache.keys().next().value); };
  // 파일 내용 지문 — SHA-256(앞 12바이트) + 길이, 없으면 FNV-1a. 이름·크기가 아니라 내용이 똑같을 때만 '같은 파일'로 본다(Codex 검토 H1)
  async function fingerprint(u8) {
    try { if (typeof crypto !== 'undefined' && crypto.subtle) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', u8)); return Array.from(d.subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('') + ':' + u8.length; } } catch (e) { /* 아래 FNV 로 */ }
    let h = 0x811c9dc5; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return 'f' + h.toString(16) + ':' + u8.length;
  }
  const figTag = (u) => u.nofig ? '' : `[그림${u.pics || 0}${u.charts ? ' 차트' + u.charts : ''}${u.tables ? ' 표' + u.tables : ''}]`;   // hwp·xlsx·글 파일은 그림 위치를 몰라 표시 안 함
  // 목록 → 훑을 파일들. 업무 항목이 섞이면 그 업무의 첨부(본문·댓글)로 바꾼다(링크는 그 업무). 같은 첨부 id 는 한 번만.
  //   내용이 똑같은 파일(다시 올린 같은 파일)은 scanFiles 가 읽은 뒤 지문으로 한 번만 보이고 알린다(※ 내용이 똑같은 파일) — 여기서 조용히 빼지 않는다.
  function scanList(x) {
    const out = [], seen = new Set();
    listOf(x).forEach(it => {
      if (it && it.kind === 'task') filesOf(it).forEach(f => { if (f.id && seen.has(f.id)) return; if (f.id) seen.add(f.id); out.push(Object.assign({}, f, { url: it.url, updated: f.created, via: it.subject, taskId: f.taskId || it.id })); });
      else if (it) out.push(it);
    });
    return out;
  }
  // ---------- 5c. Dooray 미리보기(서버 문서 변환 — 업무 첨부의 🔍 미리보기 버튼과 같은 호출, 2026-09-29 실측) ----------
  //   GET /v2/wapi/preview/services/project/files/{첨부}?convert=external&redirectUrl=/preview-pages/posts/{업무}/{첨부}&downloadUrl=/files/{첨부}?disposition=attachment&action=download
  //     → result.content.redirectUrl = /SynapDocViewServer/viewer/doc.html?key={키}&… (Synap 문서 뷰어, 같은 도메인)
  //   GET /SynapDocViewServer/status/{키} → { pageNum, format, fileName, imgErrCode… } — 변환이 끝나면 pageNum > 0
  //   GET /SynapDocViewServer/thumbnail/{키}/{쪽-1}?dpi=150&w=1500&h=1125 → PNG — 슬라이드·쪽 모양 그대로(EMF 그래프·한글 그림 포함)
  //   GET /SynapDocViewServer/thumbnailxml/{키}/{쪽-1}?dpi=150 → XML <paragraph><text> — 쪽의 글(PDF·옛 형식 ppt·doc·xls 도)
  //   드라이브 파일(파일 두 번 누르기 → /preview-pages/drives/{드라이브}/{파일}?folderId= 새 탭, 2026-09-29 실측):
  //     GET /v2/wapi/preview/services/drive/files/{드라이브}-{파일}-{version}?convert=external&redirectUrl=/preview-pages/drives/{드라이브}/{파일}?folderId={폴더}
  //         &downloadUrl=/drive/v1/downloads/{프로젝트}/{파일}?disposition=attachment&action=download  (downloadUrl 이 없으면 서버 오류 -1)
  //     → 같은 Synap 키. 파일을 PC 에 받지 않는다(서버가 그림·글로 바꿔 줌).
  //   ⚠ 미리보기 키는 한 사람에게 **한 번에 하나만** 살아 있다 — 다른 파일(같은 파일도)의 키를 새로 만들면 앞 키의 status·thumbnail 이 403(실측).
  //     → 미리보기 작업은 pvExclusive 로 한 번에 하나씩, 쪽 그림은 키를 받은 즉시 blob 으로 받아 둔다(결과 화면이 나중에 깨지지 않게).
  const PV_EXT = /^(pdf|ppt|doc|xls)$/i;   // 코어가 직접 못 읽어 미리보기 글로 훑는 형식
  const pvInfo = new Map();                 // 첨부 id → { pages, format, texts[] } — 쪽 수·쪽 글은 키가 바뀌어도 그대로 쓴다
  let pvActive = null;                      // { id, key } — 지금 살아 있는 키
  let pvChain = Promise.resolve();
  const pvExclusive = (fn) => { const run = pvChain.then(fn, fn); pvChain = run.catch(() => {}); return run; };
  const pvView = (id, key) => { const info = pvInfo.get(id); return { id, key, info, pages: info.pages, format: info.format, img: (n) => `/SynapDocViewServer/thumbnail/${key}/${n - 1}?dpi=150` }; };
  // 미리보기를 만들 수 있는 항목: 업무 첨부(taskId) 또는 드라이브 파일(driveId·projectId)
  const canPreview = (f) => !!(f && f.id && (f.taskId || (f.kind === 'file' && f.driveId && f.projectId)));
  function previewReq(f) {
    const id = String(f.id);
    if (f.taskId) return `/v2/wapi/preview/services/project/files/${id}?convert=external&redirectUrl=${E('/preview-pages/posts/' + f.taskId + '/' + id)}&downloadUrl=${E('/files/' + id + '?disposition=attachment&action=download')}`;
    return `/v2/wapi/preview/services/drive/files/${f.driveId}-${id}-${f.version || 0}?convert=external&redirectUrl=${E('/preview-pages/drives/' + f.driveId + '/' + id + (f.folderId ? '?folderId=' + f.folderId : ''))}`
      + `&downloadUrl=${E('/drive/v1/downloads/' + f.projectId + '/' + id + '?disposition=attachment&action=download')}`;
  }
  async function previewOf(f) {
    const id = String((f && f.id) || '') + '@' + (f && f.version != null ? f.version : '') + '@' + ((f && (f.updated || f.created)) || '');   // 판마다(새 판을 올리면 쪽 수·쪽 글을 다시)
    if (!canPreview(f)) return { error: 'Dooray 미리보기를 만들 수 없는 항목(업무 첨부·드라이브 파일만)' };
    if (pvActive && pvActive.id === id && pvInfo.has(id)) {   // 같은 파일이면 키를 다시 쓰되, 그 사이 Dooray 에서 다른 미리보기를 열었으면 키가 막혔다 → 새로
      if (await keyAlive(pvActive.key)) return pvView(id, pvActive.key);
      pvActive = null;
    }
    const d = await dfetch(previewReq(f));
    const red = String((d && d.result && d.result.content && d.result.content.redirectUrl) || ''), m = /[?&]key=([0-9a-f]{16,})/.exec(red);
    if (apiErr(d) || !m) return { error: 'Dooray 미리보기 만들기 실패: ' + (apiErr(d) || red || 'no key') };
    const key = m[1];
    pvActive = { id, key };
    if (!pvInfo.has(id)) {
      let st = null;
      for (let i = 0; i < 100; i++) {   // 큰 파일은 서버 변환에 시간이 걸린다 — 0.4초 간격, 최대 약 40초
        try { st = JSON.parse((await tfetch(`/SynapDocViewServer/status/${key}`, { credentials: 'include' }, TMO.pv, (rr) => rr.text())).body); } catch (e) { st = null; }
        if (st && (st.pageNum > 0 || st.imgErrCode)) break;
        await sleep(400);
      }
      if (!st || !(st.pageNum > 0)) return { error: 'Dooray 미리보기 변환 실패' + (st && st.imgErrCode ? '(코드 ' + st.imgErrCode + ')' : '(시간 초과)') };
      pvInfo.set(id, { pages: st.pageNum, format: String(st.format || ''), texts: [] });
    }
    return pvView(id, key);
  }
  const keyAlive = async (key) => { try { const { r, body } = await tfetch(`/SynapDocViewServer/status/${key}`, { credentials: 'include' }, TMO.pv, (rr) => rr.text()); if (!r.ok) return false; const st = JSON.parse(body); return !!(st && st.pageNum > 0); } catch (e) { return false; } };
  // 쪽 글 — thumbnailxml 의 <text> 를 문단별로 이어 붙인다(첨부별로 들고 있음). 키가 막혀 HTML 이 오면 오류(빈 글로 넘기지 않음).
  async function pageText(pv, n) {
    const t = pv.info.texts;
    if (t[n - 1] != null) return t[n - 1];
    const { r, body: x } = await tfetch(`/SynapDocViewServer/thumbnailxml/${pv.key}/${n - 1}?dpi=150`, { credentials: 'include' }, TMO.page, (rr) => rr.text());
    if (!r.ok || /^\s*<!doctype|<html/i.test(x)) throw new Error(`Dooray 미리보기 글 받기 실패(HTTP ${r.status}) — 다른 미리보기가 새로 열려 키가 막혔을 수 있음`);
    t[n - 1] = String(x).split(/<\/paragraph>/).map(p => [...p.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => unxml(m[1])).join('').trim()).filter(Boolean).join('\n');
    return t[n - 1];
  }
  async function pageTexts(pv) {
    const res = await pool(Array.from({ length: pv.pages }, (_, i) => i + 1), 4, (n) => pageText(pv, n));
    const bad = res.find(v => v && typeof v === 'object' && v.error);
    if (bad) throw new Error(bad.error);
    return pv.info.texts.slice(0, pv.pages).map(v => v || '');
  }
  const squash = (s) => String(s || '').replace(/\s+/g, '');
  // 문단들 → 미리보기 쪽 { 문단 번호: 쪽 }. 문단이 파일 안 몇 % 쯤에 있는지로 쪽을 짐작해 그 둘레부터 4쪽씩 읽는다
  //   (긴 보고서도 몇 쪽만 — 전 쪽을 읽으면 100쪽에 약 25초). wants: [{ key, text, frac(0~1) }]. 쪽 글이 막히면(키 403) 그만둔다.
  async function pagesOfTexts(pv, wants) {
    const out = {}, N = pv.pages, T = pv.info.texts;
    for (const w of wants) {
      const t = squash(w.text).slice(0, 40);
      if (t.length < 6) continue;
      const guess = Math.min(N, Math.max(1, Math.ceil((w.frac || 0) * N)));
      const order = Array.from({ length: N }, (_, i) => i + 1).sort((a, b) => Math.abs(a - guess) - Math.abs(b - guess) || a - b);
      const known = order.find(n => T[n - 1] != null && squash(T[n - 1]).includes(t));
      if (known) { out[w.key] = known; continue; }
      for (let i = 0; i < order.length; i += 4) {
        const batch = order.slice(i, i + 4), need = batch.filter(n => T[n - 1] == null);
        const res = await pool(need, 4, (n) => pageText(pv, n));
        const hit = batch.find(n => T[n - 1] != null && squash(T[n - 1]).includes(t));
        if (hit) { out[w.key] = hit; break; }
        if (need.length && res.every(v => v && typeof v === 'object' && v.error)) return out;   // 키가 막힘 — 더 읽어도 소용없음
      }
    }
    return out;
  }
  const previewUnits = (f) => pvExclusive(async () => {
    const pv = await previewOf(f);
    if (pv.error) return { error: pv.error };
    const texts = await pageTexts(pv);
    return { fmt: (pv.format || extOf(f.name)).toLowerCase() + '(미리보기)', unit: '쪽', tag: 'p', nofig: true,
      units: texts.map((t, i) => Object.assign(newUnit(i + 1, '', t.replace(/\n/g, ' / ')), { nofig: true })).filter(u => u.text.trim()) };
  });
  let lastScan = null;
  // scanFiles(x, q, opt) — 여러 파일 속을 한 번에 훑어 q 가 나오는 슬라이드·문단을 찾는다(사용자가 시킨 찾기이면 따로 허락을 묻지 않는다).
  //   x: 'last'·생략(= 마지막 report 의 드라이브 목록 — [F번호]가 같다) · 드라이브 목록·only 결과·항목 배열 · 업무 목록(→ 그 업무들의 첨부, 예 last().tasks)
  //   q: 정규식 · 글 · 글 배열(하나라도) — 대소문자 무시. 동의어·영문·단위(예 /전압|voltage|potential|cell voltage/i)를 넓게.
  //      { all:[정규식…], any:정규식 } — 한 슬라이드·문단에 모두 나오는 곳만(예 Cu 와 에폭시화가 함께). 걸린 곳마다 score(순위 점수).
  //   opt: { figures:false(그림·차트·표가 있는 단위만 — "그래프가 있는 슬라이드"), ext:'pptx|docx'(기본: 읽을 수 있는 형식 전부), name:/파일 이름/(좁히기),
  //          since, until(수정일·첨부는 올린 날), maxMB:150, maxFiles:40, perFile:12(파일당 보일 곳), chars:260, notes:false(pptx 발표자 메모도),
  //          quiet:false(true = 결과 글을 화면에 쓰지 않음 — quick 용), onProgress(끝난 수, 전체) }
  //   한 번 읽은 파일은 기억해 두어 다시 받지 않는다(unitCache). 결과 글은 작업 탭(get_page_text). 그림은 showFigures, 한 번에 하려면 quick.
  async function scanFiles(x, q, opt = {}) {
    const t0 = Date.now(), M = matcher(q);
    if (!M) return { summary: 'ERR 찾을 말이 없습니다', shown: show('ERR 찾을 말이 없습니다 — scanFiles(목록, /낱말|낱말/i)') };
    const srcX = x == null || x === 'last' ? (lastReport && lastReport.drive) : x;
    const noDetail = listOf(srcX).filter(t => t && t.kind === 'task' && !(t.detail && !t.detail.error)).length;   // 본문·첨부를 안 읽은 업무 — 첨부를 모른다
    const list = scanList(srcX), nameRe = opt.name != null ? toRe(opt.name) : null;
    const P = period(opt), byDate = !!(opt.since || opt.until), maxMB = opt.maxMB || 150, extRe = opt.ext ? new RegExp('^(?:' + opt.ext + ')$', 'i') : READABLE;
    const todo = [], skip = [], same = [];
    list.forEach((f, k) => {
      if (!f || f.kind === 'folder') return;
      const ext = extOf(f.name);
      if (nameRe && !nameRe.test(NF(f.name || ''))) return;
      if (byDate) { const ts = tsOf(f.updated || f.created); if (ts < P.since || ts > P.until) return; }
      const viaPv = PV_EXT.test(ext) && canPreview(f) && opt.preview !== false;   // PDF·옛 형식은 Dooray 미리보기 글로(업무 첨부·드라이브 파일)
      if (!(opt.ext ? extRe.test(ext) : (READABLE.test(ext) || viaPv))) { if (!opt.ext) skip.push({ k, f, why: NO_EXT[ext] ? NO_EXT[ext].split(' —')[0] : (ext || '확장자 없음') + ' 형식' }); return; }
      if (PV_EXT.test(ext) && !viaPv) { skip.push({ k, f, why: canPreview(f) ? '미리보기 끔' : NO_EXT[ext].split(' —')[0] }); return; }
      // 이름·크기가 같아도 다른 판일 수 있어 미리 건너뛰지 않는다 — 읽은 뒤 내용 지문(해시)이 똑같은 파일만 한 번만 보인다(Codex 검토 H1)
      todo.push({ k, f, viaPv });
    });
    // 읽는 순서: 이름에 찾을 말(q·prefer)이 든 파일, 그다음 최근 파일부터 — 파일 수 한도(maxFiles)·시간 한도(maxSec)에 걸려도 중요한 파일을 먼저 읽는다
    const pre = opt.prefer != null ? toRe(opt.prefer) : null, pri = (f) => (M.any(NF(f.name || '')) ? 2 : 0) + (pre && pre.test(NF(f.name || '')) ? 1 : 0);
    todo.sort((a, b) => pri(b.f) - pri(a.f) || tsOf(b.f.updated || b.f.created) - tsOf(a.f.updated || a.f.created));
    const cut = todo.length > (opt.maxFiles || 40) ? todo.splice(opt.maxFiles || 40) : [];
    const budget = (opt.maxSec != null ? opt.maxSec : 60) * 1000, late = [];
    if (!opt.quiet) show(`(kk-dry 파일 속 찾는 중 … 파일 ${todo.length}개 — 잠시 뒤 get_page_text 를 다시 부르세요)`);
    let done = 0;
    progress = `파일 속 찾는 중 0/${todo.length}`;
    const res = await pool(todo, 4, async (it) => {
      const { k, f, viaPv } = it, t1 = Date.now();
      const ce = cacheGet(f, opt);
      let r = ce ? ce.r : null, hash = ce ? ce.hash : null;
      const cached = !!r;
      if (!cached && t1 - t0 > budget) { late.push(it); return { late: true }; }   // 시간 한도 — 새로 받을 파일은 시작하지 않는다(이미 읽어 둔 파일은 그대로 씀)
      if (!r && viaPv) { try { r = await previewUnits(f); } catch (e) { r = { error: 'Dooray 미리보기 실패: ' + errText(e) }; } }
      else if (!r) {
        const g = await fetchBytes(f, maxMB);
        r = g;
        if (!g.error && !g.unsupported) { try { hash = await fingerprint(g.u8); r = await unitsOf(f.name, g.u8, opt); } catch (e) { r = { error: '읽기 실패: ' + errText(e) }; } }
      }
      progress = `파일 속 찾는 중 ${++done}/${todo.length}`;
      if (opt.onProgress) { try { opt.onProgress(done, todo.length); } catch (e) { /* 진행 표시 실패는 무시 */ } }
      if (r.error || r.unsupported) return { k, f, error: r.error || '', unsupported: r.unsupported === true ? r.reason : (r.unsupported || '') };
      if (!r.units || !r.units.length) return { k, f, error: '글을 찾지 못함' + (r.note ? ' — ' + r.note : ' (스캔 PDF·그림뿐인 파일일 수 있음)') };
      if (!cached) cacheUnits(f, opt, r, hash);
      const hits = r.units.filter(u => (!opt.figures || figOf(u) > 0) && M.test(hayN(u)));
      // 점수 = 찾을 말 수 + 그림·차트·표(+1) + 제목 줄(+2) + 낱말들이 가까이(+1~2) + 숫자·단위(+1)
      hits.forEach(u => { const h = hayN(u); u.score = M.score(h) + (figOf(u) ? 1 : 0) + (M.score(NF(titleSeg(u))) ? 2 : 0) + (M.near ? M.near(h) : 0) + (NUMU.test(h) ? 1 : 0); });
      return { k, f, fmt: r.fmt, unit: r.unit, tag: r.tag, note: r.note || '', nofig: !!r.nofig, n: r.units.length, figs: r.units.filter(u => figOf(u) > 0).length, hits, cached, hash, ms: Date.now() - t1, doc: r };
    });
    const all = res.map((v, i) => v && v.late ? null : v && v.f ? v : { k: todo[i].k, f: todo[i].f, error: (v && v.error) || 'no result' }).filter(Boolean).sort((a, b) => a.k - b.k);   // 읽는 순서와 달리 결과는 목록 순서(F번호)로
    // 내용이 똑같은 파일(같은 지문 — 드라이브와 업무 첨부에 같은 파일 등)은 번호가 가장 앞선 것만 남기고 나머지는 '같은 파일'로 알림
    const byHash = new Map(), files = [];
    for (const v of all) {
      if (v.hash && v.hits) { if (byHash.has(v.hash)) { same.push({ k: v.k, f: v.f, of: byHash.get(v.hash) }); continue; } byHash.set(v.hash, v.k); }
      files.push(v);
    }
    lastScan = { re: M.label, label: M.label, opt, list, files, skip, cut, same, late, maxSec: budget / 1000, noDetail, ms: Date.now() - t0 };
    progress = '';
    const text = scanText(lastScan);
    return { summary: text.split('\n')[0], shown: opt.quiet ? '' : show(text), chars: text.length, hits: files.reduce((s, v) => s + ((v.hits && v.hits.length) || 0), 0) };
  }
  function scanText(S) {
    const perFile = S.opt.perFile || 12, chars = S.opt.chars || 260;
    const hitF = S.files.filter(v => v.hits && v.hits.length), noneF = S.files.filter(v => v.hits && !v.hits.length), badF = S.files.filter(v => !v.hits);
    const H = [`■ 파일 속 찾기 — ${S.re} | 파일 ${S.files.length}개: 걸린 파일 ${hitF.length} · 없음 ${noneF.length}${badF.length ? ' · 못 읽음 ' + badF.length : ''}${S.opt.figures ? ' | 그림·차트·표 있는 곳만' : ''} | ${(S.ms / 1000).toFixed(1)}초`];
    if (S.cut.length) H.push(`⚠ 파일이 많아 ${S.files.length}개만 읽음(이름에 찾을 말이 든 파일·최근 파일 먼저) — 나머지 ${S.cut.length}개는 안 봄(maxFiles 로 늘리거나 name·ext·since 로 좁혀 다시)`);
    if (S.late && S.late.length) H.push(`⏱ 시간 한도(${S.maxSec}초)로 ${S.late.length}개는 안 봄 — maxSec 로 늘리거나 name·ext·since 로 좁혀 다시`);
    if (S.same && S.same.length) H.push(`※ 내용이 똑같은 파일 ${S.same.length}개는 한 번만 보임: ` + S.same.slice(0, 8).map(v => `[F${v.k}]=F${v.of}`).join(' · ') + (S.same.length > 8 ? ' …' : ''));
    if (S.noDetail) H.push(`※ 첨부를 읽지 않은 업무 ${S.noDetail}건은 빠짐 — report 의 limits:{detail:N} 을 늘리거나 getTasks 로 읽은 뒤 다시`);
    if (!S.files.length && !S.cut.length) H.push('(훑을 파일이 없습니다 — 목록·name·ext·기간 조건을 확인)');
    if (badF.length) H.push('⚠ 못 읽음(없음이 아님): ' + badF.map(v => `[F${v.k}] ${v.f.name} — ${v.error || v.unsupported}`).join(' / '));
    if (S.skip.length) H.push(`※ 읽을 수 없는 형식 ${S.skip.length}개(안 봄): ` + S.skip.slice(0, 12).map(v => `${v.f.name}(${v.why})`).join(' · ') + (S.skip.length > 12 ? ' …' : ''));
    const nofigF = S.files.filter(v => v.nofig);
    if (S.opt.figures && nofigF.length) H.push(`※ 그림 위치를 알 수 없는 형식(hwp·xlsx·글 파일) ${nofigF.length}개는 figures:true 에서 걸리지 않음 — 글로 찾으려면 figures 없이 다시`);
    H.push('※ 그림 속 글씨는 읽지 못함(차트 개체는 제목·축·계열을 읽음) — 그림을 볼 곳은 showFigures([[F번호,[번호…],\'한 줄 설명\'], …])');
    let used = H.join('\n').length;
    for (let i = 0; i < hitF.length; i++) {
      const v = hitF[i];
      const B = [`== [F${v.k}] ${ymd(v.f.updated || v.f.created)} | ${v.f.name} | ${kb(v.f.size)}${v.f.via ? ' | 업무 ' + v.f.via : ''} | ${v.unit} ${v.n}(그림·차트·표 있는 곳 ${v.figs}) | 걸림 ${v.hits.length} | ${(v.ms / 1000).toFixed(1)}초` + partNote(v) + (v.f.url ? ' → ' + v.f.url : '')];
      v.hits.slice(0, perFile).forEach(u => B.push('  ' + [labOf(v, u), figTag(u), clip(u.text.replace(/\s+/g, ' '), chars)].filter(Boolean).join(' ')
        + (u.chart.length ? ' {' + u.chart.map(chartStr).join(' | ').slice(0, 300) + '}' : '') + (u.alt.length ? ' {그림 설명 ' + u.alt.slice(0, 3).join(' | ').slice(0, 120) + '}' : '')
        + (u.ctx ? ' {다음 문단 ' + clip(u.ctx, 120) + '}' : '') + (u.note ? ' {메모 ' + clip(u.note, 120) + '}' : '')));
      if (v.hits.length > perFile) B.push(`  … 외 ${v.hits.length - perFile}곳(perFile 로 늘려 다시)`);
      const s = B.join('\n');
      if (used + s.length > BUDGET) { H.push(`… 글이 길어 여기까지 — 걸린 파일 ${hitF.length - i}개 더(찾을 말을 좁히거나 figures:true)`); break; }
      H.push(s); used += s.length + 1;
    }
    if (noneF.length) H.push('', `■ 걸린 곳 없음 ${noneF.length}개: ` + noneF.map(v => `[F${v.k}] ${v.f.name}${partNote(v)}`).join(' · '));
    return H.join('\n');
  }
  // 일부만 읽은 파일의 알림(엑셀 30만 자에서 자름·배포용 hwp 미리보기 글만 등) — '없음'으로 읽히지 않게 파일 줄에 붙인다
  const partNote = (v) => v.note && /자름|미리보기 글|못 읽어|찾지 못함/.test(v.note) ? ` (※ ${v.note})` : '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let blobUrls = [];
  const dropBlobs = () => { blobUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* 무시 */ } }); blobUrls = []; };
  const chartHtml = (c) => `<table class="ch"><caption>${esc(chartStr(c).slice(0, 240))}</caption>`
    + (c.series.length ? `<tr><th></th>${(c.series[0].cats || []).slice(0, 14).map(x => `<th>${esc(x)}</th>`).join('')}</tr>` + c.series.slice(0, 8).map(s => `<tr><th>${esc(s.name)}</th>${s.vals.slice(0, 14).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') : '') + '</table>';
  const NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  // 글 화면을 결과 한 건씩 칸으로 나눈다(2026-09-30 여백 요청). 새 칸 = [T번호]·[F번호]·== [F번호]·①~⑳·"— " 로 시작하는 줄.
  // 칸 사이에 '\n' 글자를 남겨 textContent·get_page_text 로 읽는 글은 나누기 전과 같다.
  const BLK_START = /^(\[[TF]\d+\]|== \[F\d+\]|[①-⑳]|\(\d+\) |— |■ )/;
  const BLK_CSS = '.blks{white-space:normal}.blk{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.6 "Malgun Gothic",-apple-system,sans-serif;color:#222;background:#fff;'
    + 'border:1px solid #d0d5dd;border-radius:8px;padding:10px 14px;margin:0 0 16px}.blk.hd{background:#f6f8fa;border-style:dashed}'
    + '.blk.sh{background:none;border:0;font-weight:bold;font-size:19px;padding:6px 2px 0;margin:22px 0 8px}';
  function blockChunks(text) {
    const out = [];
    let cur = [];
    String(text).split('\n').forEach(l => {
      if (BLK_START.test(l) && cur.some(x => x.trim())) { out.push(cur); cur = []; }
      cur.push(l);
    });
    if (cur.length) out.push(cur);
    return out.map(c => c.join('\n'));   // 빈 줄도 그대로 — 칸들을 '\n' 으로 이으면 원래 글과 한 글자도 다르지 않다
  }
  const blkClass = (c, i) => 'blk' + (/^\n*■ /.test(c) ? ' sh' : (i === 0 && !BLK_START.test(c) ? ' hd' : ''));   // ■ 줄 = 구분 제목, 첫 칸 = 머리줄
  const blocksHtml = (text) => blockChunks(text).map((c, i) => `<div class="${blkClass(c, i)}">${esc(c.replace(/^\n+|\n+$/g, '') || ' ')}</div>`).join('\n');
  // 글자 크기는 크게(사용자 지시 2026-09-30 "너무 작아 잘 안 보인다") — 본문 18px, 슬라이드 글·목록 16px, 제목 26px
  const FIG_CSS = '<style>body{font:18px/1.6 "Malgun Gothic",-apple-system,sans-serif;margin:14px 20px;color:#111;background:#fff}h2{font-size:26px;margin:6px 0}'
    + '.meta{color:#444;font-size:16px;font-weight:normal}section{border-top:1px solid #ddd;padding:12px 0}h3{font-size:21px;margin:0 0 4px}h4{font-size:18px;margin:12px 0 4px;color:#222}.memo{background:#fff4c2;padding:2px 8px;margin:2px 0;display:inline-block}'
    + '.txt{color:#222;font-size:16px;margin:6px 0;white-space:pre-wrap}.imgs{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}.imgs img{max-width:640px;max-height:520px;border:1px solid #bbb}'
    + '.ph{border:1px dashed #999;padding:10px;color:#555;font-size:16px}table.ch{border-collapse:collapse;margin:8px 0;font-size:15px}.ch td,.ch th{border:1px solid #ccc;padding:2px 8px}.ch caption{text-align:left;color:#444}.err{color:#b00}a{color:#0b57d0}'
    + '.imgs a.pg img{max-width:100%;width:1100px;max-height:none}.lead{font-size:18px;margin:8px 0;padding:8px 12px;background:#eef4ff;border-left:5px solid #0b57d0}'
    + '.wait{font-size:18px;color:#7a4b00;background:#fff4c2;padding:8px 12px;margin:10px 0}.sum pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.6 "Malgun Gothic",-apple-system,sans-serif;color:#222;background:#f6f6f6;padding:10px 12px;margin:6px 0}'
    // 결과 사이 여백(사용자 지시 2026-09-30 "다닥다닥 붙어 있어 구분이 안 된다") — 파일마다 카드, 슬라이드·쪽마다 점선 구분, 글 결과·목록은 항목마다 칸
    + 'body{background:#f2f4f7}section{border:1px solid #d0d5dd;border-radius:10px;background:#fff;padding:16px 20px;margin:0 0 28px;box-shadow:0 1px 3px rgba(0,0,0,.08)}'
    + '.unit{margin-top:18px;padding-top:14px;border-top:1px dashed #c8ccd2}'
    + BLK_CSS + '</style>';
  // 탭 제목 — 결과 탭이 뒤에 있으면(사용자가 다른 탭을 보는 중) 그 탭을 볼 때까지 제목을 깜박여 알린다(최대 2분). quiet = 깜박이지 않음.
  let blinkT = null;
  function titleAlert(t, quiet) {
    if (blinkT) { clearInterval(blinkT); blinkT = null; }
    document.title = t;
    if (quiet || !document.hidden || typeof setInterval !== 'function') return;
    let k = 0;
    blinkT = setInterval(() => {
      if (!document.hidden || ++k > 120) { clearInterval(blinkT); blinkT = null; document.title = t; return; }
      document.title = k % 2 ? '🔔 결과가 떴습니다 — 이 탭을 보세요' : t;
    }, 1000);
  }
  // showFigures(picks, opt) — 찾은 슬라이드·쪽·문단의 그림·차트 값·글을 작업 탭에 펼친다(사용자가 보는 결과 화면).
  //   picks: [[F번호 | 항목, [슬라이드·문단 번호…], '한 줄 설명'?], …] 또는 { f, units, memo, note, pages } — F번호는 scanFiles 결과의 [F번호](scanFiles 전이면 report 의 드라이브 [F번호])
  //   opt: { title, intro(HTML), tail(HTML 또는 함수 — 끝에 붙임), wait(약속 — 첫 파일을 그리기 전에 기다림: 링크용 폴더 경로), maxMB:150, text:500(단위 글 글자 수),
  //          server:true(업무 첨부·드라이브 파일은 Dooray 미리보기 쪽 그림), pages:false(번호 = 미리보기 쪽 — showPages) }
  //   화면: 파일마다 한 묶음(① 이름 · 날짜·사람·경로·링크 한 번) 아래 슬라이드·쪽·문단. 준비된 파일부터 차례로 붙고(⏳ 줄이 사라지면 끝),
  //     탭 제목은 '👉 kk-dry 결과 — N곳'(탭이 뒤에 있으면 깜박임).
  //   그림: Dooray 미리보기가 그린 **쪽 그림**(슬라이드 모양 그대로, EMF 그래프·한글 그림 포함) — pptx 는 슬라이드 = 쪽, docx·hwpx·hwp 문단은 그 글이 나오는 쪽
  //     (같은 쪽의 문단은 한 곳으로 묶음). 미리보기가 안 되면 파일 안 그림 원본(EMF·WMF 는 자리만). 파일은 scanFiles 가 읽어 둔 것을 쓰고 그림 원본이 필요할 때만 받는다.
  //   ① Claude 의 확인용(computer screenshot) ② 사용자에게 보여 줄 결과 화면 — 탭을 닫지 않는다(파일로 저장되지 않음, 탭을 닫으면 사라짐).
  async function showFigures(picks, opt = {}) {
    if (!isWorkTab()) return 'ERR 작업 탭(https://kist.gov-dooray.com/robots.txt)에서만 화면에 씁니다 — 쓰던 Dooray 화면은 건드리지 않음';
    const src = lastScan ? lastScan.list : listOf(lastReport && lastReport.drive);
    const P = [].concat(picks || []).map(p => Array.isArray(p) ? { f: p[0], units: [].concat(p[1] == null ? [] : p[1]), memo: p[2] || '' }
      : { f: p.file != null ? p.file : p.f, units: [].concat(p.units || []), memo: p.memo || '', note: p.note || '', pages: !!p.pages });
    if (!P.length) return 'ERR 띄울 곳이 없습니다 — showFigures([[F번호,[슬라이드 번호]]])';
    dropBlobs();
    progress = '그림 준비 중';
    const head = FIG_CSS + `<h2>${esc(opt.title || 'kk-dry 결과 — 찾은 그림')}</h2>` + (opt.intro || '')
      + '<p class="meta">Chrome 안에서만 만든 화면입니다 — 파일로 저장되지 않고, 이 탭을 닫으면 사라집니다. 그림을 누르면 크게 보입니다. "Dooray 에서 열기"는 그 파일이 선택된 드라이브 폴더(업무 첨부는 그 업무)를 엽니다.</p>';
    const parts = [], waitTxt = (i) => `⏳ 그림 준비 중 … 파일 ${i}/${P.length} — 준비된 것부터 위에 붙습니다`;
    const box = () => (typeof document.getElementById === 'function' && document.getElementById('kkres')) || null;
    const paint = (i, tail) => { document.body.innerHTML = head + `<div id="kkres">${parts.join('')}</div>` + (tail != null ? tail : `<p id="kkwait" class="wait">${esc(waitTxt(i))}</p>`); };
    // 준비된 파일부터 화면에 붙인다 — 실제 Chrome 에서는 이어 붙이기(앞 그림이 다시 그려지지 않음), 시험용 가짜 문서에서는 통째로 다시 쓰기
    const emit = (html, i) => {
      parts.push(html);
      const b = box();
      if (b && typeof b.insertAdjacentHTML === 'function') { b.insertAdjacentHTML('beforeend', html); const w = document.getElementById('kkwait'); if (w) w.textContent = waitTxt(i); }
      else paint(i);
    };
    titleAlert('⏳ kk-dry 결과 준비 중', true);
    paint(0);
    let nu = 0, ni = 0, ns = 0, waited = !opt.wait;
    const waitOnce = async () => { if (!waited) { waited = true; try { await opt.wait; } catch (e) { /* 폴더 경로를 못 채우면 대안 링크 */ } } };
    const blobOf = async (url) => {
      const { r, body: b } = await tfetch(url, { credentials: 'include' }, TMO.page, (rr) => rr.ok ? rr.blob() : null);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (!/^image\//.test(b.type || '')) throw new Error('그림이 아님');
      const u = URL.createObjectURL(b); blobUrls.push(u); return u;
    };
    for (let pi = 0; pi < P.length; pi++) {
      const p = P[pi], it = typeof p.f === 'number' ? src[p.f] : p.f;
      const fail = (msg) => emit(`<p class="err">${esc(msg)}</p>`, pi + 1);
      if (!it) { fail(`ERR 파일 번호 ${p.f} 가 목록에 없습니다`); continue; }
      try {   // 파일 하나의 오류(받기 실패·손상)는 그 파일 줄에만 — 다른 파일의 결과는 그대로
      const pvOnly = !!(opt.pages || p.pages || PV_EXT.test(extOf(it.name)));   // 쪽 번호로 보거나 PDF·옛 형식 → 미리보기만
      if (pvOnly && !canPreview(it)) { fail(`ERR ${it.name} — Dooray 미리보기를 만들 수 없는 항목(업무 첨부·드라이브 파일만)`); continue; }
      let r = null, g = null, ents = null;
      const bytes = async () => {   // 파일 원본 — 단위를 아직 모르거나(scanFiles 를 안 거침) 그림 원본이 필요할 때만 받는다
        if (!g) {
          g = await fetchBytes(it, opt.maxMB || 150);
          if (!g.error && !g.unsupported && g.u8[0] === 0x50 && g.u8[1] === 0x4B) { try { ents = zipEntries(g.u8); } catch (e) { ents = null; } }
        }
        return g;
      };
      if (!pvOnly) {
        r = cachedUnits(it, {}) || cachedUnits(it, { notes: true });
        if (!r) {
          const gg = await bytes();
          r = gg;
          if (!gg.error && !gg.unsupported) { try { r = await unitsOf(it.name, gg.u8, {}); if (r.units) cacheUnits(it, {}, r); } catch (e) { r = { error: '읽기 실패: ' + errText(e) }; } }
        }
        if (r.error || r.unsupported) { fail(`ERR ${it.name} — ${r.error || r.reason || r.unsupported}`); continue; }
      }
      const pick = (rr) => p.units.length ? p.units : pvOnly ? [1] : rr.units.filter(u => figOf(u) > 0).map(u => u.n).slice(0, 5);
      // Dooray 미리보기 쪽 그림 — 키는 한 번에 하나만 살아 있으므로 이 파일의 쪽 그림을 지금 다 받아 둔다(blob)
      let pv = null;
      const pgOf = {}, pgImg = {};
      if ((pvOnly || opt.server !== false) && canPreview(it)) {
        try {
          await pvExclusive(async () => {
            pv = await previewOf(it);
            if (pv.error) return;
            const want = pvOnly ? pick(null).filter(n => n >= 1 && n <= pv.pages) : pick(r);
            if (pvOnly) { await pool(want, 3, (n) => pageText(pv, n)); want.forEach(n => { pgOf[n] = n; }); }
            else if (r.fmt === 'pptx' && pv.pages === r.units.length) want.forEach(n => { if (n <= pv.pages) pgOf[n] = n; });
            else {   // 문단(docx·hwpx·hwp) — 또는 미리보기 쪽 수가 슬라이드 수와 다른 pptx(숨긴 슬라이드 등): 글로 쪽을 찾는다
              const at = new Map(r.units.map((u, i) => [u.n, i]));
              Object.assign(pgOf, await pagesOfTexts(pv, want.filter(n => at.has(n)).map(n => { const u = r.units[at.get(n)]; return { key: n, text: u.text || u.ctx || '', frac: (at.get(n) + 0.5) / r.units.length }; })));
            }
            await pool([...new Set(Object.values(pgOf))], 3, async (pg) => { try { pgImg[pg] = await blobOf(pv.img(pg)); } catch (e) { pgImg[pg] = ''; } });
          });
        } catch (e) { pv = { error: 'Dooray 미리보기 실패: ' + errText(e) }; }
      }
      const usePv = !!(pv && !pv.error);
      if (pvOnly && !usePv) { fail(`ERR ${it.name} — ${pv ? pv.error : 'Dooray 미리보기 실패'}`); continue; }
      if (pvOnly) r = { fmt: pv.format.toLowerCase(), unit: '쪽', tag: 'p', units: Array.from({ length: pv.pages }, (_, i) => Object.assign(newUnit(i + 1, '', String(pv.info.texts[i] || '').replace(/\n/g, ' / ')), { nofig: true })) };
      const units = pick(r);
      // 여러 슬라이드에 되풀이되는 그림(학교·연구실 로고 등 장식)은 뺀다 — 절반 넘는 슬라이드(5장 이상)에 같은 그림 파일이 있으면 장식으로 본다
      const use = {};
      r.units.forEach(x => new Set((x.media || []).map(m => m.part)).forEach(pt => { use[pt] = (use[pt] || 0) + 1; }));
      const deco = (pt) => r.units.length >= 5 && use[pt] >= Math.max(5, r.units.length * 0.5);
      const byPage = !pvOnly && r.fmt !== 'pptx';   // 문단 단위(docx·hwpx·hwp) — 같은 쪽에 있는 문단은 한 곳으로
      const secs = [], atPg = {}, okNs = [], pvTried = (pvOnly || opt.server !== false) && canPreview(it);
      for (const n of units) {
        const u = r.units.find(x => x.n === n);
        if (!u) { secs.push({ err: `${it.name} — ${r.tag + n} 없음(전체 ${r.units.length}${r.unit})` }); continue; }
        nu++;
        const pg = usePv ? (pgOf[n] || 0) : 0, lab = r.unit === '쪽' ? n + '쪽' : (u.lab || r.unit + ' ' + n), txt = u.text || u.ctx || '';
        if (byPage && pg && pgImg[pg] && atPg[pg]) { const s = atPg[pg]; s.labs.push(lab); s.texts.push(txt); s.charts.push(...u.chart); okNs.push(n); continue; }
        let imgs = '', decoN = 0;
        const ni0 = ni;
        if (pg && pgImg[pg]) {   // Dooray 미리보기가 그린 쪽 그림(받아 둔 blob — 키가 바뀌어도 깨지지 않음)
          imgs = `<a class="pg" href="${esc(pgImg[pg])}" target="_blank"><img src="${esc(pgImg[pg])}" alt="${esc(pg + '쪽')}"></a>` + (byPage ? `<div class="ph">[이 문단이 있는 미리보기 ${pg}쪽]</div>` : '');
          ni++;
        } else {
          if (pg) imgs += `<div class="ph">[미리보기 ${pg}쪽 그림을 받지 못함]</div>`;
          const seen = new Set();
          for (const m of u.media || []) {
            if (seen.has(m.part)) continue;   // 같은 그림 파일을 한 슬라이드에 두 번(잘라서) 쓴 경우 한 번만
            seen.add(m.part);
            if (deco(m.part)) { decoN++; continue; }
            const ext = extOf(m.part), mime = MIME[ext];
            let data = null;
            if (mime) { const gg = await bytes(); try { data = !gg.error && !gg.unsupported && ents ? await zipBytes(gg.u8, ents, m.part) : null; } catch (e) { data = null; } }
            if (!data) { imgs += `<div class="ph">[${esc(ext || '그림')} 그림 — 브라우저에서 표시 못 함]</div>`; continue; }
            const url = URL.createObjectURL(new Blob([data], { type: mime })); blobUrls.push(url); ni++;
            imgs += `<a href="${esc(url)}" target="_blank"><img src="${esc(url)}" alt="${esc(m.alt)}"></a>`;
          }
          if (decoN) imgs += `<div class="ph">[여러 슬라이드에 되풀이되는 로고·장식 그림 ${decoN}개 생략]</div>`;
          if (!(u.media || []).length && u.pics) imgs += '<div class="ph">[그림이 있지만 파일 안 위치를 찾지 못함]</div>';
          if (usePv && !pg && byPage) imgs += '<div class="ph">[이 문단이 있는 쪽을 미리보기에서 찾지 못해 파일 속 그림만]</div>';
        }
        // 그림이 있어야 할 곳인데 미리보기·파일 받기가 일시로 실패해 그림을 하나도 못 보였으면 '보인 곳'으로 치지 않는다(Codex 검토 M3)
        const transient = (pvTried && !usePv) || (pg && !pgImg[pg]) || !!(g && g.error);
        if ((u.pics || 0) > 0 && ni === ni0 && transient) imgs += '<div class="ph">[그림을 받지 못함 — 일시 오류일 수 있음. 대화창에서 "더 보여줘"라고 하면 다시]</div>';
        else okNs.push(n);
        const s = { n, labs: [lab], texts: [txt], imgs, charts: u.chart.slice() };
        if (byPage && pg && pgImg[pg]) atPg[pg] = s;
        secs.push(s);
      }
      await waitOnce();
      ns += secs.filter(s => !s.err).length;
      const meta = [ymd(it.updated || it.created), it.by, it.via ? '업무 ' + it.via : '', (it.drive || '') + (it.path ? ' ' + it.path : ''), kb(it.size)].filter(Boolean).join(' · ');
      emit(`<section class="file" data-id="${esc(String(it.id || ''))}"><h3>${NUM[pi] || '(' + (pi + 1) + ')'} ${esc(it.name)}${p.note ? ` <span class="meta">— ${esc(p.note)}</span>` : ''}</h3>`
        + (p.memo ? `<div class="memo">${esc(p.memo)}</div>` : '')
        + `<div class="meta">${esc(meta)}` + (it.url ? ` · <a href="${esc(it.url)}" target="_blank">Dooray 에서 열기 ↗</a>` : '') + '</div>'
        + secs.map(s => s.err ? `<p class="err">${esc(s.err)}</p>`
          : `<div class="unit" data-n="${s.n != null ? s.n : ''}"><h4>${esc(s.labs.join(' · '))}</h4>` + [...new Set(s.texts.filter(Boolean))].map(t => `<div class="txt">${esc(clip(t, opt.text || 500))}</div>`).join('')
            + (s.imgs ? `<div class="imgs">${s.imgs}</div>` : '') + s.charts.map(chartHtml).join('') + '</div>').join('')
        + '</section>', pi + 1);
      if (opt.onFile) { try { opt.onFile(pi, okNs); } catch (e) { /* 표시 기록 실패는 무시 */ } }   // 실제로 보인 곳(quick·more 가 '보인 곳'으로 기록)
      } catch (e) { fail(`ERR ${it.name} — ${errText(e)}`); }
    }
    await waitOnce();
    if (opt.waitTail) { try { await opt.waitTail; } catch (e) { /* 폴더 경로를 못 채우면 대안 링크 */ } }
    const tail = typeof opt.tail === 'function' ? opt.tail() : (opt.tail || '');
    const b = box();
    if (b && typeof b.insertAdjacentHTML === 'function') { const w = document.getElementById('kkwait'); if (w) w.remove(); if (tail) b.insertAdjacentHTML('afterend', tail); }
    else paint(P.length, tail);
    progress = '';
    titleAlert(`👉 kk-dry 결과 — ${ns}곳`);
    return `shown ${nu} units, ${ni} images`;
  }
  // showPages([[F번호 | 항목, [쪽…], '설명']], opt) — 업무 첨부·드라이브 파일의 Dooray 미리보기 쪽 그림을 쪽 번호로(보고서 목차·표지 등). 파일을 받지 않아 큰 파일도 빠르다.
  const showPages = (picks, opt = {}) => showFigures(picks, Object.assign({}, opt, { pages: true }));
  const scanned = () => lastScan;

  // ---------- 5d. 한 번에: 찾기 → 파일 속 찾기 → 파일별 주요 2~3곳 → 결과 화면 (2026-09-29 사용자 요청: "파일별로 주요해 보이는 2~3개만 먼저 보여 주고,
  //   더 원하면 세부적으로 — 검색 결과 출력 속도를 올리고 싶다") ----------
  // quick(spec) — Claude 왕복 없이 한 번의 호출로 끝까지 간다. 결과 화면(작업 탭)은 준비된 파일부터 차례로 붙고, 끝에 '■ 파일 목록'(보인 곳·링크·못 읽은 파일)이 붙는다.
  //   spec: { find:[['…'],['…','…']](report 와 같은 묶음 — 없으면 마지막 찾기 결과를 다시 씀), q: 파일 속 찾을 말(scanFiles 의 q — 정규식·글 배열·{all,any}),
  //           since, until, sinceDays, tasks:true, drive:true, projectId, maxPages(찾기 옵션), detail:30(첨부를 볼 업무 수),
  //           ext·name·figures·notes·maxFiles:40·maxMB(훑기 옵션), top:3(파일당 먼저 보일 곳), files:6(보일 파일 수 — 나머지는 목록), title,
  //           view:'auto'(슬라이드 pptx·ppt = Chrome 결과 화면, 글 위주 문서 hwp·hwpx·docx·xlsx·pdf 등 = '■ 글 결과' → Claude 가 채팅에 / 'chrome'·'chat' 로 모두 한쪽) }
  //   글 위주 문서(사용자 제안 2026-09-29 "한글·엑셀·워드처럼 글·숫자 위주 문서의 문구나 크지 않은 표는 Chrome 창 대신 채팅에 바로"): 찾은 문단(짧으면 다음 문단까지)과
  //     표(작으면 전체, 크면 머리 행 + 걸린 행 둘레 — | 칸 | 꼴, 찾을 말이 든 칸은 **굵게**)를 화면 끝 '■ 글 결과' 에 적는다 → Claude 가 채팅에 그대로. figures:true 면 그림 있는 문서도 Chrome.
  //   순위: 찾을 말이 많이·제목 줄에 나오고 그림·차트·표가 있는 곳이 위, 표지(글만 있는 첫 슬라이드)·참고문헌은 아래. 파일 순서 = 위 top 곳 점수 합.
  //   반환 { summary(한 줄), shown, files, places } — 끝났는지는 화면에 '■ 파일 목록' 이 있고 ⏳ 줄이 없는지로(get_page_text 한 번에 목록·링크까지).
  //   후속: more(F번호 | [F번호…] | 'all') = 다음 순위 곳 · quick({q:…}) = 들고 있는 파일 글로 다시 좁혀(파일을 다시 받지 않음)
  let lastQuick = null;
  // 진행 화면 — 사용자가 결과 탭을 먼저 보고 있어도 무엇을 하는 중인지 보이게. fresh = 새로 그림(앞 결과 지움)
  function stage(msg, fresh, title) {
    const w = !fresh && typeof document.getElementById === 'function' && document.getElementById('kkwait');
    if (w) { w.textContent = msg; return; }
    dropBlobs();
    titleAlert(title || '⏳ kk-dry 찾는 중', true);
    document.body.innerHTML = FIG_CSS + '<h2>kk-dry</h2>' + `<p id="kkwait" class="wait">${esc(msg)}</p>`;
  }
  // 찾을 말을 사람이 읽는 꼴로(결과 화면 제목): /Cu(?![a-z])|구리/ → 'Cu·구리', { all:[A, B] } → 'A + B'
  function friendly(q) {
    const one = (x) => x instanceof RegExp
      ? x.source.replace(/\(\?<?[!=][^)]*\)/g, '').replace(/\\[bBdDsSwW]|\[[^\]]*\]|\{\d*,?\d*\}|[\\^$?*+.()]/g, '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 4).join('·')
      : [].concat(x == null ? [] : x).map(String).slice(0, 4).join('·');
    return q && typeof q === 'object' && !(q instanceof RegExp) && !Array.isArray(q) && (q.all || q.any) ? [].concat(q.all || []).concat(q.any != null ? [q.any] : []).map(one).join(' + ') : one(q);
  }
  async function quick(spec = {}) {
    if (!isWorkTab()) return { summary: 'ERR 작업 탭(https://kist.gov-dooray.com/robots.txt)에서만 화면에 씁니다 — 쓰던 Dooray 화면은 건드리지 않음' };
    if (qBusy) return { summary: 'ERR 앞 찾기가 아직 도는 중입니다 — 화면의 ⏳ 가 사라진 뒤 다시' };
    let M0 = null;
    try { M0 = matcher(spec.q); } catch (e) { M0 = null; }
    if (!M0) { stage('ERR 파일 속 찾을 말(q)이 없거나 잘못됐습니다 — 정규식·글·글 배열·{all:[…], any:…} 중 하나로', true, 'kk-dry 오류'); return { summary: 'ERR 파일 속 찾을 말(q)이 없거나 잘못됐습니다 — quick({find:[…], q:/낱말|낱말/i})' }; }
    qBusy = true;
    const run = (async () => {
      try { return await quickRun(spec); }
      catch (e) { progress = ''; stage('ERR kk-dry 실패: ' + errText(e), true, 'kk-dry 오류'); return { summary: 'ERR ' + errText(e) }; }
      finally { qBusy = false; }
    })();
    lastRun = run;
    return run;
  }
  // done(초) — 도는 quick·more 가 끝나는 즉시 요약 한 줄을 돌려준다(고정 wait 없이 — 일찍 끝나면 일찍). 한도(기본 35초 — javascript_tool 은 34초 await 도 돌려줌, 2026-09-30 실측) 안에 안 끝나면 '⏳ 아직 — 진행'.
  //   부를 때: 같은 browser_batch 에서 quick 시작 → await kkDry.done(35) → get_page_text. '⏳ 아직' 이면 await kkDry.done(35) → get_page_text 를 한 번 더.
  let lastRun = null;
  async function done(sec = 35) {
    if (!lastRun) return 'ERR 도는 찾기가 없습니다 — quick(…)·more(…) 로 시작';
    let tm = null;
    const t = new Promise(r => { tm = setTimeout(() => r(null), Math.max(0.05, +sec || 35) * 1000); });
    const r = await Promise.race([lastRun, t]);
    clearTimeout(tm);
    if (!r) { const w = typeof document.getElementById === 'function' && document.getElementById('kkwait'); return '⏳ 아직 — ' + ((w && w.textContent) || progress || '준비 중') + ' (다시 await kkDry.done(35))'; }
    return r.summary || 'ERR 결과 없음';
  }
  // goto(F번호 | '이름 조각', 슬라이드·쪽 번호?) — 결과 화면에서 그 곳으로 스크롤한다(그림 확인은 이어서 screenshot 한 번). 반환 'ok …' 또는 ERR.
  function goto(x, n) {
    const S = (lastQuick && lastQuick.S) || lastScan;
    let f = null;
    if (typeof x === 'number') { const v = S && S.files.find(v => v.k === x); f = v && v.f; }
    else if (S && x != null) { const key = NF(x).toLowerCase(); const v = S.files.find(v => NF(v.f.name).toLowerCase().includes(key)); f = v && v.f; }
    if (!f) return 'ERR 결과에 그 파일이 없습니다 — ■ 파일 목록의 [F번호]로';
    if (typeof document.querySelectorAll !== 'function') return 'ERR 결과 화면이 없습니다';
    const sec = [...document.querySelectorAll('section.file')].find(e => e.getAttribute('data-id') === String(f.id));
    if (!sec) return 'ERR 그 파일은 지금 화면에 없습니다 — more(F번호) 로 먼저 띄우기';
    const u = n == null ? sec : [...sec.querySelectorAll('.unit')].find(e => e.getAttribute('data-n') === String(n));
    if (!u) return `ERR 그 곳(${n})은 지금 화면에 없습니다 — more(F번호) 로`;
    u.scrollIntoView(); if (typeof window.scrollBy === 'function') window.scrollBy(0, -8);
    return 'ok ' + sanitize(String(f.name).slice(0, 40)) + (n != null ? ' · ' + n : '');
  }
  let qBusy = false;
  async function quickRun(spec) {
    const t0 = Date.now(), T = {};
    if (spec.find) {
      stage('⏳ 업무·드라이브에서 파일 찾는 중 …', true);
      // 첨부 목록만 있으면 되므로 댓글은 읽지 않는다(댓글에 단 파일도 업무 첨부 목록에 함께 온다 — 실측) → 업무당 요청 1번
      const r = await find(spec.find, { since: spec.since, until: spec.until, sinceDays: spec.sinceDays, tasks: spec.tasks, drive: spec.drive, projectId: spec.projectId, maxPages: spec.maxPages,
        detail: spec.tasks === false ? 0 : (spec.detail != null ? spec.detail : 30), comments: 0, paths: 0 });
      T.find = r.ms;
      if (r.error && !r.tasks && !r.drive) { lastReport = { error: r.error }; progress = ''; stage('ERR ' + r.error, true, 'kk-dry 오류'); return { summary: 'ERR ' + r.error }; }
      lastReport = { groups: r.groups, tasks: r.tasks || { items: [] }, drive: r.drive || { items: [] }, expanded: [], ms: r.ms, quick: true,
        errors: [r.tasks && r.tasks.error ? '업무 검색: ' + r.tasks.error : '', r.drive && r.drive.error ? '드라이브 검색: ' + r.drive.error : ''].filter(Boolean),
        truncated: !!((r.tasks && r.tasks.truncated) || (r.drive && r.drive.truncated)) };
    } else if (!lastReport || lastReport.error) return { summary: 'ERR 다시 쓸 찾기 결과가 없습니다 — quick({find:[…], q:…})' };
    else stage('⏳ 들고 있는 파일 속에서 다시 찾는 중 …', true);
    const x = listOf(lastReport.drive).concat(listOf(lastReport.tasks)), t1 = Date.now();
    const pref = lastReport.groups ? [].concat(...lastReport.groups.map(g => String(g).split(/\s+/))).filter(w => w.length > 1) : null;
    const sr = await scanFiles(x, spec.q, { figures: spec.figures, ext: spec.ext, name: spec.name, notes: spec.notes, maxFiles: spec.maxFiles, maxMB: spec.maxMB, quiet: true, prefer: pref && pref.length ? pref : null,
      maxSec: spec.maxSec != null ? spec.maxSec : 45,
      onProgress: (d, n) => stage(`⏳ 파일 속 찾는 중 … ${d}/${n}`) });
    T.scan = Date.now() - t1;
    if (/^ERR/.test(sr.summary)) { progress = ''; stage(sr.summary, true, 'kk-dry 오류'); return { summary: sr.summary }; }
    const S = lastScan, top = Math.max(1, spec.top || 3), maxF = Math.max(1, spec.files || 6);
    const hitF = S.files.filter(v => v.hits && v.hits.length).map(v => {
      const rank = ranked(v);
      return Object.assign(v, { rank, best: rank.slice(0, top).reduce((s, u) => s + rankScore(u, v.unit), 0), shown: new Set() });
    }).sort((a, b) => b.best - a.best || b.hits.length - a.hits.length || tsOf(b.f.updated || b.f.created) - tsOf(a.f.updated || a.f.created));
    const view = spec.view === 'chrome' || spec.view === 'chat' ? spec.view : 'auto';
    hitF.forEach(v => { v.mode = view !== 'auto' ? view : (/^(pptx|ppt)$/i.test(extOf(v.f.name)) || (spec.figures && !v.nofig)) ? 'chrome' : 'chat'; });
    lastQuick = { spec, top, files: maxF, hitF, S, t0, T, M: matcher(spec.q), R: lastReport };
    return quickShow(pickFiles(hitF, top, maxF, null), true);
  }
  // 보일 파일 고르기 — 순위대로 maxF 개. 채팅 글 파일은 앞 파일과 같은 글(보고서의 다른 판·사본)이면 접는다(v.dupOf = 앞 파일 F번호, 목록에 한 줄)
  //   '같은 글' = 공백 뺀 글의 4글자 조각이 짧은 쪽 기준 70% 이상 겹침 — 한 문장이 끼어든 다른 판도 잡는다(앞 글자 일치로는 못 잡던 것, 2026-09-29 실측)
  function gramsOf(ps) {
    const t = NF(ps.kind === 'table' ? [0].concat(ps.rows).map(i => (ps.T.rows[i] || []).join(' ')).join(' ') : ps.texts.join(' ')).replace(/\s+/g, '').toLowerCase().slice(0, 600), g = new Set();
    for (let i = 0; i + 4 <= t.length; i++) g.add(t.slice(i, i + 4));
    return { t, g };
  }
  const sameText = (a, b) => {
    if (a.g.size < 12 || b.g.size < 12) return a.t === b.t;   // 짧은 글은 똑같을 때만
    const [x, y] = a.g.size <= b.g.size ? [a.g, b.g] : [b.g, a.g];
    if (x.size / y.size < 0.5) return false;   // 길이가 두 배 넘게 다르면 다른 글
    let n = 0; for (const s of x) if (y.has(s)) n++;
    return n / x.size >= 0.7;
  };
  function pickFiles(vs, top, maxF, ks) {
    const picks = [], kept = [];   // kept: { gr, k } — 이번에 보일 조각들
    for (const v of vs) {
      if (picks.length >= maxF) break;
      if (ks && !ks.has(v.k)) continue;
      if (!ks && v.dupOf != null) continue;
      const nx = nextOf(v, top);
      if (!nx) continue;
      if (nx.passages) {
        const fresh = [];
        let dupK = null;
        for (const ps of nx.passages) {
          const gr = gramsOf(ps), hit = kept.find(x => sameText(x.gr, gr));
          if (hit) { if (dupK == null) dupK = hit.k; if (ks) fresh.push(ps); continue; }
          kept.push({ gr, k: v.k }); fresh.push(ps);
        }
        if (!fresh.length && !ks) { v.dupOf = dupK; continue; }
        nx.passages = fresh;
      }
      picks.push(nx);
    }
    return picks;
  }
  // 한 파일에서 아직 안 보인 다음 곳들 — Chrome 파일은 단위(슬라이드·쪽·문단), 채팅 파일은 글 조각(문단·표)
  function nextOf(v, top) {
    if (v.mode === 'chat') { const passages = chatPick(v, top); return passages.length ? { v, passages } : null; }
    const units = v.rank.filter(u => !v.shown.has(u.n)).slice(0, top);
    return units.length ? { v, units } : null;
  }
  // ---------- 5e. 채팅용 글 결과 — 글·숫자 위주 문서의 찾은 문단·작은 표(사용자 제안 2026-09-29) ----------
  // 채팅에 보일 곳 고르기: 순위대로 — 표 안이면 그 표 하나(같은 표의 다른 걸린 행도 순위대로 8행까지), 아니면 문단(짧으면 다음 문단까지 — 제목 줄 뒤 내용)
  function chatPick(v, top) {
    const r = v.doc, out = [];
    if (!r || !r.units) return out;
    const idx = new Map(r.units.map((u, i) => [u.n, i])), hitN = new Set(v.hits.map(u => u.n)), usedT = new Set();
    for (const u of v.rank) {
      if (out.length >= top) break;
      if (v.shown.has(u.n) || out.some(ps => ps.covers.includes(u.n))) continue;
      const T = u.tb != null && r.tables ? r.tables[u.tb] : null;
      if (T && T.rows && T.rows.length) {
        if (usedT.has(u.tb)) continue;
        usedT.add(u.tb);
        const inT = v.rank.filter(h => h.tb === u.tb && !v.shown.has(h.n)).slice(0, 8);
        out.push({ kind: 'table', u, T, rows: inT.map(h => h.rc[0]), covers: inT.map(h => h.n) });
        continue;
      }
      const i = idx.get(u.n), covers = [u.n];
      let texts, fig = null;
      if (!u.text && (u.pics || u.charts)) {   // 그림만 있는 문단 — 글은 그 아래 그림 설명(다음 문단)
        texts = [u.ctx || '']; fig = u;
        const nx = i != null ? r.units[i + 1] : null;
        if (nx && nx.tb == null && hitN.has(nx.n)) covers.push(nx.n);
      } else {
        texts = [u.text];
        const pv = i > 0 ? r.units[i - 1] : null;
        if (pv && !pv.text && (pv.pics || pv.charts)) { fig = pv; if (hitN.has(pv.n)) covers.push(pv.n); }   // 바로 위 그림의 설명 문단
        for (let j = i + 1; i != null && j < r.units.length && j <= i + 3 && texts.join(' ').length < 160; j++) {
          const w = r.units[j];
          if (w.tb != null || (!w.text && (w.pics || w.charts))) break;
          texts.push(w.text);
          if (hitN.has(w.n)) covers.push(w.n);
        }
      }
      out.push({ kind: 'para', u, texts, covers, fig });
    }
    return out;
  }
  const cellTxt = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  // 표 → 채팅 표(| 칸 | 칸 |). 12행 이하면 전체, 크면 첫 행(머리) + 걸린 행 둘레(넘치면 걸린 행만). 찾을 말이 든 칸은 **굵게**(그 둘레 80자), 다른 칸은 60자까지, 8열까지.
  function tableMd(rows, hitRows, M, maxR = 12, maxC = 8) {
    const R = Array.from(rows || [], r => Array.from(r || [], cellTxt)), full = R.map((r, i) => (r.some(Boolean) ? i : -1)).filter(i => i >= 0);   // 빈 행(구멍)도 [] 로
    if (!full.length) return { lines: [], note: '빈 표' };
    const isHit = (x) => !!(x && M && M.any(NF(x)));
    const wide = R.reduce((mx, r) => Math.max(mx, r.length), 0), hs = [...new Set(hitRows)].filter(i => i >= 0 && i < R.length).sort((a, b) => a - b);
    // 넓은 표(열 8개 초과): 첫 열(행 이름) + 찾은 칸이 있는 열 + 앞쪽 열 순으로 8개
    const hitC = []; hs.forEach(i => (R[i] || []).forEach((x, c) => { if (isHit(x) && !hitC.includes(c)) hitC.push(c); }));
    const cols = wide <= maxC ? Array.from({ length: wide }, (_, c) => c) : [...new Set([0, ...hitC, ...Array.from({ length: wide }, (_, c) => c)])].slice(0, maxC).sort((a, b) => a - b);
    const nc = cols.length;
    let pick = full;
    if (full.length > maxR) {
      const has = (i) => i >= 0 && i < R.length && R[i].some(Boolean);
      let keep = new Set([full[0]]);
      hs.forEach(h => [h - 1, h, h + 1].forEach(i => { if (has(i)) keep.add(i); }));
      if (keep.size > maxR) { keep = new Set([full[0]]); hs.forEach(h => { if (keep.size < maxR && has(h)) keep.add(h); }); }
      pick = [...keep].sort((a, b) => a - b);
    }
    const cell = (x) => { const hit = isHit(x); x = hit ? around(x, M, 80) : x.length > 60 ? x.slice(0, 60) + '…' : x; return hit ? `**${x}**` : x; };
    const out = [];
    pick.forEach((i, k) => {
      if (k > 0 && full.indexOf(i) - full.indexOf(pick[k - 1]) > 1) out.push('| … |' + ' |'.repeat(Math.max(0, nc - 1)));   // 글이 있는 행을 건너뛸 때만(빈 행은 조용히)
      out.push('| ' + cols.map(c => cell(R[i][c] || '')).join(' | ') + ' |');
      if (k === 0) out.push('|' + ' --- |'.repeat(nc));
    });
    return { lines: out, note: `${full.length}행×${wide}열` + (pick.length < full.length ? ` 중 ${pick.length}행` : '') + (wide > nc ? ` · 열 ${nc}개(첫 열·찾은 칸 열 먼저)` : '') };
  }
  // 긴 글은 찾을 말 둘레만(앞 1/3 · 뒤 2/3)
  function around(t, M, n) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    let at = 0;
    if (M && M.first) { at = M.first(t); if (at < 0) { const nt = NF(t), j = M.first(nt); at = j < 0 ? 0 : Math.round(j * t.length / Math.max(1, nt.length)); } }
    const st = Math.max(0, Math.min(at - Math.floor(n / 3), t.length - n));
    return (st > 0 ? '…' : '') + t.slice(st, st + n) + (st + n < t.length ? '…' : '');
  }
  const whereOf = (f) => f.via ? '업무 ' + f.via : [f.drive, f.path].filter(Boolean).join(' ');
  // 곳 이름 — 슬라이드 S3·문단 ¶12·쪽 p4, 엑셀은 실제 행 번호(R100, 시트가 여럿이면 '시트!R100')
  const labOf = (v, u) => (u && u.lab) || (v.tag + (u ? u.n : '?'));
  const unitByN = (v, n) => { if (!v._um) v._um = new Map(((v.doc && v.doc.units) || []).map(u => [u.n, u])); return v._um.get(n); };
  const shownLab = (p) => p.units ? p.units.map(u => labOf(p.v, u)).join(' ')
    : p.passages.map(ps => ps.kind === 'table' ? (ps.T.name != null ? `시트'${ps.T.name}'` : '표' + (ps.u.tb + 1)) : labOf(p.v, ps.u)).join(' ');
  // 화면 끝 '■ 글 결과' — Claude 가 get_page_text 로 읽어 채팅에 그대로 보인다(사용자는 이 탭을 볼 필요 없음)
  function chatText(tP, first, from) {
    const Q = lastQuick, M = Q.M, L = ['■ 글 결과 — 대화창에 그대로 옮겨 보인다(문단은 인용, 표는 | 칸 | 그대로)'];
    tP.forEach((p, i) => {
      const v = p.v, f = v.f;
      L.push('', `${NUM[from + i] || '(' + (from + i + 1) + ')'} [F${v.k}] ${f.name} | ${ymd(f.updated || f.created)} | 걸린 곳 ${v.hits.length} · ${first ? '보인 곳' : '이번'} ${shownLab(p)} · 남은 ${v.hits.length - v.shown.size} | ${whereOf(f)} | ${f.by || '?'}` + (f.url ? ' → ' + f.url : ''));
      p.passages.forEach(ps => {
        if (ps.kind === 'table' && ps.T.name == null && Array.from(ps.T.rows || [], r => (r || []).length).reduce((a, b) => Math.max(a, b), 0) <= 1) {   // 한 칸짜리 표(글상자처럼 쓴 것)는 문단처럼
          L.push(`   ▸ 표 ${ps.u.tb + 1}(한 칸): ` + around([...new Set(ps.rows)].map(i => (ps.T.rows[i] || [])[0]).filter(Boolean).join(' / '), M, 300));
        } else if (ps.kind === 'table') {
          const tm = tableMd(ps.T.rows, ps.rows, M);
          L.push(`   ▸ ${ps.T.name != null ? `시트 '${ps.T.name}'` : '표 ' + (ps.u.tb + 1)} (${tm.note}) — 걸린 칸 ${ps.covers.map(n => labOf(v, unitByN(v, n))).join(' ')}`);
          tm.lines.forEach(l => L.push('     ' + l));
        } else {
          const g = ps.fig, fig = g ? ` [${g === ps.u ? '' : '바로 위 '}그림${g.pics ? ' ' + g.pics : ''}${g.charts ? ' 차트 ' + g.charts : ''} — ${g === ps.u ? '' : v.tag + g.n + ', '}보려면 그림으로]` : '';
          L.push(`   ▸ ${labOf(v, ps.u)}${fig}: ` + around(ps.texts.filter(Boolean).join(' / '), M, 300));
        }
      });
    });
    return `<section class="sum"><h3>■ 글 결과</h3><div class="blks">${blocksHtml(L.join('\n'))}</div></section>`;
  }
  // more(x, opt) — quick 뒤 '더 보여줘': 이미 보인 곳 다음 순위 곳을 띄운다(파일은 다시 받지 않는다).
  //   x: F번호 · [F번호…] · 'all'(기본 — 보인 파일 먼저, 그다음 아직 안 보인 걸린 파일) / opt: { top·files(기본 quick 과 같음), title, view:'chrome'|'chat'(그 파일들을 한쪽으로) }
  async function more(x = 'all', opt = {}) {
    const Q = lastQuick;
    if (!Q) return { summary: 'ERR 먼저 quick(…) 로 찾으세요' };
    if (!isWorkTab()) return { summary: 'ERR 작업 탭(https://kist.gov-dooray.com/robots.txt)에서만 화면에 씁니다 — 쓰던 Dooray 화면은 건드리지 않음' };
    if (qBusy) return { summary: 'ERR 앞 찾기가 아직 도는 중입니다 — 화면의 ⏳ 가 사라진 뒤 다시' };
    const top = Math.max(1, opt.top || Q.top), maxF = Math.max(1, opt.files || Q.files);
    const ks = x === 'all' || x == null ? null : new Set([].concat(x).map(Number));
    if (ks && ![...ks].some(k => Q.hitF.some(v => v.k === k))) return { summary: 'ERR 그 F번호는 걸린 파일이 아닙니다 — 화면 끝 ■ 파일 목록의 [F번호]' };
    const order = Q.hitF.filter(v => v.shown.size).concat(Q.hitF.filter(v => !v.shown.size));
    if (opt.view === 'chrome' || opt.view === 'chat') order.forEach(v => { if (!ks || ks.has(v.k)) v.mode = opt.view; });
    const picks = pickFiles(order, top, maxF, ks);
    if (!picks.length) return { summary: '더 보일 곳이 없습니다 — 걸린 곳을 모두 보였습니다(다른 말로 좁히려면 quick({q:…}))' };
    qBusy = true;
    const run = (async () => {
      try { return await quickShow(picks, false, opt.title); }
      catch (e) { progress = ''; stage('ERR kk-dry 실패: ' + errText(e), true, 'kk-dry 오류'); return { summary: 'ERR ' + errText(e) }; }
      finally { qBusy = false; }
    })();
    lastRun = run;
    return run;
  }
  async function quickShow(picks, first, title) {
    const Q = lastQuick, S = Q.S, RP = Q.R || lastReport || {}, t2 = Date.now();
    const cP = picks.filter(p => p.units), tP = picks.filter(p => p.passages);
    picks = cP.concat(tP);   // 번호: Chrome 화면 파일 먼저(①…), 이어서 채팅 글 파일
    const added = [];   // 이번에 '보인 곳'으로 표시한 것 — 그리기가 실패하면 되돌려 '더 보여줘'에서 다시 나오게
    const mark = (v, n) => { if (!v.shown.has(n)) { v.shown.add(n); added.push([v, n]); } };
    // 채팅 글은 글이라 늘 보인다 → 미리 표시. Chrome 화면 곳은 그림까지 실제로 보인 것만 showFigures 가 알려 줄 때 표시(Codex 검토 M3)
    tP.forEach(p => p.passages.forEach(ps => ps.covers.forEach(n => mark(p.v, n))));
    try { return await quickPaint(picks, cP, tP, first, title, Q, S, RP, t2, mark); }
    catch (e) { added.forEach(([v, n]) => v.shown.delete(n)); throw e; }
  }
  async function quickPaint(picks, cP, tP, first, title, Q, S, RP, t2, mark) {
    // 링크용 부모 폴더 — 보일 파일은 첫 그림을 받는 동안, 목록에만 오를 걸린 파일(20개까지)은 끝 목록을 쓰기 전까지 함께 채운다
    //   (목록의 링크도 '파일이 선택된 폴더'로 열리게 — 답에서 linkOf 를 따로 부르지 않아도 되게, 2026-09-30)
    const noPath = (f) => f && f.kind === 'file' && f.driveId && !f.folderId;
    const needPath = picks.map(p => p.v.f).filter(noPath);
    const wait = needPath.length ? pool(needPath, 3, drivePath) : null;
    const needRest = Q.hitF.filter(v => !picks.some(p => p.v === v)).slice(0, 20).map(v => v.f).filter(f => noPath(f) && !needPath.includes(f));
    const waitRest = needRest.length ? pool(needRest, 3, drivePath) : null;
    const places = cP.reduce((s, p) => s + p.units.length, 0), tPlaces = tP.reduce((s, p) => s + p.passages.length, 0), badN = S.files.filter(v => !v.hits).length, readN = S.files.length - badN;   // 읽은 파일 = 읽기에 성공한 것만(못 읽은 파일은 따로 — Codex 실계정 검토)
    const ttl = title || Q.spec.title || `kk-dry 결과 — '${friendly(Q.spec.q)}' 파일 속 찾기`;
    const moreTxt = `더 보려면 대화창에서 <b>"더 보여줘"</b>${first ? ' (또는 "①번 더", "그중 ○○만")' : ''}.`;
    // 없음이 아닌 것들 — 찾기 오류(로그인 만료 등)·시간 한도·파일 수 한도·못 읽은 파일은 요약·머리글·탭 제목에 먼저 드러낸다
    const warn = first ? [(RP.errors || []).length ? '찾기 오류 ' + RP.errors.join(' / ') : '', S.late && S.late.length ? `시간 한도로 ${S.late.length}개 안 봄` : '',
      S.cut && S.cut.length ? `파일이 많아 ${S.cut.length}개 안 봄` : '', badN ? `못 읽은 파일 ${badN}개` : '',
      S.noDetail ? `첨부를 안 본 업무 ${S.noDetail}건` : ''].filter(Boolean) : [];
    const warnHtml = warn.length ? `<b>⚠ ${esc(warn.join(' · '))} — 없음이 아님(맨 아래 목록).</b> ` : '';
    const lead = warnHtml + (!S.files.length ? `찾기 결과에 속을 읽을 수 있는 파일이 없습니다(업무 ${listOf(RP.tasks).length}건 · 드라이브 ${listOf(RP.drive).length}건). 다른 말로 찾으려면 대화창에서 말씀하세요.`
      : !Q.hitF.length ? (readN ? `찾은 파일 ${readN}개를 읽었지만 찾을 말이 나오는 곳이 없습니다` : `찾은 파일 ${S.files.length}개를 모두 읽지 못했습니다`) + (badN ? ` — 못 읽은 파일 ${badN}개는 아래 목록(없음이 아님)` : '') + '. 다른 말로 찾으려면 대화창에서 말씀하세요.'
        : (first ? `파일 ${readN}개를 읽어 <b>${Q.hitF.length}개</b>에서 찾았습니다 — ` : `앞서 본 곳 다음 순위 — `)
          + (cP.length ? `슬라이드·쪽 그림은 이 화면에 파일마다 ${first ? '주요 ' : ''}<b>${Q.top}곳</b>까지` : '')
          + (cP.length && tP.length ? ', ' : '') + (tP.length ? `문서(한글·워드·엑셀·PDF 등)에서 찾은 글·표는 <b>대화창</b>에 보여 드립니다` : '')
          + (first && Q.hitF.length > picks.length ? ` (파일은 위 ${picks.length}개, 나머지는 맨 아래 목록)` : '') + '. ' + moreTxt);
    const intro = `<p class="lead">${lead}</p>`, tail = () => (tP.length ? chatText(tP, first, cP.length) : '') + quickTail(picks, first, Date.now() - t2);
    let res;
    const okF = new Set(); let okPlaces = 0;
    const onFile = (pi, ns) => { const p = cP[pi]; if (!p) return; ns.forEach(n => mark(p.v, n)); if (ns.length) { okF.add(pi); okPlaces += ns.length; } };
    if (cP.length) res = await showFigures(cP.map(p => ({ f: p.v.f, units: p.units.map(u => u.n), note: `걸린 곳 ${p.v.hits.length} · ${first ? '보인 곳' : '이번'} ${shownLab(p)}` })), { title: ttl, intro, tail, wait, waitTail: waitRest, onFile });
    else {   // 채팅 글뿐이면(또는 걸린 곳 없음) Chrome 결과 화면이 아니라 Claude 작업 글 — 탭 제목도 조용히
      if (wait) await wait;
      if (waitRest) await waitRest;
      dropBlobs();
      document.body.innerHTML = FIG_CSS + `<h2>${esc(ttl)}</h2>` + intro + tail();
      titleAlert(`kk-dry 작업 — ${tP.length ? '글 결과 ' + tPlaces + '곳(채팅에)' : warn.length ? '⚠ 확인 필요' : '0곳'}`, true);
      res = 'shown 0 units, 0 images';
    }
    progress = '';
    const findFail = first && (RP.errors || []).length && !S.files.length && !(S.cut && S.cut.length);
    const summary = (findFail ? 'ERR 찾기 실패(없음이 아님) — ' + RP.errors.join(' / ') + ' | ' : '')
      + `■ kk-dry ${first ? 'quick' : 'more'} — 읽은 파일 ${readN}${badN ? `(못 읽음 ${badN})` : ''} · 걸린 ${Q.hitF.length} · Chrome 화면 파일 ${okF.size}개 ${okPlaces}곳${okPlaces < places ? `(그림을 못 받은 ${places - okPlaces}곳은 '더 보여줘'로 다시)` : ''} · 채팅 글 파일 ${tP.length}개 ${tPlaces}곳 | ${res} | ${((Date.now() - (first ? Q.t0 : t2)) / 1000).toFixed(1)}초`
      + (warn.length && !findFail ? ' | ⚠ ' + warn.join(' · ') : '');
    return { summary, shown: res, files: okF.size + tP.length, places: okPlaces, chat: tPlaces };
  }
  // 결과 화면 끝 '■ 파일 목록' — 사용자는 링크 목록으로, Claude 는 get_page_text 로 답에 쓸 것(파일·보인 곳·남은 곳·링크·못 읽은 파일·시간)을 한 번에 읽는다
  function quickTail(picks, first, msShow) {
    const Q = lastQuick, S = Q.S, R = Q.R || lastReport || {}, sec = (ms) => (ms / 1000).toFixed(1) + '초';
    const noneF = S.files.filter(v => v.hits && !v.hits.length), badF = S.files.filter(v => !v.hits);
    const where = whereOf;
    const L = [`■ kk-dry ${first ? '찾기' : '더 보기'} — ${R.groups ? '검색어 ' + R.groups.map(g => '[' + g + ']').join(' ') + ' | ' : ''}파일 속 ${S.label} | 읽은 파일 ${S.files.length - badF.length} · 걸린 ${Q.hitF.length} · 없음 ${noneF.length}${badF.length ? ' · 못 읽음 ' + badF.length : ''}`
      + ' | ' + (first ? [Q.T.find != null ? '찾기 ' + sec(Q.T.find) : '', '파일 속 ' + sec(Q.T.scan), '그림 ' + sec(msShow), '합계 ' + sec(Date.now() - Q.t0)].filter(Boolean).join(' · ') : '그림 ' + sec(msShow))];
    if (first) {
      (R.errors || []).forEach(e => L.push('⚠ ' + e + ' (없음이 아님)'));
      if (R.truncated) L.push('⚠ 찾기 결과가 많아 일부만 — 낱말을 더해 좁히거나 maxPages');
      if (S.cut.length) L.push(`⚠ 파일이 많아 ${S.files.length}개만 읽음(이름에 찾을 말이 든 파일·최근 파일 먼저) — 나머지 ${S.cut.length}개는 안 봄(maxFiles 로 늘리거나 ext·name 으로 좁혀 다시)`);
      if (S.late && S.late.length) L.push(`⏱ 시간 한도(${S.maxSec}초)로 ${S.late.length}개는 안 봄(이름에 찾을 말이 든 파일·최근 파일부터 읽음) — maxSec 로 늘리거나 좁혀 다시`);
      if (S.same && S.same.length) L.push(`※ 내용이 똑같은 파일 ${S.same.length}개는 한 번만 보임: ` + S.same.slice(0, 8).map(v => `[F${v.k}]=F${v.of}`).join(' · '));
      if (S.noDetail) L.push(`※ 첨부를 읽지 않은 업무 ${S.noDetail}건은 빠짐(detail 로 늘려 다시)`);
    }
    L.push('');
    picks.forEach((p, i) => {
      const f = p.v.f;
      L.push(`${NUM[i] || '(' + (i + 1) + ')'} [F${p.v.k}] ${ymd(f.updated || f.created)} | ${f.name} | 걸린 곳 ${p.v.hits.length} · ${first ? '보인 곳' : '이번'} ${shownLab(p)}${p.units ? ' (Chrome 화면)' : ' (채팅 글)'} · 남은 ${p.v.hits.length - p.v.shown.size} | ${where(f)} | ${f.by || '?'}${partNote(p.v)}` + (f.url ? ' → ' + f.url : ''));   // 이름과 주소를 한 줄에(2026-09-30)
    });
    const rest = Q.hitF.filter(v => !picks.some(p => p.v === v) && v.hits.length > v.shown.size), dup = rest.filter(v => v.dupOf != null), other = rest.filter(v => v.dupOf == null);
    if (dup.length) L.push('', `— 앞 파일과 같은 글(다른 판·사본) ${dup.length}개 — 접음: ` + dup.slice(0, 20).map(v => `[F${v.k}] ${v.f.name}(=F${v.dupOf})`).join(' · ') + (dup.length > 20 ? ' …' : ''));
    if (other.length) {
      L.push('', `— 걸린 파일 ${other.length}개 더(목록만 — "더 보여줘"):`);
      other.slice(0, 20).forEach(v => L.push(`[F${v.k}] ${ymd(v.f.updated || v.f.created)} | ${v.f.name} | 걸린 곳 ${v.hits.length}${v.shown.size ? ' · 보인 곳 ' + v.shown.size : ''} | ${where(v.f)}` + (v.f.url ? ' → ' + v.f.url : '')));
      if (other.length > 20) L.push(`… 외 ${other.length - 20}개`);
    }
    if (first && noneF.length) L.push('', `— 걸린 곳 없음 ${noneF.length}개: ` + noneF.slice(0, 40).map(v => v.f.name + partNote(v)).join(' · ') + (noneF.length > 40 ? ' …' : ''));
    if (first && badF.length) L.push('', '⚠ 못 읽음(없음이 아님): ' + badF.map(v => `[F${v.k}] ${v.f.name} — ${v.error || v.unsupported}`).join(' / '));
    if (first && S.skip.length) L.push('', `※ 읽을 수 없는 형식 ${S.skip.length}개(안 봄): ` + S.skip.slice(0, 15).map(v => `${v.f.name}(${v.why})`).join(' · ') + (S.skip.length > 15 ? ' …' : ''));
    return `<section class="sum"><h3>■ 파일 목록</h3><div class="blks">${blocksHtml(L.join('\n'))}</div></section>`;
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

  // ---------- 7. 빠른 길: 한 번에 찾고 읽어 작업 탭에 글로 펼치기 (2026-09-29 사용자 지적 "15분 걸리면 직접 하는 게 빠르다") ----------
  // 작업 탭 = https://kist.gov-dooray.com/robots.txt — 가볍고 같은 origin 이라 세션으로 fetch 된다. 쓰던 Dooray 화면은 건드리지 않는다.
  // report() 가 찾기 + (선택) 프로젝트 전체 + 본문·댓글·첨부·경로를 한 번에 모아 그 탭 화면에 글로 써 두면, get_page_text 한 번에 전부 읽는다
  //   (javascript_tool 의 1,000자 잘림·쿼리 꼴 가림을 피함 — 실측 2.7만 자 한 번에, a=b&c=d 도 그대로). 15번 넘던 왕복이 3~4번으로.
  const BUDGET = 45000;   // 작업 탭에 쓰는 글의 상한(글자 수) — get_page_text 한도 5만 자에서 머리줄 여유를 뺀 값
  const isWorkTab = () => /\/robots\.txt$/.test(String((typeof location !== 'undefined' && location.pathname) || ''));
  function show(text) {
    if (!isWorkTab()) return 'ERR 작업 탭(https://kist.gov-dooray.com/robots.txt)에서만 화면에 씁니다 — 쓰던 Dooray 화면은 건드리지 않음';
    dropBlobs();   // 앞서 띄운 그림(showFigures)의 메모리 반납
    titleAlert('kk-dry 결과', true);
    document.body.innerHTML = '';
    // 업무·드라이브 한 건씩 칸으로(2026-09-30 여백 요청). 칸 밖 빈 줄·칸 사이 '\n' 은 글자로만 남겨(화면엔 안 보임) textContent 가 원래 글과 같다.
    const box = document.createElement('div');
    box.style.cssText = 'white-space:normal;margin:14px 20px';
    const st = document.createElement('style');
    st.textContent = 'body{background:#f2f4f7}' + BLK_CSS;
    (document.head || document.body).appendChild(st);   // 상자 밖에 — 상자의 글(textContent)에 CSS 가 섞이지 않게
    blockChunks(String(text)).forEach((c, i) => {
      if (i) box.appendChild(document.createTextNode('\n'));
      const m = c.match(/^(\n*)([\s\S]*?)(\n*)$/);
      if (m[1]) box.appendChild(document.createTextNode(m[1]));
      const d = document.createElement('div');
      d.className = blkClass(m[2], i);
      d.textContent = m[2];
      box.appendChild(d);
      if (m[3]) box.appendChild(document.createTextNode(m[3]));
    });
    document.body.appendChild(box);
    return 'shown ' + String(text).length;
  }
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + ` …(+${s.length - n}자)` : s; };
  const ymd = (s) => String(s || '').slice(0, 10);
  const hm = (s) => String(s || '').slice(0, 16).replace('T', ' ');
  // lim = { body, comment 글자 수 / files 첨부 이름 최대 수 / comments 댓글 최대 수(최근 것부터) / detailN 이 번호 이후 업무는 줄만 } — files·comments·detailN 이 없으면 줄이지 않는다
  function taskBlock(it, k, lim) {
    const d = it.detail || {}, L = [];
    L.push(`[T${k}] ${ymd(it.updated)} | ${it.project} #${it.number} | ${it.subject} | ${it.from}→${it.to.join(',') || '-'}${it.cc.length ? ' (참조 ' + it.cc.join(',') + ')' : ''} | ${it.status} | 작성 ${ymd(it.created)}`
      + (it.hits ? ' | 검색어 ' + it.hits.join('·') : (it.sibling ? ' | 같은 프로젝트' : '')));
    L.push('     ' + it.url);
    if (lim.detailN != null && k >= lim.detailN) { L.push(`     (글이 길어 본문·댓글·첨부는 생략 — 첨부 ${it.files || 0}개 · showItems([last().tasks.items[${k}]]) 또는 showFiles(${k}))`); return L.join('\n'); }
    if (!it.detail) { L.push('     (목록만 — 본문·댓글은 안 읽음)'); return L.join('\n'); }
    if (d.error) { L.push('     ERR ' + d.error); return L.join('\n'); }
    if (d.text) L.push('     본문: ' + clip(d.text, lim.body).replace(/\n+/g, '\n           ') + (d.textCut ? ` (※ 본문이 아주 길어 앞 ${d.textLen}자만 읽음 — 원문 ${d.textFull}자)` : ''));
    const fs = filesOf(it);
    if (fs.length) {
      const cap = lim.files == null ? fs.length : lim.files;
      L.push(`     첨부(${fs.length}): ` + fs.slice(0, cap).map(f => `${f.name} (${kb(f.size)}, ${f.by || '?'}, ${ymd(f.created)}, ${f.where})`).join(' / ')
        + (fs.length > cap ? ` … 외 ${fs.length - cap}개 (전체 목록: showFiles(${k}))` : ''));
    }
    if (d.commentError) L.push('     ⚠ ' + d.commentError);
    if (d.comments && d.comments.length) {
      const cs = lim.comments == null ? d.comments : d.comments.slice(0, lim.comments);   // d.comments 는 최신순
      L.push(`     댓글 ${d.commentTotal}개${cs.length < d.commentTotal ? '(최근 ' + cs.length + '개만)' : ''} — 오래된 순:`);
      cs.slice().reverse().forEach(c => L.push(`       ${hm(c.date)} ${c.who}: ` + clip(c.text, lim.comment).replace(/\s*\n\s*/g, ' ') + (c.files.length ? ` [첨부 ${c.files.map(f => f.name).join(', ')}]` : '') + (c.cut ? ' (※ 댓글이 아주 길어 앞 5만 자만 읽음)' : '')));
    }
    return L.join('\n');
  }
  function driveLine(f, k) {
    return `[F${k}] ${ymd(f.updated)} | ${f.kind === 'folder' ? '폴더' : (f.ext || '파일')} | ${f.drive}${f.path ? ' ' + f.path : ''} | ${f.name}${f.kind === 'file' ? ' | ' + kb(f.size) : ''} | 올린 ${f.by || '?'}`
      + (f.hits ? ' | 검색어 ' + f.hits.join('·') : '') + '\n     ' + f.url;
  }
  // 목록(업무·드라이브·only 결과)을 줄 제한 없이 작업 탭에 — 후속 질문의 결과를 한 번에 볼 때
  function showItems(x, { body = 3000, comment = 1200 } = {}) {
    const items = listOf(x), lim = { body, comment };
    const un = x && !Array.isArray(x) && x.unchecked ? `⚠ 찾을 말로 거를 때 본문·댓글을 끝까지 못 본 업무 ${x.unchecked}건은 확인하지 못했습니다(없음이 아님): `
      + x.uncheckedItems.slice(0, 8).map(it => it.subject).join(' / ') + (x.unchecked > 8 ? ' …' : '') + '\n' : '';
    return show(`■ 목록 ${items.length}건\n` + un + items.map((it, k) => it.kind === 'task' ? taskBlock(it, k, lim) : driveLine(it, k)).join('\n'));
  }
  // 첨부 파일 목록을 업무마다 묶어 작업 탭에 — report 가 첨부를 '… 외 N개' 로 줄였거나 "어떤 파일들이 있는지" 물었을 때 get_page_text 한 번에.
  //   x: 숫자 k(= last().tasks.items[k], 목록의 [Tk]) · 'all'(읽어 둔 모든 업무, 생략해도 같음) · 업무 항목 · 항목 배열
  //   c: { name:정규식·글(파일 이름), ext:'hwp|hwpx', by:정규식·글(올린 사람), where:'본문'|'댓글', since, until(올린 날, YYYY-MM-DD), ids:true(받기용 첨부 id), sort:'new'(기본 오래된 순) }
  //   본문·첨부를 읽지 않은 업무(report 의 detail 밖)는 빠지며 머리줄에 몇 건인지 적는다. 글이 4.5만 자를 넘으면 거기서 멈추고 조건을 좁히라고 적는다.
  function showFiles(x, c = {}) {
    const all = lastReport && lastReport.tasks ? lastReport.tasks.items : [];
    const rx = (v) => v == null ? null : (v instanceof RegExp ? new RegExp(v.source, v.flags.replace('g', '')) : new RegExp(String(v), 'i'));
    const nm = rx(c.name), by = rx(c.by), wh = rx(c.where), ext = c.ext ? new RegExp('^(?:' + c.ext + ')$', 'i') : null, P = period(c), byDate = !!(c.since || c.until);
    const pick = (x == null || x === 'all') ? all.map((t, k) => ({ t, k }))
      : typeof x === 'number' ? (all[x] ? [{ t: all[x], k: x }] : [])
        : (Array.isArray(x) ? x : (x && x.items) || [x]).map(t => ({ t, k: all.indexOf(t) }));
    if (!pick.length) return show('ERR 파일을 볼 업무가 없습니다 — 먼저 report() 로 찾거나 번호를 확인하세요');
    let unread = 0, read = 0, hit = 0, cut = false, used = 0;
    const out = [];
    for (const { t, k } of pick) {
      if (!t.detail || t.detail.error) { unread++; continue; }
      read++;
      const fs = filesOf(t).filter(f => (!nm || nm.test(f.name)) && (!ext || ext.test(extOf(f.name))) && (!by || by.test(f.by || '')) && (!wh || wh.test(f.where))
        && (!byDate || (tsOf(f.created) >= P.since && tsOf(f.created) <= P.until)));
      if (!fs.length) continue;
      fs.sort((a, b) => (c.sort === 'new' ? -1 : 1) * (tsOf(a.created) - tsOf(b.created)));
      const block = [`[T${k}] ${ymd(t.updated)} | ${t.project} #${t.number} | ${t.subject} | ${t.url}`]
        .concat(fs.map(f => `   ${f.name} | ${kb(f.size)} | ${f.by || '?'} | ${ymd(f.created)} | ${f.where}` + (c.ids ? ' | id ' + f.id : '')));
      const len = block.join('\n').length + 1;
      if (used + len > BUDGET - 1500) { cut = true; break; }
      used += len; hit += fs.length; out.push(...block);
    }
    const cond = ['name', 'ext', 'by', 'where', 'since', 'until'].filter(q => c[q] != null).map(q => q + ' ' + String(c[q])).join(', ');
    const head = [`■ 첨부 파일 ${hit}개 · 읽은 업무 ${read}건${cond ? ' | 조건 ' + cond : ''}${c.sort === 'new' ? ' | 최신순' : ' | 오래된 순'}`];
    if (unread) head.push(`※ 첨부를 읽지 않은 업무 ${unread}건은 빠짐 (report 의 limits:{detail:N} 을 늘리거나 getTasks 로 읽은 뒤 다시)`);
    if (cut) head.push('※ 글이 길어 여기까지만 — name·ext·by·since 로 좁혀 다시');
    return show(head.concat('', hit ? out : ['(조건에 맞는 첨부 없음)']).join('\n'));
  }
  // 파일 내용 전체를 작업 탭에 (readFile 결과) — 800자씩 나눠 읽지 않고 get_page_text 한 번에
  function showText(r) {
    if (r == null) return notYet();
    if (r.error || r.unsupported) return show(r.error ? 'ERR ' + (r.name ? r.name + ': ' : '') + r.error : '읽기 미지원 ' + (r.name ? r.name + ': ' : '') + r.reason);
    return show(`■ ${r.name} | ${r.fmt} | ${kb(r.size)} | 글 ${r.textLen}자${r.parts ? ' | ' + r.parts : ''}${r.note ? ' | ' + r.note : ''}\n\n` + r.text);
  }
  let lastReport = null;
  // report(묶음들, opt) — 빠른 길 한 번 호출. opt: find 의 옵션(since·until·kind·ext·tasks·drive·maxPages) +
  //   expand:true(결과가 2건 이상 몰린 프로젝트(없으면 1위)의 업무 전체를 더함 — 사람과 함께 한 일처럼 이름이 글에 없는 업무까지),
  //   expandProjects:2, limits:{detail:30(본문·댓글 읽을 업무 수), comments:100, body:3000, comment:1200, files:(첨부 이름 최대 수 — 기본 제한 없음), paths:60, expandMax:60}
  //   글이 4.5만 자를 넘으면 스스로 줄인다(get_page_text 한도 5만 자) — 머리줄 ※ 에 어떻게 줄였는지, 잘린 첨부는 '… 외 N개 (showFiles(번호))'.
  //   반환 { summary, shown, chars, reduced } — 본문은 작업 탭 화면(get_page_text). 결과 객체는 last() 로(후속 only·showFiles·readFile·링크).
  // report 도 done() 으로 끝을 기다릴 수 있게 — 부르는 쪽 약속(실패 시 reject)은 그대로
  function report(groups, opt = {}) { const run = reportRun(groups, opt); lastRun = run.catch(e => ({ summary: 'ERR ' + errText(e) })); return run; }
  async function reportRun(groups, opt = {}) {
    const t0 = Date.now();
    const lim = Object.assign({ detail: 30, comments: 100, body: 3000, comment: 1200, paths: 60, expandMax: 60 }, opt.limits || {});   // paths: 파일이 선택된 채 열리는 링크에 부모 폴더가 필요
    show('(kk-dry 찾는 중 … await kkDry.done(35) 뒤 get_page_text)');
    const r = await find(groups, Object.assign({}, opt, { detail: 0, paths: 0 }));
    progress = '정리 중';
    if (r.error && !r.tasks && !r.drive) { progress = ''; lastReport = { error: r.error }; show('ERR ' + r.error); return { summary: 'ERR ' + r.error }; }
    let tasks = r.tasks ? r.tasks.items.slice() : [];
    const expanded = [];
    if (opt.expand && tasks.length) {
      const cnt = {};
      tasks.forEach(t => { cnt[t.projectId] = (cnt[t.projectId] || 0) + 1; });
      let pids = Object.keys(cnt).filter(p => cnt[p] >= 2).sort((a, b) => cnt[b] - cnt[a]).slice(0, opt.expandProjects || 2);
      if (!pids.length) pids = [Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]];
      for (const pid of pids) {
        progress = '프로젝트 전체 목록';
        const pt = await projectTasks(pid, { maxPages: 1 }).catch(e => ({ error: errText(e), items: [] }));
        if (pt.error) { expanded.push({ pid, error: pt.error }); continue; }
        const have = new Set(tasks.map(t => t.id)), fresh = pt.items.filter(t => !have.has(t.id));
        const add = fresh.slice(0, lim.expandMax), pname = (pt.items.find(t => t.project) || tasks.find(t => t.projectId === pid && t.project) || {}).project || '';
        add.forEach(t => { t.sibling = true; if (!t.project) t.project = pname; });
        tasks = tasks.concat(add);
        expanded.push({ pid, project: pname, total: pt.total, added: add.length, cut: add.length < fresh.length || !!pt.truncated });
      }
      tasks.sort((a, b) => tsOf(b.updated) - tsOf(a.updated));
    }
    progress = `본문·댓글 읽는 중(${Math.min(lim.detail, tasks.length)}건)`;
    await Promise.all([
      tasks.length ? getTasks(tasks, { n: lim.detail, comments: lim.comments }).catch(() => null) : null,
      r.drive && lim.paths ? drivePaths(r.drive, lim.paths).catch(() => null) : null,
    ]);
    const D = r.drive ? r.drive.items : [];
    const build = (l) => {
      const H = [`■ kk-dry 찾기 — 검색어 ${r.groups.map(g => '[' + g + ']').join(' ')}${r.period ? ' | 기간 ' + r.period : ''} | 업무 ${tasks.length}건 · 드라이브 ${D.length}건 | ${((Date.now() - t0) / 1000).toFixed(1)}초`];
      if (r.tasks && r.tasks.error) H.push('⚠ 업무 검색 오류(없음이 아님): ' + r.tasks.error);
      if (r.drive && r.drive.error) H.push('⚠ 드라이브 검색 오류(없음이 아님): ' + r.drive.error);
      if ((r.tasks && r.tasks.truncated) || (r.drive && r.drive.truncated)) H.push('⚠ 잘림 — 결과가 많아 일부만(낱말을 더해 좁히거나 maxPages)');
      expanded.forEach(e => H.push(e.error ? '⚠ 프로젝트 전체 목록 실패: ' + e.error : `+ 프로젝트 '${e.project}' 업무 ${e.total}건 중 검색에 안 걸린 ${e.added}건을 더함${e.cut ? '(일부만)' : ''}`));
      if (tasks.length > lim.detail) H.push(`※ 본문·댓글은 위 ${lim.detail}건만 읽음(나머지는 목록만)`);
      if (l.reduced) H.push(`※ 글이 4.5만 자(get_page_text 한도 5만 자)를 넘어 줄임: ${l.detailN != null ? '본문·댓글·첨부는 앞 ' + l.detailN + '건만, ' : ''}첨부 이름은 업무당 ${l.files}개까지, 본문 ${l.body}자, 댓글 ${l.comment}자·최근 ${l.comments}개. 전체는 showFiles(번호) · showItems([last().tasks.items[번호]])`);
      H.push('', '■ 업무 (수정일 최신순)');
      tasks.forEach((t, k) => { if (l.listMax == null || k < l.listMax) H.push(taskBlock(t, k, l)); });
      if (l.listMax != null && tasks.length > l.listMax) H.push(`… 외 업무 ${tasks.length - l.listMax}건 (showItems(last().tasks))`);
      if (!tasks.length) H.push('(없음)');
      H.push('', '■ 드라이브 (수정일 최신순)');
      D.forEach((f, k) => { if (l.driveMax == null || k < l.driveMax) H.push(driveLine(f, k)); });
      if (l.driveMax != null && D.length > l.driveMax) H.push(`… 외 드라이브 ${D.length - l.driveMax}건 (showItems(last().drive))`);
      if (!D.length) H.push('(없음)');
      return H;
    };
    // get_page_text 는 5만 자에서 잘린다(max_chars 인자 없음, 2026-09-29 실측: 첨부 수십~백여 개짜리 업무가 섞여 10.7만 자가 된 결과가 앞 5만 자만 읽힘)
    // → 4.5만 자 안에 들 때까지 단계별로 줄인다: 본문·댓글 글자 수 → 첨부 이름 수·댓글 수 → (끝까지 크면) 뒤쪽 업무는 줄만·드라이브 40줄·업무 80줄
    const STEPS = [
      { body: lim.body, comment: lim.comment, files: lim.files == null ? null : lim.files, comments: null },
      { body: 1200, comment: 400, files: 60, comments: 40 },
      { body: 900, comment: 300, files: 40, comments: 25 },
      { body: 700, comment: 250, files: 30, comments: 20 },
      { body: 550, comment: 200, files: 22, comments: 14 },
      { body: 400, comment: 160, files: 15, comments: 10 },
      { body: 320, comment: 130, files: 11, comments: 7 },
      { body: 250, comment: 100, files: 8, comments: 5 },
    ];
    const mk = (s, i) => Object.assign({}, s, { body: Math.min(lim.body, s.body), comment: Math.min(lim.comment, s.comment), files: s.files == null || lim.files == null ? s.files : Math.min(lim.files, s.files), reduced: i > 0 });
    let li = 0, l = mk(STEPS[0], 0), H = build(l), text = H.join('\n');
    while (text.length > BUDGET && li < STEPS.length - 1) { li++; l = mk(STEPS[li], li); H = build(l); text = H.join('\n'); }
    if (text.length > BUDGET) {
      l = Object.assign({}, l, { driveMax: 40, listMax: 80 }); H = build(l); text = H.join('\n');
      for (const n of [20, 12, 8, 5, 3, 1]) {
        if (text.length <= BUDGET) break;
        if (n >= tasks.length) continue;
        l = Object.assign({}, l, { detailN: n }); H = build(l); text = H.join('\n');
      }
    }
    if (text.length > BUDGET + 4000) text = text.slice(0, BUDGET + 3000) + '\n…(글이 너무 길어 여기서 자름 — showItems·showFiles 로 나눠 보기)';
    lastReport = { groups: r.groups, tasks: { items: tasks }, drive: r.drive, expanded, text, ms: Date.now() - t0, reduced: !!l.reduced };
    lastScan = null;   // 새 찾기 — F번호는 이제 이 목록 기준(옛 파일 속 찾기 목록으로 풀지 않게)
    progress = '';
    return { summary: H[0], shown: show(text), chars: text.length, reduced: !!l.reduced };
  }
  const last = () => lastReport;

  // ---------- 대화형 후속 질문용 거르기 (다시 검색하지 않고 들고 있는 결과로) ----------
  // only(x, { kind:'file'|'folder'|'task', ext:'pptx|hwp', name:/정규식/, who:/사람/, project:/프로젝트·드라이브/, text:/본문·댓글/, since, until })
  function only(x, c = {}) {
    const rx = (v) => v == null ? null : (v instanceof RegExp ? new RegExp(v.source, v.flags.replace('g', '')) : new RegExp(String(v), 'i'));
    const nm = rx(c.name), who = rx(c.who), pj = rx(c.project), tx = rx(c.text), ext = c.ext ? new RegExp('^(?:' + c.ext + ')$', 'i') : null;
    const P = period(c);
    const unread = [];   // 글(text)로 거를 때 본문·댓글을 끝까지 못 본 업무(안 읽음·20만 자 넘는 본문·5만 자 넘는 댓글·댓글 일부만) — 0건이 '없음'이 아니다(Codex 재검토 R1)
    const items = listOf(x).filter(it => {
      if (c.kind && it.kind !== c.kind) return false;
      if (ext && !ext.test(it.ext || '')) return false;
      if (nm && !nm.test(it.name || it.subject || '')) return false;
      if (who && ![it.by, it.upd, it.from].concat(it.to || [], it.cc || []).some(v => v && who.test(v))) return false;
      if (pj && !pj.test(it.project || it.drive || '')) return false;
      const ts = tsOf(it.updated);
      if ((c.since || c.until) && (ts < P.since || ts > P.until)) return false;
      if (tx) {
        const d = it.detail || {}, cs = d.comments || [];
        const all = [it.subject || it.name || '', d.text || ''].concat(cs.map(v => v.text)).join('\n');
        if (!tx.test(all)) {
          if (it.kind === 'task' && (!it.detail || d.error || d.textCut || cs.some(v => v.cut) || (d.commentTotal || 0) > cs.length || d.commentError)) unread.push(it);
          return false;
        }
      }
      return true;
    });
    return { items, total: items.length, filtered: true, unchecked: unread.length, uncheckedItems: unread };
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
    const un = x.unchecked ? ` ⚠ 본문·댓글을 끝까지 못 본 업무 ${x.unchecked}건은 확인 못 함(없음이 아님 — showItems·getTask 로 더 읽기)` : '';
    if (x.truncatedGroups) return ' ⚠ 잘림(' + x.truncatedGroups.length + '묶음 — maxPages 늘려 다시)' + un;
    return (x.truncated ? ` ⚠ 잘림(전체 ${x.total} 중 ${x.fetched} — maxPages 늘려 다시)` : '') + un;
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
    if (!d) return '(자세히 없음 — 먼저 kkDry.getTasks([항목]) 로 본문·첨부·댓글을 읽을 것. 목록 항목에 그대로 채워진다)';
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
    // 주소 옆에 이름을 함께 — 링크를 답에 옮길 때 이름과 대조하게(2026-09-30 옆 파일 링크를 준 실수)
    const rows = fitRows(items.slice(from, to).map((it, k) => `${from + k} | ` + (hy ? `P ${hyId(it.projectId)} | ${it.kind === 'task' ? 'T' : 'F'} ${hyId(it.id)}` : it.url) + ' | ' + sanitize(String(it.name || it.subject || '').slice(0, 30))), 80);
    const end = from + rows.length;
    return `[링크 ${from}-${end} of ${items.length}]` + (end < Math.min(to, items.length) ? ` ▶ 다음 조각 ${end}` : '') + '\n' + rows.join('\n');
  }
  // linkOf(x) — 답에 줄 링크를 이름과 한 줄로: '[F번호] 이름 | 날짜 | 경로 → 주소'. 답의 링크는 여기(또는 ■ 파일 목록)에서만 옮긴다. 부를 때는 await kkDry.linkOf(…).
  //   결과 화면(작업 탭)의 DOM 을 훑어 링크를 뽑지 않는다 — 카드의 'Dooray 에서 열기' 는 이름과 떨어져 있어 옆 파일 링크를 집는다(2026-09-30 실측 실수).
  //   x = F번호(quick·scanFiles 의 [F번호]) · 이름 조각(글, 대소문자·NFKC 무시) · 정규식. 여러 개가 걸리면 모두 보여 준다(이름으로 더 좁힌다).
  //   대상 = 마지막 quick·scanFiles 가 읽은 파일 + 마지막 report·find 의 드라이브 항목·업무(T번호).
  //   드라이브 파일의 부모 폴더를 아직 모르면(검색 화면으로 열리는 주소) 여기서 채워 '폴더가 열리고 파일이 선택되는' 주소로 준다(앞 6개, 실패하면 그 주소 그대로 + 표시).
  async function linkOf(x) {
    if (x == null || x === '') return 'ERR linkOf(F번호 | 이름 조각 | /정규식/)';
    const key = (s) => NF(s).toLowerCase();
    const hit = (name) => x instanceof RegExp ? x.test(NF(name)) : key(name).includes(key(x));
    const picks = [], seen = new Set();
    const add = (tag, f, name) => { if (!f || !f.url || seen.has(f.url + '|' + name)) return; seen.add(f.url + '|' + name); picks.push({ tag, f, name }); };
    const S = (lastQuick && lastQuick.S) || lastScan;
    const R = lastReport && !lastReport.error ? lastReport : null;
    if (typeof x === 'number') {
      const v = S && S.files.find(v => v.k === x);
      if (v) add(`[F${v.k}]`, v.f, v.f.name);
      else if (R && R.drive && R.drive.items && R.drive.items[x]) add(`[F${x}]`, R.drive.items[x], R.drive.items[x].name);
    } else {
      if (S) S.files.forEach(v => { if (hit(v.f.name)) add(`[F${v.k}]`, v.f, v.f.name); });
      if (R) {
        ((R.drive && R.drive.items) || []).forEach((it, k) => { if (hit(it.name)) add(`[F${k}]`, it, it.name); });
        ((R.tasks && R.tasks.items) || []).forEach((it, k) => { if (hit(it.subject)) add(`[T${k}]`, it, it.subject); });
      }
    }
    if (!picks.length) return 'ERR 결과에 그 파일이 없습니다 — ' + sanitize(String(x)) + ' (이름을 확인하거나 먼저 quick·report 로 찾기)';
    const need = picks.filter(p => p.f.driveId && !p.f.folderId && !p.f.taskId && p.f.kind !== 'folder').slice(0, 6);
    const fails = new Set();
    if (need.length) await pool(need, 3, async (p) => { try { await drivePath(p.f); } catch (e) { fails.add(p.f); } });
    const rows = picks.map(p => `${p.tag} ${sanitize(p.name)} | ${ymd(p.f.updated || p.f.created)} | ${sanitize(whereOf(p.f) || p.f.project || '')} → ${p.f.url}`
      + (/\?query=/.test(p.f.url) ? (fails.has(p.f) ? ' (폴더를 못 읽어 검색 화면으로 열림)' : ' (검색 화면으로 열림)') : ''));
    const out = fitRows(rows, 80);
    return `[링크 ${out.length} of ${rows.length}]` + (rows.length > 1 ? ' ⚠ 여러 개 — 답의 파일 이름과 같은 줄만 쓴다' : '') + '\n' + out.join('\n');
  }
  // checkLinks(답) — 링크가 든 답을 보내기 전에 한 번: 답의 Dooray 주소마다 같은 줄(이름이 없으면 바로 위 두 줄)의 파일·업무 이름이 그 주소의 것인지 결정적으로 대조한다.
  //   2026-09-30 실수(줄에는 260623, 주소는 260713) 뒤 추가. x = 답 글(여러 줄) · 줄 배열 · [이름, 주소] 쌍 배열.
  //   대조 대상 = 이 탭의 마지막 quick·scanFiles·report·find 결과(업무 링크는 그 업무 제목과 첨부 이름 모두 인정).
  //   결과 첫 줄 'OK …' = 통과. '✗' = 다른 항목의 주소(linkOf 로 다시 받아 고침) · '?' = 찾은 결과에 없는 주소 · '△' = 줄에 이름이 없거나 최상위 폴더로 열리는 주소.
  function checkLinks(x) {
    const lines = Array.isArray(x) ? x.map(v => Array.isArray(v) ? v.join(' ') : String(v == null ? '' : v)) : String(x == null ? '' : x).split(/\r?\n/);
    const known = new Map();   // 항목 id → [{tag, name}]
    const put = (url, tag, name) => { const id = idOfUrl(url); if (!id || !name) return; if (!known.has(id)) known.set(id, []); const a = known.get(id); if (!a.some(e => e.name === name)) a.push({ tag, name: String(name) }); };
    const S = (lastQuick && lastQuick.S) || lastScan, R = lastReport && !lastReport.error ? lastReport : null;
    if (S) S.files.forEach(v => { put(v.f.url, `[F${v.k}]`, v.f.name); if (v.f.via) put(v.f.url, `[F${v.k}]`, v.f.via); });
    if (R) {
      ((R.drive && R.drive.items) || []).forEach((it, k) => put(it.url, `[F${k}]`, it.name));
      ((R.tasks && R.tasks.items) || []).forEach((it, k) => { put(it.url, `[T${k}]`, it.subject); filesOf(it).forEach(f => put(it.url, `[T${k}]`, f.name)); });
    }
    if (!known.size) return 'ERR 대조할 찾기 결과가 없습니다 — 이 작업 탭에서 quick·report·find 로 찾은 뒤 부르세요(탭을 새로 열었으면 결과가 없어짐)';
    const toks = (s) => [...new Set(NF(s).toLowerCase().replace(/\.(pptx?|docx?|xlsx?|hwpx?|pdf|txt|csv|md|zip|png|jpe?g)\b/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2))];
    const bare = (t) => NF(String(t).replace(/https?:\/\/\S+/g, ' ')).toLowerCase();   // 주소 속 ?query= 에 파일 이름이 들어 있어 주소는 빼고 본다
    // 한 조각(그 링크 바로 앞 글 — 앞 링크 뒤부터) 안에 '있는' 이름 판정(Codex 검토 2026-09-30: 한 줄에 비슷한 이름이 둘이면 줄 전체로 보면 틀린 링크도 OK 였다).
    //   이름이 있다 = 낱말이 다 있거나(60% 이상 + 그 이름에만 있는 낱말이 있음). 낱말 일부만 겹치는 비슷한 이름(260623 과 260713 의 PEOR_Kiki)은 '있다'가 아니다.
    const judge = (seg, id) => {
      const ctx = bare(seg), cands = [];
      known.forEach((list, kid) => list.forEach(e => { const t = toks(e.name); if (!t.length) return; const hit = t.filter(w => ctx.includes(w)); if (hit.length / t.length >= 0.6) cands.push({ id: kid, e, t, hit }); }));
      const present = cands.filter(c => c.hit.length === c.t.length || c.t.some(w => ctx.includes(w) && !cands.some(o => o !== c && o.id !== c.id && o.t.includes(w))));
      if (!present.length) return null;   // 이 조각엔 아는 이름이 없음
      // 다른 이름으로 치려면 글자가 든 낱말이나 5자리 이상 숫자(yymmdd 등)가 맞아야 한다 — '2026-06' 같은 폴더 이름이 윗줄 날짜 (2026-06-10) 에 걸려 이름으로 잡히지 않게
      const strong = (w) => /\p{L}/u.test(w) || w.length >= 5;
      const own = present.filter(c => c.id === id).sort((a, b) => b.hit.length - a.hit.length)[0], oth = present.filter(c => c.id !== id && c.hit.some(strong)).sort((a, b) => b.hit.length - a.hit.length);
      if (!own) return { v: 'other', o: oth[0] };
      const rivals = oth.filter(c => !c.t.every(w => own.t.includes(w)));   // 내 이름의 일부일 뿐인 이름(report ⊂ report_v2)은 경쟁자가 아님
      if (!rivals.length) return { v: 'ok' };
      const sup = rivals.find(c => own.t.every(w => c.t.includes(w)));      // 내 이름을 다 품은 더 긴 이름(report_v2 ⊃ report) → 그쪽 이름을 쓴 줄
      return sup ? { v: 'other', o: sup } : { v: 'two', o: rivals[0] };
    };
    const out = []; let n = 0, bad = 0;
    lines.forEach((line, li) => {
      const L0 = String(line), re = /https:\/\/kist\.gov-dooray\.com\/[^\s)\]>"'`]+/g, found = [];
      let mm; while ((mm = re.exec(L0))) found.push({ u: mm[0], at: mm.index, end: mm.index + mm[0].length });
      found.forEach((f, fi) => {
        const u = f.u;
        n++;
        const id = idOfUrl(u), where = `${li + 1}줄 '${sanitize(L0.replace(/https?:\/\/\S+/g, '').replace(/[*[\]()]/g, '').trim().slice(0, 36))}'`;
        if (/\/drive\/\d+\/views\/\d+\/?$/.test(u)) { out.push(`△ ${where}: 드라이브 최상위가 열리는 주소(파일이 안 보임) — linkOf 의 주소로`); bad++; }
        const es = known.get(id);
        if (!es) { out.push(`? ${where}: 찾은 결과에 없는 주소 — linkOf 로 받은 주소인지 확인`); bad++; return; }
        // 그 링크의 이름 = 링크 바로 앞 조각(앞 링크 뒤부터) → 없으면 링크 뒤 조각(다음 링크 전까지) → 없으면 바로 위 두 줄 + 앞 조각
        const r = judge(L0.slice(fi ? found[fi - 1].end : 0, f.at), id)
          || judge(L0.slice(f.end, fi + 1 < found.length ? found[fi + 1].at : L0.length), id)
          || judge(lines.slice(Math.max(0, li - 2), li).join(' ') + ' ' + L0.slice(0, f.at), id);
        const nm = (e) => `${e.tag} ${sanitize(e.name.slice(0, 40))}`;
        if (!r) { out.push(`△ ${where}: 줄에 ${nm(es[0])} 의 이름이 없음 — 이름과 링크를 한 줄에`); bad++; }
        else if (r.v === 'other') { out.push(`✗ ${where}: 주소는 ${nm(es[0])} 의 것 — 줄의 이름은 ${nm(r.o.e)} → linkOf 로 다시`); bad++; }
        else if (r.v === 'two') { out.push(`△ ${where}: 링크 앞에 이름이 둘(${nm(es[0])} · ${nm(r.o.e)}) — 어느 파일 링크인지 모호, 이름과 링크를 한 줄에 하나씩`); bad++; }
      });
    });
    if (!n) return 'ERR 답에 Dooray 링크가 없습니다 — 링크가 든 줄을 넘기세요';
    const head = bad ? `✗ 링크 ${n}개 중 ${bad}곳 확인 필요 — 고친 뒤 다시 checkLinks` : `OK 링크 ${n}개 — 모두 같은 줄의 이름과 맞음`;
    return [head].concat(fitRows(out, 120)).join('\n');
  }
  function idOfUrl(u) {
    u = String(u || '');
    let m = u.match(/\/views\/(\d+)/); if (m) return m[1];
    m = u.match(/\/task\/\d+\/(\d+)/); if (m) return m[1];
    m = u.match(/\/drive\/\d+\/(\d+)/); if (m) return m[1];
    return '';
  }
  // 파일 내용 조각: 머리(이름·형식·글자 수·쪽수) + 글 chars 자(offset 으로 이어 읽기)
  function fmtText(r, chars = 800, offset = 0) {
    if (r == null) return notYet();
    if (r.error) return 'ERR ' + sanitize((r.name ? r.name + ': ' : '') + r.error);
    if (r.unsupported) return '읽기 미지원 ' + sanitize((r.name ? r.name + ': ' : '') + r.reason);
    const head = `${r.name.slice(0, 50)} | ${r.fmt} | ${kb(r.size)} | 글 ${r.textLen}자${r.parts ? ' | ' + r.parts : ''}${r.note ? ' | ' + r.note : ''}` + (offset ? ` | ${offset}자부터` : '');
    return sanitize(head + '\n' + r.text.slice(offset, offset + chars));
  }

  window.kkDry = {
    dfetch, apiErr,
    searchTasks, searchTasksMany, projectTasks, getTask, getTasks,
    searchDrive, searchDriveMany, drivePath, drivePaths,
    find, report, last, show, showItems, showFiles, showText, only, filesOf, readFile, readBytes, saveFile,
    scanFiles, scanned, showFigures, showPages, quick, more, done, goto, _tableMd: tableMd, _tmo: TMO, previewOf, pageText, pageTexts, unitsOf, driveUrl, _inflate: inflateJS,
    fmtFind, fmtTasks, fmtDrive, fmtTask, fmtComments, fmtFiles, fmtLinks, linkOf, checkLinks, fmtText, fmtSaved, sanitize, hyId,
    _version: 'kk-dry-ops/2.11',
  };
  window.kkDooray = window.kkDry;   // 옛 이름(2026-09-29 kk-dooray → kk-dry 개명 전) — 같은 객체
  return window.kkDry._version + ' =^.^=';
})();
