$ErrorActionPreference = "Stop"
$root = "c:\Users\Eagi\projects\actual-budget-fork"

# --- Step 1: copy-migrations (mimics loot-core/bin/copy-migrations) ---
$lootCore = "$root\packages\loot-core"
$publicDir = "$root\packages\desktop-client\public"
$dataDir = "$publicDir\data"

$migrationsDir = "$dataDir\migrations"
if (Test-Path $migrationsDir) { Remove-Item $migrationsDir -Recurse -Force }
New-Item -ItemType Directory -Path $migrationsDir -Force | Out-Null
Copy-Item "$lootCore\migrations\*" $migrationsDir -Force
Copy-Item "$lootCore\default-db.sqlite" $dataDir -Force
Write-Host "Migrations copied."

# --- Step 2: Generate data-file-index.txt ---
Set-Location $dataDir
$files = Get-ChildItem -File -Recurse | ForEach-Object {
    $_.FullName.Substring($dataDir.Length + 1).Replace('\', '/')
} | Sort-Object
$files -join "`n" | Set-Content "$publicDir\data-file-index.txt" -NoNewline -Encoding utf8
Write-Host "data-file-index.txt generated with $($files.Count) entries."

# --- Step 3: Ensure kcab symlink ---
$kcabLink = "$publicDir\kcab"
$browserDist = "$lootCore\lib-dist\browser"
if (!(Test-Path $browserDist)) { New-Item -ItemType Directory -Path $browserDist -Force | Out-Null }
if (Test-Path $kcabLink) {
    $item = Get-Item $kcabLink -Force
    if ($item.LinkType -ne "SymbolicLink") {
        Remove-Item $kcabLink -Recurse -Force
        cmd.exe /c mklink /D "$kcabLink" "$browserDist"
    }
} else {
    cmd.exe /c mklink /D "$kcabLink" "$browserDist"
}
Write-Host "kcab symlink OK."

# --- Step 4: Copy sql-wasm.wasm ---
$sqlWasm = "$root\node_modules\@jlongster\sql.js\dist\sql-wasm.wasm"
if (Test-Path $sqlWasm) {
    Copy-Item $sqlWasm "$publicDir\sql-wasm.wasm" -Force
    Write-Host "sql-wasm.wasm copied."
}

# --- Step 5: Build loot-core browser backend (vite) ---
Write-Host "Building loot-core browser backend..."
$env:NODE_ENV = "development"
Set-Location $lootCore
npx vite build --config vite.config.ts --mode development
Write-Host "loot-core browser backend built."

# --- Step 6: Ensure service-worker symlink ---
$swLink = "$root\packages\desktop-client\service-worker"
$pluginsDist = "$root\packages\plugins-service\dist"
if (!(Test-Path $swLink)) {
    cmd.exe /c mklink /D "$swLink" "$pluginsDist"
}
Write-Host "service-worker symlink OK."

# --- Step 7: Start desktop-client vite dev server ---
Write-Host "Starting vite dev server on port 3001..."
$env:IS_GENERIC_BROWSER = "1"
$env:PORT = "3001"
$env:REACT_APP_BACKEND_WORKER_HASH = "dev"
Set-Location "$root\packages\desktop-client"
npx vite --port 3001 --open false
