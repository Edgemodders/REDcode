# A2F spike: restarts NVIDIA's Audio2Face container on one of its models and runs every exported line through it.
# Usage: powershell -File run-model.ps1 <model: james|claire|mark|multi> <lines folder> [client config: james|claire|mark]
# The NGC key is read from the Windows user variable into this process only; it is never printed.
param([Parameter(Mandatory = $true)][string]$Model, [Parameter(Mandatory = $true)][string]$Lines, [string]$Config = "claire")
# The container's model profiles for an RTX 4090 (from its list-model-profiles, 2.0).
$profiles = @{
  mark   = "4a13a78c606a49ddf4c0aeac66488897a0c392286bc98dde8c5097ce378b6835"
  claire = "c021f3ca049d620f84393cc2e8b1748439a849f4e4813e80343b46f819042f7d"
  james  = "c39d6cc51c706dcf9cb07ceecc80bf8641c4b2c08fe8588e0d6d875b464c6295"
  multi  = "dee1ac011ab648c0e10c9e92b5fec24f6ca665d9a76f69daa4476260a0e4d453"
}
if (-not $profiles.ContainsKey($Model)) { throw "Unknown model $Model" }
$env:NGC_API_KEY = [Environment]::GetEnvironmentVariable('NGC_API_KEY', 'User')
$env:NIM_MODEL_PROFILE = $profiles[$Model]
docker network create a2f 2>$null | Out-Null
docker rm -f a2f-nim 2>$null | Out-Null
docker run -d --name a2f-nim --network a2f --gpus all -e NGC_API_KEY -e NIM_MODEL_PROFILE -v a2f-cache:/opt/nim/.cache -p 52000:52000 -p 8000:8000 nvcr.io/nim/nvidia/audio2face-3d:2.0 | Out-Null
$ready = $false
foreach ($i in 1..80) {
  Start-Sleep -Seconds 5
  if ((docker inspect -f "{{.State.Status}}" a2f-nim 2>$null) -ne "running") { break }
  try { if ((Invoke-RestMethod -Uri http://127.0.0.1:8000/v1/health/ready -TimeoutSec 3).status -eq "ready") { $ready = $true; break } } catch { }
}
if (-not $ready) { docker logs --tail 15 a2f-nim 2>&1 | Where-Object { $_ -notmatch "(?i)key|token" }; throw "Audio2Face ($Model) did not become ready" }
"ready: $Model after $($i * 5) s"
foreach ($dir in Get-ChildItem -Directory $Lines) {
  if (-not (Test-Path (Join-Path $dir.FullName "voice.wav"))) { continue }
  Get-ChildItem -Directory $dir.FullName -Filter "output_*" | Remove-Item -Recurse -Force
  $ok = docker run --rm --network a2f -v "$($dir.FullName):/work" -w /work --entrypoint python3 edgefab-a2f-client /samples/app/a2f_3d.py run_inference /work/voice.wav /samples/app/config/config_$Config.yml -u a2f-nim:52000 2>&1 | Select-String "SUCCESS"
  $made = Get-ChildItem -Directory $dir.FullName -Filter "output_*" | Select-Object -First 1
  $to = Join-Path $dir.FullName "a2f_$Model"
  if (Test-Path $to) { Remove-Item -Recurse -Force $to }
  if ($made) { Rename-Item $made.FullName $to }
  "$($dir.Name): $([bool]$ok)"
}
