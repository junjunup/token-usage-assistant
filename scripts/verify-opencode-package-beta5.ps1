$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$env:ELECTRON_RUN_AS_NODE=$null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$nativeRoot=Join-Path $projectRoot ('work\portable-1.8.0-beta.5-'+$stamp)
$exe=Join-Path $projectRoot 'release-v1.8.0-beta.5\TokenUsageAssistant-Portable-1.8.0-beta.5.exe'
$p=Start-Process -FilePath $exe -ArgumentList @('--smoke-test',('--test-directory='+$nativeRoot),'--disable-gpu') -WindowStyle Hidden -Wait -PassThru
$report=Get-Content -LiteralPath (Join-Path $nativeRoot 'smoke-result.json') -Raw | ConvertFrom-Json
if ($p.ExitCode -ne 0 -or -not $report.ok) { $report | ConvertTo-Json -Depth 8; throw 'Native smoke failed' }
Copy-Item -LiteralPath (Join-Path $nativeRoot 'brand-native.json') -Destination docs/verification-1.8.0-beta.5/brand-native.json
Copy-Item -LiteralPath (Join-Path $nativeRoot 'smoke-result.json') -Destination docs/verification-1.8.0-beta.5/portable-smoke.json
Get-ChildItem -LiteralPath $nativeRoot -Filter '*.png' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination docs/verification-1.8.0-beta.5 }
node scripts/verify-package-beta5.cjs
if ($LASTEXITCODE -ne 0) { throw 'Source integrity failed' }
$newAsar=Join-Path $projectRoot 'release-v1.8.0-beta.5/win-unpacked/resources/app.asar'
$unpackRoot=Join-Path $projectRoot ('work\payloads-1.8.0-beta.5-'+$stamp)
$seven='C:\Users\Jun\AppData\Local\electron-builder\Cache\7zip@1.0.0\7zip-win-x64-a34pt\bin\7za.exe'
$items=@()
$expected=(Get-FileHash -LiteralPath $newAsar -Algorithm SHA256).Hash.ToLowerInvariant()
foreach ($kind in @('Setup','Portable')) {
  $target=Join-Path $unpackRoot $kind
  & $seven x (Join-Path $projectRoot ('release-v1.8.0-beta.5\TokenUsageAssistant-'+$kind+'-1.8.0-beta.5.exe')) 'resources\app.asar' ('-o'+$target) -y *> work/extract-1.8.0-beta.5.txt
  if ($LASTEXITCODE -ne 0) { throw 'Payload extraction failed' }
  $hash=(Get-FileHash -LiteralPath (Join-Path $target 'resources\app.asar') -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $expected) { throw 'Payload differs' }
  $items+=@{kind=$kind;asarSha256=$hash}
}
@{ok=$true;version='1.8.0-beta.5';asarSha256=$expected;payloads=$items} | ConvertTo-Json -Depth 4 | Set-Content docs/verification-1.8.0-beta.5/payload-integrity.json -Encoding utf8
$report.associations | ConvertTo-Json -Depth 5

