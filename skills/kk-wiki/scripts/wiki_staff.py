# -*- coding: utf-8 -*-
"""kk-wiki 담당자표 — 포탈 게시판 "부서별업무분장표"(그룹웨어 xClick, FC_BBS224) 부서별 최신 게시글의 직무·담당(내선) 표를 로컬에 두고 검색.

수집은 브라우저 코어(kk_wiki_ops.js: staffList → staffCollect → staffRender)가 그룹웨어 탭 안에서 하고,
Claude 가 `get_page_text` 로 읽은 덤프를 파일로 저장하면 이 스크립트가 파싱한다(로그인 세션 필요, 토큰 API 없음).

사용:
  python wiki_staff.py import <dump.txt>        # staffRender 덤프 → staff/staff.json + staff.md (이전본은 staff/_history/)
  python wiki_staff.py find 출장 여비            # 직무구분·직무내용에서 단어 AND 검색 → 팀 | 직무 | 담당 (내선) | 기준일
  python wiki_staff.py team 재무팀               # 한 팀의 표 전체
  python wiki_staff.py status                   # 팀 수·수집일·표 없는(이미지) 팀
스냅샷 위치: <kiki_root>/wiki/staff/ (내부 자료 — 각자 PC 에만).
"""
from __future__ import annotations
import argparse, io, json, os, re, sys, time
# Windows 한국어(cp949) 콘솔·파이프에서도 한글·기호가 깨지거나 멈추지 않게 출력은 UTF-8 로 (모듈로 불러 써도 적용)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wiki_snapshot import snapshot_root, pick_download, downloads_dir  # noqa: E402


def staff_dir(root: str) -> str:
    d = os.path.join(root, "staff")
    os.makedirs(d, exist_ok=True)
    return d


def norm_team(s: str) -> str:
    return re.sub(r"[·ㆍ・]", "·", (s or "").strip())


_NAME = re.compile(r"^[가-힣]{2,4}(\s*(스쿨)?사무국장|\s*팀장)?(\s*[(（][^)）]*[)）])?([,/·\s]+[가-힣]{2,4}(\s*[(（][^)）]*[)）])?)*$")
_PHONE = re.compile(r"^[☎☏]?\s*\d{4}(\s+\d{4})*$")
_DUTY_MARK = re.compile(r"^[◦oㅇㅁ⁃‧․\-\*•·]\s?|^\d+\.\s")


def _is_staffish(c: str) -> bool:
    c = c.strip()
    if not c or c == "-":
        return False
    return bool(_NAME.match(c) or _PHONE.match(c) or re.match(r"^[가-힣]{2,4}\s*[(（]\s*[☎☏]?\d{4}", c) or re.match(r"^팀장$", c))


def _is_header(cells: list) -> bool:
    joined = " ".join(cells)
    return (any(re.search(r"담당|성\s*명|이름", c) for c in cells) and any(re.search(r"구분|분류|항\s*목|업무|직무|내용|연락처|번호", c) for c in cells)
            and not any(_PHONE.match(c) for c in cells) and len(joined) < 80)


def _col_type(h: str, i: int, n: int) -> str:
    """헤더 셀 → 열 종류. 구분·분류·항목 = role / 세부·내용·업무·직무 = duty(담당업무 포함) / 담당·성명·이름·연락처·내선·정·부 = staff / 첫 열 번호 = index."""
    h = h or ""
    if i == 0 and re.search(r"^(번\s*호|No\.?|순번)$", h, re.I):
        return "index"
    if re.search(r"구분|분류|항\s*목", h):
        return "role"
    if re.search(r"세부|내용|업무|직무", h) and not re.match(r"^담당(자)?(\s*[(（].*[)）])?$", h):
        return "duty"
    if re.search(r"담당|성\s*명|이름|연락처|내선|^정$|^부$", h) or (i == n - 1 and re.search(r"번호", h)):
        return "staff"
    return "role"


def _col_types(header: list) -> list:
    types = [_col_type(h, i, len(header)) for i, h in enumerate(header)]
    duties = [i for i, t in enumerate(types) if t == "duty"]
    for i in duties[:-1]:                     # duty 열이 여럿이면 마지막만 업무, 앞은 구분(예: 업무 | 업무내용 | 담당자)
        types[i] = "role"
    if "duty" not in types:                   # duty 가 없으면 staff 앞의 마지막 role 을 업무로
        roles = [i for i, t in enumerate(types) if t == "role"]
        if roles:
            types[roles[-1]] = "duty"
    return types


def _eff_header(cur: dict) -> list:
    """헤더 + 보조 헤더를 펼친 실제 열 목록. [항목|업무내용|담당자]+[정|부] → [항목,업무내용,담당자(정),담당자(부)],
    [업무 분류|담당(지원)]+[대분류|중분류|소분류] → [대분류,중분류,소분류,담당(지원)]."""
    header = list(cur.get("header") or [])
    sub = cur.get("subheader") or []
    if header and sub:
        types = _col_types(header)
        if all(re.match(r"^(정|부)$", c) for c in sub):
            si = [i for i, t in enumerate(types) if t == "staff"]
            if si:
                i = si[-1]
                header = header[:i] + [header[i] + "(" + c + ")" for c in sub] + header[i + 1:]
        elif len(sub) >= 2:
            ri = [i for i, t in enumerate(types) if t != "staff"]
            if ri:
                i = ri[0]
                header = header[:i] + sub + header[i + 1:]
    return header


def _n_staff_cols(cur: dict) -> int:
    """실제 열 목록에서 담당 계열 열 수(담당자·정·부·연락처·내선·마지막 '번호')."""
    header = _eff_header(cur)
    n = sum(1 for t in _col_types(header) if t == "staff") if header else 0
    return max(n, 1)


def _map_by_header(cells: list, header: list):
    types = _col_types(header)
    role = " > ".join(c for c, t in zip(cells, types) if t == "role" and c)
    duty = " ".join(c for c, t in zip(cells, types) if t == "duty")
    staff = " / ".join(c for c, t in zip(cells, types) if t == "staff" and c and c != "-")
    return {"role": role, "duties": duty, "staff": staff}


def _map_full_row(cur: dict, cells: list):
    """셀 수가 실제 열 수와 같으면 열 종류대로 배치. 담당 열이 가운데 오는 표('구분|성명|세부내용|연락처')는
    셀이 모자라도(앞 구분 열이 rowspan) 오른쪽 정렬로 배치한다."""
    header = _eff_header(cur)
    if not header:
        return None
    if len(cells) == len(header):
        return _map_by_header(cells, header)
    types = _col_types(header)
    staff_idx = [i for i, t in enumerate(types) if t == "staff"]
    duty_idx = [i for i, t in enumerate(types) if t == "duty"]
    if staff_idx and duty_idx and min(staff_idx) < max(duty_idx) and 1 < len(cells) < len(header):
        return _map_by_header(cells, header[len(header) - len(cells):])      # 담당이 가운데 → 오른쪽 정렬
    return None


def _add_row(cur: dict, cells: list) -> None:
    """표 형식이 팀마다 다르다(직무|내용|담당 / 항목|내용|정|부 / 대·중·소분류|담당 / 성명|연락처|업무 / 번호|대|중|내용|정|부).
    규칙: 헤더의 담당 계열 열 수(n)만큼 오른쪽 셀 = 담당(단, 긴 문장은 담당이 아님), 남은 셀의 마지막 = 업무, 그 앞 = 구분.
    rowspan 으로 빠진 구분·담당은 직전 행에서 이어받는다. '성명|연락처|업무' 꼴(사무국)은 왼쪽이 담당."""
    cells = [c for c in cells if c != ""]
    if not cells:
        return
    header = cur.get("header") or []
    prev = cur["rows"][-1] if cur["rows"] else None
    if header and re.search(r"성\s*명|이름", header[0] or ""):          # 담당이 왼쪽
        staff = cells[0] + (" (" + cells[1] + ")" if len(cells) > 2 and _PHONE.match(cells[1]) else "")
        cur["rows"].append({"role": "", "duties": " ".join(cells[2:] if len(cells) > 2 else cells[1:]), "staff": staff})
        return
    full = _map_full_row(cur, cells)
    if full:
        if not full["staff"] and prev:
            full["staff"] = prev["staff"]
        if not full["role"] and prev:
            full["role"] = prev["role"]
        cur["rows"].append(full)
        return
    if header and re.search(r"번호|No", header[0] or "", re.I) and re.match(r"^\d{1,3}$", cells[0]):
        cells = cells[1:]
    if len(cells) == 1:                                                  # 업무만 있는 행(구분·담당 rowspan)
        cur["rows"].append({"role": prev["role"] if prev else "", "duties": cells[0], "staff": prev["staff"] if prev else ""})
        return
    n = _n_staff_cols(cur)
    k = min(n, len(cells) - 1)
    # 담당 셀은 짧다(이름·내선). 긴 문장이 잡히면 담당 열 수를 줄인다
    while k > 0 and (len(cells[-k]) > 24 and not re.search(r"\d{4}", cells[-k]) and not _NAME.match(cells[-k])):
        k -= 1
    staff_cells, body = cells[len(cells) - k:] if k else [], cells[: len(cells) - k] if k else cells
    duties = body[-1]
    role = " > ".join(body[:-1]) if len(body) > 1 else (prev["role"] if prev else "")
    staff = " / ".join(c for c in staff_cells if c != "-") if staff_cells else (prev["staff"] if prev else "")
    cur["rows"].append({"role": role, "duties": duties, "staff": staff})


def parse_dump(text: str) -> dict:
    """staffRender 덤프 형식:
    === KKWIKI-STAFF v1 | exported ... | board ... | teams N ===
    ## 팀: 재무팀 | 글번호 NNNNN | 게시일 08-18 17:58 | 게시자 김키키 | 제목 ... | id NEW... | pos 0
    | 직무구분 | 직무 내용 | 담당 |
    | 팀장 | ◦ 재무업무 총괄 | 김키키 (NNNN) |
    (표 없음 — 이미지 게시글)
    """
    m = re.search(r"=== KKWIKI-STAFF v1 \| exported ([^|]+)\| board ([^|]+)\| teams (\d+)(?: \| run (\w+))? ===", text)
    meta = {"exported": (m.group(1).strip() if m else ""), "board": (m.group(2).strip() if m else ""), "teams_declared": int(m.group(3)) if m else 0,
            "run": (m.group(4) or "") if m else "", "has_header": bool(m), "has_end": "=== END ===" in text,
            "ocr": "화면 확대 캡처로 판독" in text}
    teams = []
    cur = None
    for line in text.splitlines():
        line = line.rstrip()
        if line.startswith("## 팀:"):
            fields = [x.strip() for x in line[len("## 팀:"):].split("|")]
            cur = {"team": norm_team(fields[0]), "rows": [], "note": ""}
            for f in fields[1:]:
                for key, name in (("글번호", "no"), ("게시일", "date"), ("게시자", "poster"), ("제목", "title"), ("id", "id"), ("url", "url"), ("pos", "pos"), ("기준일", "asof")):
                    if f.startswith(key):
                        cur[name] = f[len(key):].strip()
            teams.append(cur)
        elif cur is not None and line.startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if not cells or re.match(r"^:?-+:?$", cells[0]):
                continue
            if _is_header(cells):
                cur["header"] = cells
                continue
            if all(len(c) <= 3 for c in cells) and not cur["rows"]:   # 정/부, 대분류|중분류|소분류 같은 보조 헤더
                cur["subheader"] = cells
                continue
            _add_row(cur, cells)
        elif cur is not None and line.startswith("(표 없음"):
            cur["note"] = line.strip("() ")
    # 기준일: 제목의 '26.8.28 / 2026.07.01 / 26.08.18 등에서 추출
    for t in teams:
        mm = re.search(r"[\(（'`‘]?\s*(\d{2,4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})", t.get("title", ""))
        if mm:
            y = mm.group(1); y = ("20" + y) if len(y) == 2 else y
            t["asof"] = f"{y}-{int(mm.group(2)):02d}-{int(mm.group(3)):02d}"
    return {"meta": meta, "teams": teams}


def _old_mark(t: dict) -> str:
    return " ⚠오래됨" if t.get("old") else ""


def _kind(t: dict) -> str:
    """새 덤프 팀 항목의 성격: table / image(이미지 게시글) / error(수집 오류) / unparsed(표 인식 실패)."""
    if t.get("rows"):
        return "table"
    note = t.get("note") or ""
    if "수집 오류" in note or re.search(r"timeout|Error|오류", note):
        return "error"
    if "표 인식 실패" in note:
        return "unparsed"
    return "image"


def cmd_import(root: str, paths: list, since: str = "2025-01-01", keep: bool = False, force: bool = False) -> None:
    """여러 덤프를 합친다(뒤 파일이 같은 팀을 덮어씀 — OCR 보정본·재수집본 반영용).
    기간 정책(사용자 2026-09-25): since(기본 2025-01-01) 이후 글이 있는 부서가 기본이고, 그 이후 글이 없는 존속 부서는 그 전 최신 글을 쓰되 old=True(⚠오래됨)로 표시한다.
    보호(2026-09-27 — 담당자표는 중대 자산):
      · 수집 오류·표 인식 실패로 표가 빈 팀은 기존 표를 유지한다(새 글이면 '새 글 읽기 실패' 표시).
      · 이미지 게시글인데 같은 글번호의 기존 표(OCR 판독본)가 있으면 그 표를 유지한다. 글번호가 바뀌었으면 새 글로 두고 OCR 필요를 알린다.
      · --keep 이 없는데 기존 팀이 새 덤프에서 빠지면 저장하지 않는다(일부만 든 덤프면 --keep, 정말 없어진 팀이면 --force).
      · 머리줄의 팀 수와 읽은 팀 수가 다르거나 끝 표시(=== END ===)가 없으면 잘린 덤프로 보고 저장하지 않는다(--force 로 무시)."""
    d0 = staff_dir(root)
    jp = os.path.join(d0, "staff.json")
    prev = json.load(open(jp, encoding="utf-8")) if os.path.exists(jp) else None
    prev_by = {t["team"]: t for t in (prev or {}).get("teams", [])}
    new_teams, order, problems = {}, [], []
    meta = {}
    for path in paths:
        d = parse_dump(io.open(path, encoding="utf-8-sig").read())
        mt = d["meta"]
        if mt.get("has_header"):
            meta = mt
            seen_n = len({t["team"] for t in d["teams"]})
            if (mt["teams_declared"] and seen_n != mt["teams_declared"]) or not mt.get("has_end"):
                problems.append(f"{os.path.basename(path)}: 머리줄 {mt['teams_declared']}팀인데 {seen_n}팀을 읽음" + ("" if mt.get("has_end") else ", 끝 표시(=== END ===) 없음") + " — 덤프가 잘렸을 수 있음")
        for t in d["teams"]:
            if mt.get("ocr") or "_ocr" in os.path.basename(path):
                t["ocr"] = True
            if t["team"] not in new_teams:
                order.append(t["team"])
            new_teams[t["team"]] = t                      # 같은 팀이 여러 번이면 뒤 것이 이긴다(보정 덤프와 같은 규칙)
    if not new_teams:
        raise SystemExit("[kk-wiki] 덤프에서 팀을 찾지 못했습니다 (형식: '## 팀: ...' 줄 필요) — 아무것도 바꾸지 않았습니다")
    if problems and not force:
        raise SystemExit("[kk-wiki] 저장하지 않았습니다 — " + " / ".join(problems) + ". 코어로 다시 받거나(staffDownload), 확인했으면 --force")
    kept_err, kept_ocr, need_ocr, changed = [], [], [], []
    merged = {}
    for name in order:
        t, old = new_teams[name], prev_by.get(name)
        k = _kind(t)
        if k in ("error", "unparsed") and old and old.get("rows"):
            o = dict(old)
            if str(old.get("no", "")) != str(t.get("no", "")):
                o["read_fail_no"] = t.get("no", "")
            merged[name] = o
            kept_err.append(f"{name}({'수집 오류' if k == 'error' else '표 인식 실패'})")
            continue
        if k == "image" and old and old.get("rows"):
            if str(old.get("no", "")) == str(t.get("no", "")):
                merged[name] = old
                kept_ocr.append(name)
                continue
            need_ocr.append(f"{name}(#{t.get('no', '')})")
        if not old or str(old.get("no", "")) != str(t.get("no", "")):
            changed.append(name)
        merged[name] = t
    if keep and prev:
        teams = [merged.get(t["team"], t) for t in prev["teams"]] + [merged[n] for n in order if n not in prev_by]
    else:
        dropped = [n for n in prev_by if n not in merged]
        if dropped and not force:
            raise SystemExit(f"[kk-wiki] 저장하지 않았습니다 — 기존 {len(prev_by)}팀 중 {len(dropped)}팀이 새 덤프에 없습니다({', '.join(dropped[:8])}{' …' if len(dropped) > 8 else ''}). "
                             "일부 팀만 다시 받은 덤프면 --keep(기존 팀 유지), 조직 개편 등으로 정말 없어진 팀이면 --force")
        teams = [merged[n] for n in order]
    data = {"meta": meta or (prev or {}).get("meta", {}), "teams": teams}
    old = []
    for t in data["teams"]:
        d1 = (t.get("asof") or t.get("date") or "")[:10]
        t["old"] = bool(since and re.match(r"^\d{4}-\d{2}-\d{2}$", d1) and d1 < since)
        if t["old"]:
            old.append(f"{t['team']}({d1})")
    data["since"] = since or ""
    data["old_teams"] = old
    if os.path.exists(jp):
        hist = os.path.join(d0, "_history"); os.makedirs(hist, exist_ok=True)
        os.replace(jp, os.path.join(hist, f"staff_{time.strftime('%y%m%d_%H%M%S')}.json"))
    data["imported_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    json.dump(data, open(jp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    lines = [f"# 부서별 업무분장표 — 담당자 (수집 {data['imported_at'][:10]}, {len(data['teams'])}팀, 기준 {since or '전체'}~ 우선)", "",
             "출처: KIST 포탈 > 게시판 > 부서별업무분장표 (부서별 최신 게시글). 내부 자료 — 각자 PC 에만.", ""]
    for t in data["teams"]:
        lines.append(f"## {t['team']}  (게시글 #{t.get('no', '')}, 기준 {t.get('asof') or t.get('date', '')}{_old_mark(t)}{' · 이미지 판독' if t.get('ocr') else ''}, 게시자 {t.get('poster', '')})")
        if t.get("url"):
            lines.append(f"링크: {t['url']}")
        if t.get("read_fail_no"):
            lines.append(f"_⚠ 새 게시글 #{t['read_fail_no']} 을 읽지 못해 이전 표를 유지 — 다시 수집 필요_")
        if t["rows"]:
            lines.append("| 직무구분 | 직무 내용 | 담당 |"); lines.append("|---|---|---|")
            for r in t["rows"]:
                lines.append(f"| {r['role']} | {r['duties']} | {r['staff']} |")
        else:
            lines.append(f"_{t.get('note') or '표 없음'} — 포탈 게시판에서 게시글 #{t.get('no', '')} 직접 확인_")
        lines.append("")
    io.open(os.path.join(d0, "staff.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    n_tbl = sum(1 for t in data["teams"] if t["rows"])
    n_prev = len(prev_by)
    print(f"[kk-wiki] 담당자표 저장: {len(data['teams'])}팀 (표 있음 {n_tbl}, 이미지·본문만 {len(data['teams']) - n_tbl}) → {d0}"
          f" | 이전 {n_prev}팀 → {len(data['teams'])}팀, 새 글 {len(changed)}" + (f", 이전 표 유지 {len(kept_err)}" if kept_err else "") + (f", 판독본 유지 {len(kept_ocr)}" if kept_ocr else ""))
    if kept_err:
        print(f"  ⚠ 읽기 실패로 이전 표를 유지한 팀: {', '.join(kept_err)} — 탭을 앞에 두고 그 팀만 다시 수집(staffCollect({{list}}))")
    if need_ocr:
        print(f"  ⚠ 새 이미지 게시글 — 판독(OCR) 필요: {', '.join(need_ocr)} (이전 판독본은 _history 에)")
    if old:
        print(f"  ⚠ {since} 이후 글이 없어 그 전 글을 쓴 팀 {len(old)}: {', '.join(old)} (부서 존속 여부 확인)")


def cmd_known(root: str) -> None:
    """팀별 글번호 JSON 한 줄 — 브라우저 코어 staffChanged(known) 에 그대로 붙여 넣는다."""
    data = load(root)
    def _no(v):
        m = re.search(r"\d+", str(v or ""))
        return int(m.group()) if m else 0
    print(json.dumps({t["team"]: _no(t.get("no")) for t in data["teams"]}, ensure_ascii=False, separators=(",", ":")))


def load(root: str) -> dict:
    jp = os.path.join(staff_dir(root), "staff.json")
    if not os.path.exists(jp):
        raise SystemExit("[kk-wiki] 담당자표가 없습니다 — 브라우저 코어로 수집 후 `wiki_staff.py import <dump.txt>`")
    return json.load(open(jp, encoding="utf-8"))


def cmd_find(root: str, terms: list, top: int) -> None:
    data = load(root)
    pats = [re.compile("|".join(re.escape(x) for x in t.split("|") if x), re.I) for t in terms]
    hits = []
    for t in data["teams"]:
        for r in t["rows"]:
            hay = f"{r['role']} {r['duties']}"
            if all(p.search(hay) for p in pats):
                score = sum(len(p.findall(hay)) for p in pats) + (3 if any(p.search(r["role"]) for p in pats) else 0)
                hits.append((score, t, r))
    hits.sort(key=lambda x: (bool(x[1].get("old")), -x[0]))   # 최근 글 있는 팀 먼저, 그 안에서 점수순 (⚠오래됨 팀은 뒤로)
    print(f"[kk-wiki] 담당자 '{' AND '.join(terms)}' → {len(hits)}건 (수집 {data.get('imported_at', '')[:10]})")
    for score, t, r in hits[:top]:
        print(f"- {t['team']} | {r['role']} | {r['staff']} | 기준 {t.get('asof') or t.get('date', '')}{_old_mark(t)}{' | 이미지 판독' if t.get('ocr') else ''}{' | ⚠새 글 미반영' if t.get('read_fail_no') else ''} | {r['duties'][:90]}" + (f"\n    링크 {t['url']}" if t.get('url') else ""))
    noimg = [t["team"] for t in data["teams"] if not t["rows"]]
    if noimg:
        print(f"  ※ 표가 이미지라 검색 안 되는 팀: {', '.join(noimg)}")


def cmd_team(root: str, name: str) -> None:
    data = load(root)
    for t in data["teams"]:
        if norm_team(name) in t["team"]:
            print(f"## {t['team']} (#{t.get('no', '')}, 기준 {t.get('asof') or t.get('date', '')}{_old_mark(t)}, 게시자 {t.get('poster', '')})")
            for r in t["rows"]:
                print(f"- {r['role']} | {r['staff']} | {r['duties'][:120]}")
            if not t["rows"]:
                print(f"  ({t.get('note') or '표 없음'})")
            return
    print("해당 팀 없음. 팀 목록:", ", ".join(t["team"] for t in data["teams"]))


def cmd_status(root: str) -> None:
    data = load(root)
    teams = data["teams"]
    print(f"[kk-wiki] 담당자표: {len(teams)}팀, 수집 {data.get('imported_at', '')}, 표 있음 {sum(1 for t in teams if t['rows'])}, 기준 {data.get('since') or '전체'}~ 우선(⚠오래됨 = 그 이후 글 없음)")
    for t in teams:
        print(f"  {t['team']:14s} #{t.get('no', ''):6s} 기준 {t.get('asof') or t.get('date', ''):10s} {'표 ' + str(len(t['rows'])) + '행' if t['rows'] else '(이미지·본문만)'}{_old_mark(t)}")


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["import", "find", "team", "status", "known"])
    ap.add_argument("args", nargs="*")
    ap.add_argument("--root")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--since", default="2025-01-01", help="이 날짜 이후 글이 없는 팀에 ⚠오래됨 표시 (빈 문자열이면 표시 안 함)")
    ap.add_argument("--keep", action="store_true", help="import: 기존 staff.json 의 팀을 유지하고 새 덤프의 팀만 덮어씀(차분 갱신)")
    ap.add_argument("--from-downloads", action="store_true", help="import: 다운로드 폴더의 kiki_staff_dump_*.txt(코어 staffDownload 결과)를 staff/ 로 복사해 가져온다")
    ap.add_argument("--expect", default="", help="import --from-downloads: 코어가 알려 준 run id — 그 run 의 덤프만 쓴다(옛 파일 오사용 방지)")
    ap.add_argument("--force", action="store_true", help="import: 기존 팀이 새 덤프에서 빠지거나 덤프가 잘려 보여도 그대로 저장(조직 개편 등 확인된 경우만)")
    a = ap.parse_intermixed_args(argv)   # `import --keep <덤프>` 처럼 옵션이 파일 앞에 와도 되게
    root = snapshot_root(a.root)
    if a.cmd == "import":
        paths = list(a.args)
        if a.from_downloads:
            src, why = pick_download("kiki_staff_dump_*.txt", a.expect, hint="코어 staffDownload()")
            if not src:
                raise SystemExit("[kk-wiki] " + why)
            if not a.expect:
                print(f"[kk-wiki] ⚠ --expect 없이 가장 최근 덤프를 씁니다: {os.path.basename(src)} — 방금 내려받은 파일이 맞는지 확인")
            import shutil
            d = staff_dir(root); os.makedirs(d, exist_ok=True)
            dst = os.path.join(d, "staff_dump_" + time.strftime("%y%m%d_%H%M") + ".txt")
            shutil.copy2(src, dst); print("[kk-wiki] 덤프 복사:", src, "→", dst)
            paths = [dst] + paths
        if not paths:
            raise SystemExit("import <dump.txt> [보정덤프.txt ...]  또는  import --from-downloads [--keep]")
        cmd_import(root, paths, a.since, a.keep, a.force)
    elif a.cmd == "find":
        if not a.args:
            raise SystemExit("find <단어...>")
        cmd_find(root, a.args, a.top)
    elif a.cmd == "team":
        if not a.args:
            raise SystemExit("team <팀명>  (예: team 재무팀)")
        cmd_team(root, a.args[0])
    elif a.cmd == "status":
        cmd_status(root)
    elif a.cmd == "known":
        cmd_known(root)


if __name__ == "__main__":
    main()
