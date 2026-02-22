$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$workbook = $excel.Workbooks.Open('C:\Users\grego\Documents\europe 1 V2\RECORD NORMALE LILLE.xlsx')
$sheet = $workbook.Sheets.Item(1)
$maxRow = $sheet.UsedRange.Rows.Count
$maxCol = $sheet.UsedRange.Columns.Count
Write-Host "Rows: $maxRow, Cols: $maxCol"
for ($i = 1; $i -le [Math]::Min(15, $maxRow); $i++) {
    $row = @()
    for ($j = 1; $j -le [Math]::Min(10, $maxCol); $j++) {
        $row += $sheet.Cells.Item($i, $j).Text
    }
    Write-Host "Row $i: $($row -join ' | ')"
}
$workbook.Close($false)
$excel.Quit()
