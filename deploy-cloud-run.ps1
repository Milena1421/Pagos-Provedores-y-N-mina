param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [string]$ServiceName = "pagos-i365",
    [string]$Region = "us-central1",
    [string]$Repository = "cloud-run",
    [string]$ImageTag = "latest",
    [string]$ViteSupabaseUrl = $env:VITE_SUPABASE_URL,
    [string]$ViteSupabaseAnonKey = $env:VITE_SUPABASE_ANON_KEY,
    [string]$GeminiApiKey = $env:GEMINI_API_KEY,
    [switch]$AllowUnauthenticated
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "No se encontro '$Name'. Instala Google Cloud CLI y vuelve a intentarlo."
    }
}

function Require-Value {
    param(
        [string]$Name,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Falta $Name. Pasalo como parametro o define la variable de entorno correspondiente."
    }
}

Require-Command "gcloud"
Require-Value "VITE_SUPABASE_URL" $ViteSupabaseUrl
Require-Value "VITE_SUPABASE_ANON_KEY" $ViteSupabaseAnonKey
Require-Value "GEMINI_API_KEY" $GeminiApiKey

$image = "$Region-docker.pkg.dev/$ProjectId/$Repository/$ServiceName`:$ImageTag"

Write-Host "Configurando proyecto $ProjectId..."
gcloud config set project $ProjectId | Out-Null

Write-Host "Habilitando APIs necesarias..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

$repoExists = $true
try {
    gcloud artifacts repositories describe $Repository --location $Region --format "value(name)" | Out-Null
}
catch {
    $repoExists = $false
}

if (-not $repoExists) {
    Write-Host "Creando repositorio Artifact Registry '$Repository' en $Region..."
    gcloud artifacts repositories create $Repository `
        --repository-format docker `
        --location $Region `
        --description "Imagenes Docker para Cloud Run"
}

Write-Host "Construyendo imagen $image..."
$cloudBuildConfig = New-TemporaryFile
@'
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -t
      - ${_IMAGE}
      - --build-arg
      - VITE_SUPABASE_URL=${_VITE_SUPABASE_URL}
      - --build-arg
      - VITE_SUPABASE_ANON_KEY=${_VITE_SUPABASE_ANON_KEY}
      - --build-arg
      - GEMINI_API_KEY=${_GEMINI_API_KEY}
      - .
images:
  - ${_IMAGE}
'@ | Set-Content -Path $cloudBuildConfig -Encoding UTF8

try {
    gcloud builds submit `
        --config $cloudBuildConfig `
        --substitutions "_IMAGE=$image,_VITE_SUPABASE_URL=$ViteSupabaseUrl,_VITE_SUPABASE_ANON_KEY=$ViteSupabaseAnonKey,_GEMINI_API_KEY=$GeminiApiKey" `
        .
}
finally {
    Remove-Item -LiteralPath $cloudBuildConfig -Force -ErrorAction SilentlyContinue
}

$authFlag = if ($AllowUnauthenticated) { "--allow-unauthenticated" } else { "--no-allow-unauthenticated" }

Write-Host "Desplegando servicio Cloud Run '$ServiceName'..."
gcloud run deploy $ServiceName `
    --image $image `
    --region $Region `
    --platform managed `
    --port 8080 `
    --memory 512Mi `
    --cpu 1 `
    $authFlag

Write-Host "Despliegue finalizado."
