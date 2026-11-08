# Reads every picture's geometry from a deck through PowerPoint COM: placed box, rotation, crop, and original size.
# Read-only: the deck opens without a window and is never saved. Writes JSON only (no images), so nothing protected is copied.
param([Parameter(Mandatory)][string]$F, [Parameter(Mandatory)][string]$Out)
$ErrorActionPreference = 'Stop'
$pp = New-Object -ComObject PowerPoint.Application
$had = $pp.Presentations.Count
$p = $null; $rows = New-Object Collections.ArrayList
function Walk($shapes, $slide, $parent) {
  foreach ($h in $shapes) {
    if ($h.Type -eq 6) { Walk $h.GroupItems $slide $h.Id; continue }
    if ($h.Type -ne 13) { continue }
    $o = [ordered]@{ slide = $slide; id = $h.Id; name = $h.Name; parent = $parent
      x = [math]::Round($h.Left, 2); y = [math]::Round($h.Top, 2); w = [math]::Round($h.Width, 2); h = [math]::Round($h.Height, 2); rot = [math]::Round($h.Rotation, 2)
      flipH = [int]$h.HorizontalFlip; flipV = [int]$h.VerticalFlip; alt = $h.AlternativeText }
    try { $c = $h.PictureFormat; $o.cropL = [math]::Round($c.CropLeft, 2); $o.cropT = [math]::Round($c.CropTop, 2); $o.cropR = [math]::Round($c.CropRight, 2); $o.cropB = [math]::Round($c.CropBottom, 2) } catch {}
    try {
      # the original size: a temporary copy reset to 100% of its source, then deleted (the deck is never saved)
      $d = $h.Duplicate().Item(1)
      $d.PictureFormat.CropLeft = 0; $d.PictureFormat.CropTop = 0; $d.PictureFormat.CropRight = 0; $d.PictureFormat.CropBottom = 0
      $d.ScaleHeight(1, -1); $d.ScaleWidth(1, -1)
      $o.origW = [math]::Round($d.Width, 2); $o.origH = [math]::Round($d.Height, 2)
      $d.Delete()
    } catch { $o.origErr = $_.Exception.GetType().Name }
    [void]$rows.Add($o)
  }
}
try {
  $p = $pp.Presentations.Open($F, -1, 0, 0)
  for ($i = 1; $i -le $p.Slides.Count; $i++) { Walk $p.Slides.Item($i).Shapes $i 0 }
  [IO.File]::WriteAllText($Out, ($rows | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
  "pictures=$($rows.Count)"
} finally { if ($p) { $p.Close() }; if ($had -eq 0) { $pp.Quit() }; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pp) }
