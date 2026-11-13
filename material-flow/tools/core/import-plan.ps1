# Read a production plan workbook through Excel COM (owner rule: company files through COM, read-only, never saved).
# Sheets: "Plan" with headers line | model | per_hour | shift  and  "BOM" with headers model | material | per_unit
# (header names are matched case-insensitively; other columns are ignored). Writes JSON to stdout:
# { "plan": [ {line, model, per_hour, shift} ], "bom": [ {model, material, per_unit} ], "sheets": [...] }
# Uses its own hidden Excel instance and quits only that instance.
param([Parameter(Mandatory = $true)][string]$Path, [string]$PlanSheet = 'Plan', [string]$BomSheet = 'BOM')
$ErrorActionPreference = 'Stop'
$full = (Resolve-Path -LiteralPath $Path).Path
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false; $xl.EnableEvents = $false
$wb = $null
try {
  $wb = $xl.Workbooks.Open($full, 0, $true)   # UpdateLinks = 0, ReadOnly = true
  function Read-Table($name, $cols) {
    $ws = $null; foreach ($s in $wb.Worksheets) { if ($s.Name -ieq $name) { $ws = $s } }
    if (-not $ws) { throw "sheet '$name' not found (sheets: $((@($wb.Worksheets) | ForEach-Object { $_.Name }) -join ', '))" }
    $v = $ws.UsedRange.Value2; if ($null -eq $v) { return @() }
    $rows = $v.GetUpperBound(0); $ncol = $v.GetUpperBound(1); $idx = @{}
    for ($c = 1; $c -le $ncol; $c++) { $h = [string]$v[1, $c]; if ($h) { $idx[$h.Trim().ToLower()] = $c } }
    foreach ($k in $cols) { if (-not $idx.ContainsKey($k)) { throw "sheet '$name' needs a column '$k' (found: $($idx.Keys -join ', '))" } }
    $out = @()
    for ($r = 2; $r -le $rows; $r++) {
      $o = [ordered]@{}; $empty = $true
      foreach ($k in $cols) { $x = $v[$r, $idx[$k]]; if ($null -ne $x -and "$x" -ne '') { $empty = $false }; $o[$k] = $x }
      $o['row'] = $r
      if (-not $empty) { $out += [pscustomobject]$o }
    }
    return ,$out
  }
  $plan = Read-Table $PlanSheet @('line', 'model', 'per_hour', 'shift')
  $bom = Read-Table $BomSheet @('model', 'material', 'per_unit')
  $sheets = @($wb.Worksheets | ForEach-Object { $_.Name })
  [pscustomobject]@{ plan = $plan; bom = $bom; sheets = $sheets } | ConvertTo-Json -Depth 5 -Compress
}
finally {
  if ($wb) { $wb.Close($false) | Out-Null; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
  $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl); [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
