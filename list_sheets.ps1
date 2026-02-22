$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$workbook = $excel.Workbooks.Open('C:\Users\grego\Documents\europe 1 V2\RECORD NORMALE LILLE.xlsx')
foreach ($sheet in $workbook.Sheets) {
    Write-Output $sheet.Name
}
$workbook.Close($false)
$excel.Quit()
