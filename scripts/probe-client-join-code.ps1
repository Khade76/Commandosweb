param(
    [int]$Minutes = 180,
    [int]$ContextLines = 3,
    [switch]$Watch,
    [int]$WatchSeconds = 120
)

$ErrorActionPreference = 'SilentlyContinue'

Write-Host 'WARDOGS local-client join-code probe'
Write-Host 'Reads local WARDOGS-related log/text/json files only. It does not contact WARDOGS, Pragma, GameLift or MetaForge.'
Write-Host 'Recognised join-code forms: 123456, 123-456, 123 456, en/em dash variants.'
Write-Host ''

$targetPattern = '(?i)(44th\s+Commandos|44thwardogs|165\.217\.136\.52|165\.217\.136\.99)'
$contextPattern = '(?i)(join|connect|server\s*(?:id|code)|join\s*(?:id|code)|session|instance|match|browser|listing|game\s*id|pragma|gamelift)'
$codePattern = '(?<!\d)(?:\d{3}[\-\s\u2013\u2014]\d{3}|\d{6})(?!\d)'
$falsePositivePattern = '(?i)(Build:|Live-CL-|CL-\d+|Earned=|Cash:|Player Cash|steamId|7656119|Timestamp=|PS_WDPlayerStateSession)'

function Normalize-Code([string]$Value) {
    return ($Value -replace '\D', '')
}

function Get-CandidateDirectories {
    $roots = @()
    if ($env:LOCALAPPDATA) { $roots += $env:LOCALAPPDATA }
    if ($env:APPDATA) { $roots += $env:APPDATA }

    $direct = New-Object System.Collections.Generic.List[string]
    foreach ($root in $roots | Select-Object -Unique) {
        if (-not (Test-Path $root)) { continue }

        Get-ChildItem -LiteralPath $root -Directory -Force | ForEach-Object {
            if ($_.Name -match '(?i)(wardogs|wardog|wdgame|bulkhead|team17|pragma)') {
                $direct.Add($_.FullName)
            }
        }

        # UE games conventionally place runtime logs beneath <Project>\Saved\Logs.
        # Walk only a few directory levels so this does not crawl the whole profile.
        $level1 = @(Get-ChildItem -LiteralPath $root -Directory -Force)
        foreach ($d1 in $level1) {
            $saved = Join-Path $d1.FullName 'Saved'
            if (Test-Path $saved) {
                $logs = Join-Path $saved 'Logs'
                if (Test-Path $logs) { $direct.Add($logs) }
            }

            foreach ($d2 in @(Get-ChildItem -LiteralPath $d1.FullName -Directory -Force)) {
                $saved2 = Join-Path $d2.FullName 'Saved'
                if (Test-Path $saved2) {
                    $logs2 = Join-Path $saved2 'Logs'
                    if (Test-Path $logs2) { $direct.Add($logs2) }
                }
            }
        }
    }

    return $direct | Sort-Object -Unique
}

function Get-RecentFiles([string[]]$Directories) {
    $cutoff = (Get-Date).AddMinutes(-1 * $Minutes)
    $items = New-Object System.Collections.Generic.List[System.IO.FileInfo]

    foreach ($dir in $Directories) {
        Get-ChildItem -LiteralPath $dir -File -Recurse -Force | Where-Object {
            $_.LastWriteTime -ge $cutoff -and $_.Length -gt 0 -and $_.Length -lt 200MB -and $_.Extension -match '(?i)^\.(log|txt|json)$'
        } | ForEach-Object { $items.Add($_) }
    }

    return $items | Sort-Object LastWriteTime -Descending -Unique
}

function Scan-File([System.IO.FileInfo]$File) {
    $lines = @()
    try {
        $lines = [System.IO.File]::ReadAllLines($File.FullName)
    } catch {
        return @()
    }

    $hits = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = [string]$lines[$i]
        if ($line -notmatch $targetPattern -and $line -notmatch $contextPattern -and $line -notmatch $codePattern) { continue }
        if ($line -match $falsePositivePattern -and $line -notmatch $targetPattern) { continue }

        $start = [Math]::Max(0, $i - $ContextLines)
        $end = [Math]::Min($lines.Count - 1, $i + $ContextLines)
        $context = ($lines[$start..$end] -join "`n")

        $nearTarget = $context -match $targetPattern
        $nearContext = $context -match $contextPattern
        $matches = [regex]::Matches($context, $codePattern)

        foreach ($m in $matches) {
            $raw = $m.Value
            $normal = Normalize-Code $raw
            if ($normal.Length -ne 6) { continue }
            if ($context -match $falsePositivePattern -and -not $nearTarget) { continue }

            $score = 1
            if ($nearContext) { $score += 3 }
            if ($nearTarget) { $score += 8 }
            if ($context -match '(?i)(join\s*(?:id|code)|server\s*(?:id|code)|connect\s*code|direct\s*connect)') { $score += 8 }
            if ($context -match '(?i)(Build:|Live-CL-|CL-)') { $score -= 8 }

            $hits.Add([pscustomobject]@{
                Code = $normal
                Raw = $raw
                Score = $score
                Path = $File.FullName
                Line = $i + 1
                Context = $context
            })
        }

        if ($nearTarget -and $matches.Count -eq 0) {
            $hits.Add([pscustomobject]@{
                Code = ''
                Raw = ''
                Score = 0
                Path = $File.FullName
                Line = $i + 1
                Context = $context
            })
        }
    }

    return $hits
}

$dirs = @(Get-CandidateDirectories)
if (-not $dirs.Count) {
    Write-Host 'No WARDOGS-like or Unreal Saved\Logs directories were found under LOCALAPPDATA/APPDATA.'
    Write-Host 'Open WARDOGS once, then re-run this probe.'
    exit 2
}

Write-Host 'Candidate log directories:'
$dirs | ForEach-Object { Write-Host "  $_" }
Write-Host ''

$files = @(Get-RecentFiles $dirs)
if (-not $files.Count) {
    Write-Host "No .log/.txt/.json files modified in the last $Minutes minutes were found in those directories."
    Write-Host 'Open WARDOGS and the server browser, search for 44th, then re-run this probe.'
    exit 3
}

Write-Host "Scanning $($files.Count) recent file(s)..."
$all = New-Object System.Collections.Generic.List[object]
foreach ($file in $files) {
    foreach ($hit in @(Scan-File $file)) { $all.Add($hit) }
}

$targetContexts = @($all | Where-Object { -not $_.Code } | Select-Object -First 12)
if ($targetContexts.Count) {
    Write-Host ''
    Write-Host '=== 44th server-name/IP contexts found ==='
    foreach ($hit in $targetContexts) {
        Write-Host "`n$($hit.Path):$($hit.Line)"
        Write-Host ($hit.Context.Substring(0, [Math]::Min(1200, $hit.Context.Length)))
    }
}

$candidates = @($all | Where-Object { $_.Code } | Sort-Object Score -Descending)
$dedup = @{}
foreach ($item in $candidates) {
    $key = "$($item.Code)|$($item.Path)"
    if (-not $dedup.ContainsKey($key) -or $item.Score -gt $dedup[$key].Score) { $dedup[$key] = $item }
}
$ranked = @($dedup.Values | Sort-Object Score -Descending)

Write-Host ''
Write-Host '=== Local-client join-code candidates ==='
if (-not $ranked.Count) {
    Write-Host 'No six-digit candidate was found near the 44th server identity or server-browser/session context.'
} else {
    foreach ($item in $ranked | Select-Object -First 20) {
        Write-Host "`n$($item.Code)  score=$($item.Score)  raw=$($item.Raw)"
        Write-Host "  $($item.Path):$($item.Line)"
        Write-Host ('  ' + (($item.Context -replace "`r?`n", ' | ').Substring(0, [Math]::Min(900, ($item.Context -replace "`r?`n", ' | ').Length))))
    }
}

if ($Watch) {
    Write-Host ''
    Write-Host "Watching candidate files for $WatchSeconds seconds. Open/refresh the WARDOGS server browser and search for '44th'."
    $positions = @{}
    foreach ($file in $files) { $positions[$file.FullName] = $file.Length }
    $deadline = (Get-Date).AddSeconds($WatchSeconds)

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 750
        foreach ($path in @($positions.Keys)) {
            if (-not (Test-Path $path)) { continue }
            $info = Get-Item -LiteralPath $path
            $old = [int64]$positions[$path]
            if ($info.Length -le $old) { continue }

            try {
                $fs = [System.IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
                $fs.Seek($old, 'Begin') | Out-Null
                $sr = New-Object System.IO.StreamReader($fs)
                $newText = $sr.ReadToEnd()
                $sr.Close(); $fs.Close()
                $positions[$path] = $info.Length

                foreach ($line in ($newText -split "`r?`n")) {
                    if ($line -match $falsePositivePattern -and $line -notmatch $targetPattern) { continue }
                    if ($line -notmatch $targetPattern -and $line -notmatch $contextPattern -and $line -notmatch $codePattern) { continue }
                    Write-Host "  $line"
                    foreach ($m in [regex]::Matches($line, $codePattern)) {
                        $normal = Normalize-Code $m.Value
                        if ($normal.Length -eq 6) { Write-Host "    >>> candidate: $normal (raw $($m.Value))" }
                    }
                }
            } catch {}
        }
    }
}

Write-Host ''
Write-Host 'Tip: the strongest result is a code on the same/adjacent line as a 44th server name/IP or explicit join/server-code field.'
