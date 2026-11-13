param([Parameter(Mandatory)][string]$F,[Parameter(Mandatory)][string]$Out,[ValidateRange(1,999)][int]$Slide=1)
$ErrorActionPreference='Stop'
[void][IO.Directory]::CreateDirectory($Out)
[void][IO.Directory]::CreateDirectory((Join-Path $Out 'plans'))
$pp=New-Object -ComObject PowerPoint.Application
$hadPresentations=$pp.Presentations.Count
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
  $p=$pp.Presentations.Open($F,-1,0,0); $s=$p.Slides.Item($Slide)
  foreach($h in $s.Shapes){ Dump $h 0 }
  [IO.File]::WriteAllText((Join-Path $Out ("slide{0}.json" -f $Slide)),($rows | ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding $false))
  $s.Export((Join-Path $Out 'slide.png'),'PNG',1920,1080)
  [IO.File]::WriteAllText((Join-Path $Out 'source.json'),([ordered]@{slide=$Slide;slides=$p.Slides.Count;width=$p.PageSetup.SlideWidth;height=$p.PageSetup.SlideHeight} | ConvertTo-Json))
  foreach($h in $s.Shapes){ if($h.Type -eq 13){
    $imagePath=Join-Path $Out ("plans/pic{0}.png" -f $h.Id)
    $h.Export($imagePath,2)
    "Exported picture $($h.Id), slide $Slide"
  } }
} finally { if($p){$p.Close()}; if($hadPresentations -eq 0){$pp.Quit()}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($pp) }
