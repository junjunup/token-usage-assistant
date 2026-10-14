# Fail-open status-line observer. Never write stdin, transcript contents or errors to disk.
$ErrorActionPreference = 'SilentlyContinue'
try {
  $tuaInput = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $tuaCfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'collector.json') -Raw | ConvertFrom-Json
  $tuaWindows = @{}
  foreach ($tuaKey in @('five_hour', 'seven_day')) {
    $tuaWindow = $tuaInput.rate_limits.$tuaKey
    if ($null -ne $tuaWindow) { $tuaWindows[$tuaKey] = @{used_percentage=$tuaWindow.used_percentage;resets_at=$tuaWindow.resets_at} }
  }
  $tuaBody = @{version=$tuaInput.version;sessionId=$tuaInput.session_id;project=$tuaInput.workspace.current_dir;windows=$tuaWindows} | ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod -Method Post -Uri ('http://127.0.0.1:' + $tuaCfg.port + '/quota') -Headers @{'x-tua-token'=$tuaCfg.token} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($tuaBody)) -TimeoutSec 1 | Out-Null
  [Console]::Write('Token usage: local collector')
} catch { [Console]::Write('Token usage: collector offline') }
exit 0
