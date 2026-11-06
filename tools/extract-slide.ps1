param($F,$Out)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$typed=New-Object -ComObject PowerPoint.Application
$ptr=[Runtime.InteropServices.Marshal]::GetIUnknownForObject($typed); $pp=[Runtime.InteropServices.Marshal]::GetUniqueObjectForIUnknown($ptr); [void][Runtime.InteropServices.Marshal]::Release($ptr)
$p=$null; $rows=New-Object Collections.ArrayList
function Hex($c){ '#{0:X2}{1:X2}{2:X2}' -f ($c -band 255),(($c -shr 8) -band 255),(($c -shr 16) -band 255) }
function Dump($h,$parent){
  $o=[ordered]@{ id=$h.Id; name=$h.Name; type=[int]$h.Type; auto=[int]$h.AutoShapeType; x=[math]::Round($h.Left,1); y=[math]::Round($h.Top,1); w=[math]::Round($h.Width,1); h=[math]::Round($h.Height,1); rot=[math]::Round($h.Rotation,1); flipH=[int]$h.HorizontalFlip; flipV=[int]$h.VerticalFlip; parent=$parent }
  try{ if($h.Fill.Visible){ $o.fill=Hex $h.Fill.ForeColor.RGB } }catch{}
  try{ if($h.Line.Visible){ $o.line=Hex $h.Line.ForeColor.RGB; $o.lw=$h.Line.Weight; $o.dash=[int]$h.Line.DashStyle; $o.arrowB=[int]$h.Line.BeginArrowheadStyle; $o.arrowE=[int]$h.Line.EndArrowheadStyle } }catch{}
  try{ if($h.Connector){ $o.conn=1; $c=$h.ConnectorFormat; $o.ctype=[int]$c.Type; if($c.BeginConnected){ $o.from=$c.BeginConnectedShape.Id; $o.fromSite=$c.BeginConnectionSite }; if($c.EndConnected){ $o.to=$c.EndConnectedShape.Id; $o.toSite=$c.EndConnectionSite }; $adj=@(); for($i=1;$i -le $h.Adjustments.Count;$i++){ $adj+=[math]::Round($h.Adjustments.Item($i),3) }; $o.adj=$adj } }catch{}
  try{ if($h.HasTextFrame -and $h.TextFrame.HasText){ $o.text=($h.TextFrame.TextRange.Text -replace "[\r\n\v]+",' ') } }catch{}
  [void]$rows.Add($o)
  if($h.Type -eq 6){ foreach($g in $h.GroupItems){ Dump $g $h.Id } }
}
try {
  $p=$pp.Presentations.Open($F,-1,0,0); $s=$p.Slides.Item(1)
  foreach($h in $s.Shapes){ Dump $h 0 }
  [IO.File]::WriteAllText((Join-Path $Out 'slide1.json'),($rows | ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding $false))
  foreach($h in $s.Shapes){ if($h.Type -eq 13){
    $h.Copy(); Start-Sleep -Milliseconds 1500; $img=$null; for($i=0;$i -lt 10 -and -not $img;$i++){ $img=[Windows.Forms.Clipboard]::GetImage(); if(-not $img){ Start-Sleep -Milliseconds 500 } }
    if($img){ $o=Join-Path $Out ("plans\pic{0}.png" -f $h.Id); $img.Save($o,[Drawing.Imaging.ImageFormat]::Png); "pic id=$($h.Id) $($h.Name) rot=$($h.Rotation) crop? at $([int]$h.Left),$([int]$h.Top) $([int]$h.Width)x$([int]$h.Height) -> $($img.Width)x$($img.Height)"; $img.Dispose() } else { "pic $($h.Id): no image" }
  } }
} finally { [Windows.Forms.Clipboard]::Clear(); if($p){$p.Close()}; $pp.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pp); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($typed) }
