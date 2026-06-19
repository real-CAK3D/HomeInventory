# Run this in PowerShell as Administrator on the Nukebox.
# It makes Home Inventory reachable from phones/tablets on the same local Wi-Fi/LAN.

param(
  [int]$Port = 5173,
  [string]$InterfaceAlias = "Ethernet 5"
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "This script must be run as Administrator." -ForegroundColor Red
  Write-Host "Right-click PowerShell and choose 'Run as administrator', then run:"
  Write-Host ".\fix-wifi-access-admin.ps1"
  exit 1
}

Write-Host "Setting $InterfaceAlias network profile to Private..."
try {
  Set-NetConnectionProfile -InterfaceAlias $InterfaceAlias -NetworkCategory Private
} catch {
  Write-Host "Could not set profile for $InterfaceAlias. Current profiles:" -ForegroundColor Yellow
  Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory
}

Write-Host "Removing old Home Inventory firewall rules..."
Get-NetFirewallRule -DisplayName "Home Inventory*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

Write-Host "Allowing inbound TCP port $Port..."
New-NetFirewallRule `
  -DisplayName "Home Inventory $Port" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -Profile Any | Out-Null

Write-Host ""
Write-Host "Current listener on port $Port:"
netstat -ano | Select-String ":$Port"

Write-Host ""
Write-Host "Nukebox IPv4 addresses:"
ipconfig | Select-String -Pattern "IPv4 Address|Default Gateway|adapter"

Write-Host ""
Write-Host "Try this from a phone on spacebergade Wi-Fi:"
Write-Host "http://10.0.0.8:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "If that still does not load, the router is isolating Wi-Fi clients from wired LAN."
Write-Host "Disable Guest Network / AP Isolation / Client Isolation / Block LAN Access for spacebergade."
