// ============================================================
// kk-mail 코어 — KIST Dooray 메일 관리 (window.kkMail)
// ------------------------------------------------------------
// 동작 원리: kist.gov-dooray.com 탭의 "세션 쿠키"로 internal wapi 호출.
//   → API 토큰/비번 불필요 (credential 0). 본인 SSO 로그인 세션만 있으면 동작.
// 사용법: 이 파일을 Read → Chrome MCP javascript_tool 로 1회 inject →
//   이후 window.kkMail.<함수>() 호출. (개인정보·하드코딩 식별자 없음)
// 출력 제약: javascript_tool 반환은 ~1,000자 truncation + `a=b`/URL/긴 숫자 필터 → 아래 "출력 도우미" 참조.
// ============================================================
(function () {
  // internal wapi 필수 헤더 — 없으면 일부 endpoint가 -200200 거부 또는
  // 200 OK + contents:[] 의 silent fail.
  const H = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'dooray-api-version': '1.1',
    'dooray-caller': 'WEB',
    'dooray-mail-api-version': '1.2',
    'dooray-drive-api-version': '1.1',
  };

  // 응답 판독(2026-09-27 전체 흐름 검수): 로그인이 풀리면 JSON 대신 로그인 화면(HTML)이 온다 → 'SyntaxError' 대신 원인과 다음 행동을 담은 DOORAY: 오류.
  //   API 가 header.isSuccessful=false 로 거절한 경우는 각 함수가 error 로 올린다(빈 목록으로 넘기지 않는다 — '폴더 0개'·'규칙 없음'으로 오인 방지).
  async function dfetch(url, { method = 'GET', body = null } = {}) {
    const opts = { method, credentials: 'include', headers: H };
    if (body != null) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    const r = await fetch(url, opts);
    if (r.status === 401 || r.status === 403) throw new Error(`DOORAY: 권한 없음(HTTP ${r.status}) — kist.gov-dooray.com 로그인 확인 → 탭 새로고침 → 코어 재주입`);
    const t = await r.text();
    if (r.status === 404) throw new Error(`DOORAY: 요청 주소가 없습니다(HTTP 404) — Dooray 화면·API 가 바뀌었을 수 있음(코어 갱신 필요, 로그인 문제 아님)`);
    if (r.status >= 500) throw new Error(`DOORAY: 서버 오류(HTTP ${r.status}) — 잠시 뒤 1회 다시`);
    if (!t.trim() && r.ok) return { header: { isSuccessful: true } };
    let d;
    try { d = JSON.parse(t); }
    catch (e) { throw new Error(`DOORAY: 응답이 JSON 이 아닙니다(HTTP ${r.status}) — 로그인이 풀렸을 수 있습니다. kist.gov-dooray.com 로그인 확인 → 탭 새로고침 → 코어 재주입`); }
    // 4xx 는 JSON 이어도 실패 — header 가 없으면(스프링 기본 오류 형식) 만들어 붙여 apiErr 가 잡게 한다
    if (!r.ok && d && typeof d === 'object' && !d.header) d.header = { isSuccessful: false, resultCode: r.status, resultMessage: String(d.error || d.message || 'HTTP ' + r.status) };
    return d;
  }
  function apiErr(d) {
    if (!d || typeof d !== 'object') return 'no response';
    const h = d.header || {};
    return h.isSuccessful === false ? String(h.resultMessage || h.resultCode || 'isSuccessful false') : '';
  }

  // ---------- 폴더 조회 ----------
  // 시스템(inbox/sent/spam/trash...) + 사용자 폴더 전체. credential 없이 본인 폴더 자동 조회.
  async function findAllFolders() {
    const out = { system: [], user: [] };
    for (const t of ['system', 'user']) {
      const d = await dfetch(`/v2/wapi/mail-folders?type=${t}&size=1000`);
      if (!d.result && apiErr(d)) throw new Error('DOORAY 폴더 조회 실패: ' + apiErr(d));
      const arr = (d.result && d.result.contents) ? d.result.contents : (Array.isArray(d.result) ? d.result : []);
      out[t] = arr.map(f => ({ id: f.id, name: f.name, type: t, total: f.totalCount }));
    }
    return out;
  }

  // 이름으로 폴더 1개 찾기 (시스템+사용자). 못 찾으면 null.
  async function findFolderId(name) {
    const all = await findAllFolders();
    for (const t of ['user', 'system']) {
      const hit = all[t].find(f => f.name === name);
      if (hit) return { id: hit.id, name: hit.name, type: t };
    }
    return null;
  }

  // 폴더 확보: 있으면 반환, 없으면 생성. (생성/삭제 형식 확정: 2026-06-04 DevTools 캡처)
  async function ensureFolder(name) {
    const found = await findFolderId(name);
    if (found) return { ...found, created: false };
    const made = await tryCreateFolder(name);
    if (made) return { ...made, created: true };
    return { needManual: true, name };  // 만일 생성 실패 시 수동생성 안내 fallback
  }

  // 사용자 폴더 생성 — POST /mail-folders/create-path, body=[{name,order}] (⚠️ 배열, order=기존 max+1).
  async function tryCreateFolder(name) {
    const d = await dfetch('/v2/wapi/mail-folders?type=user&size=1000');
    const arr = (d.result && d.result.contents) ? d.result.contents : [];
    const maxOrder = Math.max(0, ...arr.map(f => f.displayOrder || 0));
    const res = await dfetch('/v2/wapi/mail-folders/create-path', { method: 'POST', body: [{ name, order: maxOrder + 1 }] });
    if (res.header && res.header.isSuccessful) {
      const re = await findFolderId(name);
      if (re) return re;
    }
    return null;
  }

  // 폴더 삭제 — DELETE /mail-folders/{id}. (정리·롤백용)
  async function deleteFolder(folderId) {
    return dfetch(`/v2/wapi/mail-folders/${folderId}`, { method: 'DELETE' });
  }

  // ---------- 메일 조회 ----------
  // 받은편지함을 기간(days)으로 필터. 분류용 핵심 필드만 추출.
  async function listInbox({ days = 7, size = 500, maxPages = 10 } = {}) {
    // 기간 안 메일 전부(페이지 넘김). 바쁜 편지함에서 200건 넘게 와도 빠지지 않는다. truncated=true 면 maxPages 를 늘릴 것.
    const r = await listMails({ folder: 'inbox', sinceDays: days, size, maxPages });
    const out = { totalInbox: r.total, fetched: r.fetched, recent: r.mails, truncated: !!r.truncated };
    if (r.error) out.error = r.error;
    return out;
  }

  async function listFolderMails(folderId, { size = 50 } = {}) {
    const d = await dfetch(`/v2/wapi/mails?folderId=${folderId}&size=${size}&page=0&order=-createdAt`);
    const c = (d.result && d.result.contents) ? d.result.contents : [];
    return c.map(summarize);
  }

  // 메일 1건 → 분류·검색 판단용 핵심 필드. (발신자/제목/날짜/읽음/첨부수/id)
  //   read   = 사용자 화면의 읽음/안 읽음 표시 (POST /mails/read|unread 로 토글)
  //   opened = 한 번이라도 열린 적 있음 (상세 GET 시 true 로 굳음, 되돌릴 수 없음) — 표시용으로는 read 를 쓸 것
  const readCache = {};   // id → 목록에서 본 read 값 (getMails 가 id 문자열만 받아도 안 읽음 복원)
  function summarize(m) {
    const f = (m.users && m.users.from && m.users.from.emailUser) ? m.users.from.emailUser : {};
    const flags = (m.mailSummary && m.mailSummary.flags) ? m.mailSummary.flags : {};
    if (m.id) readCache[String(m.id)] = !!flags.read;
    return {
      id: m.id,
      date: (m.createdAt || '').slice(0, 16).replace('T', ' '),
      fromName: f.name || '',
      fromEmail: f.emailAddress || '',
      toEmails: ((m.users && m.users.to) || []).map(u => (u.emailUser && u.emailUser.emailAddress) || '').filter(Boolean),
      subject: m.subject || '',
      read: !!flags.read,
      opened: !!flags.opened,
      replied: !!flags.replied,       // '답장함' 표시 — Dooray 에서 답장하면 켜진다(2026-09-30 실측)
      forwarded: !!flags.forwarded,
      fileCount: m.fileCount || 0,
      folderId: m.folderId || '',
    };
  }

  // ---------- 기능 1: 찾기 — 페이징 목록 + 본문 (2026-09-24 실증) ----------
  // 폴더의 메일을 최신순으로 페이지를 넘기며 수집. since(YYYY-MM-DD)/sinceDays 보다 오래된 메일이 나오면 중단.
  //   opt = { folder:'inbox'|'sent'|... (시스템 folderName) | folderId:'...', sinceDays?:90, since?:'YYYY-MM-DD', until?:'YYYY-MM-DD', maxPages?:6, size?:500 }
  // 반환 { total, fetched, pages, mails:[summarize + url], end, truncated? } — end: all(끝까지)·period(기간 경계)·cap(maxPages 에서 멈춤)·error.
  //   cap 이면 truncated=true(2026-09-27 Codex 점검: 상한에서 멈춘 목록을 '전부'로 오인하지 않게 — fmtList 머리줄에 ⚠ 목록 잘림). 실측: size 500 × 3페이지(1,500건) ≈ 2.5초. size 1000 도 허용.
  // ⚠️ 목록엔 본문 미리보기(previewText)가 비어 있다 → 본문 단서는 getMail 로.
  async function listMails(opt = {}) {
    const size = opt.size || 500, maxPages = opt.maxPages || 6;
    const kst = (d, end) => new Date(/T/.test(d) ? d : d + (end ? 'T23:59:59.999+09:00' : 'T00:00:00+09:00')).getTime();   // 'YYYY-MM-DD' 는 한국시간 기준
    const sinceTs = opt.since ? kst(opt.since, false) : (opt.sinceDays ? Date.now() - opt.sinceDays * 86400000 : 0);
    const untilTs = opt.until ? kst(opt.until, true) : Infinity;
    const folder = opt.folder || 'inbox';
    const base = opt.folderId ? `folderId=${opt.folderId}` : `folderName=${folder}`;
    const urlOf = (m) => opt.folderId ? `/mail/folders/${opt.folderId}/${m.id}` : `/mail/systems/${folder}/${m.id}`;
    const out = { total: null, fetched: 0, pages: 0, mails: [], end: 'cap' };
    for (let p = 0; p < maxPages; p++) {
      const d = await dfetch(`/v2/wapi/mails?${base}&size=${size}&page=${p}&order=-createdAt`);
      if (!d.result) { out.error = 'DOORAY 목록 조회 실패(page ' + p + '): ' + (apiErr(d) || 'no result'); out.end = 'error'; break; }
      const c = d.result.contents || [];
      if (out.total == null) out.total = d.result.totalCount;
      out.fetched += c.length; out.pages++;
      let stop = c.length < size ? 'all' : '';
      for (const m of c) {
        const ts = new Date(m.createdAt).getTime();
        if (ts < sinceTs) { stop = 'period'; break; }
        if (ts < untilTs) { const s = summarize(m); s.url = 'https://kist.gov-dooray.com' + urlOf(m); out.mails.push(s); }
      }
      if (!stop && out.total != null && out.fetched >= out.total) stop = 'all';
      if (stop) { out.end = stop; break; }
    }
    if (out.end === 'cap') out.truncated = true;
    return out;
  }

  // HTML 본문 → 읽기용 텍스트 (style/script 제거, 블록 요소 줄바꿈)
  function htmlToText(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style,script,head,title').forEach(e => e.remove());
    doc.querySelectorAll('br,p,div,tr,li,h1,h2,h3,h4,h5,h6,blockquote').forEach(e => e.insertAdjacentText('afterend', '\n'));
    return (doc.body ? doc.body.textContent : '').replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  }

  // 읽음/안 읽음 표시 (UI 툴바 "읽음"/"안 읽음" 과 동일 호출, 2026-09-24 캡처)
  async function markRead(mailIdList) { return dfetch('/v2/wapi/mails/read', { method: 'POST', body: { mailIdList } }); }
  async function markUnread(mailIdList) { return dfetch('/v2/wapi/mails/unread', { method: 'POST', body: { mailIdList } }); }

  // 메일 1건 본문. GET /v2/wapi/mails/{id} → result.content.{subject, createdAt, users, body:{mimeType,content(HTML)}, fileList[]}
  // ⚠️ 이 GET 은 서버가 그 메일을 읽음(read=true, opened=true)으로 바꾼다(실측). 목록에서 read=false 였던 메일은
  //    조회 직후 markUnread 로 read 를 복원한다(wasRead 를 넘길 것). opened 는 되돌릴 수 없지만 화면 표시엔 read 만 쓰인다.
  // 2026-09-27 Codex 점검: API 거절(isSuccessful=false)을 빈 본문으로 넘기지 않고 throw. 안 읽음 복원이 거절되면 restoredUnread=true 로 적지 않고
  //   throw 하되 읽은 본문은 e.mail 에 담는다 → getMails 는 본문과 함께 restoreError 를 남기고 fmtBody 머리줄에 '⚠ 안 읽음 복원 실패' 가 뜬다.
  async function getMail(id, { wasRead = null, restoreUnread = true, maxChars = 20000 } = {}) {
    const d = await dfetch(`/v2/wapi/mails/${id}`);
    const bad = apiErr(d);
    if (bad || !(d.result && d.result.content)) throw new Error('DOORAY 본문 조회 실패: ' + (bad || '본문 없음(result.content)'));
    const c = d.result.content;
    const html = (c.body && c.body.content) || '';
    const text = htmlToText(html).slice(0, maxChars);
    const from = (c.users && c.users.from && c.users.from.emailUser) || {};
    const to = ((c.users && c.users.to) || []).map(u => (u.emailUser && u.emailUser.emailAddress) || '').filter(Boolean);
    const cc = ((c.users && c.users.cc) || []).map(u => (u.emailUser && u.emailUser.emailAddress) || '').filter(Boolean);
    const bcc = c.users && Array.isArray(c.users.bcc) ? c.users.bcc.map(u => (u.emailUser && u.emailUser.emailAddress) || '').filter(Boolean) : null;   // 없으면 null(확인 불가)
    const files = (c.fileList || []).map(f => f.name || f.fileName || f.originalName || f.originalFileName || '').filter(Boolean);
    let restored = false, restoreError = '';
    if (restoreUnread && wasRead === false) {
      try { restoreError = apiErr(await markUnread([id])); } catch (e) { restoreError = String((e && e.message) || e); }
      restored = !restoreError;
    }
    const out = { id, subject: c.subject || '', date: (c.createdAt || '').slice(0, 16).replace('T', ' '), fromName: from.name || '', fromEmail: from.emailAddress || '',
      to, cc, bcc, files, text, textLen: text.length, htmlLen: html.length, restoredUnread: restored };
    if (restoreError) {
      const e = new Error('DOORAY 안 읽음 복원 실패 — 이 메일은 읽음으로 바뀌었습니다: ' + restoreError);
      e.mail = Object.assign(out, { restoreError });
      throw e;
    }
    return out;
  }

  // 후보 여러 건 본문 순차 조회 (rate limit: burst 20/초당 5 → 건당 delayMs 간격). items = listMails 의 mails 항목(id·read 포함) 또는 id 문자열.
  async function getMails(items, { delayMs = 300, maxChars = 8000 } = {}) {
    const out = [];
    for (const it of items) {
      const id = String(typeof it === 'string' ? it : it.id).replace(/-/g, '');            // fmtList 의 하이픈 id 도 됨
      const wasRead = typeof it === 'string' ? (id in readCache ? readCache[id] : null) : it.read;
      try { out.push(await getMail(id, { wasRead, maxChars })); }
      catch (e) { out.push(e && e.mail ? e.mail : { id, error: String(e).slice(0, 120) }); }   // 복원 실패는 본문 + restoreError
      await new Promise(r => setTimeout(r, delayMs));
    }
    return out;
  }

  // ---------- 기능 4: 스팸 신고 (휴지통 + 학습 + 발신자 차단) ----------
  // idList: 메일 id 배열 (N건 일괄). 항상 호출측이 사용자 confirm 후 실행.
  const normIds = (list) => (list || []).map(x => String(x && x.id ? x.id : x).replace(/-/g, '')).filter(Boolean);
  async function reportSpam(idList, { applyBefore = true, addReject = true } = {}) {
    idList = normIds(idList);
    return dfetch('/v2/wapi/mails/report-spam-hacking', {
      method: 'POST',
      body: {
        idList,
        spamOptions: { reportSpam: true, applyBeforeMail: applyBefore, applyBeforeMailFolders: ['inbox'] },
        hackingOptions: { reportHacking: false, reportReason: '' },
        addRejectFromEmail: addReject,
      },
    });
  }

  // ---------- 기능 2: 폴더 이동 (1회성, 과거 메일) ----------
  async function moveMails(mailIdList, targetFolderId, targetFolderName) {
    mailIdList = normIds(mailIdList);
    return dfetch('/v2/wapi/mails/move', {
      method: 'POST',
      body: { targetFolderId, targetFolderName, mailIdList },
    });
  }

  // ---------- 제목 키워드 (기능 3·4 공통 — 2026-09-27 사용자 확정) ----------
  // 사용자가 발신 주소 말고 제목도 거르는 조건으로 쓰라고 하면, 제목 전체가 아니라 그 시리즈 메일에 매번 그대로 들어가는 핵심 구절만 쓴다.
  //   '[To:한국과학기술연구원*NNN][매입]○○업체(유)로부터 전자세금계산서(NNNNNNNNNN)가 YYYYMMDD 발급되었습니다.(XXXXXXXX)' → '○○업체(유)로부터 전자세금계산서'
  //   '거래명세서_○○업체 NNNNNNNNNN' → '거래명세서_○○업체'
  //   'Re: Invitation to ○○ Materials Science Conference' → '○○ Materials Science Conference'
  //   'Dear Dr. Professor, Publish at very low APC - Journal of ○○ Science' → 'Journal of ○○ Science'
  // Dooray 제목 조건은 '포함' 일치 → 키워드는 원문 제목 안에 이어 붙어 있는 구간 그대로(띄어쓰기·괄호·밑줄까지). 조각을 이어 붙이거나 고쳐 쓰지 않는다.
  // subjectKeyword 는 1차 후보일 뿐 — 최종 구절은 Claude 가 같은 시리즈 제목 2~3건을 보고 뜻으로 고르고 사용자 confirm.
  const KW_CUT = [
    /\[(?:to|cc|bcc|from)\s*:[^\]]*\]|\[[^\]]*[*@][^\]]*\]/gi,  // [To:…] 같은 받는 곳 태그는 통째로
    /[\[\]【】〔〕]/g,                                         // 그 밖의 [태그]는 괄호만 — [매입] 은 짧아 빠지고 [NNNN 추계 ○○학회] 는 이름이 후보로 남는다
    /\((?=[^)]*\d)[^)]*\)/g,                                     // 숫자가 든 괄호(승인번호·추적 코드)
    /\((?=[^)]*[A-Za-z])[A-Za-z0-9]{6,}\)/g,                     // 영숫자 추적 코드 괄호
    /\d{2,4}[-./]\d{1,2}(?:[-./]\d{1,2})?/g,                     // 날짜
    /\d{4,}/g,                                                   // 번호·연도·YYYYMMDD
    /\b\d+(?:st|nd|rd|th)\b/gi,                                  // 회차(영문)
    /제\s*\d+\s*회/g,                                            // 회차(한글)
    /^\s*(?:(?:re|fw|fwd)\s*(?:\[\d+\])?\s*:\s*|(?:회신|답장|전달)\s*:\s*)+/gi,  // 답장·전달 머리말
    /^\s*dear\b[^,]{0,60},\s*/gi,                                // 인사말
    /\s+[-–—|:]\s+|\s*::\s*|:\s+/g,                              // 문구 구분자( - | : )
  ];
  const KW_LEAD = /^(?:(?:special\s+)?invitation|invite|call\s+for\s+(?:papers|abstracts|speakers|submissions)|final\s+call|last\s+call|reminder|greetings)\b\s*(?:to|for)?\s*/i;
  const KW_EDGE = /^[\s.,:;!?·~\-–—|_'"“”‘’]+|[\s.,:;!?·~\-–—|_'"“”‘’]+$/g;
  const KW_TAIL = /\s*\([^)]*(?:요청|회신|참석|필독|중요|긴급)[^)]*\)$|\s*(?:안내|공지|알림)(?:\s*드립니다)?$/;   // 끝의 공지 꼬리
  const KW_EMPTY = /^(?:안내|알림|공지|입니다|발급되었습니다|님|귀하|[가이을를은는의에와과및로])$/;
  const KW_ADS = /\b(?:publish(?:\s+at)?|apc|discount|low\s+cost|fast\s+track|submit|submission|special\s+issue|cfp|deadline|extended|still\s+available|now\s+open|register(?:\s+now)?|don'?t\s+miss|limited|last\s+chance|early\s+bird)\b|\d+\s*%|할인|무료|마감|모집|투고/i;
  const KW_NAME = /journal|conference|congress|symposium|summit|forum|workshop|webinar|expo|society|association|institute|committee|council|학회|협회|위원회|저널|심포지엄|심포지움|워크숍|세미나|포럼|컨퍼런스|학술/i;
  const KW_DOC = /세금계산서|계산서|거래명세서|명세서|견적서|청구서|발주서|납품|invoice|statement|quotation|receipt/i;
  const KW_COMMON = /^(?:(?:전자)?세금계산서|거래명세서|견적서|명세서|안내|공지|알림|초대|세미나|학회|저널|conference|journal|invitation|call\s+for\s+papers|newsletter|webinar|seminar)$/i;

  function kwSegments(s) {
    const cut = new Array(s.length).fill(false);
    for (const re of KW_CUT) {
      const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = r.exec(s)) !== null) {
        if (!m[0].length) { r.lastIndex++; continue; }
        for (let i = m.index; i < m.index + m[0].length; i++) cut[i] = true;
      }
    }
    const segs = [];
    for (let i = 0; i < s.length;) {
      if (cut[i]) { i++; continue; }
      let j = i; while (j < s.length && !cut[j]) j++;
      segs.push(s.slice(i, j)); i = j;
    }
    return segs;
  }
  function kwClean(t) {
    let x = t.replace(KW_EDGE, '');
    for (let k = 0; k < 3; k++) { const y = x.replace(KW_LEAD, '').replace(KW_TAIL, '').replace(KW_EDGE, ''); if (y === x) break; x = y; }
    return x;
  }
  function kwScore(t) {
    if (t.length < 4 || KW_EMPTY.test(t) || KW_COMMON.test(t)) return 0;
    let sc = Math.min(t.length, 40) / 10;
    if (KW_NAME.test(t)) sc += 3;
    if (KW_DOC.test(t)) sc += 3;
    if (KW_ADS.test(t)) sc -= 4;
    return Math.round(sc * 10) / 10;
  }
  // 제목 1건 → { keyword(1순위), candidates[], removed[](키워드 앞·뒤로 뺀 부분) }. 후보가 없으면 keyword ''.
  function subjectKeyword(subject) {
    const s = String(subject || '');
    const cands = [];
    for (const g of kwSegments(s)) {
      const t = kwClean(g);
      if (!t || !s.includes(t) || cands.some(c => c.keyword === t)) continue;
      const score = kwScore(t);
      if (score > 0) cands.push({ keyword: t, score });
    }
    cands.sort((a, b) => b.score - a.score);
    const keyword = cands.length ? cands[0].keyword : '', at = keyword ? s.indexOf(keyword) : -1;
    const removed = at < 0 ? [] : [s.slice(0, at).trim(), s.slice(at + keyword.length).trim()].filter(Boolean);
    return { keyword, candidates: cands.map(c => c.keyword), removed };
  }
  // 규칙에 넣기 전 점검 → [{ keyword, level:'block'|'warn', problem }] (빈 배열이면 통과).
  //   subjects(선택) = 잡으려는 메일들의 원문 제목 → 키워드가 제목마다 그대로 들어 있는지, 제목을 통째로 넣지 않았는지도 본다.
  //   block = createRule 이 거부(번호·날짜·회차·머리말·[To:…]·번호 태그·인사말·60자 초과·원문에 없음·제목 통째). warn = 너무 흔한 말·일반 [태그] → 사용자에게 알리고 선택.
  function checkSubjectKeywords(keywords, subjects) {
    const out = [], subs = (subjects || []).map(String);
    for (const k of (keywords || [])) {
      const kw = String(k == null ? '' : k), t = kw.trim();
      const add = (level, problem) => out.push({ keyword: kw.slice(0, 40), level, problem });
      if (!t) { add('block', '빈 키워드'); continue; }
      if (/\d{4,}/.test(kw) || /\d{2,4}[-./]\d{1,2}/.test(kw)) add('block', '번호·날짜·연도(4자리 이상 숫자) — 다음 메일부터 안 잡힘');
      if (/\b\d+(?:st|nd|rd|th)\b|제\s*\d+\s*회/i.test(kw)) add('block', '회차 — 해마다 바뀜');
      if (/^\s*(?:(?:re|fw|fwd)\s*(?:\[\d+\])?\s*:|(?:회신|답장|전달)\s*:)/i.test(kw)) add('block', '답장·전달 머리말');
      if (/\[(?:to|cc|bcc|from)\s*:[^\]]*\]|\[[^\]]*[\d*@][^\]]*\]/i.test(kw)) add('block', '[To:…]·번호가 든 태그 — 받는 곳·번호 표시는 뺄 것');
      else if (/\[[^\]]*\]/.test(kw)) add('warn', '[태그] 포함 — 그 태그로 거르려는 게 아니면 뺄 것');
      if (/^\s*dear\b/i.test(kw)) add('block', '인사말');
      if (kw.length > 60) add('block', '60자 초과 — 제목을 통째로 넣은 것 같음');
      if (KW_COMMON.test(t) || KW_EMPTY.test(t)) add('warn', '너무 흔한 말 — 다른 정상 메일까지 걸림(발신처·고유 이름과 묶을 것)');
      if (subs.length) {
        const miss = subs.filter(x => !x.includes(kw)).length;
        if (miss) add('block', `대상 제목 ${subs.length}건 중 ${miss}건에 이 구절이 그대로 없음 — 원문에서 이어진 구간을 글자 그대로`);
        if (subs.some(x => x.trim() === t)) add('block', '제목 전체와 같음');
      }
    }
    return out;
  }
  // 규칙 미리보기(⛔ 먼저 보여주고 묻는다): 이 조건이면 지난 받은 메일 중 무엇이 잡히는지.
  //   spec = { subjectKeywords:[…], fromEmails?:[…], since?:'YYYY-MM-DD', sinceDays?(기본 365) }
  //   서버 검색은 키워드의 긴 낱말 2개로 넓게 받고, 제목 포함 여부는 여기서 대소문자 무시로 다시 거른다(실제 규칙보다 좁게 보이지 않게). 보낸 메일은 뺀다.
  async function previewSubjectRule(spec = {}) {
    const kws = (spec.subjectKeywords || []).map(String).filter(x => x.trim());
    const froms = (spec.fromEmails || []).map(x => String(x).toLowerCase());
    const opt = { size: 100, maxPages: 5 };
    if (spec.since) opt.since = spec.since; else opt.sinceDays = spec.sinceDays || 365;
    const seen = new Map(), hits = {}; let cut = false;
    for (const kw of kws) {
      const words = kw.split(/[^0-9A-Za-z가-힣]+/).filter(w => w.length >= 2).sort((a, b) => b.length - a.length).slice(0, 2);
      const r = await searchMails(words.length ? words : [kw], opt);
      if (r.error) return { error: r.error, hits, total: 0, mails: [] };
      if (r.truncated) cut = true;
      const low = kw.toLowerCase();
      hits[kw] = 0;
      for (const m of r.mails) {
        if (m.folder === 'sent' || !m.subject.toLowerCase().includes(low)) continue;
        if (froms.length && !froms.some(f => m.fromEmail.toLowerCase().includes(f))) continue;
        hits[kw]++;
        if (!seen.has(m.id)) seen.set(m.id, m);
      }
      await new Promise(res => setTimeout(res, 200));
    }
    const mails = Array.from(seen.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { hits, total: mails.length, mails, truncated: cut };
  }

  // ---------- 기능 3: 자연어 자동분류 규칙 엔진 ----------
  // 규칙 1건 생성. 조건은 from(발신) 또는 subject(제목 키워드) — 둘 다 주면 AND.
  // 정책(2026-09-24): 기본은 fromEmails(정확 주소) 만 넘긴다. subjectKeywords 는 사용자가 명시했을 때만 — 발신+제목 AND 규칙은 제목이 조금만 바뀌어도 빠져나간다.
  // 정책(2026-09-27): subjectKeywords 는 제목 전체가 아니라 핵심 구절만(위 '제목 키워드'). checkSubjectKeywords 에 block 문제가 있으면 만들지 않고 { blocked, problems } 를 돌려준다.
  //   spec = { fromEmails?:[], subjectKeywords?:[], sampleSubjects?:[원문 제목…], toFolderName, applyBefore?, operator?, applyOrder?, overrideKeywordCheck? }
  //   overrideKeywordCheck:true 는 사용자가 경고를 듣고도 그 키워드를 그대로 원할 때만.
  // ⚠️ Dooray 제약: 배열 POST 시 "첫 1건만" 생성 → 단건 호출. from.type은 include만(not_include -200200).
  // ⚠️ 같은 도메인 두 용도 분기는 applyOrder로 — 정확주소(예 nzine@nrf.re.kr)를 도메인(nrf.re.kr)보다 작게(먼저).
  async function createRule(spec) {
    spec = Object.assign({}, spec || {});
    const arr = x => x == null ? [] : [].concat(x).map(String).filter(v => v.trim());
    spec.fromEmails = arr(spec.fromEmails); spec.subjectKeywords = arr(spec.subjectKeywords);
    if (!spec.fromEmails.length && !spec.subjectKeywords.length) return { blocked: 'noCondition', problems: [{ level: 'block', problem: '조건이 없습니다(fromEmails 또는 subjectKeywords) — 모든 메일이 옮겨지는 규칙은 만들지 않음' }] };
    if (!spec.toFolderName) return { blocked: 'noFolder', problems: [{ level: 'block', problem: 'toFolderName 이 없습니다' }] };
    const kwCheck = spec.subjectKeywords.length ? checkSubjectKeywords(spec.subjectKeywords, spec.sampleSubjects) : [];
    if (!spec.overrideKeywordCheck && kwCheck.some(p => p.level === 'block')) return { blocked: 'subjectKeywords', problems: kwCheck };
    const folder = await ensureFolder(spec.toFolderName);
    if (folder.needManual) return { needManualFolder: folder.name };
    const condition = { operator: spec.operator || 'and' };
    if (spec.fromEmails && spec.fromEmails.length) condition.from = { type: 'include', value: spec.fromEmails };
    if (spec.subjectKeywords && spec.subjectKeywords.length) condition.subject = { type: 'include', value: spec.subjectKeywords };
    const rule = {
      condition,
      action: { toFolder: { id: folder.id, name: folder.name, type: folder.type === 'system' ? 'system' : 'user' } },
      type: 'auto_classification',
      applyBeforeMail: spec.applyBefore !== false,
      applyBeforeMailFolders: ['inbox', 'user_folders'],
    };
    if (spec.applyOrder != null) rule.applyOrder = spec.applyOrder;  // 우선순위(낮을수록 먼저 적용)
    // 단건 배열 POST (Dooray 제약)
    const res = await dfetch('/v2/wapi/mail-rules', { method: 'POST', body: [rule] });
    return { folder, rule, res, keywordCheck: kwCheck };
  }

  async function listMailRules() {
    const d = await dfetch('/v2/wapi/mail-rules?size=1000&page=0&types=auto_classification');
    if (!d.result && apiErr(d)) throw new Error('DOORAY 규칙 조회 실패: ' + apiErr(d));
    const res = d.result || {};
    return Array.isArray(res) ? res : (res.contents || []);
  }

  async function deleteMailRule(ruleId) {
    return dfetch(`/v2/wapi/mail-rules/${ruleId}`, { method: 'DELETE' });
  }

  // ---------- 기능 1 경로 A: 서버 검색 (POST /v2/wapi/mails/search — Dooray 검색창과 동일 호출, 2026-09-24 캡처·실측) ----------
  // terms: ['○○대'] 단어 배열. 원소끼리 AND, 한 원소 안의 띄어쓰기('○○대 세미나')는 구절(인접) 매칭. 대상 = 제목·본문·발신자 전체.
  //   기간: since/before ('YYYY-MM-DD' 또는 ISO 시각; 서버는 ISO 시각+타임존만 받으므로 날짜면 보정) 또는 sinceDays. until/period 등 다른 이름은 조용히 무시된다.
  //   폴더 지정 파라미터 없음(folderName 무시, 받은·보낸 모두) — exceptFolders(시스템 폴더 이름, 기본 draft/spam/trash 제외)만. 결과 folder 로 사후 필터.
  //   응답: result.contents[{id}] + references.mailMap[id](목록과 같은 메일 객체 + mailSummary.previewText 본문 앞 ~300자) + references.folderMap[id]{name,type}.
  //   실측: size 100 OK / 연도 조건은 서버가 걸러 즉시 / 본문에만 있는 구절도 hit.
  async function searchMails(terms, opt = {}) {
    const size = opt.size || 100, maxPages = opt.maxPages || 5;
    const iso = (d, end) => /T/.test(d) ? d : d + (end ? 'T23:59:59+09:00' : 'T00:00:00+09:00');
    const body = { exceptFolders: opt.exceptFolders || ['draft', 'spam', 'trash'], all: Array.isArray(terms) ? terms : [String(terms)],
      page: 0, order: opt.order || '-createdAt', highlight: true, size };
    if (opt.since) body.since = iso(opt.since, false); else if (opt.sinceDays) body.since = new Date(Date.now() - opt.sinceDays * 86400000).toISOString();
    if (opt.before || opt.until) body.before = iso(opt.before || opt.until, true);   // until 도 같은 뜻으로
    const out = { total: null, fetched: 0, pages: 0, mails: [], end: 'cap' }, folders = {};
    for (let p = 0; p < maxPages; p++) {
      body.page = p;
      const d = await dfetch('/v2/wapi/mails/search?preview=true', { method: 'POST', body });
      if (!d.result) { out.error = (d.header && (d.header.resultMessage || d.header.resultCode)) || 'no result'; out.end = 'error'; break; }
      const cs = d.result.contents || [], refs = d.result.references || {}, mm = refs.mailMap || {};
      Object.assign(folders, refs.folderMap || {});
      if (out.total == null) out.total = d.result.totalCount;
      out.fetched += cs.length; out.pages++;
      for (const c of cs) {
        const m = mm[c.id]; if (!m) continue;
        const s = summarize(m), f = folders[m.folderId] || {};
        s.preview = ((m.mailSummary && m.mailSummary.previewText) || '').slice(0, 400);
        s.folder = f.name || '';
        s.url = 'https://kist.gov-dooray.com' + (f.type === 'system' ? `/mail/systems/${f.name}/${m.id}` : `/mail/folders/${m.folderId}/${m.id}`);
        out.mails.push(s);
      }
      if (cs.length < size || (out.total != null && out.fetched >= out.total)) { out.end = 'all'; break; }
    }
    if (out.end === 'cap') out.truncated = true;   // listMails 와 같은 규칙 — 상한에서 멈추면 잘림 표시
    return out;
  }
  // 동의어 묶음별로 검색해 합치고 중복 제거(최신순). groups = [['○○대'], ['univ'], ['○○대학교', '세미나']]
  async function searchMany(groups, opt = {}) {
    const seen = new Map(); let totalSum = 0; const errors = [], cut = [];
    for (const g of groups) {
      const r = await searchMails(g, opt); totalSum += r.total || 0;
      if (r.error) errors.push(String(r.error));                       // 검색 오류는 '없음'이 아니라 오류로 보고
      if (r.truncated) cut.push([].concat(g).join(' ') + ' ' + r.fetched + '/' + r.total);   // 잘린 묶음도 합친 결과에 남긴다
      for (const m of r.mails) if (!seen.has(m.id)) seen.set(m.id, m);
      await new Promise(res => setTimeout(res, 200));
    }
    const out = { totalSum, mails: Array.from(seen.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) };
    if (errors.length) out.error = errors.join(' / ');
    if (cut.length) { out.truncated = true; out.truncatedGroups = cut; }
    return out;
  }

  // ---------- 출력 도우미 (Claude in Chrome javascript_tool 제약 대응, 2026-09-24 실측) ----------
  // (1) 반환 문자열은 약 1,000자에서 [TRUNCATED] → 결과를 window 에 두고 fmtList/fmtBody 로 조각내어 회수한다.
  // (2) 출력 필터: `a=b` 꼴이 있으면 통째로 [BLOCKED: Cookie/query string], URL·긴 숫자열(메일 id)도 가려진다
  //     → sanitize: = & ? ; 제거, URL→[url], 8자리 이상 숫자→#, '/'→'>'. 메일 id 는 hyId(4자리마다 '-')로만 노출.
  //     링크는 팝업 주소 https://kist.gov-dooray.com/mail/popup/mails/<id> (hyId 의 '-' 를 지워 조합, 폴더 무관).
  function sanitize(s) {
    return String(s == null ? '' : s).replace(/https?:\S+/gi, '[url]').replace(/[=&?;]/g, ' ').replace(/\d{8,}/g, '#').replace(/\//g, '>');
  }
  function hyId(id) { return String(id).replace(/(\d{4})(?=\d)/g, '$1-'); }
  // 목록 정규식 1차 선별(제목·발신자·발신주소). Claude 가 동의어·영문·약어를 넓혀 만든 정규식을 넘긴다.
  //   excludeFrom: 발신 주소 제외 정규식(예 /kist\.re\.kr$/i 로 사내 공지 제외). ⚠️ 약어는 대소문자 구분·단어경계로(짧은 약어 정규식은 다른 단어 조각에도 걸린다).
  function pick(mails, re, { excludeFrom } = {}) {
    const rx = new RegExp(re.source, re.flags.replace('g', ''));   // /g 면 test() 가 lastIndex 를 남겨 건너뛰는 함정
    const ex = excludeFrom ? new RegExp(excludeFrom.source, excludeFrom.flags.replace('g', '')) : null;
    return (mails || []).filter(m => (rx.test(m.subject) || rx.test(m.fromName) || rx.test(m.fromEmail)) && !(ex && ex.test(m.fromEmail)));
  }
  // 목록 한 조각: idx | 날짜 | R/U | 첨부수 | 발신 | 제목 [폴더] [| 미리보기 pv자] [| id(하이픈)]. 12줄 ≈ 800자(pv 를 주면 줄을 줄일 것).
  // 2-스텝 결과(window.__x) 그대로 넘긴다: null = 아직(또는 .then 에 오류 처리를 안 붙임) / {error} = 실패 / 배열·컨테이너 = 결과.
  const NOT_YET = '(결과 없음 — 비동기 조회가 아직이면 2~3초 뒤 다시. 계속 이러면 .then(r=>…, e=>window.__x={error:String(e)}) 로 오류까지 저장했는지 확인)';
  function listOf(x) { return Array.isArray(x) ? x : (x && (x.mails || x.recent)) || []; }
  function errOf(x) { return (x && !Array.isArray(x) && x.error) ? String(x.error) : ''; }
  // 반환 문자열은 1,000자에서 잘린다(실측) → 줄 수가 아니라 글자 수로 끊고 머리줄에 다음 조각 번호를 적는다
  function cutOf(x) {                         // 잘림 머리줄: 전체 몇 건 중 몇 건을 읽었는지(묶음 검색은 잘린 묶음 수)
    const tot = x.total != null ? x.total : x.totalInbox;
    if (x.truncatedGroups) return `(묶음 ${x.truncatedGroups.length}개)`;
    return tot != null && x.fetched != null ? `(전체 ${tot} 중 ${x.fetched})` : '';
  }
  function fitRows(rows, reserve = 150) { const out = []; let n = reserve; for (const r of rows) { n += r.length + 1; if (n > 960) break; out.push(r); } return out; }
  function fmtList(x, from = 0, to = 12, { subj = 44, who = 14, ids = false, pv = 0 } = {}) {
    if (x == null) return NOT_YET;
    const mails = listOf(x), err = errOf(x);
    if (err && !mails.length) return 'ERR ' + sanitize(err);
    const rows = fitRows(mails.slice(from, to).map((m, k) =>
      sanitize(`${from + k} | ${m.date.slice(2)} | ${m.read ? 'R' : 'U'} | att${m.fileCount} | ${(m.fromName || m.fromEmail).slice(0, who)} | ${m.subject.slice(0, subj)}`
        + (m.folder && m.folder !== 'inbox' ? ` [${m.folder}]` : '') + (pv && m.preview ? ' | ' + m.preview.slice(0, pv) : '')) + (ids ? ' | ' + hyId(m.id) : '')));
    const end = from + rows.length;
    return `[${from}-${end} of ${mails.length}]` + (end < Math.min(to, mails.length) ? ` ▶ 다음 조각 ${end}` : '') + (err ? ' ⚠ 일부 오류: ' + sanitize(err).slice(0, 80) : '') + (x.truncated ? ' ⚠ 목록 잘림' + cutOf(x) + ' — maxPages 늘려 다시' : '') + '\n' + rows.join('\n');
  }
  // 본문 1건: 머리 1줄(제목·날짜·발신·첨부·복원 여부) + 본문 chars 자. 긴 본문은 offset 을 옮겨 이어 읽는다.
  function fmtBody(b, chars = 700, offset = 0) {
    if (!b) return 'no body';
    if (b.error) return 'ERR ' + sanitize(b.error);
    const files = b.files.length ? ` (${b.files.slice(0, 3).join(', ').slice(0, 80)})` : '';
    const head = `${b.subject.slice(0, 40)} | ${b.date.slice(2)} | ${b.fromName || b.fromEmail} | files ${b.files.length}${files} | txt ${b.textLen}${b.restoredUnread ? ' | unread restored' : ''}${b.restoreError ? ' | ⚠ 안 읽음 복원 실패(읽음으로 바뀜)' : ''}`;
    return sanitize(head + '\n' + b.text.slice(offset, offset + chars));
  }
  // ---------- 메일 팝업 보기 (2026-09-27 사용자 확정: 링크·열기 모두 팝업 방식) ----------
  // Dooray 새 창 버튼과 같은 주소 /mail/popup/mails/{id} — 폴더와 관계없이 id 하나로, 목록 없이 그 메일 한 통만 보인다(받은·보낸 메일 실측).
  //   답의 링크도 이 주소로 준다. 대화창 링크는 브라우저 새 탭으로 열리지만 쓰던 메일함 화면은 그대로 남는다.
  // "그 메일 열어줘/띄워줘" 할 때만(열면 읽음 처리됨): openMail(항목) → 화면 오른쪽 위에 임시 버튼 'kiki 메일 팝업 열기' 가 생긴다
  //   → Claude 가 find 로 그 버튼을 찾아 computer left_click(ref) → popupStatus() 가 opened 인지 확인.
  //   스크립트만으로 window.open 하면 Chrome 팝업 차단기가 막는다(실측) — 실제 클릭이 있어야 열린다. 버튼은 누르면 스스로 사라진다.
  //   클릭 한 번에 창 하나라 여러 통이면 한 통씩 반복. 같은 메일은 같은 창을 다시 쓴다(창 이름 kkmail_<id>). closePopups() 로 한꺼번에 닫는다.
  const POPUP_BASE = 'https://kist.gov-dooray.com/mail/popup/mails/';
  const popupWins = {};
  let popupState = null;
  function popupUrl(x) { return POPUP_BASE + String(x && x.id ? x.id : x); }
  function openMail(m) {
    const id = String(m && m.id ? m.id : m).replace(/-/g, '');
    const old = document.getElementById('kk-mail-popup-btn'); if (old) old.remove();
    const b = document.createElement('button');
    b.id = 'kk-mail-popup-btn';
    b.textContent = 'kiki 메일 팝업 열기';
    b.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;padding:12px 18px;font-size:15px;background:#ffb300;color:#000;border:2px solid #000;border-radius:8px;cursor:pointer';
    popupState = { id, state: 'waiting' };
    b.onclick = () => {
      const n = Object.keys(popupWins).length % 5;
      const left = Math.max(0, (window.screenX || 0) + Math.round(((window.outerWidth || 1200) - 720) / 2) + 30 * n);
      const top = Math.max(0, (window.screenY || 0) + 80 + 30 * n);
      const w = window.open(popupUrl(id), 'kkmail_' + id, `popup=yes,width=720,height=800,left=${left},top=${top},resizable=yes,scrollbars=yes`);
      if (w) { popupWins[id] = w; try { w.focus(); } catch (e) { /* 무시 */ } }
      popupState = { id, state: w ? 'opened' : 'blocked' };
      b.remove();
    };
    document.body.appendChild(b);
    return 'popup button ready';
  }
  function popupStatus() { return popupState ? popupState.state + ' ' + hyId(popupState.id) : 'none'; }
  function closePopups() {
    let k = 0;
    for (const id of Object.keys(popupWins)) {
      try { if (!popupWins[id].closed) { popupWins[id].close(); k++; } } catch (e) { /* 무시 */ }
      delete popupWins[id];
    }
    return 'closed ' + k;
  }

  // ---------- 기능 5: 메일 보내기 (2026-09-30 쓰기 화면 캡처 + 본인에게 실제 발송 1통으로 확인) ----------
  // 쓰기 화면과 같은 호출: 초안 POST /v2/wapi/mail-drafts [초안] → result[0].id → POST /v2/wapi/mails/send {draftId}.
  //   쓰기 화면은 중간에 PUT /v2/wapi/mail-drafts/{id} 로 다시 저장하지만, 처음 POST 에 내용을 다 담으면 그 단계는 필요 없다.
  //   주소 = {type:'emailUser', emailUser:{name, emailAddress}} — 받는 사람(to)·참조(cc)·숨은 참조(bcc) 모두 같은 모양(참조도 받는 사람처럼 검색해 넣는다).
  //   보내는 사람 = 설정 mail.write-from(selectedName·selectedEmailAddress). 본문은 쓰기 화면과 같은 모양:
  //   <div style="font-family: Arial; font-size: 16px"><div>줄</div>…<div><br></div><!-- begin signature -->서명<!-- end signature --></div>
  //   서명 = 설정 mail.signature(enabled·options.new·signatures[useIndex].content), 글꼴 = 설정 mail.write format. 보내기 전 '미리 보기' 창은 화면 설정일 뿐 API 에는 없다.
  //   ⚠️ 보낸 메일은 되돌릴 수 없다 → prepareMail(미리보기 — 서버에 아무것도 만들지 않음) → 사용자 확인 → sendPrepared(키). 키는 한 번만 쓴다.
  const SEARCH_TYPES = ['member', 'distributionList', 'projectMail', 'contact', 'recent', 'contactsLabel', 'sharedMailMember'];
  const SEARCH_ROLES = ['admin', 'owner', 'member', 'subMember', 'guest', 'dummy'];
  const KIND_KO = { member: '조직도', recent: '최근', contact: '주소록', contactsLabel: '주소록 그룹', distributionList: '그룹 메일', projectMail: '프로젝트 메일', sharedMailMember: '공유 메일' };
  const str = (v) => (typeof v === 'string' ? v : '');
  // 받는 사람 찾기 — 쓰기 화면 받는 사람·참조 칸에 이름을 칠 때와 같은 검색(조직도·주소록·최근 받는 사람). 사번·전화번호는 꺼내지 않는다.
  //   쪽을 넘겨 끝까지 읽는다(maxPages×size 까지) → complete=false 면 못 읽은 후보가 있다 — 한 명만 나왔다고 고르지 않는다(Codex 검토 2026-09-30).
  async function findAddress(q, { size = 30, maxPages = 5 } = {}) {
    const seen = new Set(), list = [];
    let total = null, fetched = 0, complete = false;
    for (let page = 0; page < maxPages; page++) {
      const d = await dfetch(`/v2/wapi/search-email-addresses?page=${page}&size=${size}`, { method: 'POST', body: { all: String(q || ''), typeList: SEARCH_TYPES, tenantMemberRoles: SEARCH_ROLES } });
      const bad = apiErr(d);
      if (bad || !d.result) throw new Error('DOORAY 주소 검색 실패: ' + (bad || 'no result'));
      const cs = d.result.contents || [];
      if (total == null && typeof d.result.totalCount === 'number') total = d.result.totalCount;
      fetched += cs.length;
      for (const c of cs) {
        const o = (c && c[c.type]) || {};
        const email = str(o.emailAddress || o.email).trim();
        if (!email || seen.has(email.toLowerCase())) continue;   // 조직도와 최근 받는 사람에 같은 주소가 겹치면 한 번
        seen.add(email.toLowerCase());
        const deps = Array.isArray(o.departments) ? o.departments : [];
        const dep = deps.find(x => x && x.primaryFlag) || deps[0] || {};
        list.push({ kind: c.type, name: str(o.name || o.displayName), email, dept: str(dep.name) || str(o.department), rank: str(o.rank) || str(o.position), company: str(o.company) || str(o.tenantName) });
      }
      if (cs.length < size || (total != null && fetched >= total)) { complete = true; break; }
    }
    return { q: String(q || ''), total, fetched, complete, list };
  }
  // 한 명으로 정해졌을 때만 그 주소(끝까지 읽었고 주소가 하나) — 아니면 null(사용자에게 고르게 하거나 좁혀 다시)
  function onlyAddress(x) { return x && !x.error && x.complete && (x.list || []).length === 1 ? x.list[0] : null; }
  // 주소 검색 조각: idx | 이름 | 주소 | 부서 | 직급 | 종류. 같은 이름이 여럿이면 사용자에게 골라 달라고 한다(추측해서 보내지 않는다).
  function fmtAddress(x, from = 0, to = 15) {
    if (x == null) return NOT_YET;
    if (x.error) return 'ERR ' + sanitize(x.error);
    const L = x.list || [];
    const rows = fitRows(L.slice(from, to).map((a, k) => `${from + k} | ${sanitize(a.name) || '-'} | ${a.email} | ${sanitize(a.dept || a.company) || '-'} | ${sanitize(a.rank) || '-'} | ${KIND_KO[a.kind] || a.kind}`), 260);
    const end = from + rows.length;
    const scope = x.complete ? ` | 검색 ${x.total != null ? x.total : x.fetched}건 다 읽음` : ` | ⚠ 검색 ${x.total != null ? x.total + '건 중 ' : ''}앞 ${x.fetched}건만 읽음 — 자동으로 고르지 말고 성+이름·부서로 좁혀 다시`;
    return `[주소 검색 '${sanitize(x.q)}' ${from}-${end} of ${L.length}${scope}]` + (end < Math.min(to, L.length) ? ` ▶ 다음 조각 ${end}` : '') + (L.length ? '' : ' — 찾은 주소 없음(철자·다른 이름으로, 또는 주소를 직접)') + '\n' + rows.join('\n');
  }
  let senderCache = null;
  // 보내는 사람·서명·글꼴(쓰기 화면이 쓰는 개인 설정 3가지)
  async function mailSender(refresh = false) {
    if (senderCache && !refresh) return senderCache;
    const [wf, sg, mw] = await Promise.all([dfetch('/v2/wapi/members/me/settings/mail.write-from'), dfetch('/v2/wapi/members/me/settings/mail.signature'), dfetch('/v2/wapi/members/me/settings/mail.write')]);
    const val = (d) => (d && d.result && d.result.content && d.result.content.value) || {};
    const w = val(wf), s = val(sg), f = val(mw).format || {};
    if (apiErr(wf) || !w.selectedEmailAddress) throw new Error('DOORAY 보내는 사람 설정 조회 실패: ' + (apiErr(wf) || '주소 없음'));
    const sig = (Array.isArray(s.signatures) ? s.signatures : [])[s.useIndex || 0];
    senderCache = { name: str(w.selectedName), email: w.selectedEmailAddress, font: str(f.font) || 'Arial', fontSize: +f.fontSize || 16,
      signature: { enabled: !!s.enabled && !apiErr(sg), forNew: !(s.options && s.options.new === false), forReply: !!(s.options && s.options.reply), html: str(sig && sig.content) } };
    return senderCache;
  }
  const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
  // "이름 <주소>" · "주소" · {name, email} · findAddress 항목 → {name, email}. 주소가 없으면 null — 이름만으로는 보내지 않는다(findAddress 로 먼저 정한다).
  function addrOf(a) {
    if (!a) return null;
    if (typeof a === 'object') { const e = str(a.email || a.emailAddress).trim(); return EMAIL.test(e) ? { name: str(a.name).trim(), email: e } : null; }
    const s = String(a).trim(), m = /^(.*?)\s*<([^<>\s]+)>$/.exec(s);
    if (m && EMAIL.test(m[2])) return { name: m[1].replace(/^["']|["']$/g, '').trim(), email: m[2] };
    return EMAIL.test(s) ? { name: '', email: s } : null;
  }
  const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // 글 → 쓰기 화면과 같은 줄 모양(<div>줄</div>, 빈 줄은 <div><br></div>)
  function textToHtml(text) { return String(text).replace(/\r\n?/g, '\n').split('\n').map(l => l.trim() === '' ? '<div><br></div>' : '<div>' + escHtml(l) + '</div>').join(''); }
  const INTERNAL_MAIL = /(^|\.)(kist\.re\.kr|kist\.gov-dooray\.com)$/i;
  const prepared = {};
  // 보낼 메일 미리보기 — 서버에 아무것도 만들지 않는다. {to, cc, bcc, subject, text | html, signature: 'auto'(기본: 설정대로)|true|false}
  //   → {key, from, to, cc, bcc, subject, text, signature, external} 또는 {error, problems}(주소가 아닌 받는 사람·제목·본문 없음)
  async function prepareMail(spec = {}) {
    const bad = [];
    const L = (k) => { const out = [], seen = new Set(); for (const a of [].concat(spec[k] || [])) { const r = addrOf(a); if (!r) { bad.push(k + ' ' + (typeof a === 'object' ? JSON.stringify(a) : String(a))); continue; } if (!seen.has(r.email.toLowerCase())) { seen.add(r.email.toLowerCase()); out.push(r); } } return out; };
    const to = L('to'), cc = L('cc'), bcc = L('bcc');
    const subject = String(spec.subject || '').trim(), text = spec.text != null ? String(spec.text) : '', html = spec.html != null ? String(spec.html) : '';
    const problems = [];
    if (bad.length) problems.push('주소가 아닌 받는 사람 — 이름만이면 findAddress 로 주소를 먼저 정할 것: ' + bad.join(' / '));
    if (!to.length) problems.push('받는 사람(to)이 없습니다');
    if (!subject) problems.push('제목이 없습니다');
    if (!text.trim() && !html.trim()) problems.push('본문이 없습니다');
    if (problems.length) return { error: problems.join(' | '), problems };
    const me = await mailSender();
    const sigHtml = me.signature.html;
    const useSig = !!sigHtml && (spec.signature === true || (spec.signature !== false && me.signature.enabled && me.signature.forNew));
    const inner = html || textToHtml(text);
    const content = `<div style="font-family: ${me.font}; font-size: ${me.fontSize}px">` + inner + (useSig ? '<div><br></div><!-- begin signature -->' + sigHtml + '<!-- end signature -->' : '') + '</div>';
    return keep(me, { to, cc, bcc, subject, content, relation: {}, text: text || htmlToText(html), signature: useSig });
  }
  const eu = (a) => ({ type: 'emailUser', emailUser: { name: a.name, emailAddress: a.email } });
  // 초안 모양(쓰기 화면과 같음)을 만들어 준비물로 보관 → 미리보기 p 를 돌려준다(p 는 보관본과 같은 객체 — saveDraft 가 p.draftId 를 채운다)
  function keep(me, o) {
    const draft = { id: null, users: { from: eu(me), to: o.to.map(eu), cc: o.cc.map(eu), bcc: o.bcc.map(eu) }, subject: o.subject, priority: 3, body: { mimeType: 'text/html', content: o.content },
      fileList: [], fileIdList: [], security: { level: 'normal', resend: true, autoDelete: false, retentionDays: 0 }, relation: o.relation || {},
      reservation: { type: '', toBeSentAt: null, toBeSentTimezone: null }, individualSend: false, securityEditable: true, version: 0, mimeSize: 0 };
    const key = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const external = o.to.concat(o.cc, o.bcc).filter(a => !INTERNAL_MAIL.test(a.email.split('@')[1] || '')).map(a => a.email);
    // fullText = 실제로 나갈 본문 전체(서명·원문 인용 포함) — 확인 전에 끝까지 보여 준다(Codex 검토 2026-09-30)
    const p = { key, from: me.email, fromName: me.name, to: o.to, cc: o.cc, bcc: o.bcc, subject: o.subject, text: o.text, fullText: htmlToText(o.content), signature: o.signature, external };
    if (o.reply) p.reply = o.reply;
    prepared[key] = { draft, p, sent: false, approved: snapOf({ to: o.to, cc: o.cc, bcc: o.bcc, subject: o.subject, html: o.content }) };
    return p;
  }
  // 승인본 대조용 요약 — 주소는 소문자 정렬, 본문은 글만 남겨 빈칸을 모두 뺀다(HTML 모양·줄바꿈 차이는 같다고 보고 글자가 바뀌면 다르다고 본다)
  const flat = (html) => htmlToText(html).replace(/\s+/g, '');
  function snapOf(o) {
    const s = (a) => (a || []).map(x => String(x && x.email != null ? x.email : x).toLowerCase()).filter(Boolean).sort();
    return { to: s(o.to), cc: s(o.cc), bcc: s(o.bcc), subject: String(o.subject || '').trim(), flat: o.flat != null ? o.flat : flat(o.html || '') };
  }
  const KO3 = { to: '받는 사람', cc: '참조', bcc: '숨은 참조' };
  // a = 승인본, b = 지금 → 바뀐 것(주소는 빠진 것·더해진 것 모두). skip 에 든 칸(bcc 등)은 확인 불가라 비교하지 않는다.
  function diffSnap(a, b, skip = []) {
    const out = [];
    for (const k of ['to', 'cc', 'bcc']) {
      if (skip.includes(k)) continue;
      const add = b[k].filter(x => !a[k].includes(x)), miss = a[k].filter(x => !b[k].includes(x));
      if (miss.length) out.push(`${KO3[k]} 빠짐: ${miss.join(', ')}`);
      if (add.length) out.push(`${KO3[k]} 더해짐: ${add.join(', ')}`);
    }
    if (a.subject !== b.subject) out.push(`제목 다름: '${a.subject}' → '${b.subject}'`);
    if (a.flat !== b.flat) out.push('본문 다름');
    return out;
  }
  // 임시 보관함 초안의 지금 내용(Dooray 에서 고쳤을 수 있다) — GET /v2/wapi/mails/{초안 id}(쓰기 화면 미리 보기도 이 호출, 2026-09-30 캡처)
  async function draftNow(draftId) {
    const d = await dfetch(`/v2/wapi/mails/${draftId}`);
    const bad = apiErr(d);
    if (bad || !(d.result && d.result.content)) throw new Error('DOORAY 임시 보관함 초안을 읽지 못함(보내지 않음): ' + (bad || '초안 없음 — Dooray 에서 이미 보냈거나 지웠을 수 있음'));
    const c = d.result.content, u = c.users || {};
    const ul = (a) => (a || []).map(x => ({ name: str(x && x.emailUser && x.emailUser.name), email: str(x && x.emailUser && x.emailUser.emailAddress) })).filter(x => x.email);
    return { to: ul(u.to), cc: ul(u.cc), bcc: ul(u.bcc), subject: c.subject || '', html: (c.body && c.body.content) || '' };
  }
  // ---------- 답장 (2026-09-30 답장 버튼 화면 캡처 + 사용자 승인 후 실제 답장 1통) ----------
  // 답장 버튼 = /mail/write/reply/{mailId} — 초안에 relation {type:'reply', mailId}, 제목 'RE: 원제목', 받는 사람 = 원래 보낸 사람,
  //   서명은 설정 options.reply(꺼져 있으면 빈 표시만), 본문 뒤 원문 인용 블록(아래 quoteBlock — 화면과 같은 모양). 보내면 원래 메일에 '답장함'(replied) 표시가 켜진다.
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  function quoteDate(iso) {   // '2026-09-30T01:06:45+09:00' → '2026-09-30 (수) 01:06:45 (UTC+09:00)'
    const t = new Date(iso);
    if (isNaN(t.getTime())) return String(iso || '');
    const k = new Date(t.getTime() + 9 * 3600000), p = (n) => String(n).padStart(2, '0');
    return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} (${WD[k.getUTCDay()]}) ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())} (UTC+09:00)`;
  }
  const qesc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const qAddr = (u) => { const e = (u && u.emailUser) || {}; return `"${qesc(e.name)}" &lt;${qesc(e.emailAddress)}&gt;`; };
  function quoteBlock(c) {
    const u = c.users || {}, many = (a) => (a || []).map(x => qAddr(x) + '; ').join('');
    return '<br><br>-----Original Message-----<br>From:  ' + qAddr(u.from) + '<br>To:     ' + many(u.to) + '<br>Cc:    ' + many(u.cc) + '<br>Sent:  ' + quoteDate(c.createdAt)
      + '<br>Subject: ' + qesc(c.subject) + '<br><br>' + ((c.body && c.body.content) || '');
  }
  // 답장 미리보기 — 서버에 아무것도 만들지 않는다. item = 받은 메일 항목(목록·unrepliedMails 결과 — read 가 있으면 안 읽음 복원) 또는 메일 id.
  //   spec = {text | html, cc?, bcc?, signature?}. 받는 사람은 원래 보낸 사람(전체 답장은 아직 없음).
  async function prepareReply(item, spec = {}) {
    const id = String(item && item.id ? item.id : item).replace(/-/g, '');
    const text = spec.text != null ? String(spec.text) : '', html = spec.html != null ? String(spec.html) : '';
    if (!text.trim() && !html.trim()) return { error: '답장 본문이 없습니다', problems: ['본문 없음'] };
    const bad = [], L = (k) => [].concat(spec[k] || []).map(a => { const r = addrOf(a); if (!r) bad.push(k + ' ' + String(a)); return r; }).filter(Boolean);
    const cc = L('cc'), bcc = L('bcc');
    if (bad.length) return { error: '주소가 아닌 참조 — findAddress 로 주소를 먼저 정할 것: ' + bad.join(' / '), problems: bad };
    const wasRead = item && typeof item === 'object' && 'read' in item ? item.read : (id in readCache ? readCache[id] : null);
    const d = await dfetch(`/v2/wapi/mails/${id}`);
    const bad2 = apiErr(d);
    if (bad2 || !(d.result && d.result.content)) throw new Error('DOORAY 원래 메일 조회 실패: ' + (bad2 || '본문 없음(result.content)'));
    let restoreError = '';
    if (wasRead === false) { try { restoreError = apiErr(await markUnread([id])); } catch (e) { restoreError = String((e && e.message) || e); } }   // 답장 준비만으로 읽음이 되지 않게
    const c = d.result.content, f = (c.users && c.users.from && c.users.from.emailUser) || {};
    if (!EMAIL.test(str(f.emailAddress))) return { error: '원래 메일의 보낸 사람 주소가 없어 답장할 수 없습니다' };
    const me = await mailSender();
    const useSig = !!me.signature.html && (spec.signature === true || (spec.signature !== false && me.signature.enabled && me.signature.forReply));
    const subject = /^\s*re\s*:/i.test(c.subject || '') ? String(c.subject) : 'RE: ' + (c.subject || '');
    const content = `<div style="font-family: ${me.font}; font-size: ${me.fontSize}px">` + (html || textToHtml(text)) + '<div><br></div><!-- begin signature -->' + (useSig ? me.signature.html : '') + '<!-- end signature --></div>' + quoteBlock(c);
    const p = keep(me, { to: [{ name: str(f.name), email: f.emailAddress }], cc, bcc, subject, content, relation: { type: 'reply', mailId: id }, text: text || htmlToText(html), signature: useSig,
      reply: { mailId: id, subject: c.subject || '', from: f.emailAddress, date: (c.createdAt || '').slice(0, 16).replace('T', ' ') } });
    if (restoreError) p.restoreError = restoreError;
    return p;
  }
  const who = (a) => (a.name ? `${a.name} <${a.email}>` : a.email);
  // 미리보기 글(사용자에게 그대로 보여 줄 것) — 본문은 실제로 나갈 전체(서명·원문 인용 포함)를 조각으로. ▶ 다음 조각이 없을 때까지 읽고 확인을 묻는다.
  //   첫 조각(offset 0)에 머리(보내는 사람·받는 사람·참조·숨은 참조·제목·서명·외부 주소)를 싣고, 1,000자 안에 들도록 본문 길이를 줄인다.
  function fmtPrepared(p, chars = 900, offset = 0) {
    if (p == null) return NOT_YET;
    if (p.error) return 'ERR ' + String(p.error).replace(/=/g, '＝');
    const full = p.fullText != null ? p.fullText : p.text, N = full.length;
    const L = [];
    if (!offset) {
      L.push(`[${p.reply ? '답장' : '보낼 메일'} 미리보기 — 아직 보내지 않음${p.draftId ? ' · 임시 보관함에 저장됨' : ''}${p.refreshed ? ' · 임시 보관함의 지금 내용(다시 확인 필요)' : ''} | 키 ${p.key}]`);
      if (p.reply) L.push(`답장할 메일: ${p.reply.date} | ${p.reply.from} | ${p.reply.subject} (원문 인용 붙음)`);
      L.push('보내는 사람: ' + who({ name: p.fromName, email: p.from }), '받는 사람: ' + p.to.map(who).join(', '));
      if (p.cc.length) L.push('참조: ' + p.cc.map(who).join(', '));
      if (p.bcc.length) L.push('숨은 참조: ' + p.bcc.map(who).join(', '));
      L.push('제목: ' + p.subject, '서명: ' + (p.signature ? '붙음(설정의 서명 — 아래 본문 끝에 보임)' : '안 붙음'));
      if (p.external.length) L.push(`⚠ 외부 주소 ${p.external.length}개(KIST 밖): ` + p.external.join(', '));
      if (p.draftId) L.push('임시 보관함 초안 id ' + hyId(p.draftId) + ' (Dooray 에서 고치면 보내기 전에 다시 확인받는다)');
      if (p.restoreError) L.push('⚠ 원래 메일 안 읽음 복원 실패(읽음으로 바뀜): ' + p.restoreError);
    }
    const head = L.join('\n');
    const room = offset ? chars : Math.max(150, Math.min(chars, 940 - head.length - 90));
    const end = Math.min(N, offset + room);
    L.push(`본문 전체(서명·원문 인용 포함) ${N}자 — ${offset}-${end}${end < N ? '' : ' 끝'}:`, full.slice(offset, end));
    if (end < N) L.push(`▶ 다음 조각 fmtPrepared(p, ${chars}, ${end})`);
    return L.join('\n').replace(/=/g, '＝');
  }
  // 실제로 나갈 HTML(서명·원문 인용 포함)을 조각으로 — 모양까지 확인할 때. '=' 는 출력 필터 때문에 '＝' 로 보인다.
  function fmtPreparedHtml(p, chars = 900, offset = 0) {
    if (p == null) return NOT_YET;
    if (p.error) return 'ERR ' + String(p.error).replace(/=/g, '＝');
    const it = prepared[p.key];
    const html = (it && (it.currentHtml || it.draft.body.content)) || '', end = Math.min(html.length, offset + chars);
    return (`[보낼 HTML ${html.length}자 — ${offset}-${end}${end < html.length ? ` ▶ 다음 조각 fmtPreparedHtml(p, ${chars}, ${end})` : ' 끝'}]\n` + html.slice(offset, end)).replace(/=/g, '＝');
  }
  const idOfDraft = (d) => { const r0 = Array.isArray(d.result) ? d.result[0] : d.result && (Array.isArray(d.result.contents) ? d.result.contents[0] : d.result); return r0 && r0.id ? String(r0.id) : ''; };
  function entryOf(key) {
    const k = String(key && key.key ? key.key : key), it = prepared[k];
    if (!it) throw new Error('준비물이 없습니다(prepareMail·prepareReply 부터 — 새로고침·재주입이면 사라진다): ' + k);
    return it;
  }
  // 임시 보관함에 초안으로 저장(보내지 않음) — 답장이면 원래 메일과 연결된 답장 초안. 같은 키로 두 번 저장하지 않는다.
  async function saveDraft(key) {
    const it = entryOf(key);
    if (it.sent) throw new Error('이미 보낸(또는 보내려 한) 준비물입니다');
    if (it.draftId) return { ok: true, draftId: it.draftId, already: true, subject: it.p.subject };
    const d = await dfetch('/v2/wapi/mail-drafts', { method: 'POST', body: [it.draft] });
    const draftId = idOfDraft(d);
    if (apiErr(d) || !draftId) throw new Error('DOORAY 초안 저장 실패: ' + (apiErr(d) || '초안 번호 없음'));
    it.draftId = draftId; it.p.draftId = draftId;
    return { ok: true, draftId, subject: it.p.subject };
  }
  // 보내기 — 준비물 키로 한 번만. 임시 보관함에 저장해 둔 초안이면 보내기 직전에 서버 초안을 다시 읽어 승인본(사용자가 본 미리보기)과 대조한다:
  //   Dooray 에서 받는 사람·제목·본문을 고쳤으면 보내지 않고 오류(e.changed) — refreshPrepared(키) 로 지금 내용을 다시 보여 주고 확인받은 뒤 보낸다(Codex 검토 2026-09-30).
  //   이때 키는 쓰지 않은 채로 남는다. 초안 만들기가 실패하면 보내지 않고, 보내기가 실패하면 초안이 임시 보관함에 남는다(e.draftId).
  async function sendPrepared(key) {
    const it = entryOf(key);
    if (it.sent) throw new Error('이미 보낸(또는 보내려 한) 준비물입니다 — 같은 메일을 두 번 보내지 않습니다. 다시 보내려면 prepareMail 부터');
    if (it.draftId) {
      const cur = snapOf(await draftNow(it.draftId));   // 읽지 못하면 throw — 보내지 않음, 키 유지
      const changes = diffSnap(it.approved, cur);
      if (changes.length) {
        const e = new Error('임시 보관함 초안이 확인받은 미리보기와 다릅니다 — 보내지 않았습니다: ' + changes.join(' / ') + ' → refreshPrepared(키) 로 지금 내용을 다시 보여 주고 확인받을 것');
        e.changed = changes; e.draftId = it.draftId;
        throw e;
      }
    }
    it.sent = true;   // 여기부터는 실패해도 이 키로 다시 보내지 않는다(중복 발송 방지)
    let draftId = it.draftId || '';
    if (!draftId) {
      const d = await dfetch('/v2/wapi/mail-drafts', { method: 'POST', body: [it.draft] });
      draftId = idOfDraft(d);
      if (apiErr(d) || !draftId) throw new Error('DOORAY 초안 만들기 실패(보내지 않음): ' + (apiErr(d) || '초안 번호 없음'));
    }
    let s;
    try { s = await dfetch('/v2/wapi/mails/send', { method: 'POST', body: { draftId } }); }
    catch (e) { const er = new Error('DOORAY 보내기 응답 없음 — 보내졌는지 보낸편지함에서 확인(checkSent): ' + ((e && e.message) || e)); er.draftId = draftId; throw er; }
    if (apiErr(s)) { const er = new Error('DOORAY 보내기 실패 — 초안은 임시 보관함에 남음: ' + apiErr(s)); er.draftId = draftId; throw er; }
    it.draftId = draftId;
    const out = { ok: true, draftId, sentAt: Date.now(), subject: it.p.subject, to: it.p.to.map(a => a.email), cc: it.p.cc.map(a => a.email), bcc: it.p.bcc.map(a => a.email), approved: it.approved };
    if (it.p.reply) out.replyTo = it.p.reply.mailId;   // 답장이면 원래 메일 — checkReplied 로 '답장함' 표시 확인
    return out;
  }
  // 임시 보관함 초안을 Dooray 에서 고쳤을 때 — 지금 내용으로 미리보기를 다시 만든다(sendPrepared 가 e.changed 로 멈춘 뒤).
  //   돌려주는 p(같은 키)를 fmtPrepared 로 사용자에게 다시 보여 주고, 확인을 받은 뒤에만 sendPrepared(키). 확인 기준(승인본)은 이 지금 내용으로 바뀐다.
  async function refreshPrepared(key) {
    const it = entryOf(key);
    if (it.sent) throw new Error('이미 보낸(또는 보내려 한) 준비물입니다');
    if (!it.draftId) throw new Error('임시 보관함에 저장하지 않은 준비물이라 다시 읽을 서버 초안이 없습니다');
    const cur = await draftNow(it.draftId);
    const p = it.p;
    p.to = cur.to; p.cc = cur.cc; p.bcc = cur.bcc; p.subject = cur.subject;
    p.fullText = htmlToText(cur.html); p.text = p.fullText; p.refreshed = true;
    p.external = cur.to.concat(cur.cc, cur.bcc).filter(a => !INTERNAL_MAIL.test(a.email.split('@')[1] || '')).map(a => a.email);
    it.currentHtml = cur.html;
    it.approved = snapOf(cur);
    return p;
  }
  // 보낸 메일함 확인(사용자 지시 2026-09-30 "보냈으면 보낸 메일함에서 잘 보내졌는지 확인까지") — r = sendPrepared 결과(권장) 또는 제목 글.
  //   초안 번호가 있으면 보낸 메일함에서 **그 번호의 메일만** 인정한다(보낸 메일 id = 초안 id, 2026-09-30 실측 — 같은 제목의 다른 메일은 성공으로 치지 않는다).
  //   그 메일을 열어 받는 사람·참조·숨은 참조의 빠진 주소와 더해진 주소, 제목·본문을 승인본과 대조한다(Codex 검토 2026-09-30). 보낸 메일은 이미 읽음이라 상태는 그대로.
  //   제목 글만 주면 같은 제목·최근 withinMin 분의 메일을 찾되 대조할 승인본이 없어 '대조 못 함'으로 적는다. 방금 보낸 메일이 늦게 뜰 수 있어 없으면 몇 초 뒤 한 번 더.
  async function checkSent(r, { withinMin = 30 } = {}) {
    const subject = typeof r === 'string' ? r : String((r && r.subject) || '');
    const draftId = r && typeof r === 'object' && r.draftId ? String(r.draftId) : '';
    const l = await listMails({ folder: 'sent', size: 50, maxPages: 2 });
    if (l.error) return { error: l.error };
    const ts = (m) => new Date(String(m.date).replace(' ', 'T') + ':00+09:00').getTime();
    const since = r && r.sentAt ? r.sentAt - 120000 : Date.now() - withinMin * 60000;
    const hit = draftId ? l.mails.filter(m => String(m.id) === draftId) : l.mails.filter(m => m.subject === subject && ts(m) >= since);
    if (!hit.length) return { found: false, subject, draftId };
    const m = hit[0];
    let got;
    try { got = await getMail(m.id, { wasRead: true, restoreUnread: false, maxChars: 1e7 }); } catch (e) { return { found: true, subject, mail: m, error: 'DOORAY 보낸 메일 열기 실패: ' + ((e && e.message) || e) }; }
    const out = { found: true, subject, mail: m, date: m.date, to: got.to, cc: got.cc, bcc: got.bcc, count: hit.length };
    const want = r && typeof r === 'object' ? (r.approved || (r.to ? snapOf({ to: r.to, cc: r.cc, bcc: r.bcc, subject: r.subject, flat: null, html: '' }) : null)) : null;
    if (!want) { out.unchecked = true; return out; }
    const skip = got.bcc == null ? ['bcc'] : [];
    const now = snapOf({ to: got.to, cc: got.cc, bcc: got.bcc || [], subject: got.subject, flat: String(got.text || '').replace(/\s+/g, '') });
    if (!r.approved) { now.flat = want.flat; }   // 본문 승인본이 없으면 본문은 대조하지 않는다
    out.problems = diffSnap(want, now, skip);
    out.ok = !out.problems.length;
    if (skip.length) out.bccUnknown = true;
    return out;
  }
  function fmtSent(c) {
    if (c == null) return NOT_YET;
    if (c.error && !c.found) return 'ERR ' + String(c.error).replace(/=/g, '＝');
    if (!c.found) return (c.draftId ? `보낸 메일함에 이 메일(초안 번호 ${hyId(c.draftId)})이 아직 없음` : `보낸 메일함에 아직 없음 — '${c.subject}'`) + ' — 몇 초 뒤 checkSent 한 번 더, 그래도 없으면 보내기 실패로 보고(같은 제목의 다른 메일은 인정하지 않음)';
    const tail = `${c.date} | ${c.subject} | id ${hyId(c.mail.id)}` + (c.count > 1 ? ` (같은 제목 ${c.count}통 — 가장 최근 것)` : '');
    const rec = `받는 사람 ${(c.to || []).join(', ') || '-'}${(c.cc || []).length ? ' | 참조 ' + c.cc.join(', ') : ''}${(c.bcc || []).length ? ' | 숨은 참조 ' + c.bcc.join(', ') : ''}`;
    let head;
    if (c.error) head = `보낸 메일함에 있음(내용 확인 실패) ${tail}\n⚠ ${c.error}`;
    else if (c.unchecked) head = `보낸 메일함에 있음(대조할 승인본 없음 — 제목으로만 찾음) ${tail}\n${rec}`;
    else if (c.ok) head = `보낸 메일함 확인 ✓ ${tail}\n${rec} | 받는 사람·참조${c.bccUnknown ? '' : '·숨은 참조'}·제목·본문이 확인받은 내용과 같음${c.bccUnknown ? ' (숨은 참조는 보낸 메일에 안 보여 대조 못 함)' : ''}`;
    else head = `⚠ 보낸 메일함에 있지만 확인받은 내용과 다름 ${tail}\n${rec}\n⚠ ${c.problems.join(' / ')}`;
    return head.replace(/=/g, '＝');
  }
  // 답장 안 한 받은 메일 — 받은 메일의 '답장함' 표시(flags.replied)가 꺼진 것만. 휴대폰·다른 메일 프로그램에서 답했을 수 있어
  //   보낸 메일함에 같은 제목(RE:·회신: 머리말을 뗀)으로 그 발신자에게 보낸 메일이 있으면 repliedElsewhere 로 표시한다.
  //   답장이 '필요한지'는 Claude 가 본문을 읽고 판단한다(광고·공지·자동 발송·단체 메일은 코드로 가르지 않는다).
  const baseSubject = (s) => String(s || '').replace(/^\s*(?:(?:re|fw|fwd)\s*(?:\[\d+\])?\s*:\s*|(?:회신|답장|전달)\s*:\s*)+/gi, '').trim().toLowerCase();
  async function unrepliedMails({ days = 7, maxPages = 4 } = {}) {
    const inbox = await listMails({ folder: 'inbox', sinceDays: days, size: 500, maxPages });
    if (inbox.error) return { error: inbox.error };
    const sent = await listMails({ folder: 'sent', sinceDays: days + 1, size: 500, maxPages: 2 });
    const keys = new Set();
    if (!sent.error) for (const m of sent.mails) for (const t of m.toEmails || []) keys.add(baseSubject(m.subject) + '|' + t.toLowerCase());
    const mails = inbox.mails.filter(m => !m.replied).map(m => Object.assign({}, m, { repliedElsewhere: keys.has(baseSubject(m.subject) + '|' + String(m.fromEmail).toLowerCase()) }));
    const out = { days, total: inbox.mails.length, repliedCount: inbox.mails.length - mails.length, mails, truncated: !!inbox.truncated || !!sent.truncated };
    if (sent.error) out.sentError = sent.error;
    return out;
  }
  // idx | 날짜 | R/U | 발신 | 제목 [| 보낸 메일함에 답장 있음]. 1,000자 안에서 끊고 ▶ 다음 조각.
  function fmtUnreplied(x, from = 0, to = 15) {
    if (x == null) return NOT_YET;
    if (x.error) return 'ERR ' + sanitize(x.error);
    const L = x.mails || [];
    const rows = fitRows(L.slice(from, to).map((m, k) => sanitize(`${from + k} | ${m.date.slice(5)} | ${m.read ? 'R' : 'U'} | ${(m.fromName || m.fromEmail).slice(0, 14)} <${String(m.fromEmail).split('@')[1] || ''}> | ${m.subject.slice(0, 40)}`) + (m.repliedElsewhere ? ' | 보낸 메일함에 답장 있음' : '')), 180);
    const end = from + rows.length;
    return `[답장 안 한 받은 메일 ${from}-${end} of ${L.length} | 최근 ${x.days}일 받은 ${x.total}통 중 답장함 ${x.repliedCount}통 제외]` + (end < Math.min(to, L.length) ? ` ▶ 다음 조각 ${end}` : '')
      + (x.truncated ? ' ⚠ 목록 잘림' : '') + (x.sentError ? ' ⚠ 보낸 메일함 대조 실패' : '') + '\n' + rows.join('\n');
  }
  // 답장을 보낸 뒤 원래 메일에 '답장함' 표시가 켜졌는지(받은 메일함 목록에서 — 원래 메일을 열지 않아 읽음 상태는 그대로)
  async function checkReplied(mailId) {
    const id = String(mailId && mailId.replyTo ? mailId.replyTo : mailId && mailId.id ? mailId.id : mailId).replace(/-/g, '');
    const l = await listMails({ folder: 'inbox', size: 500, maxPages: 3 });
    if (l.error) return { error: l.error };
    const m = l.mails.find(x => String(x.id) === id);
    return m ? { found: true, replied: m.replied, subject: m.subject } : { found: false };
  }

  // ---------- export ----------
  // ---------- 스팸 후보 목록 + 첫 실행 현황 조각 (2026-09-27 전체 흐름 검수) ----------
  //   점수 규칙(spamHints)은 폐기: 실제 받은편지함 3주치(226통)에서 약탈적 저널·학회 모객·피싱 약 10통 중 1통만 '스팸의심'으로 잡고
  //   지갑 피싱 메일은 0점이었다(거짓 안심). 코드는 사내 발신을 빼고 외부 발신만 짧게 나열하고, 판단은 Claude 가 classification_policy.md 로 한다.
  //   fmtExternal(listInbox 결과 또는 메일 배열) → '[외부 발신 a-b of N | 전체 M, 사내 K 제외]' + 'idx | 월-일 시각 | 발신 도메인 | 제목'
  //   id 는 찍지 않는다 — 신고·이동은 번호로: reportSpam([3,7].map(i => kkMail.externalOf(window.__x)[i])) (19자리 id 를 옮겨 적다 틀리는 일을 없앤다)
  const INTERNAL = /(^|\.)kist\.re\.kr$/i;
  function externalOf(x, internal = INTERNAL) { return listOf(x).filter(m => !internal.test(String(m.fromEmail || '').split('@')[1] || '')); }
  function fmtExternal(x, from = 0, to = 20, { internal = INTERNAL } = {}) {
    if (x == null) return NOT_YET;
    const all = listOf(x), err = errOf(x);
    if (err && !all.length) return 'ERR ' + sanitize(err);
    const ext = externalOf(x, internal);
    const rows = fitRows(ext.slice(from, to).map((m, k) => sanitize(`${from + k} | ${String(m.date || '').slice(5)} | ${String(m.fromEmail || '').split('@')[1] || '?'} | ${String(m.subject || '').slice(0, 56)}`)));
    const end = from + rows.length;
    return `[외부 발신 ${from}-${end} of ${ext.length} | 전체 ${all.length}, 사내 ${all.length - ext.length} 제외]` + (end < Math.min(to, ext.length) ? ` ▶ 다음 조각 ${end}` : '') + (err ? ' ⚠ 일부 오류: ' + sanitize(err).slice(0, 60) : '') + (x && x.truncated ? ' ⚠ 목록 잘림' : '') + '\n' + rows.join('\n');
  }
  function fmtFolders(all) {
    if (all == null) return NOT_YET;
    if (all.error) return 'ERR ' + sanitize(all.error);
    const u = all.user || [], s = all.system || [];
    const cap = (t, n) => t.length > n ? t.slice(0, n) + ' …(생략)' : t;
    return sanitize('사용자 폴더 ' + u.length + ': ' + cap(u.map(f => `${f.name}(${f.total || 0})`).join(', '), 330) + '\n시스템: ' + cap(s.map(f => `${f.name}(${f.total || 0})`).join(', '), 150));
  }
  // fmtRules(rules, from, {reserve, q}) — q 를 주면 발신·제목·폴더에 q 가 든 규칙만(규칙이 수백 개여도 충돌 확인은 검색으로). 번호는 원래 순번.
  // 규칙 동작 이름: 폴더 이동이면 폴더명, 아니면 휴지통 등(실측: 157개 중 28개가 action.toTrash)
  function ruleTarget(r) { const a = r.action || {}; return (a.toFolder && a.toFolder.name) || (a.toTrash ? '휴지통' : '') || (a.toSpam || a.spam ? '스팸' : '') || '기타 동작(' + (Object.keys(a).filter(k => k !== 'version').join('+') || '없음') + ')'; }
  function ruleText(r) { const c = r.condition || {}; return [((c.from && c.from.value) || []).join(' '), ((c.subject && c.subject.value) || []).join(' '), ruleTarget(r)].join(' '); }
  function fmtRules(rules, from = 0, { reserve = 150, q = '' } = {}) {
    if (rules == null) return NOT_YET;
    if (!Array.isArray(rules) && rules.error) return 'ERR ' + sanitize(rules.error);
    if (!rules.length) return '자동분류 규칙 없음(조회 성공, 0개)';
    const pool = rules.map((r, i) => [r, i]).filter(([r]) => !q || ruleText(r).toLowerCase().includes(String(q).toLowerCase()));
    const lines = fitRows(pool.slice(from).map(([r, i]) => {
      const c = r.condition || {}, fr = ((c.from && c.from.value) || []).join(' '), sj = ((c.subject && c.subject.value) || []).join(' ');
      const to = ruleTarget(r);
      return sanitize(`${i} | 발신 ${fr.slice(0, 60) || '-'} | 제목 ${sj.slice(0, 40) || '-'} | → ${to} | order ${r.applyOrder == null ? '-' : r.applyOrder}`);
    }), reserve);
    const end = from + lines.length;
    return `[규칙 ${from}-${end} of ${pool.length}` + (q ? ` (검색 ${sanitize(q)}, 전체 ${rules.length})` : '') + ']' + (end < pool.length ? ` ▶ 다음 조각 ${end}` : '') + '\n' + lines.join('\n');
  }
  async function overview() { const [folders, rules] = await Promise.all([findAllFolders(), listMailRules()]); return { folders, rules }; }
  function fmtOverview(x) {
    if (x == null) return NOT_YET;
    if (x.error) return 'ERR ' + sanitize(x.error);
    const f = fmtFolders(x.folders), by = {};
    (x.rules || []).forEach(r => { const t = ruleTarget(r); by[t] = (by[t] || 0) + 1; });
    const sum = '규칙 ' + (x.rules || []).length + '개(대상별): ' + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · ');
    return f + '\n' + ((x.rules || []).length ? sanitize(sum).slice(0, 200) + '\n' : '') + fmtRules(x.rules, 0, { reserve: 150 + f.length + sum.length }) + ((x.rules || []).length > 8 ? '\n(특정 발신·제목 규칙 확인은 fmtRules(window.__f.rules, 0, {q:"주소 일부"}))' : '');
  }
  window.kkMail = {
    dfetch, findAllFolders, findFolderId, ensureFolder, deleteFolder,
    listInbox, listFolderMails, summarize,
    listMails, getMail, getMails, htmlToText, markRead, markUnread,
    searchMails, searchMany,
    pick, fmtList, fmtBody, sanitize, hyId, openMail, popupUrl, popupStatus, closePopups,
    reportSpam, moveMails,
    createRule, listMailRules, deleteMailRule,
    subjectKeyword, checkSubjectKeywords, previewSubjectRule,
    externalOf, fmtExternal, fmtFolders, fmtRules, ruleTarget, overview, fmtOverview, apiErr,
    findAddress, onlyAddress, fmtAddress, mailSender, prepareMail, fmtPrepared, fmtPreparedHtml, sendPrepared, refreshPrepared, checkSent, fmtSent,
    prepareReply, saveDraft, unrepliedMails, fmtUnreplied, checkReplied,
    _version: 'kk-mail-ops/1.12',
  };
  return window.kkMail._version + ' =^.^=';
})();
