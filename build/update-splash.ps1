param(
  [Parameter(Mandatory = $true)][int]$InstallerPid,
  [string]$Version = ''
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = '专利撰写助手'
$form.Size = New-Object System.Drawing.Size(440, 210)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.ShowInTaskbar = $true

$label = New-Object System.Windows.Forms.Label
$label.Location = New-Object System.Drawing.Point(28, 28)
$label.Size = New-Object System.Drawing.Size(380, 72)
$verText = if ($Version) { " v$Version" } else { '' }
$label.Text = "正在安装专利撰写助手$verText …`r`n请勿关闭此窗口，安装完成后将自动启动应用。"
$form.Controls.Add($label)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(28, 118)
$bar.Size = New-Object System.Drawing.Size(380, 22)
$bar.Style = 'Marquee'
$bar.MarqueeAnimationSpeed = 24
$form.Controls.Add($bar)

$hint = New-Object System.Windows.Forms.Label
$hint.Location = New-Object System.Drawing.Point(28, 152)
$hint.Size = New-Object System.Drawing.Size(380, 36)
$hint.ForeColor = [System.Drawing.Color]::Gray
$hint.Text = '正在写入文件并配置环境，通常需要 1～3 分钟…'
$form.Controls.Add($hint)

$form.Add_Shown({ $form.Activate() })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
  $proc = Get-Process -Id $InstallerPid -ErrorAction SilentlyContinue
  if (-not $proc) {
    $label.Text = "安装完成，正在启动专利撰写助手…"
    $hint.Text = '若数秒内未自动打开，请从开始菜单手动启动。'
    $bar.Style = 'Continuous'
    $bar.Value = 100
    $timer.Stop()
    Start-Sleep -Seconds 3
    $form.Close()
  }
})
$timer.Start()

[void][System.Windows.Forms.Application]::Run($form)
