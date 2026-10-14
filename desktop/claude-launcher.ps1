# Run from your project directory. The original Claude settings file is never edited.
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$ClaudeArguments)
$tuaClaude = Get-Command claude -ErrorAction Stop
$tuaVersion = (& $tuaClaude.Source --version | Out-String)
if ($tuaVersion -notmatch '2\.1\.(\d+)' -or [int]$Matches[1] -lt 251) { throw 'Supported Claude Code: 2.1.251 or later within 2.1.x.' }
& $tuaClaude.Source --settings (Join-Path $PSScriptRoot 'claude-settings.json') @ClaudeArguments
exit $LASTEXITCODE
