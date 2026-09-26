# MorphologAI - Yerel gelistirme sunucusu (Python/Node gerektirmez)
# Kullanim:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 5500]
# Sonra tarayicida: http://localhost:5500/
#
# - website/ klasorunu sunar; vercel.json'daki guvenlik basliklarini (CSP) uygular.
# - /api/config: proje kokundeki .env.local dosyasindan Supabase ayarini dondurur
#   (Vercel'deki api/config.js islevinin yerel karsiligi). Dosya yoksa yerel mod.
# - /__supabase/<dosya>: supabase/ klasorundeki SQL (yalnizca yerel testler icin).
param(
  [int]$Port = 5500,
  [string]$Root = (Join-Path $PSScriptRoot '..\website')
)

$Root = [System.IO.Path]::GetFullPath($Root)
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$SupabaseDir = Join-Path $ProjectRoot 'supabase'

# vercel.json'daki "/(.*)" basliklarini yerelde de uygula (CSP vb. yayindakiyle ayni olsun)
$globalHeaders = @{}
$vj = Join-Path $Root 'vercel.json'
if (Test-Path $vj) {
  try {
    $cfg = Get-Content $vj -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($rule in $cfg.headers) {
      if ($rule.source -eq '/(.*)') { foreach ($hd in $rule.headers) { $globalHeaders[$hd.key] = $hd.value } }
    }
  } catch { Write-Host "vercel.json okunamadi: $($_.Exception.Message)" }
}

function Read-DotEnv {
  $vars = @{}
  foreach ($f in @((Join-Path $ProjectRoot '.env.local'), (Join-Path $ProjectRoot '.env'), (Join-Path $Root '.env.local'))) {
    if (-not (Test-Path -LiteralPath $f)) { continue }
    foreach ($line in [System.IO.File]::ReadAllLines($f)) {
      $t = $line.Trim()
      if (-not $t -or $t.StartsWith('#')) { continue }
      $i = $t.IndexOf('=')
      if ($i -lt 1) { continue }
      $k = $t.Substring(0, $i).Trim()
      $v = $t.Substring($i + 1).Trim()
      if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) { $v = $v.Substring(1, $v.Length - 2) }
      else { $h = $v.IndexOf(' #'); if ($h -ge 0) { $v = $v.Substring(0, $h).Trim() } }
      if (-not $vars.ContainsKey($k)) { $vars[$k] = $v }
    }
  }
  return $vars
}

function Test-SecretKey([string]$key) {
  if ($key -match '^sb_secret_') { return $true }
  $parts = $key.Split('.')
  if ($parts.Length -ne 3) { return $false }
  try {
    $p = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($p.Length % 4) { 2 { $p += '==' } 3 { $p += '=' } }
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p))
    return ($json -match '"role"\s*:\s*"service_role"')
  } catch { return $false }
}

function Get-ClientConfig {
  $e = Read-DotEnv
  $url = @($e['SUPABASE_URL'], $e['NEXT_PUBLIC_SUPABASE_URL']) | Where-Object { $_ } | Select-Object -First 1
  $key = @($e['SUPABASE_ANON_KEY'], $e['SUPABASE_PUBLISHABLE_KEY'], $e['NEXT_PUBLIC_SUPABASE_ANON_KEY'], $e['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) | Where-Object { $_ } | Select-Object -First 1
  if (-not $url -or -not $key -or $url -match 'PROJE-KIMLIGI' -or $key -eq 'eyJ...') { return @{ status = 200; body = '{"supabase":null,"version":1}' } }
  $url = $url.TrimEnd('/')
  if ($url -notmatch '^https://[^/\s]+$') { return @{ status = 500; body = '{"supabase":null,"error":"SUPABASE_URL gecersiz (https://<proje>.supabase.co)."}' } }
  if (Test-SecretKey $key) { return @{ status = 500; body = '{"supabase":null,"error":"Gizli (service_role) anahtar tanimlanmis. Yalnizca anon/publishable anahtari kullanin."}' } }
  $body = (@{ supabase = @{ url = $url; anonKey = $key }; version = 1 } | ConvertTo-Json -Compress -Depth 4)
  return @{ status = 200; body = $body }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "MorphologAI: $Root -> http://localhost:$Port/"
$c0 = Get-ClientConfig
if ($c0.body -match '"url"') { Write-Host 'Supabase: .env.local bulundu -> bulut modu' } else { Write-Host 'Supabase: ayar yok -> yerel mod (bkz. .env.example)' }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'
  '.wav' = 'audio/wav'; '.mp3' = 'audio/mpeg'; '.m4a' = 'audio/mp4'; '.webm' = 'audio/webm'
  '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'; '.txt' = 'text/plain; charset=utf-8'
  '.md' = 'text/markdown; charset=utf-8'; '.dict' = 'text/plain; charset=utf-8'; '.sql' = 'text/plain; charset=utf-8'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    foreach ($k in $globalHeaders.Keys) { $res.Headers.Add($k, $globalHeaders[$k]) }
    $res.Headers.Add('Cache-Control', 'no-store')

    if ($path -eq '/api/config') {
      $c = Get-ClientConfig
      $res.StatusCode = $c.status
      $res.ContentType = 'application/json; charset=utf-8'
      $b = [Text.Encoding]::UTF8.GetBytes($c.body)
      $res.ContentLength64 = $b.Length
      $res.OutputStream.Write($b, 0, $b.Length)
      continue
    }

    if ($path.StartsWith('/__supabase/')) {
      $base = $SupabaseDir
      $full = [System.IO.Path]::GetFullPath((Join-Path $SupabaseDir ($path.Substring(12).Replace('/', '\'))))
    } else {
      $base = $Root
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $full = [System.IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/').Replace('/', '\'))))
    }
    # Kök dışına çıkış (../) ve "website2" gibi kardeş klasörler engellenir
    if (-not ($full -eq $base -or $full.StartsWith($base.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase))) { $res.StatusCode = 403; continue }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      # Vercel "cleanUrls" davranisi: /app -> app.html
      if (Test-Path -LiteralPath "$full.html" -PathType Leaf) { $full = "$full.html" }
      else {
        $res.StatusCode = 404
        $b = [Text.Encoding]::UTF8.GetBytes('404 - Bulunamadi')
        $res.OutputStream.Write($b, 0, $b.Length)
        Write-Host "404 $path"
        continue
      }
    }
    $ext = [System.IO.Path]::GetExtension($full).ToLower()
    $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $res.ContentLength64 = $bytes.Length
    if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
  } catch {
    Write-Host "HATA $($_.Exception.Message)"
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.Close() } catch {}
  }
}
