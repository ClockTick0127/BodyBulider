Add-Type -AssemblyName System.Drawing

$sourceDirectory = Join-Path $PSScriptRoot '..\src\assets\cursor'
$maximumSize = 32
$padding = 2
$contentBounds = @{
  'cursor1.png' = [System.Drawing.Rectangle]::new(410, 265, 590, 500)
  'cursor2.png' = [System.Drawing.Rectangle]::new(555, 315, 395, 330)
}

Get-ChildItem -LiteralPath $sourceDirectory -Filter 'cursor*.png' |
  Where-Object { $_.Name -in @('cursor1.png', 'cursor2.png') } |
  ForEach-Object {
  $source = [System.Drawing.Bitmap]::FromFile($_.FullName)

  try {
    $sourceBounds = $contentBounds[$_.Name]
    $contentWidth = $sourceBounds.Width
    $contentHeight = $sourceBounds.Height
    $availableSize = $maximumSize - (2 * $padding)
    $scale = [Math]::Min($availableSize / $contentWidth, $availableSize / $contentHeight)
    $width = [Math]::Max(1, [Math]::Round($contentWidth * $scale))
    $height = [Math]::Max(1, [Math]::Round($contentHeight * $scale))

    $output = New-Object System.Drawing.Bitmap $maximumSize, $maximumSize
    $graphics = [System.Drawing.Graphics]::FromImage($output)

    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

      $destination = New-Object System.Drawing.Rectangle $padding, $padding, $width, $height
      $graphics.DrawImage($source, $destination, $sourceBounds, [System.Drawing.GraphicsUnit]::Pixel)
    }
    finally {
      $graphics.Dispose()
    }

    try {
      if ($_.Name -eq 'cursor1.png') {
        $output.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)
      }

      $outputPath = Join-Path $sourceDirectory ($_.BaseName + '-cursor.png')
      $output.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $output.Dispose()
    }
  }
  finally {
    $source.Dispose()
  }
}
