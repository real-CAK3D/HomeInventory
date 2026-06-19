param(
  [string]$HomeInventoryDir = "C:\Users\CAK3D-Creations VM\Home Inventory",
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"
$env:HOME_INVENTORY_DIR = $HomeInventoryDir
$env:HOST = "0.0.0.0"
$env:PORT = "$Port"

if (-not (Test-Path -LiteralPath $HomeInventoryDir)) {
  New-Item -ItemType Directory -Force -Path $HomeInventoryDir | Out-Null
}

npm.cmd run build
Write-Host ""
Write-Host "Home Inventory will listen on every network interface."
Write-Host "From another device, do not use 127.0.0.1. Use one of this machine's IPv4 addresses with port $Port."
Write-Host ""
ipconfig | Select-String -Pattern "IPv4 Address"
Write-Host ""
Write-Host "If phones cannot load it, run PowerShell as Administrator and allow inbound TCP $Port:"
Write-Host "New-NetFirewallRule -DisplayName `"Home Inventory $Port`" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any"
Write-Host ""
node.exe server.js
