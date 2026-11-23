# Run from your project directory. The original Claude settings file is never edited.
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$ClaudeArguments)
$tuaClaude = Get-Command claude -ErrorAction Stop
$tuaVersion = (& $tuaClaude.Source --version | Out-String)
# T18.5: 2.1.251 or any later version (it was 2.1.x only).
if ($tuaVersion -notmatch '(\d+)\.(\d+)\.(\d+)' -or [version]('{0}.{1}.{2}' -f $Matches[1], $Matches[2], $Matches[3]) -lt [version]'2.1.251') { throw 'Supported Claude Code: 2.1.251 or later.' }
& $tuaClaude.Source --settings (Join-Path $PSScriptRoot 'claude-settings.json') @ClaudeArguments
exit $LASTEXITCODE
