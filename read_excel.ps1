$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$workbook = $excel.Workbooks.Open('C:\Users\grego\Documents\europe 1 V2\RECORD NORMALE LILLE.xlsx')
$sheet = $workbook.Sheets.Item(1)
$data = @()
for ($i = 2; $i -le 367; $i++) {
    $row = [PSCustomObject]@{
        Date = $sheet.Cells.Item($i, 1).Text
        Max = $sheet.Cells.Item($i, 2).Value2
        Min = $sheet.Cells.Item($i, 3).Value2
    }
    $data += $row
}
$workbook.Close($false)
$excel.Quit()
$data | ConvertTo-Json | Out-File 'records.json'
