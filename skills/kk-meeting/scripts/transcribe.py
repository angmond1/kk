# -*- coding: utf-8 -*-
r"""kk-meeting 회의 기록 → 글. 녹음은 이 PC 밖으로 나가지 않는다(로컬 음성 인식 faster-whisper).

  python transcribe.py check [<녹음 파일>] [--json]
      이 PC 사양(CPU·메모리·NVIDIA 그래픽카드)·설치 상태(faster-whisper·모델)·녹음 길이·녹음 시각 힌트를 보고 권장 경로를 고른다.
        local-gpu / local-cpu = 이 PC 에서 변환,  phone = 휴대폰 녹음 앱의 텍스트 변환이나 클로바노트로 바꾼 글을 받는다.
      마지막 줄: [요약] 권장 <경로>(대안 <경로>) | 예상 <분> | 설치 필요 예/아니오 | 녹음 <분>
  python transcribe.py run <녹음 파일> [--model auto|small|medium|turbo] [--device auto|cpu|cuda] [--hint "과제명 용어"] [--out <txt>]
      녹음을 한국어 글로 바꿔 {kiki_root}/meeting/transcripts/<이름>_녹취록.txt 에 저장(덮어쓰지 않음, 원본 녹음은 건드리지 않음).
      진행률을 30초마다 찍는다(길면 백그라운드로 돌린다). 그래픽카드로 안 되면 CPU 로 자동 전환.
      마지막 줄: [요약] 녹음 N분 → 글 N자(말한 구간 N분), 모델·장치, N분 걸림 → <파일>
  python transcribe.py text <기록 파일>
      docx·hwpx·vtt·srt·txt 에서 글만 뽑아 {kiki_root}/meeting/transcripts/<이름>_회의기록.txt 로(자막 시각표·서식 제거).
      pdf 는 Claude 가 바로 읽는다. hwp(구형)는 한글에서 hwpx·pdf 로 저장해 달라고 한다.

설치(사용자 동의 후 처음 한 번): python -m pip install faster-whisper      — ffmpeg 불필요(PyAV 가 오디오를 읽는다), 그래픽카드 불필요.
  NVIDIA 그래픽카드를 쓰려면 추가로: python -m pip install nvidia-cublas-cu12 "nvidia-cudnn-cu12==9.*"   (약 1GB 이상; 안 되면 CPU 로 자동 전환)
모델은 처음 변환할 때 {kiki_root}/_models/whisper 로 내려받는다(small 약 0.5GB, medium 약 1.5GB, turbo 약 1.6GB).
속도는 공식 벤치마크(small·int8·8스레드 데스크톱에서 13분 녹음 1분 42초)를 바탕으로 한 추정치 — 실제 시간은 run 요약 줄로 확인한다.
"""
from __future__ import annotations
import argparse, html, io, json, os, platform, re, shutil, struct, subprocess, sys, time, wave, zipfile

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

MODELS = {"small": ("Systran/faster-whisper-small", 0.5), "medium": ("Systran/faster-whisper-medium", 1.5),
          "turbo": ("mobiuslabsgmbh/faster-whisper-large-v3-turbo", 1.6)}
# 실시간 대비 배수(1분 녹음에 걸리는 분). CPU small 0.13 = 공식 벤치마크(int8·beam5·8스레드 i7-12700K, 13분 → 1분 42초).
# medium·turbo 는 small 대비 계산량으로 잡은 추정, GPU 는 fp16 추정. 범위는 PC 세대 차이를 감안해 넓게 잡는다.
CPU_RTF = {"small": 0.13, "medium": 0.33, "turbo": 0.45}
GPU_RTF = {"small": 0.02, "medium": 0.03, "turbo": 0.04}
AUDIO_EXT = (".m4a", ".mp3", ".wav", ".mp4", ".aac", ".3gp", ".amr", ".ogg", ".opus", ".webm", ".flac", ".wma", ".mov", ".mkv")
CLOVA_URL = "https://clovanote.naver.com"
# 조용한 구간에서 Whisper 가 지어내는 흔한 한국어 문구(영상 자막 학습 흔적) — 이런 구간만 따로 있으면 버린다
HALLUCINATION = re.compile(r"^(?:시청해\s*주셔서\s*감사합니다|구독과\s*좋아요[^.]*|좋아요와\s*구독[^.]*|자막\s*(?:제공|by)[^.]*|다음\s*(?:영상|시간)에서?\s*만나요|MBC\s*뉴스[^.]*|감사합니다)[.!\s]*$")


# ---------------------------------------------------------------- 공통
def _kiki_root() -> str:
    r = os.environ.get("KIKI_ROOT", "").strip()
    if r:
        return os.path.expanduser(r)
    for cfg in ("~/.claude/kiki/kiki.config.json", "~/.codex/kiki/kiki.config.json"):
        p = os.path.expanduser(cfg)
        if os.path.exists(p):
            try:
                r = (json.load(open(p, encoding="utf-8-sig")).get("kiki_root") or "").strip()
            except Exception:
                r = ""
            if r:
                return os.path.expanduser(r)
    return r"C:\kiki" if os.name == "nt" else os.path.expanduser("~/kiki")


def model_dir() -> str:
    return os.path.join(_kiki_root(), "_models", "whisper")


def trans_dir() -> str:
    return os.path.join(_kiki_root(), "meeting", "transcripts")


def _unique(p: str) -> str:
    if not os.path.exists(p):
        return p
    stem, ext = os.path.splitext(p)
    k = 2
    while os.path.exists(f"{stem}_{k}{ext}"):
        k += 1
    return f"{stem}_{k}{ext}"


def _mins(sec) -> str:
    return "?" if sec is None else f"{sec / 60:.0f}"


def _pip_cmd(*pkgs) -> str:
    exe = sys.executable or "python"
    exe = f'"{exe}"' if " " in exe else exe
    in_venv = sys.prefix != getattr(sys, "base_prefix", sys.prefix)          # 가상환경 안에서는 --user 가 실패한다
    return exe + " -m pip install " + " ".join(f'"{p}"' if "*" in p or "=" in p else p for p in pkgs) + ("" if os.name == "nt" or in_venv else " --user")


# ---------------------------------------------------------------- 이 PC 사양
def _ram_gb() -> float:
    try:
        import psutil  # type: ignore
        return psutil.virtual_memory().total / 2 ** 30
    except Exception:
        pass
    try:
        if os.name == "nt":
            import ctypes

            class MS(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                            ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
            m = MS()
            m.dwLength = ctypes.sizeof(MS)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
                return m.ullTotalPhys / 2 ** 30
        elif sys.platform == "darwin":
            return int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=10).stdout.strip()) / 2 ** 30
        else:
            for ln in open("/proc/meminfo"):
                if ln.startswith("MemTotal:"):
                    return int(ln.split()[1]) / 2 ** 20
    except Exception:
        pass
    return 0.0


def _cpu() -> dict:
    logical = os.cpu_count() or 1
    physical, name = None, ""
    try:
        import psutil  # type: ignore
        physical = psutil.cpu_count(logical=False)
    except Exception:
        pass
    try:
        if os.name == "nt":
            import winreg
            k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            name = str(winreg.QueryValueEx(k, "ProcessorNameString")[0]).strip()
            if not physical:
                out = subprocess.run(["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum"],
                                     capture_output=True, text=True, timeout=30).stdout.strip()
                physical = int(out) if out.isdigit() else None
        elif sys.platform == "darwin":
            name = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True, timeout=10).stdout.strip()
            if not physical:
                out = subprocess.run(["sysctl", "-n", "hw.physicalcpu"], capture_output=True, text=True, timeout=10).stdout.strip()
                physical = int(out) if out.isdigit() else None
        else:
            txt = open("/proc/cpuinfo").read()
            m = re.search(r"model name\s*:\s*(.+)", txt)
            name = m.group(1).strip() if m else ""
            cores = {(a, b) for a, b in re.findall(r"physical id\s*:\s*(\d+)[\s\S]*?core id\s*:\s*(\d+)", txt)}
            physical = len(cores) or None
    except Exception:
        pass
    return {"name": name, "logical": logical, "physical": physical or max(1, logical // 2)}


def _gpu() -> dict | None:
    exe = shutil.which("nvidia-smi")
    if not exe and os.name == "nt" and os.path.exists(r"C:\Windows\System32\nvidia-smi.exe"):
        exe = r"C:\Windows\System32\nvidia-smi.exe"
    if not exe:
        return None
    try:
        out = subprocess.run([exe, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=20).stdout
        ln = out.strip().splitlines()[0]
        n, mem = [x.strip() for x in ln.split(",")[:2]]
        return {"name": n, "mem_gb": round(float(mem) / 1024, 1)}
    except Exception:
        return None


def _nvidia_lib_dirs() -> list:
    """pip 로 깐 NVIDIA 라이브러리(nvidia-cublas-cu12·nvidia-cudnn-cu12) 폴더."""
    dirs = []
    try:
        import importlib.util
        for mod in ("nvidia.cublas", "nvidia.cudnn", "nvidia.cuda_runtime"):
            try:
                spec = importlib.util.find_spec(mod)
            except Exception:
                spec = None
            for base in (spec.submodule_search_locations if spec and spec.submodule_search_locations else []):
                for sub in ("bin", "lib"):
                    p = os.path.join(base, sub)
                    if os.path.isdir(p):
                        dirs.append(p)
    except Exception:
        pass
    return dirs


def _gpu_libs_found() -> bool:
    """cuBLAS(CUDA 12)·cuDNN 9 를 찾을 수 있는지 — 없으면 그래픽카드 시도가 프로세스째 멈출 수 있어 미리 본다."""
    dirs = _nvidia_lib_dirs() + [d for d in os.environ.get("PATH", "").split(os.pathsep) if d]
    cp = os.environ.get("CUDA_PATH")
    if cp:
        dirs.append(os.path.join(cp, "bin"))
    want = (("cublas64_12.dll",), ("cudnn64_9.dll", "cudnn_ops64_9.dll")) if os.name == "nt" else (("libcublas.so.12",), ("libcudnn.so.9", "libcudnn_ops.so.9"))
    found = [False, False]
    for d in dirs:
        for i, names in enumerate(want):
            if not found[i] and any(os.path.exists(os.path.join(d, n)) for n in names):
                found[i] = True
    return all(found)


def _prepare_gpu_libs() -> None:
    dirs = _nvidia_lib_dirs()
    if os.name == "nt":
        for d in dirs:
            try:
                os.add_dll_directory(d)
            except Exception:
                pass
        if dirs:
            os.environ["PATH"] = os.pathsep.join(dirs + [os.environ.get("PATH", "")])
    else:
        import ctypes, glob
        for d in dirs:
            for so in sorted(glob.glob(os.path.join(d, "lib*.so*"))):
                try:
                    ctypes.CDLL(so, mode=ctypes.RTLD_GLOBAL)
                except OSError:
                    pass


def _installed() -> dict:
    info = {"faster_whisper": None, "models": [], "gpu_libs": _gpu_libs_found()}
    try:
        import importlib.metadata as md
        info["faster_whisper"] = md.version("faster-whisper")
    except Exception:
        pass
    for key, (repo, _gb) in MODELS.items():
        base = os.path.join(model_dir(), "models--" + repo.replace("/", "--"), "snapshots")
        if os.path.isdir(base) and any(os.path.exists(os.path.join(base, s, "model.bin")) for s in os.listdir(base)):
            info["models"].append(key)
    return info


# ---------------------------------------------------------------- 녹음 정보(길이·녹음 시각) — 설치 없이 읽는다
def _mp4_mvhd(path):
    size_total = os.path.getsize(path)
    with open(path, "rb") as f:
        def boxes(start, end):
            pos = start
            while pos + 8 <= end:
                f.seek(pos)
                size, typ = struct.unpack(">I4s", f.read(8))
                hl = 8
                if size == 1:
                    size = struct.unpack(">Q", f.read(8))[0]
                    hl = 16
                elif size == 0:
                    size = end - pos
                if size < hl:
                    return
                yield typ, pos + hl, pos + size
                pos += size
        for typ, s, e in boxes(0, size_total):
            if typ == b"moov":
                for t2, s2, _e2 in boxes(s, e):
                    if t2 == b"mvhd":
                        f.seek(s2)
                        ver = f.read(4)[0]
                        if ver == 1:
                            ct, _mt = struct.unpack(">QQ", f.read(16))
                            ts, du = struct.unpack(">IQ", f.read(12))
                        else:
                            ct, _mt, ts, du = struct.unpack(">IIII", f.read(16))
                        created = ct - 2082844800 if ct > 2082844800 + 86400 * 365 * 30 else None   # 1904 기준 → 1970 기준(0·엉터리 값은 버림)
                        return (du / ts if ts else None), created
    return None, None


def _mp3_duration(path):
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        head = f.read(10)
        off = 0
        if head[:3] == b"ID3" and len(head) == 10:
            off = 10 + (((head[6] & 0x7F) << 21) | ((head[7] & 0x7F) << 14) | ((head[8] & 0x7F) << 7) | (head[9] & 0x7F)) + (10 if head[5] & 0x10 else 0)
        f.seek(off)
        buf = f.read(65536)
    br_tab = {1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]}
    sr_tab = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}
    for i in range(len(buf) - 40):
        if buf[i] != 0xFF or (buf[i + 1] & 0xE0) != 0xE0:
            continue
        h = struct.unpack(">I", buf[i:i + 4])[0]
        ver, layer, br_i, sr_i, mode = (h >> 19) & 3, (h >> 17) & 3, (h >> 12) & 15, (h >> 10) & 3, (h >> 6) & 3
        if ver == 1 or layer != 1 or br_i in (0, 15) or sr_i == 3:          # Layer III 만
            continue
        sr = sr_tab[ver][sr_i]
        br = br_tab[1 if ver == 3 else 2][br_i] * 1000
        spf = 1152 if ver == 3 else 576
        xo = i + ((36 if mode != 3 else 21) if ver == 3 else (21 if mode != 3 else 13))
        if buf[xo:xo + 4] in (b"Xing", b"Info"):
            flags = struct.unpack(">I", buf[xo + 4:xo + 8])[0]
            if flags & 1:
                frames = struct.unpack(">I", buf[xo + 8:xo + 12])[0]
                return frames * spf / sr
        return (size - off - i) * 8 / br
    return None


def audio_info(path: str) -> dict:
    """길이(초)·녹음 시작 시각 힌트. wav·m4a/mp4·mp3 는 표준 라이브러리로, 그 밖은 PyAV(설치돼 있으면)·ffprobe 로."""
    ext = os.path.splitext(path)[1].lower()
    info = {"file": os.path.basename(path), "size_mb": round(os.path.getsize(path) / 2 ** 20, 1), "duration": None, "created": None, "how": ""}
    try:
        if ext == ".wav":
            with wave.open(path) as w:
                info["duration"], info["how"] = w.getnframes() / w.getframerate(), "wav"
        elif ext in (".m4a", ".mp4", ".mov", ".3gp"):
            d, c = _mp4_mvhd(path)
            info["duration"], info["created"], info["how"] = d, c, "mp4"
        elif ext == ".mp3":
            info["duration"], info["how"] = _mp3_duration(path), "mp3"
    except Exception:
        pass
    if info["duration"] is None:
        try:
            import av  # type: ignore
            with av.open(path) as c:
                if c.duration:
                    info["duration"], info["how"] = c.duration / 1_000_000, "av"
        except Exception:
            pass
    if info["duration"] is None and shutil.which("ffprobe"):
        try:
            out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
                                 capture_output=True, text=True, timeout=60).stdout.strip()
            info["duration"], info["how"] = float(out), "ffprobe"
        except Exception:
            pass
    name = os.path.basename(path)
    m = re.search(r"(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[ _T.-]?(\d{2})[-_.:h]?(\d{2})", name) or re.search(r"(?<!\d)(\d{2})(\d{2})(\d{2})[ _-](\d{2})(\d{2})\d{0,2}(?!\d)", name)
    if m:
        y, mo, d, hh, mi = (int(x) for x in m.groups()[:5])
        y = y + 2000 if y < 100 else y
        if 1 <= mo <= 12 and 1 <= d <= 31 and hh < 24 and mi < 60:
            info["name_time"] = f"{y:04d}-{mo:02d}-{d:02d} {hh:02d}:{mi:02d}"
    info["mtime"] = time.strftime("%Y-%m-%d %H:%M", time.localtime(os.path.getmtime(path)))
    if info["created"]:
        info["created"] = time.strftime("%Y-%m-%d %H:%M", time.localtime(info["created"]))
    return info


# ---------------------------------------------------------------- check
def _est(dur_min: float, rtf: float, f: float = 1.0) -> tuple:
    lo, hi = dur_min * rtf * f * 0.8, dur_min * rtf * f * 2.5
    return max(1, round(lo)), max(1, round(hi))


def assess(path: str | None = None) -> dict:
    cpu, ram, gpu, inst = _cpu(), _ram_gb(), _gpu(), _installed()
    au = audio_info(path) if path else None
    dur_min = (au["duration"] / 60) if au and au["duration"] else None
    ref = dur_min or 60
    try:
        free_gb = shutil.disk_usage(_kiki_root() if os.path.exists(_kiki_root()) else os.path.expanduser("~")).free / 2 ** 30
    except Exception:
        free_gb = None
    threads = max(1, min(cpu["physical"], 8))
    f = 8 / threads
    rep = {"cpu": cpu, "ram_gb": round(ram, 1), "gpu": gpu, "installed": inst, "free_gb": round(free_gb, 1) if free_gb is not None else None,
           "python": platform.python_version(), "os": platform.system(), "arch": platform.machine(), "audio": au, "ref_minutes": round(ref),
           "estimates": {"cpu_" + k: _est(ref, CPU_RTF[k], f) for k in CPU_RTF}}
    if gpu:
        rep["estimates"].update({"gpu_" + k: _est(ref, GPU_RTF[k]) for k in GPU_RTF})
    why = []
    py_ok = sys.version_info >= (3, 9) and platform.machine().lower() in ("amd64", "x86_64", "arm64", "aarch64")
    if not py_ok:
        why.append(f"파이썬 {platform.python_version()}·{platform.machine()} 에서는 faster-whisper 를 쓸 수 없음(3.9 이상, 64비트 필요)")
    need_gb = MODELS["turbo" if gpu else "small"][1] + 0.3
    if free_gb is not None and free_gb < need_gb + 1:
        why.append(f"여유 공간 {free_gb:.1f}GB — 모델·패키지에 {need_gb:.1f}GB 필요")
    if py_ok and not why and gpu and gpu["mem_gb"] >= 4:
        route, alt, model = "local-gpu", "local-cpu", "turbo"
        est = rep["estimates"]["gpu_turbo"]
    else:
        small_hi = rep["estimates"]["cpu_small"][1]
        if not py_ok or why or ram < 6 or cpu["physical"] <= 2:
            route, alt, model = "phone", ("local-cpu" if py_ok and not why else ""), "small"
            if ram < 6:
                why.append(f"메모리 {ram:.0f}GB")
            if cpu["physical"] <= 2:
                why.append(f"물리 {cpu['physical']}코어")
        elif small_hi <= 30:
            route, alt, model = "local-cpu", "phone", "small"
        elif small_hi <= 90:
            route, alt, model = "phone", "local-cpu", "small"
            why.append(f"{ref:.0f}분 녹음에 이 PC 로 약 {rep['estimates']['cpu_small'][0]}~{small_hi}분")
        else:
            route, alt, model = "phone", "local-cpu", "small"
            why.append(f"{ref:.0f}분 녹음에 이 PC 로 약 {rep['estimates']['cpu_small'][0]}~{small_hi}분 — 너무 오래 걸림")
        est = rep["estimates"]["cpu_small"]
    pkgs = [] if inst["faster_whisper"] else ["faster-whisper"]
    if route == "local-gpu" and not inst["gpu_libs"]:
        pkgs += ["nvidia-cublas-cu12", "nvidia-cudnn-cu12==9.*"]
    rep.update({"route": route, "alt": alt, "model": model, "estimate": est, "why": why,
                "install_cmd": _pip_cmd(*pkgs) if pkgs else "", "install_mb": (100 if "faster-whisper" in pkgs else 0) + (1100 if len(pkgs) > 1 else 0),
                "model_download_gb": 0 if model in inst["models"] else MODELS[model][1],
                "needs_install": bool(pkgs) or model not in inst["models"]})
    return rep


def fmt_assess(r: dict) -> str:
    c, g, i, a = r["cpu"], r["gpu"], r["installed"], r["audio"]
    L = [f"[이 PC] {c['name'] or 'CPU'} · 물리 {c['physical']}코어(논리 {c['logical']}) · 메모리 {r['ram_gb']:.0f}GB · 그래픽카드 "
         + (f"{g['name']} {g['mem_gb']:.0f}GB" if g else "없음(NVIDIA 기준)") + f" · 파이썬 {r['python']} · 여유 공간 "
         + (f"{r['free_gb']:.0f}GB" if r["free_gb"] is not None else "?"),
         "[설치] faster-whisper " + (i["faster_whisper"] or "없음") + " · 모델 " + (", ".join(i["models"]) or "없음")
         + (" · 그래픽카드 라이브러리 " + ("있음" if i["gpu_libs"] else "없음") if g else "")]
    if a:
        t = "녹음 시작 " + a["created"] + "(파일 정보)" if a.get("created") else ("파일 이름 시각 " + a["name_time"] if a.get("name_time") else "녹음 시작 시각 정보 없음")
        L.append(f"[녹음] {a['file']} · {a['size_mb']}MB · " + (f"{a['duration'] / 60:.0f}분" if a["duration"] else "길이 모름") + f" · {t} · 파일 수정 {a['mtime']}")
    lo, hi = r["estimate"]
    base = f"{r['ref_minutes']}분 녹음 기준" + ("" if a and a["duration"] else "(길이 모름 — 1시간으로 가정)")
    inst_note = ""
    if r["needs_install"]:
        parts = []
        if r["install_cmd"]:
            parts.append(f"설치 명령 {r['install_cmd']} (약 {r['install_mb']}MB)")
        if r["model_download_gb"]:
            parts.append(f"모델 {r['model']} 약 {r['model_download_gb']}GB 내려받기")
        inst_note = " 처음 한 번: " + ", ".join(parts) + ". 사용자 동의를 받은 뒤 설치."
    if r["route"] == "local-gpu":
        cl, ch = r["estimates"]["cpu_small"]
        L.append(f"[권장] 이 PC 에서 변환 — 그래픽카드, 정확한 모델 turbo, {base} 예상 약 {lo}~{hi}분.{inst_note} 그래픽카드가 안 되면 CPU 로 자동 전환(가벼운 모델 small, 약 {cl}~{ch}분).")
    elif r["route"] == "local-cpu":
        tl, th = r["estimates"]["cpu_turbo"]
        L.append(f"[권장] 이 PC 에서 변환 — CPU, 가벼운 모델 small, {base} 예상 약 {lo}~{hi}분(정확한 모델 turbo 는 약 {tl}~{th}분).{inst_note}")
    else:
        L.append("[권장] 휴대폰 녹음 앱의 텍스트 변환 또는 클로바노트 " + CLOVA_URL + " 로 바꾼 글을 받는다 — 이유: " + ("; ".join(r["why"]) or "이 PC 사양")
                 + ". 클로바노트는 녹음이 외부 서버로 올라가므로 내부 회의면 보안 기준 확인."
                 + (f" 사용자가 원하면 이 PC 에서도 가능(가벼운 모델 small, {base} 약 {lo}~{hi}분).{inst_note}" if r["alt"] == "local-cpu" else ""))
    L.append(f"[요약] 권장 {r['route']}" + (f"(대안 {r['alt']})" if r["alt"] else "") + f" | 예상 {lo}~{hi}분 | 설치 필요 {'예' if r['needs_install'] else '아니오'}"
             + (f" | 녹음 {a['duration'] / 60:.0f}분" if a and a["duration"] else ""))
    return "\n".join(L)


# ---------------------------------------------------------------- run
def _fmt_ts(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60:02d}:{sec % 60:02d}"


def _load_model(name: str, device: str):
    from faster_whisper import WhisperModel  # type: ignore
    threads = max(2, min(_cpu()["physical"], 16))
    if device == "cuda":
        _prepare_gpu_libs()
        return WhisperModel(name, device="cuda", compute_type="auto", download_root=model_dir())
    return WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=threads, download_root=model_dir())


def transcribe_file(path: str, model: str, device: str, hint: str, out: str) -> int:
    t0 = time.time()
    au = audio_info(path)
    dur = au["duration"]
    print(f"[kk-meeting] 변환 시작: {au['file']} · " + (f"{dur / 60:.0f}분" if dur else "길이 모름") + f" · 모델 {model} · {device} (모델을 처음 쓰면 내려받기부터)", flush=True)
    try:
        m = _load_model(model, device)
    except Exception as e:
        msg = str(e)
        if re.search(r"connect|resolve|timed? ?out|HTTPS?Connection|ProxyError|SSL|huggingface", msg, re.I):
            print(f"ERR 모델({model})을 내려받지 못했습니다 — 인터넷·사내망 프록시·VPN 확인. 안 되면 휴대폰·클로바노트 경로로. ({type(e).__name__}: {msg[:160]})")
        elif device == "cuda":
            print(f"⚠ 그래픽카드 준비 실패: {type(e).__name__}: {msg[:200]}")   # 부모 프로세스가 CPU 로 다시 한다
        else:
            print(f"ERR 모델을 불러오지 못했습니다({device}): {type(e).__name__}: {msg[:200]}")
        return 3 if device == "cuda" else 1
    kw = dict(language="ko", beam_size=5, vad_filter=True, vad_parameters={"min_silence_duration_ms": 500}, condition_on_previous_text=False)
    try:
        segs, info = m.transcribe(path, hotwords=(hint or None), **kw)
    except TypeError:                                   # hotwords 가 없는 옛 버전 — 첫 구간 힌트(initial_prompt)로 대신
        segs, info = m.transcribe(path, initial_prompt=(hint or None), **kw)
    dur = dur or getattr(info, "duration", None)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    part = out + ".part"
    n_chars = n_seg = n_drop = 0
    last = time.time()
    with io.open(part, "w", encoding="utf-8", newline="\n") as fo:
        fo.write(f"# 녹취록 — {au['file']}\n# 녹음 " + (f"{dur / 60:.0f}분" if dur else "길이 모름") + f" · 모델 {model}({device}) · 변환 {time.strftime('%Y-%m-%d %H:%M')}"
                 + " · 자동 변환이라 사람 이름·과제명·용어가 틀릴 수 있음\n\n")
        for s in segs:
            text = (s.text or "").strip()
            if not text:
                continue
            if HALLUCINATION.match(text) or getattr(s, "compression_ratio", 0) > 2.6 or (getattr(s, "no_speech_prob", 0) > 0.6 and getattr(s, "avg_logprob", 0) < -1.0):
                n_drop += 1
                continue
            fo.write(f"[{_fmt_ts(s.start)}] {text}\n")
            n_chars += len(text)
            n_seg += 1
            if time.time() - last >= 30:
                last = time.time()
                el = (time.time() - t0) / 60
                pct = (s.end / dur * 100) if dur else 0
                eta = (el / pct * (100 - pct)) if pct > 1 else None
                print(f"  진행 {pct:.0f}% (녹음 {s.end / 60:.0f}/{_mins(dur)}분, {el:.1f}분 경과" + (f", 남은 예상 약 {eta:.0f}분" if eta else "") + ")", flush=True)
    os.replace(part, out)
    spoken = getattr(info, "duration_after_vad", None) or dur
    took = (time.time() - t0) / 60
    warn = ""
    if spoken and n_chars / max(1.0, spoken / 60) < 80:
        warn = " ⚠ 말한 분량에 비해 글이 너무 적습니다 — 한국어 회의가 맞는지·녹음 소리가 작은지 확인하고, 정확한 모델(--model turbo)로 한 번 더 또는 휴대폰·클로바노트로"
    print(f"[요약] 녹음 {_mins(dur)}분 → 글 {n_chars:,}자(말한 구간 {_mins(spoken)}분, {n_seg}문장" + (f", 지어낸 문구 {n_drop}개 뺌" if n_drop else "")
          + f"), 모델 {model}·{device}, {took:.1f}분 걸림 → {out}{warn}", flush=True)
    return 0


def cmd_run(a) -> int:
    path = os.path.abspath(os.path.expanduser(a.file))
    if not os.path.isfile(path):
        print("ERR 녹음 파일이 없습니다:", path)
        return 1
    if os.path.splitext(path)[1].lower() not in AUDIO_EXT:
        print(f"ERR 녹음 파일 형식이 아닙니다({os.path.splitext(path)[1] or '확장자 없음'}) — 글 파일이면 text 명령, 녹음이면 m4a·mp3·wav 등")
        return 1
    try:
        import faster_whisper  # noqa: F401  # type: ignore
    except ImportError:
        print("ERR faster-whisper 가 없습니다 — 사용자 동의 후 설치: " + _pip_cmd("faster-whisper") + " (약 100MB, ffmpeg·그래픽카드 불필요). 먼저 transcribe.py check 로 권장 경로 확인")
        return 2
    out = os.path.abspath(a.out) if a.out else _unique(os.path.join(trans_dir(), os.path.splitext(os.path.basename(path))[0] + "_녹취록.txt"))
    device = a.device
    if device == "auto":
        device = "cuda" if (_gpu() and _gpu_libs_found()) else "cpu"
    model = a.model if a.model != "auto" else ("turbo" if device == "cuda" else "small")
    if device == "cuda" and not a.no_fallback:
        # 그래픽카드 라이브러리 문제는 프로세스째 멈출 수 있어 자식 프로세스로 먼저 해 보고, 안 되면 CPU 로 다시
        cmd = [sys.executable, os.path.abspath(__file__), "run", path, "--device", "cuda", "--model", model, "--out", out, "--no-fallback"]
        if a.hint:
            cmd += ["--hint", a.hint]
        rc = subprocess.call(cmd)
        if rc == 0:
            return 0
        print(f"⚠ 그래픽카드로 변환하지 못해(종료 코드 {rc}) CPU 로 다시 합니다 — 가벼운 모델 small" if a.model == "auto" else f"⚠ 그래픽카드로 변환하지 못해(종료 코드 {rc}) CPU 로 다시 합니다", flush=True)
        device = "cpu"
        if a.model == "auto":
            model = "small"
    return transcribe_file(path, model, device, a.hint or "", out)


# ---------------------------------------------------------------- text (글로 된 기록에서 글만)
def _read_text(p: str) -> str:
    raw = open(p, "rb").read()
    for enc in ("utf-8-sig", "cp949", "utf-16"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _xml_paras(xml: str, p_tag: str, t_tag: str) -> list:
    out = []
    # 줄바꿈·탭: docx 는 글 조각(<w:t>) 밖에 있으니 글 조각으로 감싸고, hwpx 는 <hp:t> 안에 있으니 문자로 바꾼다(문단 서식의 탭 위치 <w:tab w:val=…/> 는 건드리지 않음)
    xml = re.sub(r"<w:br\b[^>]*/>|<w:cr/>", "<w:t>\n</w:t>", xml)
    xml = xml.replace("<w:tab/>", "<w:t>\t</w:t>")
    xml = re.sub(r"<hp:lineBreak\b[^>]*/>", "\n", xml)
    xml = re.sub(r"<hp:tab\b[^>]*/>", "\t", xml)
    for para in re.findall(rf"<{p_tag}[ >][\s\S]*?</{p_tag}>", xml):
        txt = "".join(re.findall(rf"<{t_tag}(?:\s[^>]*)?>([\s\S]*?)</{t_tag}>", para))
        txt = html.unescape(re.sub(r"<[^>]+>", "", txt)).strip()
        if txt:
            out.append(txt)
    return out


def extract_text(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".txt", ".md", ".csv"):
        return _read_text(path).strip()
    if ext in (".vtt", ".srt"):
        lines, prev = [], None
        for ln in _read_text(path).splitlines():
            s = ln.strip()
            if not s or s == "WEBVTT" or s.startswith("NOTE") or "-->" in s or s.isdigit() or s.startswith(("Kind:", "Language:")):
                continue
            m = re.match(r"<v\s+([^>]+)>(.*?)(?:</v>)?$", s)
            s = f"{m.group(1).strip()}: {m.group(2).strip()}" if m else s
            s = html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
            if s and s != prev:
                lines.append(s)
                prev = s
        return "\n".join(lines)
    if ext == ".docx":
        with zipfile.ZipFile(path) as z:
            return "\n".join(_xml_paras(z.read("word/document.xml").decode("utf-8", errors="replace"), "w:p", "w:t"))
    if ext == ".hwpx":
        with zipfile.ZipFile(path) as z:
            secs = sorted(n for n in z.namelist() if re.match(r"Contents/section\d+\.xml$", n))
            return "\n".join(t for n in secs for t in _xml_paras(z.read(n).decode("utf-8", errors="replace"), "hp:p", "hp:t"))
    if ext == ".hwp":
        raise ValueError("hwp(구형 한글) 파일은 바로 못 읽습니다 — 한글에서 '다른 이름으로 저장' 으로 hwpx 나 pdf 로 저장해 주세요")
    if ext == ".pdf":
        raise ValueError("pdf 는 Claude 가 바로 읽습니다 — 이 명령이 필요 없습니다")
    raise ValueError(f"지원하지 않는 형식({ext or '확장자 없음'}) — txt·docx·hwpx·vtt·srt·pdf")


def cmd_text(a) -> int:
    path = os.path.abspath(os.path.expanduser(a.file))
    if not os.path.isfile(path):
        print("ERR 파일이 없습니다:", path)
        return 1
    try:
        txt = extract_text(path)
    except (ValueError, KeyError, zipfile.BadZipFile) as e:
        print("ERR", e if not isinstance(e, (KeyError, zipfile.BadZipFile)) else f"파일 안에서 본문을 찾지 못했습니다({type(e).__name__}) — 손상됐거나 형식이 다름")
        return 1
    if not txt.strip():
        print("ERR 글을 찾지 못했습니다 — 스캔 이미지로 된 문서면 글이 없습니다(사진·pdf 로 주시면 Claude 가 읽음)")
        return 1
    out = _unique(os.path.join(trans_dir(), os.path.splitext(os.path.basename(path))[0] + "_회의기록.txt"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    io.open(out, "w", encoding="utf-8", newline="\n").write(txt + "\n")
    print(f"[요약] 글 {len(txt):,}자({len(txt.splitlines())}줄) → {out}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    c = sub.add_parser("check")
    c.add_argument("file", nargs="?")
    c.add_argument("--json", action="store_true")
    r = sub.add_parser("run")
    r.add_argument("file")
    r.add_argument("--model", default="auto", choices=["auto", "small", "medium", "turbo"])
    r.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    r.add_argument("--hint", default="", help="과제명·전문 용어·참석자 이름(띄어쓰기로) — 인식기가 이 단어들을 더 잘 알아듣게")
    r.add_argument("--out")
    r.add_argument("--no-fallback", action="store_true", help=argparse.SUPPRESS)
    t = sub.add_parser("text")
    t.add_argument("file")
    a = ap.parse_args(argv)
    if a.cmd == "check":
        if a.file and not os.path.isfile(a.file):
            print("ERR 녹음 파일이 없습니다:", a.file)
            return 1
        rep = assess(a.file)
        print(json.dumps(rep, ensure_ascii=False, indent=1) if a.json else fmt_assess(rep))
        return 0
    if a.cmd == "run":
        return cmd_run(a)
    if a.cmd == "text":
        return cmd_text(a)
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
