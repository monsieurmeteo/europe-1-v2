$content = Get-Content -Path 'records_utf8.json' -Encoding UTF8 -Raw
# Remove BOM if present
if ($content.StartsWith([char]65279)) { $content = $content.Substring(1) }
$data = $content | ConvertFrom-Json

$monthMap = @{
    'janvier' = 1; 'fevrier' = 2; 'mars' = 3; 'avril' = 4; 'mai' = 5; 'juin' = 6;
    'juillet' = 7; 'aout' = 8; 'septembre' = 9; 'octobre' = 10; 'novembre' = 11; 'decembre' = 12
}

function Strip-Accents {
    param([string]$s)
    $s = $s.ToLower()
    $map = @{'e' = @([char]0x00E9, [char]0x00E8, [char]0x00EA); 'u' = @([char]0x00FB, [char]0x00F9); 'a' = @([char]0x00E0, [char]0x00E2); 'i' = @([char]0x00EE, [char]0x00EF); 'o' = @([char]0x00F4); 'c' = @([char]0x00E7) }
    foreach ($k in $map.Keys) {
        foreach ($c in $map[$k]) { $s = $s.Replace([string]$c, $k) }
    }
    return $s
}

$pairs = @()
foreach ($row in $data) {
    if (!$row.Date) { continue }
    $normalized = Strip-Accents $row.Date
    if ($normalized -notmatch '^(\d+) ([a-z]+)$') { continue }
    $day = [int]$Matches[1]
    $monthName = $Matches[2]
    $monthNum = $monthMap[$monthName]
    if (!$monthNum) { continue }
    $minVal = $row.Max  # Max column = Min temperature value in this layout
    if ($null -ne $minVal -and $minVal -ne '') {
        $pairs += [PSCustomObject]@{ Key = "$monthNum-$day"; Min = $minVal; Year = $row.Min }
    }
}

Write-Host "Records found: $($pairs.Count)"

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append("const lilleRecordsMin = {")
$first = $true
foreach ($p in $pairs) {
    if (!$first) { [void]$sb.Append(",") }
    $first = $false
    $yr = if ($null -ne $p.Year) { $p.Year } else { "null"; }
    [void]$sb.Append("""$($p.Key)"":{""min"":$($p.Min),""year"":$yr}")
}
[void]$sb.Append("};")

Set-Content -Path 'lille_records.js' -Value $sb.ToString() -Encoding UTF8
Write-Host "File written!"
