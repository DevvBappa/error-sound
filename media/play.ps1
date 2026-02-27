param([string]$soundFile)
Add-Type -AssemblyName presentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([uri]$soundFile)
$player.Play()
Start-Sleep -Milliseconds 3000
$player.Close()
