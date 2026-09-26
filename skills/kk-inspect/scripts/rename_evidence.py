# -*- coding: utf-8 -*-
"""증빙 파일 개명(복사) + 원본 휴지통 이동 (복구 가능, 영구삭제 X). Windows / macOS / Linux.

사용:
  python rename_evidence.py <원본경로> "<새파일명(확장자포함)>"   # 같은 폴더에 새 이름으로 복사 (원본은 그대로)
  python rename_evidence.py --trash <경로...>                       # 휴지통 이동 (복구 가능)

권장 새 파일명 형식: "{YYMMDD} {원화금액} {거래처 내용} 카드영수증.jpg"
무의미한 무작위 숫자 파일명을 의미있게 바꿀 때 사용. 개명은 복사본을 만들 뿐이라 원본은 남는다 —
첨부까지 끝난 뒤 필요 없는 원본(png 등 업로드 불가 형식 포함)은 사용자 confirm 후 --trash 로 정리한다.

안전 규칙(2026-09-27): 이미 있는 파일은 절대 덮어쓰지 않는다 / 파일명에 폴더 구분자·금지 문자가 있으면 거부한다 /
휴지통 명령에 경로를 문자열로 끼워 넣지 않는다(파일명이 명령으로 실행되는 일 없음) / 휴지통 이동이 안 되면 같은 폴더 _trash/ 로.
종료 코드: 0 정상, 1 오류(메시지 출력).
"""
import sys, os, shutil, subprocess
# Windows 한국어(cp949) 콘솔·파이프에서도 한글·기호가 깨지거나 멈추지 않게 출력은 UTF-8 로 (모듈로 불러 써도 적용)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"
BAD_CHARS = '\\/:*?"<>|'          # Windows 금지 문자(다른 OS 에서도 같이 막아 어디서나 같은 이름이 되게)


def check_name(newname):
    """새 파일명 점검 → 문제 문구(없으면 '')."""
    n = str(newname or '')
    if not n.strip():
        return '새 파일명이 비어 있습니다'
    if os.path.basename(n) != n or any(c in n for c in BAD_CHARS):
        return '파일명에 쓸 수 없는 문자(' + BAD_CHARS + ')가 있습니다 — 하이픈·공백으로 바꿔 주세요'
    if n != n.strip() or n.endswith('.'):
        return '파일명 앞뒤 공백이나 끝의 점은 쓸 수 없습니다'
    if n in ('.', '..') or len(n.encode('utf-8')) > 240:
        return '파일명이 너무 길거나 올바르지 않습니다'
    if not os.path.splitext(n)[1]:
        return '확장자가 없습니다(예 .jpg .pdf)'
    return ''


def unique_path(path):
    """같은 이름이 있으면 ' (2)', ' (3)' 을 붙여 비어 있는 이름을 돌려준다."""
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    k = 2
    while os.path.exists(base + ' (' + str(k) + ')' + ext):
        k += 1
    return base + ' (' + str(k) + ')' + ext


def to_recycle(path):
    """OS 휴지통으로 이동 (복구 가능). 어느 방법도 안 되면 같은 폴더의 _trash/ 로 이동.
    반환: '휴지통' | '_trash'. 경로는 인자·환경변수로만 넘긴다(명령 문자열에 끼워 넣지 않음)."""
    path = os.path.abspath(path)
    try:
        if IS_WIN:
            ps = ("Add-Type -AssemblyName Microsoft.VisualBasic;"
                  "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile("
                  "$env:KK_TRASH_PATH,'OnlyErrorDialogs','SendToRecycleBin')")
            env = dict(os.environ, KK_TRASH_PATH=path)
            r = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', ps],
                               check=False, capture_output=True, env=env, timeout=60)
            if r.returncode == 0 and not os.path.exists(path):
                return '휴지통'
        elif IS_MAC:
            r = subprocess.run(['osascript', '-e', 'on run argv',
                                '-e', 'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)',
                                '-e', 'end run', path],
                               check=False, capture_output=True, timeout=60)
            if r.returncode == 0 and not os.path.exists(path):
                return '휴지통'
        elif shutil.which('gio'):
            r = subprocess.run(['gio', 'trash', '--', path], check=False, capture_output=True, timeout=60)
            if r.returncode == 0 and not os.path.exists(path):
                return '휴지통'
    except Exception:
        pass
    trash = os.path.join(os.path.dirname(path), '_trash')
    os.makedirs(trash, exist_ok=True)
    shutil.move(path, unique_path(os.path.join(trash, os.path.basename(path))))
    return '_trash'


def rename_copy(src, newname):
    """src 를 같은 폴더에 newname 으로 복사. 반환 새 경로. 문제면 ValueError."""
    if not os.path.isfile(src):
        raise ValueError('원본 파일이 없습니다: ' + src)
    problem = check_name(newname)
    if problem:
        raise ValueError(problem + ': ' + str(newname))
    dst = os.path.join(os.path.dirname(os.path.abspath(src)), newname)
    if os.path.exists(dst):
        if os.path.samefile(src, dst):
            raise ValueError('이미 그 이름입니다: ' + newname)
        raise ValueError('같은 이름의 파일이 이미 있어 덮어쓰지 않습니다: ' + newname)
    shutil.copy2(src, dst)
    return dst


def main():
    if '--trash' in sys.argv:
        paths = [a for a in sys.argv[1:] if a != '--trash']
        if not paths:
            print('사용: python rename_evidence.py --trash <경로...>')
            return 1
        bad = 0
        for p in paths:
            if not os.path.exists(p):
                print('ERR 파일이 없습니다:', p)
                bad = 1
                continue
            where = to_recycle(p)
            print(where + ':', os.path.basename(p) + ('' if where == '휴지통' else '  (휴지통 이동이 안 돼 같은 폴더 _trash/ 로 옮김)'))
        return bad
    if len(sys.argv) < 3:
        print('사용: python rename_evidence.py <원본> "<새파일명>"  또는  --trash <경로...>')
        return 1
    try:
        dst = rename_copy(sys.argv[1], sys.argv[2])
    except ValueError as e:
        print('ERR', e)
        return 1
    print('개명 저장:', os.path.basename(dst), '(원본은 그대로 — 필요 없으면 --trash 로 정리)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
