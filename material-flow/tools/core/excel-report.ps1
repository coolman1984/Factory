# Write a report workbook through Excel COM (owner rule). Input JSON: { "sheets": [ { "name": "...", "rows": [[...], ...] } ] }.
# Uses its own hidden Excel instance and quits only that instance. Run with PowerShell 7 (pwsh): Windows PowerShell 5 fails on
# this PC with TYPE_E_LIBNOTREGISTERED. The saved file may come out NASCA-wrapped; read it back through COM only.
param([Parameter(Mandatory = $true)][string]$Json, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
$data = Get-Content -LiteralPath $Json -Raw | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
$wb = $null
try {
  $wb = $xl.Workbooks.Add()
  while ($wb.Worksheets.Count -lt $data.sheets.Count) { [void]$wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)) }
  for ($s = 0; $s -lt $data.sheets.Count; $s++) {
    $sh = $data.sheets[$s]; $ws = $wb.Worksheets.Item($s + 1); $ws.Name = $sh.name
    $rows = @($sh.rows); $nr = $rows.Count; $nc = ($rows | ForEach-Object { @($_).Count } | Measure-Object -Maximum).Maximum
    $arr = New-Object 'object[,]' $nr, $nc
    for ($r = 0; $r -lt $nr; $r++) { $row = @($rows[$r]); for ($c = 0; $c -lt $row.Count; $c++) { $arr[$r, $c] = $row[$c] } }
    $rng = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($nr, $nc)); $rng.Value2 = $arr
    $ws.Rows.Item(1).Font.Bold = $true; [void]$ws.UsedRange.Columns.AutoFit()
  }
  if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Force }
  $wb.SaveAs($Out, 51); $wb.Close($false); $wb = $null
}
finally {
  if ($wb) { $wb.Close($false) | Out-Null }
  $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl); [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
