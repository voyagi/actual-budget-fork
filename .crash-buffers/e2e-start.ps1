$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

# Build plugins service worker
$env:NODE_ENV = "development"
$pluginsDir = "packages\plugins-service"
$desktopDir = "packages\desktop-client"

# Clean previous build
Remove-Item "$pluginsDir\dist\*" -Force -ErrorAction SilentlyContinue
if (Test-Path "$desktopDir\service-worker") { Remove-Item "$desktopDir\service-worker" -Force -Recurse -ErrorAction SilentlyContinue }

# Create symlink for dev
cmd.exe /c mklink /D "$desktopDir\service-worker" "$((Resolve-Path $pluginsDir\dist).Path)"

# Build via vite
npx vite build --config "$pluginsDir\vite.config.mts" --mode development

# Start the browser backend + frontend in parallel
$env:NODE_ENV = $null
npx npm-run-all --parallel "start:browser-backend" "start:browser-frontend"
