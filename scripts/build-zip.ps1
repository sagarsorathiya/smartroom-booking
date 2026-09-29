# build-zip.ps1 — Build and package ConferenceHub for production deployment
# Usage: powershell -ExecutionPolicy Bypass -File scripts/build-zip.ps1

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ZipName = 'conferencehub-production.zip'
$StagingDir = Join-Path $ProjectRoot '.zip-staging'
$ZipPath = Join-Path $ProjectRoot $ZipName

Write-Host "`n=== ConferenceHub Production Build ===" -ForegroundColor Cyan

# 1. Build frontend
Write-Host "`n[1/4] Building frontend..." -ForegroundColor Yellow
Push-Location $ProjectRoot
npx vite build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Frontend build failed' }

# 2. Build server
Write-Host "`n[2/4] Building server..." -ForegroundColor Yellow
npx tsc -p tsconfig.server.json
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'Server build failed' }

# 2.5. Generate Prisma client (bundled into zip so production never needs to run generate)
Write-Host "`n[2.5/4] Generating Prisma client..." -ForegroundColor Yellow
$prismaOut = cmd /c "npx prisma generate --schema prisma\schema.prisma 2>&1"
$prismaOut | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

# 3. Stage files
Write-Host "`n[3/4] Staging files..." -ForegroundColor Yellow
if (Test-Path $StagingDir) { Remove-Item $StagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $StagingDir | Out-Null

# Copy production artifacts
Copy-Item -Path (Join-Path $ProjectRoot 'dist') -Destination (Join-Path $StagingDir 'dist') -Recurse
Copy-Item -Path (Join-Path $ProjectRoot 'dist-server') -Destination (Join-Path $StagingDir 'dist-server') -Recurse
Copy-Item -Path (Join-Path $ProjectRoot 'prisma') -Destination (Join-Path $StagingDir 'prisma') -Recurse
Copy-Item -Path (Join-Path $ProjectRoot 'server') -Destination (Join-Path $StagingDir 'server') -Recurse
Copy-Item -Path (Join-Path $ProjectRoot 'components') -Destination (Join-Path $StagingDir 'components') -Recurse
Copy-Item -Path (Join-Path $ProjectRoot 'context') -Destination (Join-Path $StagingDir 'context') -Recurse
Copy-Item -Path (Join-Path $ProjectRoot 'services') -Destination (Join-Path $StagingDir 'services') -Recurse
Copy-Item -Path (Join-Path $ProjectRoot 'utils') -Destination (Join-Path $StagingDir 'utils') -Recurse
Copy-Item -Path (Join-Path $ProjectRoot 'scripts') -Destination (Join-Path $StagingDir 'scripts') -Recurse

# Bundle pre-generated Prisma client so production never needs to run prisma generate
$prismaClientSrc = Join-Path $ProjectRoot 'node_modules\.prisma\client'
if (Test-Path $prismaClientSrc) {
    $prismaClientDest = Join-Path $StagingDir '.prisma\client'
    New-Item -ItemType Directory -Path $prismaClientDest -Force | Out-Null
    Copy-Item "$prismaClientSrc\*" -Destination $prismaClientDest -Recurse -Force
    Write-Host "  Bundled .prisma/client" -ForegroundColor Gray
}

# Copy docs folder (SOP documents)
if (Test-Path (Join-Path $ProjectRoot 'docs')) {
    Copy-Item -Path (Join-Path $ProjectRoot 'docs') -Destination (Join-Path $StagingDir 'docs') -Recurse
}

# Copy public folder (static assets)
if (Test-Path (Join-Path $ProjectRoot 'public')) {
    Copy-Item -Path (Join-Path $ProjectRoot 'public') -Destination (Join-Path $StagingDir 'public') -Recurse
}

# Copy config & meta files
$filesToCopy = @(
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.server.json',
    'prisma.config.ts',
    'tailwind.config.js',
    'postcss.config.js',
    'metadata.json',
    '.env.example',
    'README.md',
    'index.html',
    'index.css',
    'index.tsx',
    'App.tsx',
    'types.ts',
    'constants.ts'
)
foreach ($f in $filesToCopy) {
    $src = Join-Path $ProjectRoot $f
    if (Test-Path $src) {
        Copy-Item $src -Destination $StagingDir
    } else {
        Write-Host "  Warning: $f not found, skipping" -ForegroundColor DarkYellow
    }
}

# 4. Create ZIP
Write-Host "`n[4/4] Creating $ZipName..." -ForegroundColor Yellow
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path (Join-Path $StagingDir '*') -DestinationPath $ZipPath -CompressionLevel Optimal

# Cleanup staging
Remove-Item $StagingDir -Recurse -Force
Pop-Location

$size = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
Write-Host "`n=== Done! $ZipName ($size MB) ===" -ForegroundColor Green
Write-Host "Location: $ZipPath"
Write-Host ""
Write-Host "Production deployment steps:" -ForegroundColor Cyan
Write-Host "  1. Extract ZIP to production server"
Write-Host "  2. npm install"
Write-Host "  3. npx prisma migrate deploy   (first time only)"
Write-Host "  4. npm start"
Write-Host ""
Write-Host "NOTE: Do NOT run 'npm run build' on the production server." -ForegroundColor Yellow
Write-Host "      The pre-built dist/ folder is already included in this ZIP.`n"
