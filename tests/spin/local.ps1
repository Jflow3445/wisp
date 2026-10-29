param(
  [ValidateSet('Start', 'Stop', 'Reset', 'Mfa')]
  [string]$Action = 'Start'
)

$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$toolsPath = Join-Path ([IO.Path]::GetTempPath()) 'nister-spin-tools'
$runtimePath = Join-Path $toolsPath 'web'
$dataPath = Join-Path $toolsPath 'data'
$mariaPath = Join-Path $toolsPath 'mariadb-11.4.5-winx64\bin'
$statePath = Join-Path $toolsPath 'local-session.json'
$routerPath = Join-Path $PSScriptRoot 'router.php'
$watchdogPath = Join-Path $PSScriptRoot 'local_watchdog.php'
$phpPath = (Get-Command php -CommandType Application -ErrorAction Stop).Source
$phpOptions = @()
if ((& $phpPath -m) -notcontains 'pdo_mysql') { $phpOptions = @('-d', 'extension=pdo_mysql') }

# These settings are deliberately fixed to the isolated local fixture, never a WISP database.
$env:SPIN_TEST_DSN = 'mysql:host=127.0.0.1;port=33079;dbname=nister_spin_test;charset=utf8mb4'
$env:SPIN_TEST_USER = 'root'
$env:SPIN_TEST_PASS = 'spin-test-only'
$env:SPIN_TEST_RUNTIME = $runtimePath
$env:SPIN_TEST_WIN_BPS = '4500'

function Invoke-TestPhp([string]$ScriptPath, [string[]]$ScriptArguments = @()) {
  & $phpPath @phpOptions $ScriptPath @ScriptArguments
  if ($LASTEXITCODE -ne 0) { throw ('Local test command failed: ' + $ScriptPath) }
}

function Get-LocalListener([int]$Port) {
  return Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Assert-LocalProcess([int]$ProcessId, [string]$Executable, [string]$ExpectedArgument) {
  $processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $ProcessId)
  if (!$processInfo -or $processInfo.ExecutablePath -ne $Executable -or !$processInfo.CommandLine.Contains($ExpectedArgument)) {
    throw ('Port/process belongs to another application; refusing to change it (PID ' + $ProcessId + ').')
  }
}

function Stop-Local {
  if (Test-Path -LiteralPath $statePath) {
    $sessionInfo = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($sessionInfo.WatchdogId -and (Get-Process -Id $sessionInfo.WatchdogId -ErrorAction SilentlyContinue)) {
      Assert-LocalProcess $sessionInfo.WatchdogId $phpPath $watchdogPath
      Stop-Process -Id $sessionInfo.WatchdogId
    }
  }
  $listener = Get-LocalListener 8037
  if ($listener) {
    Assert-LocalProcess $listener.OwningProcess $phpPath $routerPath
    Stop-Process -Id $listener.OwningProcess
  }
  $listener = Get-LocalListener 33079
  if ($listener) {
    Assert-LocalProcess $listener.OwningProcess (Join-Path $mariaPath 'mariadbd.exe') $dataPath
    & (Join-Path $mariaPath 'mariadb-admin.exe') '--host=127.0.0.1' '--port=33079' '--user=root' '--password=spin-test-only' shutdown
    if ($LASTEXITCODE -ne 0) { throw 'Could not shut down the local test database.' }
  }
  Write-Host 'Local Spin test services stopped. Test balances are preserved.'
}

function Show-LocalLinks {
  Write-Host ''
  Write-Host 'Customer login:  http://127.0.0.1:8037/login.php'
  Write-Host '  Phone:         0201234567'
  Write-Host '  Password:      test-customer-password'
  Write-Host 'Game:            http://127.0.0.1:8037/spin.php'
  Write-Host 'Wallet:          http://127.0.0.1:8037/portal.php#wallet_section'
  Write-Host 'Admin login:     http://127.0.0.1:8037/admin/login.php'
  Write-Host '  Username:      operator'
  Write-Host '  Password:      test-operator-password'
  Write-Host 'Game management: http://127.0.0.1:8037/admin/spin.php'
  Write-Host 'Withdrawals:     http://127.0.0.1:8037/admin/withdrawals.php'
  Write-Host ''
  Write-Host 'Game changes use your existing administrator login.'
  Write-Host 'Fresh test balances:      .\tests\spin\local.ps1 -Action Reset'
  Write-Host 'Stop services:            .\tests\spin\local.ps1 -Action Stop'
  Write-Host 'Local fixture only: virtual funds, live flight returns, payment checkout disabled.'
}

if ($Action -eq 'Stop') { Stop-Local; return }
if ($Action -eq 'Mfa') {
  if (!(Get-LocalListener 33079)) { throw 'Start the local test environment first.' }
  Write-Host 'Separate authenticator codes are no longer required. Use your existing administrator login.'
  return
}
if ($Action -eq 'Reset') { Stop-Local }

New-Item -ItemType Directory -Path $toolsPath, $runtimePath -Force | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $mariaPath 'mariadbd.exe'))) {
  $archivePath = Join-Path $toolsPath 'mariadb.zip'
  if (!(Test-Path -LiteralPath $archivePath)) {
    Write-Host 'Downloading the portable local test database (about 91 MB)...'
    Invoke-WebRequest -Uri 'https://archive.mariadb.org/mariadb-11.4.5/winx64-packages/mariadb-11.4.5-winx64.zip' -OutFile $archivePath
  }
  Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsPath -Force
}

$dbListener = Get-LocalListener 33079
if ($dbListener) {
  Assert-LocalProcess $dbListener.OwningProcess (Join-Path $mariaPath 'mariadbd.exe') $dataPath
} else {
  if (!(Test-Path -LiteralPath (Join-Path $dataPath 'mysql'))) {
    & (Join-Path $mariaPath 'mariadb-install-db.exe') '--datadir' $dataPath '--password=spin-test-only'
    if ($LASTEXITCODE -ne 0) { throw 'Local database initialization failed.' }
  }
  $databaseProcess = Start-Process -FilePath (Join-Path $mariaPath 'mariadbd.exe') -ArgumentList @('--no-defaults', ('--datadir="' + $dataPath + '"'), '--bind-address=127.0.0.1', '--port=33079', '--console') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $toolsPath 'db-out.log') -RedirectStandardError (Join-Path $toolsPath 'db-error.log')
  for ($attempt = 0; $attempt -lt 50 -and !(Get-LocalListener 33079); $attempt++) {
    if ($databaseProcess.HasExited) { throw ('Local database failed. Inspect ' + (Join-Path $toolsPath 'db-error.log')) }
    Start-Sleep -Milliseconds 200
  }
  if (!(Get-LocalListener 33079)) { throw 'Local database did not become ready.' }
}

& (Join-Path $mariaPath 'mariadb.exe') '--host=127.0.0.1' '--port=33079' '--user=root' '--password=spin-test-only' '--execute=CREATE DATABASE IF NOT EXISTS nister_spin_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
if ($LASTEXITCODE -ne 0) { throw 'Local test database creation failed.' }

$sessionInfo = $null
if (Test-Path -LiteralPath $statePath) { $sessionInfo = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
if ($Action -eq 'Reset' -or !$sessionInfo -or !(Test-Path -LiteralPath (Join-Path $runtimePath '.env'))) {
  Invoke-TestPhp (Join-Path $PSScriptRoot 'web_setup.php')
} else {
  Invoke-TestPhp (Join-Path $PSScriptRoot 'local_upgrade.php')
}

$webListener = Get-LocalListener 8037
if ($webListener) {
  Assert-LocalProcess $webListener.OwningProcess $phpPath $routerPath
  $webId = $webListener.OwningProcess
} else {
  $webProcess = Start-Process -FilePath $phpPath -ArgumentList ($phpOptions + @('-S', '127.0.0.1:8037', ('"' + $routerPath + '"'))) -WorkingDirectory $repoPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $toolsPath 'web-out.log') -RedirectStandardError (Join-Path $toolsPath 'web-error.log')
  $webId = $webProcess.Id
}

$watchdogId = $null
if ($sessionInfo -and $sessionInfo.WatchdogId -and (Get-Process -Id $sessionInfo.WatchdogId -ErrorAction SilentlyContinue)) {
  Assert-LocalProcess $sessionInfo.WatchdogId $phpPath $watchdogPath
  $watchdogId = $sessionInfo.WatchdogId
}
if (!$watchdogId) {
  $watchdogProcess = Start-Process -FilePath $phpPath -ArgumentList ($phpOptions + @(('"' + $watchdogPath + '"'))) -WorkingDirectory $repoPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $toolsPath 'watchdog-out.log') -RedirectStandardError (Join-Path $toolsPath 'watchdog-error.log')
  $watchdogId = $watchdogProcess.Id
}
@{ WebId = $webId; WatchdogId = $watchdogId; Initialized = $true } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
for ($attempt = 0; $attempt -lt 50 -and !(Get-LocalListener 8037); $attempt++) { Start-Sleep -Milliseconds 200 }
if (!(Get-LocalListener 8037)) { throw ('Local PHP server did not start. Inspect ' + (Join-Path $toolsPath 'web-error.log')) }
Show-LocalLinks
