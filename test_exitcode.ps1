$p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c exit 0" -PassThru -NoNewWindow
Start-Sleep -Seconds 2
Write-Host "HasExited: $($p.HasExited)"
if ($null -eq $p.ExitCode) { Write-Host "ExitCode is NULL!" } else { Write-Host "ExitCode: $($p.ExitCode)" }
