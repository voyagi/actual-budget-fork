$env:IS_GENERIC_BROWSER = "1"
$env:PORT = "3001"
$env:REACT_APP_BACKEND_WORKER_HASH = "dev"
$env:NODE_ENV = "development"
Set-Location "c:\Users\Eagi\projects\actual-budget-fork\packages\desktop-client"
node "c:\Users\Eagi\projects\actual-budget-fork\node_modules\vite\bin\vite.js" --port 3001 --open false
