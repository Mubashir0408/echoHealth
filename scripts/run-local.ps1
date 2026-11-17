$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$projectPython = Join-Path $PWD '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $projectPython)) {
    # This workstation also has a bundled interpreter; never install into its directory.
    $bundledPython = 'C:/Program Files/LibreOffice/program/python.exe'
    if ((Test-Path -LiteralPath $bundledPython) -and (Test-Path -LiteralPath '.deps/fastapi')) {
        $projectPython = $bundledPython
        $env:PYTHONPATH = Join-Path $PWD '.deps'
    } else {
        throw 'Create .venv with Python 3.10-3.12 and install requirements.txt first. See README.md.'
    }
}
& $projectPython scripts/dev_python.py echohealth.server
exit $LASTEXITCODE
