# deploy.ps1 — Build, deploy, and restart ConferenceHub on the production server
# Usage: powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 [-ForceNpmInstall]
#
# Flags:
#   -ForceNpmInstall   — Always run npm install on the production server (slow over UNC).
#                        By default, npm install is SKIPPED unless package.json changed.
#
# Configuration: Set these variables below OR pass as environment variables
#   $env:DEPLOY_PATH   — UNC path or local path to the production folder (e.g., \\SERVER\ConferenceHub or C:\ConferenceHub)
#   $env:DEPLOY_SERVICE — Windows service name if running as a service (e.g., "ConferenceHub")
#
# Examples:
#   # Normal deploy (skips npm install if dependencies unchanged - FAST)
#   powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
#
#   # Force npm install (e.g. after adding/removing a package)
#   powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -ForceNpmInstall

param(
    [switch]$ForceNpmInstall
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# ─── Configuration ─────────────────────────────────────────
$DeployPath   = $env:DEPLOY_PATH
$ServiceName  = if ($env:DEPLOY_SERVICE) { $env:DEPLOY_SERVICE } else { 'conferencehub.exe' }
$ZipName      = 'conferencehub-production.zip'
$ZipPath      = Join-Path $ProjectRoot $ZipName
$BackupSuffix = (Get-Date -Format 'yyyyMMdd_HHmmss')

if (-not $DeployPath) {
    Write-Host "`nError: DEPLOY_PATH is not set." -ForegroundColor Red
    Write-Host "Set it before running:" -ForegroundColor Yellow
    Write-Host '  $env:DEPLOY_PATH = "\\\\SERVER\\ConferenceHub"' -ForegroundColor Cyan
    Write-Host '  $env:DEPLOY_PATH = "C:\\ConferenceHub"' -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "`n=== ConferenceHub Deploy ===" -ForegroundColor Cyan
Write-Host "  Target: $DeployPath" -ForegroundColor Gray

# ─── Step 1: Build ─────────────────────────────────────────
Write-Host "`n[1/5] Building..." -ForegroundColor Yellow
Push-Location $ProjectRoot
& powershell -ExecutionPolicy Bypass -File scripts/build-zip.ps1
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Build failed' }
Pop-Location

if (-not (Test-Path $ZipPath)) {
    throw "Zip not found at $ZipPath"
}

# ─── Step 2: Stop the service / process ────────────────────
Write-Host "`n[2/5] Stopping application..." -ForegroundColor Yellow
# Derive the remote computer name/IP from the UNC path if deploying remotely
$RemoteHost = $null
if ($DeployPath -match '^\\\\([^\\]+)') { $RemoteHost = $Matches[1] }

if ($ServiceName) {
    if ($RemoteHost) {
        # Stop remote service via sc.exe (works without PSRemoting)
        $scStop = sc.exe "\\$RemoteHost" stop $ServiceName 2>&1
        Write-Host "  sc stop $ServiceName on $RemoteHost`: $scStop" -ForegroundColor Gray
        Start-Sleep -Seconds 3  # give service time to release file handles
    } else {
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') {
            Stop-Service -Name $ServiceName -Force
            Write-Host "  Service '$ServiceName' stopped." -ForegroundColor Gray
        }
    }
} else {
    # Try to stop node process running from the deploy path
    $nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.CommandLine -match [regex]::Escape($DeployPath) }
    if ($nodeProcs) {
        $nodeProcs | Stop-Process -Force
        Write-Host "  Node process(es) stopped." -ForegroundColor Gray
    } else {
        Write-Host "  No running process detected (manual restart may be needed)." -ForegroundColor DarkYellow
    }
}

# ─── Step 3: Backup current deployment ─────────────────────
Write-Host "`n[3/5] Backing up current deployment..." -ForegroundColor Yellow
$BackupDir = Join-Path $DeployPath ".backups"
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }

# Backup the critical folders (dist, dist-server, prisma, server)
$foldersToBackup = @('dist', 'dist-server')
foreach ($folder in $foldersToBackup) {
    $src = Join-Path $DeployPath $folder
    if (Test-Path $src) {
        $dest = Join-Path $BackupDir "${folder}_$BackupSuffix"
        Copy-Item $src -Destination $dest -Recurse -Force
    }
}
Write-Host "  Backup saved to $BackupDir" -ForegroundColor Gray

# ─── Step 4: Deploy ────────────────────────────────────────
Write-Host "`n[4/5] Deploying..." -ForegroundColor Yellow

# Extract to a temp location first
$TempExtract = Join-Path $env:TEMP "conferencehub-deploy-$BackupSuffix"
if (Test-Path $TempExtract) { Remove-Item $TempExtract -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath $TempExtract -Force

# Preserve the daemon folder (service binary + config) — save it before wiping dist-server
$daemonSrc = Join-Path $DeployPath 'dist-server\server\daemon'
$daemonTemp = Join-Path $env:TEMP "conferencehub-daemon-$BackupSuffix"
$hasDaemon = Test-Path $daemonSrc
if ($hasDaemon) {
    Copy-Item $daemonSrc -Destination $daemonTemp -Recurse -Force
    Write-Host "  Saved daemon folder to temp" -ForegroundColor Gray
}

# Only update the built output & prisma (preserve .env, node_modules, database, uploads)
# NOTE: The 'uploads/' folder (booking file attachments) is intentionally NOT in this list
#       so user-uploaded files are preserved across deployments.
# Use robocopy /MIR for directories (much faster over UNC than recursive Remove+Copy-Item).
$deployDirs  = @('dist', 'dist-server', 'prisma')
$deployFiles = @('package.json', 'package-lock.json')

foreach ($dir in $deployDirs) {
    $src  = Join-Path $TempExtract $dir
    $dest = Join-Path $DeployPath  $dir
    if (Test-Path $src) {
        robocopy $src $dest /MIR /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
        # Robocopy exit codes 0-7 are all "success" (some combination of copied/skipped/mismatched
        # files); 8+ means at least one real failure (file lock, permission, network drop over UNC).
        # This previously went unchecked, so a partial/failed copy (e.g. of prisma/migrations) would
        # still print "Updated" and the deploy would proceed as if nothing was wrong — see Known Issue
        # in the deployment guide about a migration folder silently going missing from production this way.
        if ($LASTEXITCODE -ge 8) {
            throw "robocopy failed copying '$dir' to production (exit code $LASTEXITCODE) - deploy aborted before restarting the service. Re-run the deploy; if this persists, check for file locks or connectivity issues on $DeployPath."
        }
        Write-Host "  Updated: $dir" -ForegroundColor Gray
    }
}

# Verify every local migration folder actually landed on production — this is the specific thing
# that silently went missing on a prior deploy (robocopy "succeeded" with no error, but the count
# was short), causing 'npx prisma migrate deploy' on the server to find nothing pending and skip
# a migration that was never actually applied. Cheap to check, catastrophic to miss.
$localMigrationsDir  = Join-Path $ProjectRoot 'prisma\migrations'
$remoteMigrationsDir = Join-Path $DeployPath  'prisma\migrations'
if (Test-Path $localMigrationsDir) {
    $localMigrations  = Get-ChildItem $localMigrationsDir -Directory | Select-Object -ExpandProperty Name | Sort-Object
    $remoteMigrations = if (Test-Path $remoteMigrationsDir) { Get-ChildItem $remoteMigrationsDir -Directory | Select-Object -ExpandProperty Name | Sort-Object } else { @() }
    $missing = Compare-Object $localMigrations $remoteMigrations | Where-Object { $_.SideIndicator -eq '<=' } | Select-Object -ExpandProperty InputObject
    if ($missing) {
        throw "Migration folder(s) missing on production after copy: $($missing -join ', ') - deploy aborted before restarting the service. Do NOT proceed; re-run the deploy, and if this keeps happening, copy prisma\migrations manually and investigate the UNC connection to $DeployPath."
    }
    Write-Host "  Verified: all $($localMigrations.Count) migration folders present on production" -ForegroundColor Gray
}

foreach ($file in $deployFiles) {
    $src  = Join-Path $TempExtract $file
    $dest = Join-Path $DeployPath  $file
    if (Test-Path $src) {
        Copy-Item $src -Destination $dest -Force
        Write-Host "  Updated: $file" -ForegroundColor Gray
    }
}

# Restore the daemon folder (robocopy /MIR would have wiped it from dist-server)
if ($hasDaemon) {
    $daemonDest = Join-Path $DeployPath 'dist-server\server\daemon'
    if (-not (Test-Path $daemonDest)) { New-Item -ItemType Directory -Path $daemonDest -Force | Out-Null }
    Copy-Item "$daemonTemp\*" -Destination $daemonDest -Recurse -Force
    Remove-Item $daemonTemp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Restored daemon folder" -ForegroundColor Gray
}

# Run npm install only if package.json changed, node_modules looks corrupt, or -ForceNpmInstall was passed.
# Skipping this over UNC saves time on every normal deploy.
$localPkgHash  = (Get-FileHash (Join-Path $ProjectRoot 'package.json') -Algorithm MD5).Hash
$remotePkgPath = Join-Path $DeployPath 'package.json'
$remotePkgHash = if (Test-Path $remotePkgPath) { (Get-FileHash $remotePkgPath -Algorithm MD5).Hash } else { '' }
$pkgChanged = $localPkgHash -ne $remotePkgHash

# Detect corrupt node_modules: check that key runtime deps have their package.json present
$nodeModules    = Join-Path $DeployPath 'node_modules'
$corruptDetect  = @('yargs', 'node-windows', 'express') |
    Where-Object { -not (Test-Path (Join-Path $nodeModules "$_\package.json")) }
$nodeModulesCorrupt = $corruptDetect.Count -gt 0

if ($ForceNpmInstall -or $pkgChanged -or $nodeModulesCorrupt) {
    if ($nodeModulesCorrupt) {
        Write-Host "  node_modules corrupt (missing: $($corruptDetect -join ', ')) - running npm install..." -ForegroundColor DarkYellow
    } elseif ($pkgChanged) {
        Write-Host "  package.json changed - running npm install..." -ForegroundColor Gray
    } else {
        Write-Host "  -ForceNpmInstall specified - running npm install..." -ForegroundColor Gray
    }
    # Map a drive letter so Node.js sees a proper cwd (required for npm over UNC)
    $TempDriveLetter = $null
    if ($DeployPath.StartsWith('\\')) {
        $letter = [char[]]('Z','Y','X','W','V','U','T','S','R','Q','P','O','N','M','L','K','J','I','H','G') |
            Where-Object { -not (Test-Path "${_}:\") } | Select-Object -First 1
        if (-not $letter) { throw 'No available drive letter for UNC mapping' }
        $TempDriveLetter = "${letter}:"
        net use $TempDriveLetter $DeployPath /persistent:no 2>&1 | Out-Null
        Write-Host "  Mapped $TempDriveLetter -> $DeployPath" -ForegroundColor Gray
        # --ignore-scripts: lifecycle scripts (e.g. prisma generate) fail over UNC; we handle prisma separately
        cmd /c "pushd $TempDriveLetter && npm install --prefer-offline --ignore-scripts 2>&1"
        net use $TempDriveLetter /delete /y 2>&1 | Out-Null
        Remove-PSDrive -Name $TempDriveLetter[0] -ErrorAction SilentlyContinue
    } else {
        Push-Location $DeployPath
        & npm install --prefer-offline 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        Pop-Location
    }
    Write-Host "  npm install complete." -ForegroundColor Gray
} else {
    Write-Host "  package.json unchanged - skipping npm install (pass -ForceNpmInstall to override)." -ForegroundColor Green
}

# Copy pre-generated Prisma client from zip to production node_modules.
# The client is bundled during build (build-zip.ps1) so no node commands run on production.
$prismaClientSrc  = Join-Path $TempExtract '.prisma\client'
$prismaClientDest = Join-Path $DeployPath  'node_modules\.prisma\client'
if (Test-Path $prismaClientSrc) {
    if (-not (Test-Path $prismaClientDest)) { New-Item -ItemType Directory -Path $prismaClientDest -Force | Out-Null }
    Copy-Item "$prismaClientSrc\*" -Destination $prismaClientDest -Recurse -Force
    Write-Host "  Prisma client deployed." -ForegroundColor Gray
} else {
    Write-Host "  WARNING: .prisma/client not found in zip - Prisma client not updated." -ForegroundColor DarkYellow
}

# Run prisma migrate locally against the production database.
# We read DATABASE_URL from the server's .env so we never need Prisma engine binaries on the server.
Write-Host "  Running database migrations (local -> production DB)..." -ForegroundColor Gray
$serverEnvPath = Join-Path $DeployPath '.env'
$prodDatabaseUrl = $null
if (Test-Path $serverEnvPath) {
    $envLine = Get-Content $serverEnvPath | Where-Object { $_ -match '^DATABASE_URL\s*=' } | Select-Object -First 1
    if ($envLine -match '^DATABASE_URL\s*=\s*"?([^"]+)"?\s*$') {
        $prodDatabaseUrl = $Matches[1].Trim('"').Trim("'")
    }
}
if ($prodDatabaseUrl) {
    # If deploying remotely, the .env uses 'localhost' (relative to the server).
    # Replace localhost/127.0.0.1 with the remote host IP so migrations run correctly from this machine.
    if ($RemoteHost) {
        $prodDatabaseUrl = $prodDatabaseUrl -replace '(?<=@)(localhost|127\.0\.0\.1)(?=[\:/])', $RemoteHost
    }
    $env:DATABASE_URL = $prodDatabaseUrl
    try {
        $migrateOutput = cmd /c "npx prisma migrate deploy --schema `"$ProjectRoot\prisma\schema.prisma`" 2>&1"
        $migrateOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    } catch {
        Write-Host "  Migration warning (may be harmless): $_" -ForegroundColor DarkYellow
    }
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
} else {
    Write-Host "  WARNING: Could not read DATABASE_URL from server .env - skipping migrations." -ForegroundColor DarkYellow
}

# Cleanup temp
Remove-Item $TempExtract -Recurse -Force

# ─── Step 5: Start the service / process ───────────────────
Write-Host "`n[5/5] Starting application..." -ForegroundColor Yellow
if ($ServiceName) {
    if ($RemoteHost) {
        $scStart = sc.exe "\\$RemoteHost" start $ServiceName 2>&1
        Write-Host "  sc start $ServiceName on $RemoteHost`: $scStart" -ForegroundColor Gray
    } else {
        Start-Service -Name $ServiceName
        Start-Sleep -Seconds 2
        $svc = Get-Service -Name $ServiceName
        Write-Host "  Service '$ServiceName': $($svc.Status)" -ForegroundColor Gray
    }
} else {
    Write-Host "  No service configured. Start manually with:" -ForegroundColor DarkYellow
    Write-Host "    cd $DeployPath" -ForegroundColor Cyan
    Write-Host "    node dist-server/server/index.js" -ForegroundColor Cyan
}

Write-Host "`n=== Deploy Complete! ===" -ForegroundColor Green
Write-Host "  Backup: $BackupDir" -ForegroundColor Gray
Write-Host ""
