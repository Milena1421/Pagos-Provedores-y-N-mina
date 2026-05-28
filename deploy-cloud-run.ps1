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
gcloud builds submit `
    --config cloudbuild.yaml `
    --substitutions "_REGION=$Region,_REPOSITORY=$Repository,_SERVICE_NAME=$ServiceName,_IMAGE_TAG=$ImageTag" `
    .

$authFlag = if ($AllowUnauthenticated) { "--allow-unauthenticated" } else { "--no-allow-unauthenticated" }

Write-Host "Desplegando servicio Cloud Run '$ServiceName'..."
gcloud run deploy $ServiceName `
    --image $image `
    --region $Region `
    --platform managed `
    --port 8080 `
    --memory 512Mi `
    --cpu 1 `
    --set-env-vars "VITE_SUPABASE_URL=$ViteSupabaseUrl,VITE_SUPABASE_ANON_KEY=$ViteSupabaseAnonKey,GEMINI_API_KEY=$GeminiApiKey" `
    $authFlag

Write-Host "Despliegue finalizado."
