$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$workbook = $excel.Workbooks.Open('C:\Users\grego\Documents\europe 1 V2\RECORD NORMALE LILLE.xlsx')
$sheet = $workbook.Sheets.Item(1)

$months = @{
    'janvier' = 1; 'fevrier' = 2; 'mars' = 3; 'avril' = 4; 'mai' = 5; 'juin' = 6;
    'juillet' = 7; 'aout' = 8; 'septembre' = 9; 'octobre' = 10; 'novembre' = 11; 'decembre' = 12
}

function Remove-Accents($s) {
    $s = $s.ToLower()
    $s = $s.Replace([char]0x00E9, 'e').Replace([char]0x00E8, 'e').Replace([char]0x00EA, 'e')
    $s = $s.Replace([char]0x00FB, 'u').Replace([char]0x00E0, 'a').Replace([char]0x00E2, 'a')
    $s = $s.Replace([char]0x00EE, 'i').Replace([char]0x00F4, 'o').Replace([char]0x00E7, 'c')
    return $s
}

$maxRow = $sheet.UsedRange.Rows.Count
$pairs = @()

for ($i = 2; $i -le $maxRow; $i++) {
    $dateVal = $sheet.Cells.Item($i, 1).Text
    if (!$dateVal) { continue }
    $normalized = Remove-Accents $dateVal
    if ($normalized -notmatch '^(\d+) (\w+)$') { continue }
    $day = [int]$matches[1]
    $monthName = $matches[2]
    $monthNum = $months[$monthName]
    if (!$monthNum) { continue }
    $tempVal = $sheet.Cells.Item($i, 2).Value2
    $yearVal = $sheet.Cells.Item($i, 3).Value2
    if ($null -ne $tempVal) {
        $pairs += [PSCustomObject]@{ Key = "$monthNum-$day"; Min = $tempVal; Year = $yearVal }
    }
}

$workbook.Close($false)
$excel.Quit()

Write-Host "Total records: $($pairs.Count)"

# Build JS object
$sb = [System.Text.StringBuilder]::new()
[void]$sb.Append("const lilleRecordsMin = {")
$first = $true
foreach ($p in $pairs) {
    if (!$first) { [void]$sb.Append(",") }
    $first = $false
    $year = if ($p.Year) { $p.Year.ToString() } else { "null" }
    [void]$sb.Append("`"$($p.Key)`":{`"min`":$($p.Min),`"year`":$year}")
}
[void]$sb.Append("};")

$sb.ToString() | Out-File -FilePath 'C:\Users\grego\Documents\europe 1 V2\lille_records.js' -Encoding UTF8
Write-Host "Done!"
