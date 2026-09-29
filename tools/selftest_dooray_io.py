# -*- coding: utf-8 -*-
"""kk-dry dooray_io.py 오프라인 시험 — 127.0.0.1 가짜 Dooray 서버(공식 API 흉내 + 파일 호스트 307)로 쓰기·받기를 검사한다.
실제 계정·네트워크·실데이터 없음. tools/selftest.sh 가 부른다(직접: python tools/selftest_dooray_io.py).
확인하는 것: 미리보기는 아무것도 안 함 / --yes 만 실행 / 307 따라가 받기·올리기 / 다른 호스트로는 토큰 안 보냄 /
  같은 이름 덮어쓰기 없음 / 사람·프로젝트가 모호하면 멈춤(코드 2) / 토큰 만료·없음은 한 줄 안내 / 파일 대신 오류 응답이면 저장 안 함 /
  파일 주소 넘김은 3번까지·웹 화면(HTML)은 저장 안 함 / 멤버 100명 넘는 프로젝트는 쪽을 넘겨 찾고, 끝까지 못 읽으면 '멤버 아님'으로 단정 안 함."""
import io, json, os, re, subprocess, sys, tempfile, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SCRIPT = os.path.join(REPO, "skills", "kk-dry", "scripts", "dooray_io.py")
TOKEN = "test-token-000000000000:abcdef"
S = {"mode": "ok", "calls": [], "port": 0}
ALIAS = {"111111": "P1", "222222": "T1", "333333": "X1", "444444": "FO", "555555": "XE", "666666": "R7", "777777": "H8"}
OKH = {"isSuccessful": True, "resultCode": 0, "resultMessage": ""}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj=None, raw=None, ctype="application/json", loc=None):
        data = raw if raw is not None else json.dumps(obj if obj is not None else {}, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        if loc:
            self.send_header("Location", loc)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def ok(self, result, **kw):
        self.send(200, dict(header=OKH, result=result, **kw))

    def base(self):
        return f"http://127.0.0.1:{S['port']}"

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def route(self, m):
        for k, v in ALIAS.items():   # 시험 링크의 숫자 별칭 → 가짜 서버 id
            self.path = self.path.replace(k, v)
        u = urlsplit(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        p = u.path
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else b""
        fn = re.search(rb'filename="([^"]*)"', body)
        S["calls"].append({"m": m, "p": p, "q": q, "auth": self.headers.get("Authorization", ""), "body": body,
                           "filename": fn.group(1).decode("utf-8", "replace") if fn else None})
        if S["mode"] == "401" or self.headers.get("Authorization") != "dooray-api " + TOKEN:
            return self.send(401, {"header": {"isSuccessful": False, "resultCode": -401, "resultMessage": "unauthorized"}})
        B = self.base()
        if p == "/common/v1/members/me":
            return self.ok({"id": "M0", "name": "김키키"})
        if p == "/common/v1/members":
            db = {"이키키": [{"id": "M1", "name": "이키키", "externalEmailAddress": "lee@example.org"}],
                  "박키키": [{"id": "M2", "name": "박키키", "externalEmailAddress": "park1@example.org"}, {"id": "M3", "name": "박키키", "externalEmailAddress": "park2@example.org"}],
                  "최키키": [{"id": "M4", "name": "최키키", "externalEmailAddress": "choi@example.org"}],
                  "정키키": [{"id": "M5", "name": "정키키", "externalEmailAddress": "jung@example.org"}]}
            if q.get("name") == "한키키":   # 같은 이름이 쪽마다 100명씩 끝없이 — 사람 찾기를 끝까지 못 읽음(재검토 R2)
                pg = int(q.get("page", "0"))
                return self.ok([{"id": f"H{pg}_{i}", "name": "한키키", "externalEmailAddress": f"h{pg}_{i}@example.org"} for i in range(100)])
            return self.ok(db.get(q.get("name"), []))
        if p == "/project/v1/projects":
            if q.get("type") == "private":
                return self.ok([{"id": "PP", "code": "private-project", "drive": {"id": "DP"}, "type": "private", "state": "active"}])
            if q.get("state") == "archived":
                return self.ok([])
            return self.ok([{"id": "P1", "code": "○○-공동연구", "drive": {"id": "D1"}, "type": "public", "state": "active"},
                            {"id": "P2", "code": "○○-공동연구-준비", "drive": {"id": "D2"}, "type": "public", "state": "active"},
                            {"id": "P3", "code": "○○-전체", "drive": {"id": "D3"}, "type": "public", "state": "active"}])
        if p == "/project/v1/projects/P1":
            return self.ok({"id": "P1", "code": "○○-공동연구", "drive": {"id": "D1"}, "type": "public"})
        if p == "/project/v1/projects/P1/members":   # 멤버 101명 — 둘째 쪽에 정키키(M5)
            first = [{"organizationMemberId": x} for x in ("M0", "M1", "M2", "M3")] + [{"organizationMemberId": f"Z{i}"} for i in range(96)]
            return self.ok(first if q.get("page", "0") == "0" else [{"organizationMemberId": "M5"}], totalCount=101)
        if p == "/project/v1/projects/P3/members":   # 쪽마다 100명이 끝없이(totalCount 없음) — 끝까지 못 읽는 프로젝트
            pg = int(q.get("page", "0"))
            return self.ok([{"organizationMemberId": f"Y{pg}_{i}"} for i in range(100)])
        if p in ("/project/v1/projects/P1/posts/T1", "/project/v1/projects/P1/posts/T9"):
            return self.ok({"id": p.rsplit("/", 1)[1], "number": 7, "subject": "○○ 보고서"})
        if p == "/project/v1/projects/P1/posts/T1/files" and m == "GET":
            return self.ok([{"id": "F1", "name": "보고서:초안?.hwp", "size": 7}, {"id": "F2", "name": "b.docx", "size": 3}, {"id": "F9", "name": "evil.bin", "size": 1}])
        mf = re.fullmatch(r"/project/v1/projects/P1/posts/T1/files/(F\d)", p)
        if mf and q.get("media") == "raw":
            return self.send(307, loc=("https://evil.example.com/x" if mf.group(1) == "F9" else f"{B}/file-api/{mf.group(1)}"))
        if p == "/file-api/F1":
            return self.send(200, raw=b"HWPDATA", ctype="application/octet-stream")
        if p == "/file-api/F2":
            return self.send(200, raw=b"DOC", ctype="application/octet-stream")
        if p == "/project/v1/projects/P1/posts" and m == "POST":
            return self.ok({"id": "T9"})
        if p == "/project/v1/projects/P1/posts/T1/logs" and m == "POST":
            return self.ok({"id": "L1"})
        if re.fullmatch(r"/project/v1/projects/P1/posts/T[19]/files", p) and m == "POST":
            return self.send(307, loc=f"{B}/file-api/upload-post")
        if p == "/file-api/upload-post":
            return self.ok({"id": "FA"})
        if p == "/drive/v1/drives/D1/files" and m == "GET":
            if q.get("subTypes") == "root":
                return self.ok([{"id": "R1", "type": "folder", "subType": "root", "name": "root"}])
            if q.get("parentId") == "R1":
                return self.ok([{"id": "X1", "name": "dup.txt", "type": "file", "size": 3, "updatedAt": "2026-09-01T10:00:00+09:00"},
                                {"id": "FO", "name": "2026", "type": "folder", "updatedAt": "2026-09-02T10:00:00+09:00"}], totalCount=2)
        if p == "/drive/v1/drives/D1/files" and m == "POST":
            return self.send(307, loc=f"{B}/file-api/drive-upload")
        if p == "/file-api/drive-upload":
            return self.ok({"id": "N1"})
        md = re.fullmatch(r"/drive/v1/drives/D1/files/(\w+)", p)
        if md:
            fid = md.group(1)
            if m == "PUT":
                return self.send(307, loc=f"{B}/file-api/drive-version")
            if q.get("media") == "meta":
                meta = {"X1": {"id": "X1", "name": "dup.txt", "type": "file", "size": 3},
                        "R7": {"id": "R7", "name": "loop.pdf", "type": "file", "size": 9},
                        "H8": {"id": "H8", "name": "page.pdf", "type": "file", "size": 9},
                        "XE": {"id": "XE", "name": "err.json", "type": "file", "size": 9},
                        "FO": {"id": "FO", "name": "2026", "type": "folder"}}.get(fid)
                if meta:
                    return self.ok(dict(meta, parentFile={"id": "R1", "path": "root"}))
            if q.get("media") == "raw":
                return self.send(307, loc=f"{B}/file-api/{fid}")
        if p == "/file-api/X1":
            return self.send(200, raw=b"abc", ctype="text/plain")
        if p == "/file-api/R7":   # 파일 호스트가 계속 다시 넘김
            return self.send(302, raw=b"<html>redirect</html>", ctype="text/html", loc=f"{B}/file-api/R7")
        if p == "/file-api/H8":   # 파일 대신 웹 화면
            return self.send(200, raw=b"<html>login</html>", ctype="text/html; charset=utf-8")
        if p == "/file-api/XE":
            return self.send(200, {"header": {"isSuccessful": False, "resultCode": -1, "resultMessage": "file gone"}})
        if p == "/file-api/drive-version":
            return self.ok({"id": "X1"})
        return self.send(404, {"header": {"isSuccessful": False, "resultMessage": "not found " + p}})


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    S["port"] = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="kkdooray_io_")
    dl, home = os.path.join(tmp, "dl"), os.path.join(tmp, "home")
    env = dict(os.environ, DOORAY_TOKEN=TOKEN, KIKI_DOORAY_API=f"http://127.0.0.1:{S['port']}", KIKI_HOME=home,
               KIKI_ROOT=os.path.join(tmp, "root"), KIKI_DOWNLOADS=dl, PYTHONIOENCODING="utf-8")
    env.pop("KIKI_INSECURE_TLS", None)

    def run(*args, **over):
        e = dict(env, **over)
        r = subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, encoding="utf-8", errors="replace", env=e, timeout=60)
        return r.returncode, r.stdout + r.stderr

    n = [0, 0]

    def ok(name, cond, info=""):
        n[0] += 1
        if not cond:
            n[1] += 1
        print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  ← " + str(info)[:400]))

    def calls(pred):
        return [c for c in S["calls"] if pred(c)]

    # 링크 파서는 6자리 이상 숫자 id 만 받는다 → 시험 링크는 숫자 별칭을 쓰고, 가짜 서버가 요청 경로의 별칭을 읽기 쉬운 id(P1·T1…)로 바꿔 받는다
    TASK = "https://kist.gov-dooray.com/task/111111/222222"
    ROOT = "https://kist.gov-dooray.com/drive/111111"
    FILE_X1 = "https://kist.gov-dooray.com/drive/111111/views/333333"
    FOLDER_FO = "https://kist.gov-dooray.com/drive/111111/views/444444"
    FILE_XE = "https://kist.gov-dooray.com/drive/111111/views/555555"

    rc, out = run("check")
    ok("check → 인증 OK(토큰 값 출력 없음)", rc == 0 and "인증 OK — 김키키" in out and TOKEN not in out, out)
    rc, out = run("check", DOORAY_TOKEN="", KIKI_HOME=os.path.join(tmp, "nohome"), KIKI_ROOT=os.path.join(tmp, "noroot"))
    ok("토큰 없음 → 한 줄 안내(코드 1, Traceback 없음)", rc == 1 and "토큰이 필요합니다" in out and "Traceback" not in out, out)
    rc, out = run("resolve", TASK)
    ok("resolve 업무 링크 → 프로젝트·번호", rc == 0 and "○○-공동연구" in out and "#7" in out, out)

    S["calls"].clear()
    rc, out = run("task-download", TASK, "--all")
    ok("task-download 미리보기 → 받지 않음", rc == 0 and "[미리보기]" in out and not os.path.exists(dl) and not calls(lambda c: c["p"].startswith("/file-api/")), out)
    rc, out = run("task-download", TASK, "--file", "F1", "F2", "--yes")
    f1 = os.path.join(dl, "보고서_초안_.hwp")
    ok("task-download --yes → 307 따라 받기 + 이름 정리(: ? → _)", rc == 0 and os.path.exists(f1) and open(f1, "rb").read() == b"HWPDATA" and open(os.path.join(dl, "b.docx"), "rb").read() == b"DOC" and "[요약] 받음 2 / 실패 0" in out, out)
    ok("파일 호스트(같은 origin)엔 토큰을 들고 감", all(c["auth"] == "dooray-api " + TOKEN for c in calls(lambda c: c["p"].startswith("/file-api/F"))))
    rc, out = run("task-download", TASK, "--file", "F1", "--yes")
    ok("다시 받기 → ' (2)' 로 새 이름, 덮어쓰지 않음", rc == 0 and os.path.exists(os.path.join(dl, "보고서_초안_ (2).hwp")) and open(f1, "rb").read() == b"HWPDATA", out)
    rc, out = run("task-download", TASK, "--file", "F9", "--yes")
    ok("파일 주소가 dooray 가 아니면 멈춤(토큰 안 보냄)", rc == 1 and "dooray 가 아닙니다" in out and not os.path.exists(os.path.join(dl, "evil.bin")), out)
    rc, out = run("task-download", TASK)
    ok("받을 첨부를 안 고르면 코드 2", rc == 2 and "--file" in out, out)

    S["calls"].clear()
    rc, out = run("task-comment", TASK, "--text", "첫 줄\\n둘째 줄")
    ok("task-comment 미리보기 → POST 없음", rc == 0 and "[미리보기] 댓글" in out and not calls(lambda c: c["m"] == "POST"), out)
    rc, out = run("task-comment", TASK, "--text", "첫 줄\\n둘째 줄", "--yes")
    lg = calls(lambda c: c["m"] == "POST" and c["p"].endswith("/logs"))
    ok("task-comment --yes → 마크다운 댓글 1개", rc == 0 and len(lg) == 1 and json.loads(lg[0]["body"]) == {"body": {"mimeType": "text/x-markdown", "content": "첫 줄\n둘째 줄"}}, out)

    body_md = os.path.join(tmp, "body.md")
    io.open(body_md, "w", encoding="utf-8").write("## 할 일\n- 초안\n")
    att = os.path.join(tmp, "a.txt")
    open(att, "wb").write(b"x")
    S["calls"].clear()
    rc, out = run("task-create", "--project", "공동연구", "--subject", "S")
    ok("프로젝트 이름이 여럿 맞으면 코드 2 + 후보", rc == 2 and "○○-공동연구-준비" in out and not calls(lambda c: c["m"] == "POST"), out)
    rc, out = run("task-create", "--project", "○○-공동연구", "--subject", "S", "--to", "박키키")
    ok("같은 이름 두 명 → 코드 2 + 메일 후보, 만들지 않음", rc == 2 and "park1@example.org" in out and not calls(lambda c: c["m"] == "POST"), out)
    rc, out = run("task-create", "--project", "○○-공동연구", "--subject", "S", "--to", "최키키")
    ok("프로젝트 멤버 아님 → 코드 2", rc == 2 and "멤버가 아닙니다" in out, out)
    rc, out = run("task-create", "--project", "○○-공동연구", "--subject", "S", "--text-file", body_md, "--to", "이키키", "--cc", "나", "--attach", att)
    ok("task-create 미리보기 → 담당·참조·첨부 보여주고 POST 없음", rc == 0 and "담당: 이키키" in out and "참조: 나" in out and "a.txt" in out and not calls(lambda c: c["m"] == "POST"), out)
    rc, out = run("task-create", "--project", "○○-공동연구", "--subject", "S", "--text-file", body_md, "--to", "이키키", "--cc", "나", "--attach", att, "--yes")
    cp = calls(lambda c: c["m"] == "POST" and c["p"] == "/project/v1/projects/P1/posts")
    j = json.loads(cp[0]["body"]) if cp else {}
    up = calls(lambda c: c["p"] == "/file-api/upload-post")
    ok("task-create --yes → 제목·본문·담당(id)·참조(id)", rc == 0 and j.get("subject") == "S" and j.get("body", {}).get("content") == "## 할 일\n- 초안"
       and j["users"]["to"] == [{"type": "member", "member": {"organizationMemberId": "M1"}}] and j["users"]["cc"] == [{"type": "member", "member": {"organizationMemberId": "M0"}}], json.dumps(j, ensure_ascii=False))
    ok("task-create 첨부 → 307 따라 올리기(파일 이름 그대로) + 새 업무 링크", len(up) == 1 and up[0]["filename"] == "a.txt" and "/task/P1/T9" in out and "첨부 1/1" in out, out)

    dup = os.path.join(tmp, "dup.txt")
    open(dup, "wb").write(b"new")
    S["calls"].clear()
    rc, out = run("drive-upload", ROOT, dup)
    ok("drive-upload 같은 이름 → 코드 2, 올리지 않음", rc == 2 and "같은 이름" in out and not calls(lambda c: c["m"] in ("POST", "PUT")), out)
    rc, out = run("drive-upload", ROOT, dup, "--as-copy", "--yes")
    du = calls(lambda c: c["p"] == "/file-api/drive-upload")
    ok("--as-copy → 'dup (2).txt' 로 올림 + 어느 드라이브인지 표시", rc == 0 and len(du) == 1 and du[0]["filename"] == "dup (2).txt" and "○○-공동연구 /" in out, out)
    rc, out = run("drive-upload", ROOT, dup, "--new-version", "--yes")
    ok("--new-version → 같은 파일에 PUT(새 버전)", rc == 0 and calls(lambda c: c["m"] == "PUT" and c["p"] == "/file-api/drive-version"), out)
    rc, out = run("drive-ls", ROOT)
    ok("drive-ls → 폴더 먼저 + 링크(폴더 = 그 폴더, 파일 = 이 폴더에서 선택된 채)", rc == 0 and re.search(r"0 \| 폴더 \| 2026 .*\| https://kist\.gov-dooray\.com/drive/111111/FO$", out, re.M)
       and re.search(r"1 \| 파일 \| dup\.txt .*\| https://kist\.gov-dooray\.com/drive/111111/R1/views/X1$", out, re.M), out)
    rc, out = run("drive-download", FILE_X1, "--to", os.path.join(tmp, "dl2"), "--yes")
    ok("drive-download --yes → 받음", rc == 0 and open(os.path.join(tmp, "dl2", "dup.txt"), "rb").read() == b"abc", out)
    rc, out = run("drive-download", "https://kist.gov-dooray.com/drive/111111/444444/views/333333", "--to", os.path.join(tmp, "dl4"))
    ok("찾기 결과 새 링크(…/{폴더}/views/{파일})도 파일로 읽음(폴더로 오인 안 함)", rc == 0 and "dup.txt" in out and "폴더입니다" not in out, out)
    rc, out = run("drive-download", "https://kist.gov-dooray.com/drive/111111/views/333333?query=all%3Ddup.txt", "--to", os.path.join(tmp, "dl4"))
    ok("검색어 붙은 대안 링크(…/views/{파일}?query=…)도 파일로", rc == 0 and "dup.txt" in out, out)
    rc, out = run("drive-download", FOLDER_FO)
    ok("폴더 링크를 받기에 주면 멈춤", rc == 1 and "폴더입니다" in out, out)
    rc, out = run("drive-download", FILE_XE, "--to", os.path.join(tmp, "dl3"), "--yes")
    ok("파일 대신 오류 응답 → 저장 안 함(.part 도 없음)", rc == 1 and "오류 응답" in out and not [x for x in os.listdir(os.path.join(tmp, "dl3"))], out)
    d5, d6 = os.path.join(tmp, "dl5"), os.path.join(tmp, "dl6")
    rc, out = run("drive-download", "https://kist.gov-dooray.com/drive/111111/views/666666", "--to", d5, "--yes")
    ok("codex M2 파일 호스트가 계속 다시 넘기면 3번에서 멈춤·저장 안 함", rc == 1 and "끝나지 않습니다" in out and not (os.path.isdir(d5) and os.listdir(d5))
       and len(calls(lambda c: c["p"] == "/file-api/R7")) == 3, out)
    rc, out = run("drive-download", "https://kist.gov-dooray.com/drive/111111/views/777777", "--to", d6, "--yes")
    ok("codex M2 파일 대신 웹 화면(HTML)이면 저장 안 함(.part 도 없음)", rc == 1 and "웹 화면" in out and not (os.path.isdir(d6) and os.listdir(d6)), out)
    rc, out = run("task-create", "--project", "○○-공동연구", "--subject", "S", "--to", "정키키")
    ok("codex M5 멤버가 100명 넘는 프로젝트 — 둘째 쪽의 멤버도 찾음", rc == 0 and "담당: 정키키" in out, out)
    rc, out = run("task-create", "--project", "○○-전체", "--subject", "S", "--to", "최키키")
    ok("codex M5 멤버를 끝까지 못 읽으면 '멤버 아님'으로 단정하지 않고 코드 2", rc == 2 and "끝까지 확인하지 못했습니다" in out and "멤버가 아닙니다" not in out, out)
    rc, out = run("members", "최키키", "--project", "○○-전체")
    ok("codex M5 members 명령도 '모름'으로 표시", rc == 0 and "프로젝트 멤버인지 모름" in out, out)
    rc, out = run("task-create", "--project", "○○-공동연구", "--subject", "S", "--to", "한키키")
    ok("재검토 R2 같은 이름이 300명 넘으면 '멤버 아님·없음'으로 단정하지 않고 코드 2", rc == 2 and "끝까지 확인하지 못했습니다" in out and "멤버가 아닙니다" not in out and "찾지 못했습니다" not in out, out)
    rc, out = run("members", "한키키", "--project", "○○-공동연구")
    ok("재검토 R2 members 명령도 '앞 300명만' 표시", rc == 0 and "앞 300명만" in out, out[-300:])
    cache = os.path.join(home, "kk-dry.cache.json")
    ctext = open(cache, encoding="utf-8").read() if os.path.exists(cache) else ""
    ok("캐시는 설정 폴더에 번호만 — 토큰·본인 이름·개인 프로젝트 코드 없음", ctext and TOKEN not in ctext and "김키키" not in ctext and "private-project" not in ctext and '"(개인)"' in ctext, ctext[:300])
    S["mode"] = "401"
    rc, out = run("task-files", TASK)
    ok("토큰 만료(401) → 한 줄 안내(코드 1)", rc == 1 and "만료됐거나" in out and "Traceback" not in out, out)

    srv.shutdown()
    print(f"\n{n[0] - n[1]}/{n[0]} PASS" + (f" — {n[1]} FAIL" if n[1] else ""))
    return 1 if n[1] else 0


if __name__ == "__main__":
    sys.exit(main())
