param(
  [int]$Port = 5173
)

$ErrorActionPreference = "Continue"

Write-Host "Checking Nukebox Inventory on port $Port..."
Write-Host ""

Write-Host "Listening sockets:"
netstat -ano | Select-String ":$Port"

Write-Host ""
Write-Host "Local HTTP checks:"
foreach ($address in @("127.0.0.1", "10.0.0.8", "100.122.30.95")) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://$address`:$Port" -TimeoutSec 5
    Write-Host "http://$address`:$Port -> HTTP $($response.StatusCode)"
  } catch {
    Write-Host "http://$address`:$Port -> FAILED: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "IPv4 addresses on this machine:"
ipconfig | Select-String -Pattern "IPv4 Address|Default Gateway|adapter"

Write-Host ""
Write-Host "Phone test URLs:"
Write-Host "LAN:       http://10.0.0.8:$Port"
Write-Host "Tailscale: http://100.122.30.95:$Port"
Write-Host ""
Write-Host "If the local checks pass but the phone fails, the server is working and inbound traffic is blocked or the phone is on a different/isolated network."
Write-Host "Run PowerShell as Administrator and execute:"
Write-Host "New-NetFirewallRule -DisplayName `"Nukebox Inventory $Port`" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any"
