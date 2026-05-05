# wf-switch-continue.ps1 - WF Switch 持续对话脚本
param(
    [string]$reason = "[请描述你完成了什么]",
    [string]$details = "",
    [string]$workspace = ""
)

[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$null = chcp 65001 2>$null
$OutputEncoding = [System.Text.Encoding]::UTF8

$globalDataDir = "$env:LOCALAPPDATA\wf-switch-continue"
$portFile = Join-Path $globalDataDir ".wf_switch_continue_port"
$windowsFile = Join-Path $globalDataDir "windows.json"
$secretFile = Join-Path $globalDataDir ".wf_switch_continue_secret"

function ConvertTo-NormalizedText([string]$value) {
    if (-not $value) { return "" }
    return $value.Trim().ToLowerInvariant().Replace("/", "\")
}

function Get-RegisteredWindows {
    if (-not (Test-Path $windowsFile)) { return @() }
    try {
        $data = Get-Content $windowsFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $data.windows) { return @() }
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        return @($data.windows) | Where-Object {
            $_.port -and ($now - [int64]($_.updatedAtMs)) -lt 120000
        } | Sort-Object updatedAtMs -Descending
    } catch {
        return @()
    }
}

function Select-WindowPort {
    $windows = @(Get-RegisteredWindows)
    $hint = $workspace
    if (-not $hint) {
        try { $hint = (Get-Location).Path } catch {}
    }
    $hintNorm = ConvertTo-NormalizedText $hint
    if ($windows.Count -gt 0) {
        if ($hintNorm) {
            $match = $windows | Where-Object {
                $p = ConvertTo-NormalizedText ([string]$_.workspacePath)
                $n = ConvertTo-NormalizedText ([string]$_.workspaceName)
                $f = ConvertTo-NormalizedText ([string]$_.workspaceFile)
                ($p -and ($hintNorm -eq $p -or $hintNorm.StartsWith($p) -or $p.StartsWith($hintNorm))) -or
                ($f -and ($hintNorm -eq $f -or $hintNorm.StartsWith($f) -or $f.StartsWith($hintNorm))) -or
                ($n -and $hintNorm.Contains($n))
            } | Select-Object -First 1
            if ($match) { return [string]$match.port }
        }
        if ($windows.Count -eq 1) { return [string]$windows[0].port }
        Write-Host "[提示] 检测到多个 WF Switch 窗口，未能按 workspace 精确匹配，使用最近活跃窗口：$($windows[0].workspaceName) -> $($windows[0].port)"
        return [string]$windows[0].port
    }
    if (Test-Path $portFile) {
        return (Get-Content $portFile -Raw -Encoding UTF8).Trim()
    }
    return "34501"
}

$port = Select-WindowPort
$url = "http://localhost:$port/continue"

try {
    $authSecret = ""
    if (Test-Path $secretFile) {
        $authSecret = (Get-Content $secretFile -Raw -Encoding UTF8).Trim()
    }
    $payload = @{
        reason = $reason
        details = $details
        workspace = $workspace
        cwd = (Get-Location).Path
        source = "wf-switch-continue.ps1"
    } | ConvertTo-Json -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $request = [System.Net.HttpWebRequest]::Create($url)
    $request.Method = "POST"
    $request.ContentType = "application/json; charset=utf-8"
    $request.Timeout = 300000
    $request.ContentLength = $bodyBytes.Length
    if ($authSecret) { $request.Headers.Add("X-Auth-Secret", $authSecret) }
    $stream = $request.GetRequestStream()
    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    $stream.Close()
    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), [System.Text.Encoding]::UTF8)
    $responseText = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
    $result = $responseText | ConvertFrom-Json
    if ($result.should_continue) {
        if ($result.image_paths -and $result.image_paths.Count -gt 0) {
            Write-Host "--- BEGIN IMAGE PATHS ---"
            foreach ($imgPath in $result.image_paths) { Write-Host $imgPath }
            Write-Host "--- END IMAGE PATHS ---"
        }
        if ($result.attached_files -and $result.attached_files.Count -gt 0) {
            Write-Host "--- BEGIN ATTACHED FILES ---"
            foreach ($file in $result.attached_files) { Write-Host $file }
            Write-Host "--- END ATTACHED FILES ---"
        }
        if ($result.user_instruction -and $result.user_instruction.Trim()) {
            $instructionFile = Join-Path $globalDataDir "last_instruction.txt"
            $result.user_instruction | Out-File -FilePath $instructionFile -Encoding UTF8 -NoNewline
            Write-Host "User instruction saved to file: $instructionFile"
            Write-Host "--- BEGIN USER INSTRUCTION ---"
            Write-Host $result.user_instruction
            Write-Host "--- END USER INSTRUCTION ---"
        } else {
            Write-Host "User chose to continue"
        }
    } else {
        Write-Host "User chose to end the conversation"
        if ($result.error) { Write-Host ("[info] " + $result.error) }
    }
} catch [System.Net.WebException] {
    Write-Host "[错误] 无法连接到 WF Switch 继续对话服务 (端口: $port)"
    Write-Host "[错误] 详情: $($_.Exception.Message)"
    Write-Host "[提示] 请确保 Windsurf 已安装并加载 WF Switch 插件，且插件本地服务已启动"
} catch {
    Write-Host "[错误] 脚本执行失败: $_"
}
