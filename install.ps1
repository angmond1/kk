#requires -version 5
<#
  kiki 설치 스크립트 (Windows)
  - 선택한 skill + 공통(_shared) 을 ~/.claude/skills/ 로 복사 (Claude 가 skill 을 찾는 곳)
  - 개인설정 폴더(~/.claude/kiki/) 준비 + kiki_root 기록
  - kiki 작업 폴더(-Root) 에 budget/ meeting/ inspect/ _tmp/ 와 token.txt 생성
  - Python / Node.js 설치 여부만 확인해 안내 (자동 설치 X)
  개인 config·토큰은 repo 밖(~/.claude/kiki/, <root>/token.txt) 에만 둔다. 기존 값은 덮어쓰지 않는다.

  사용 (Root 는 반드시 -Root 로 이름을 붙여 준다):
    ./install.ps1                              # 전체 skill, root = 이 스크립트가 있는 kiki 폴더
    ./install.ps1 kk-mail kk-pay               # 일부 skill
    ./install.ps1 -Root C:\kiki                # 작업 폴더 지정 (기본 = 이 폴더, 권장 C:\kiki). 없으면 만든다.
  실행정책에 막히면:
    powershell -NoProfile -ExecutionPolicy Bypass -File ./install.ps1 -Root "C:/kiki"
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [string]$Root = "",
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Skills
)

$ErrorActionPreference = "Stop"
if (-not $env:USERPROFILE) { Write-Error "USERPROFILE 환경변수가 설정되어 있지 않습니다."; exit 1 }
$repo   = $PSScriptRoot
$srcDir = Join-Path $repo "skills"
$dstDir = Join-Path $env:USERPROFILE ".claude\skills"
$cfgDir = Join-Path $env:USERPROFILE ".claude\kiki"
if (-not $Root) { $Root = $repo }
$Root = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Root)   # 현재 위치 기준 절대경로

$all = Get-ChildItem -LiteralPath $srcDir -Directory |
       Where-Object { $_.Name -like "kk-*" } |
       Select-Object -ExpandProperty Name
if (-not $Skills -or $Skills.Count -eq 0) { $Skills = $all }

New-Item -ItemType Directory -Force -Path $dstDir | Out-Null

# 복사 헬퍼 - 대상이 있으면 먼저 제거(재실행 시 _shared/_shared 중첩 방지) 후 복사. 경로의 [ ] 도 글자 그대로.
function Copy-Tree($from, $to) {
  if (Test-Path -LiteralPath $to) { Remove-Item -LiteralPath $to -Recurse -Force }
  Copy-Item -LiteralPath $from -Destination $to -Recurse
}

# 1) 공통 _shared (항상 복사 - 없으면 skill 이 동작하지 않음)
Copy-Tree (Join-Path $srcDir "_shared") (Join-Path $dstDir "_shared")
Write-Host "[복사] _shared (공통 문서·설정 템플릿)"

# 2) 선택 skill
$unknown = 0
foreach ($s in $Skills) {
  if ($all -notcontains $s) { Write-Warning "알 수 없는 skill: $s (건너뜀)"; $unknown = 1; continue }
  Copy-Tree (Join-Path $srcDir $s) (Join-Path $dstDir $s)
  Write-Host "[복사] $s"
}

# 개명된 skill 의 옛 이름 정리(폴더·설정·캐시·데이터)는 새 이름 skill 이 설치돼 있을 때만(이번에 복사했거나 전에 설치) -
# 다른 skill 만 설치하면 옛 skill 이 쓰던 설정·데이터를 그대로 둔다(2026-09-29 Codex 검토 H3)
$hasMeet = Test-Path -LiteralPath (Join-Path $dstDir "kk-meet\SKILL.md")
$hasDry  = Test-Path -LiteralPath (Join-Path $dstDir "kk-dry\SKILL.md")

# 2-1) 개명된 skill 의 옛 폴더 정리 (2026-09-26 kk-dining → kk-meeting, 2026-09-29 kk-meeting → kk-meet) - kk-meet 이 설치돼 있을 때만
foreach ($old in @("kk-dining", "kk-meeting")) {
  $legacy = Join-Path $dstDir $old
  if (Test-Path -LiteralPath $legacy) {
    if ($hasMeet) { Remove-Item -LiteralPath $legacy -Recurse -Force; Write-Host "[정리] 옛 이름 $old 폴더 삭제 (지금은 kk-meet)" }
    else { Write-Host "[안내] 옛 $old 폴더가 있습니다 - kk-meet 을 설치하면 정리됩니다: ./install.ps1 kk-meet" }
  }
}

# 2-2) 개명된 skill 의 옛 폴더 정리 (2026-09-29 kk-dooray → kk-dry) - kk-dry 가 설치돼 있을 때만
$legacy2 = Join-Path $dstDir "kk-dooray"
if (Test-Path -LiteralPath $legacy2) {
  if ($hasDry) { Remove-Item -LiteralPath $legacy2 -Recurse -Force; Write-Host "[정리] 옛 이름 kk-dooray 폴더 삭제 (지금은 kk-dry)" }
  else { Write-Host "[안내] 옛 kk-dooray 폴더가 있습니다 - kk-dry 를 설치하면 정리됩니다: ./install.ps1 kk-dry" }
}

# 3) 개인설정 폴더 + 템플릿 (없을 때만 - 기존 값 보존) + kiki_root 확정·기록 (기존 값이 있으면 그것이 진짜 작업 폴더)
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
$midCfg = Join-Path $cfgDir "kk-meeting.config.json"; $newCfg = Join-Path $cfgDir "kk-meet.config.json"
if ($hasMeet -and (Test-Path -LiteralPath $midCfg) -and -not (Test-Path -LiteralPath $newCfg)) {
  Move-Item -LiteralPath $midCfg -Destination $newCfg
  Write-Host "[정리] kk-meeting.config.json → kk-meet.config.json (skill 개명)"
}
$legacyCfg = Join-Path $cfgDir "kk-dining.config.json"
if ($hasMeet -and (Test-Path -LiteralPath $legacyCfg) -and -not (Test-Path -LiteralPath $newCfg)) {
  Move-Item -LiteralPath $legacyCfg -Destination $newCfg
  $old = Get-Content -LiteralPath $newCfg -Raw -Encoding UTF8
  $new = $old -replace '/dining/', '/meeting/' -replace '\\\\dining\\\\', '\\meeting\\'
  if ($new -ne $old) { [System.IO.File]::WriteAllText($newCfg, $new, (New-Object System.Text.UTF8Encoding($false))) }
  Write-Host "[정리] kk-dining.config.json → kk-meet.config.json (skill 개명, 안의 dining 경로도 meeting 으로)"
}
$legacyCache = Join-Path $cfgDir "kk-dooray.cache.json"; $newCache = Join-Path $cfgDir "kk-dry.cache.json"
if ($hasDry -and (Test-Path -LiteralPath $legacyCache) -and -not (Test-Path -LiteralPath $newCache)) {
  Move-Item -LiteralPath $legacyCache -Destination $newCache
  Write-Host "[정리] kk-dooray.cache.json → kk-dry.cache.json (skill 개명)"
}
$cfg = Join-Path $cfgDir "kiki.config.json"
if (-not (Test-Path -LiteralPath $cfg)) {
  Copy-Item -LiteralPath (Join-Path $srcDir "_shared\kiki.config.example.json") -Destination $cfg
  Write-Host "[생성] $cfg  (본인 값은 첫 실행 때 Claude 가 채움)"
}
# kiki_root 가 비어 있으면 이번 root 로 채움 (JSON 문자열이라 백슬래시는 2개로). 이미 있으면 유지하고 다르면 알린다.
$json = Get-Content -LiteralPath $cfg -Raw -Encoding UTF8
$rootJson = ($Root -replace '\\', '\\') -replace '"', '\"'
if ($json -match '"kiki_root":\s*""') {
  $json = $json -replace '"kiki_root":\s*""', ('"kiki_root": "' + $rootJson + '"')
  [System.IO.File]::WriteAllText($cfg, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "[기록] kiki_root = $Root  ($cfg)"
} elseif ($json -match '"kiki_root":\s*"((?:\\.|[^"\\])+)"') {
  $prev = ($Matches[1] -replace '\\\\', '\') -replace '\\"', '"'
  if ($prev -ne $Root) {
    Write-Warning ("kiki_root 는 기존 값을 유지합니다: " + $prev + "  (이번 -Root: " + $Root + "). 바꾸려면 " + $cfg + " 의 kiki_root 를 고치세요.")
    $Root = $prev
  }
} elseif ($json -notmatch '"kiki_root"') {
  Write-Warning "기존 kiki.config.json 에 kiki_root 항목이 없습니다. 첫 실행 때 Claude 가 추가합니다: $Root"
}

# 4) kiki 작업 폴더 (확정된 root) - 데이터 폴더 + token.txt
New-Item -ItemType Directory -Force -Path $Root | Out-Null
$legacyData = Join-Path $Root "dining"; $newData = Join-Path $Root "meeting"
if ($hasMeet -and (Test-Path -LiteralPath $legacyData)) {
  # 앞선 설치가 만들어 둔 빈 meeting\ 은 비어 있을 때만 치우고 옮긴다(내용이 있으면 손대지 않음)
  if ((Test-Path -LiteralPath $newData) -and -not (Get-ChildItem -LiteralPath $newData -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $newData -Force }
  if (-not (Test-Path -LiteralPath $newData)) { Move-Item -LiteralPath $legacyData -Destination $newData; Write-Host "[정리] 데이터 폴더 dining/ → meeting/ (skill 개명)" }
  else { Write-Host "[안내] dining\ 과 meeting\ 이 둘 다 있습니다 - dining\ 의 내용을 meeting\ 으로 직접 합친 뒤 dining\ 을 지우세요: $Root" }
}
foreach ($sub in @("budget", "meeting", "inspect", "_tmp")) {
  if ($sub -eq "meeting" -and (Test-Path -LiteralPath $legacyData)) { continue }   # 옛 dining\ 이 남아 있으면(kk-meet 미설치) 빈 meeting\ 을 만들지 않는다 - 나중 이동이 막히지 않게
  New-Item -ItemType Directory -Force -Path (Join-Path $Root $sub) | Out-Null
}
$tok = Join-Path $Root "token.txt"
if (-not (Test-Path -LiteralPath $tok)) {
  Copy-Item -LiteralPath (Join-Path $srcDir "_shared\token.txt.example") -Destination $tok
  Write-Host "[생성] $tok  (Dooray 토큰은 이 파일의 'Dooray token:' 다음 줄에 - kk-pay 카드 RPA 업로드 때만 필요)"
}

# 5) Python / Node.js 확인 (실제로 실행해 본다 - Microsoft Store 의 0바이트 python.exe 스텁은 제외; 설치는 안내만)
function Test-Python {
  foreach ($c in @(@('py', '-3', '--version'), @('python', '--version'))) {
    if (-not (Get-Command $c[0] -ErrorAction SilentlyContinue)) { continue }
    try { $o = & $c[0] $c[1..($c.Count - 1)] 2>&1 | Out-String; if ($LASTEXITCODE -eq 0 -and $o -match 'Python 3') { return $true } } catch {}
  }
  return $false
}
function Test-Node { try { $null = & node --version 2>&1; if ($LASTEXITCODE -ne 0) { return $false }; $null = & npx --version 2>&1; return ($LASTEXITCODE -eq 0) } catch { return $false } }
$hasPy   = Test-Python
$hasNode = Test-Node
Write-Host ""
if ($hasPy)   { Write-Host "[확인] Python  있음" } else { Write-Warning "Python 이 없습니다 - kk-budget/kk-pay/kk-meet/kk-inspect/kk-wiki(와 kk-dry 받기·쓰기·올리기) 에 필요. https://www.python.org/downloads/ (설치 시 'Add python.exe to PATH' 체크) 또는  winget install -e --id Python.Python.3.12" }
if ($hasNode) { Write-Host "[확인] Node.js 있음" } else { Write-Warning "Node.js 가 없습니다 - 파일첨부(chrome-devtools-mcp) 에 필요. https://nodejs.org/ (LTS) 또는  winget install -e --id OpenJS.NodeJS.LTS" }

Write-Host ""
Write-Host "=^.^=  kiki 설치 완료"
Write-Host "완료. [!] Claude Code(또는 Claude Desktop)를 재시작한 뒤 'kk-<skill> 설정해줘' 로 첫 실행하세요."
Write-Host "    (새 skill 은 재시작해야 인식됩니다. Desktop 은 트레이 아이콘 → Quit 으로 완전 종료 후 재실행)"
Write-Host "kiki 작업 폴더: $Root   (엑셀·회의록·검수 파일은 여기 하위 budget/ meeting/ inspect/ 에)"
Write-Host "토큰 파일     : $tok    (채팅창에 토큰을 붙여넣지 말고 이 파일에 저장)"
Write-Host "개인 config   : $cfgDir  (repo 에는 올라가지 않습니다)"
if ($unknown) { Write-Warning "일부 skill 이름을 찾지 못했습니다 - 철자를 확인하세요."; exit 1 }
