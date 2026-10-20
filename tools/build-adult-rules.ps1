# Rebuilds rules/adult.json (WebWell's adult-content filter) from StevenBlack/hosts'
# porn-only list (MIT; merges several MIT-licensed upstream lists).
# Usage:  powershell -ExecutionPolicy Bypass -File tools\build-adult-rules.ps1
# Not loaded by the extension; it only writes the static ruleset.
param(
  [string]$Source = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
  [int]$ChunkSize = 2500
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP 'ww-adult-hosts.txt'
Invoke-WebRequest -UseBasicParsing $Source -OutFile $tmp

# Valid, lower-case host names only (Chrome rejects anything else in requestDomains).
$domains = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($line in [IO.File]::ReadLines($tmp)) {
  if ($line -notmatch '^0\.0\.0\.0\s+(\S+)') { continue }
  $d = $Matches[1].ToLower() -replace '^www\.', ''
  if ($d -eq '0.0.0.0' -or $d -notmatch '^[a-z0-9-]+(\.[a-z0-9-]+)+$') { continue }
  [void]$domains.Add($d)
}

# requestDomains also matches subdomains, so drop any domain whose parent is listed.
$kept = foreach ($d in $domains) {
  $p = $d; $covered = $false
  while (($i = $p.IndexOf('.')) -ge 0) {
    $p = $p.Substring($i + 1)
    if ($p.Contains('.') -and $domains.Contains($p)) { $covered = $true; break }
  }
  if (-not $covered) { $d }
}
$kept = @($kept | Sort-Object)

$rules = New-Object System.Collections.ArrayList
$id = 1
for ($i = 0; $i -lt $kept.Count; $i += $ChunkSize) {
  $chunk = $kept[$i..([Math]::Min($i + $ChunkSize, $kept.Count) - 1)]
  # Pages: redirect to WebWell's blocked page.
  [void]$rules.Add([ordered]@{ id = $id++; priority = 100
    action = @{ type = 'redirect'; redirect = @{ extensionPath = '/blocked/blocked.html?r=adult' } }
    condition = [ordered]@{ requestDomains = $chunk; resourceTypes = @('main_frame') } })
  # Everything embedded elsewhere (frames, images, video): just block.
  [void]$rules.Add([ordered]@{ id = $id++; priority = 100
    action = @{ type = 'block' }
    condition = [ordered]@{ requestDomains = $chunk; resourceTypes = @('sub_frame', 'image', 'media', 'script', 'xmlhttprequest') } })
}
# Catch-all for unlisted sites whose host name is unmistakably adult.
# One tiny regex per keyword: a single big alternation compiles past Chrome's
# 2 KB-per-regex memory limit and the whole rule gets skipped.
foreach ($kw in 'porn', 'xvideo', 'xnxx', 'xhamster', 'redtube', 'youporn', 'hentai', 'brazzers', 'onlyfans', 'chaturbate', 'livejasmin', 'stripchat', 'camsoda', 'bongacams', 'spankbang', 'rule34', 'nhentai') {
  [void]$rules.Add([ordered]@{ id = $id++; priority = 100
    action = @{ type = 'redirect'; redirect = @{ extensionPath = '/blocked/blocked.html?r=adult' } }
    condition = [ordered]@{
      regexFilter = '^https?://[^/]*' + $kw + '[^/]*/'
      isUrlFilterCaseSensitive = $false; resourceTypes = @('main_frame') } })
}

New-Item -ItemType Directory -Force (Join-Path $root 'rules') | Out-Null
$out = Join-Path $root 'rules\adult.json'
[IO.File]::WriteAllText($out, (ConvertTo-Json $rules -Depth 6 -Compress), (New-Object Text.UTF8Encoding $false))
"{0:N0} listed -> {1:N0} after subdomain folding -> {2} rules, {3:N1} MB" -f $domains.Count, $kept.Count, $rules.Count, ((Get-Item $out).Length / 1MB)
