# Fail-open status-line observer. Never write stdin, transcript contents or errors to disk.
$ErrorActionPreference = 'SilentlyContinue'
# T12.7: the assistant's quota line may contain Chinese; write it as UTF-8 for Claude Code.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try {
  $tuaInput = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $tuaCfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'collector.json') -Raw | ConvertFrom-Json
  $tuaWindows = @{}
  foreach ($tuaKey in @('five_hour', 'seven_day')) {
    $tuaWindow = $tuaInput.rate_limits.$tuaKey
    if ($null -ne $tuaWindow) { $tuaWindows[$tuaKey] = @{used_percentage=$tuaWindow.used_percentage;resets_at=$tuaWindow.resets_at} }
  }
  $tuaBody = @{version=$tuaInput.version;sessionId=$tuaInput.session_id;project=$tuaInput.workspace.current_dir;windows=$tuaWindows} | ConvertTo-Json -Depth 5 -Compress
  $tuaReply = Invoke-RestMethod -Method Post -Uri ('http://127.0.0.1:' + $tuaCfg.port + '/quota') -Headers @{'x-tua-token'=$tuaCfg.token} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($tuaBody)) -TimeoutSec 1
  $tuaLine = $tuaReply.line
  if ($tuaLine -is [string] -and $tuaLine.Length -gt 0 -and $tuaLine.Length -le 200 -and $tuaLine -notmatch '[\x00-\x1f\x7f]') { [Console]::Write($tuaLine) }
  else { [Console]::Write('Token usage: local collector') }
} catch {
  # T13.1: connected through Claude Code's settings, every session runs this; an offline assistant then adds nothing.
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'statusline-chain.json'))) { [Console]::Write('Token usage: collector offline') }
}
exit 0
