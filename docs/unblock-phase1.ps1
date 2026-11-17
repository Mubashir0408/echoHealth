# Run in a normal PowerShell window outside Codex.
# Prerequisite: standard Python 3.11 x64 installed for this user.
# If needed, install it first in that window:
# winget install --exact --id Python.Python.3.11 --scope user --architecture x64
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'C:\projects\echoHealth'
$bootstrapPython = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'
if (-not (Test-Path -LiteralPath $bootstrapPython -PathType Leaf)) {
    throw "Standard Python 3.11 was not found at $bootstrapPython. Set bootstrapPython to your installed Python 3.10-3.12 x64 executable."
}

function Invoke-CheckedPython {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Python command failed with exit code $LASTEXITCODE. Stop here and retain the error output."
    }
}

# Probe outside Codex before installing anything. No security controls are changed.
Invoke-CheckedPython $bootstrapPython @('-c', "import urllib.request; print('PyPI HTTPS:', urllib.request.urlopen('https://pypi.org/simple/numpy/', timeout=15).status)")
Invoke-CheckedPython $bootstrapPython @('-m', 'venv', '.venv')
$projectPython = Join-Path (Get-Location).Path '.venv\Scripts\python.exe'
Invoke-CheckedPython $projectPython @('-m', 'pip', 'install', '--upgrade', 'pip')
Invoke-CheckedPython $projectPython @('-m', 'pip', 'install', '-r', 'requirements.txt')
Invoke-CheckedPython $projectPython @('-m', 'pip', 'check')
Invoke-CheckedPython $projectPython @('-m', 'echohealth', 'download')

# Inspect the actual binary independently of Yamnet's input/output assumptions.
$inspection = @'
import json
import os
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
from echohealth.assets import verify_model
from echohealth.config import MODEL_NAME, WINDOW_SAMPLES
from pathlib import Path
path = Path('models') / MODEL_NAME
verify_model(path)
interpreter = tf.lite.Interpreter(model_path=str(path), num_threads=2)
def details(items):
    return [{k: (v.tolist() if hasattr(v, 'tolist') else str(v))
             for k, v in item.items()} for item in items]
record = {'tensorflow_version': tf.__version__,
          'original_inputs': details(interpreter.get_input_details()),
          'original_outputs': details(interpreter.get_output_details())}
try:
    inputs = interpreter.get_input_details()
    interpreter.resize_tensor_input(inputs[0]['index'], [WINDOW_SAMPLES], strict=True)
    interpreter.allocate_tensors()
    record['allocated_inputs'] = details(interpreter.get_input_details())
    record['allocated_outputs'] = details(interpreter.get_output_details())
except Exception as exc:
    record['allocation_error'] = repr(exc)
    raise
finally:
    Path('reports').mkdir(exist_ok=True)
    Path('reports/tensor_specs.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    print(json.dumps(record, indent=2))
'@
Invoke-CheckedPython $projectPython @('-c', $inspection)
Invoke-CheckedPython $projectPython @('scripts\fetch_demo_audio.py')
$env:ECHOHEALTH_TEST_AUDIO = (Resolve-Path -LiteralPath '.\samples\speech_whistling2.wav').Path
Invoke-CheckedPython $projectPython @('-m', 'unittest', 'discover', '-s', 'tests', '-v')
Invoke-CheckedPython $projectPython @('-m', 'echohealth', 'classify', $env:ECHOHEALTH_TEST_AUDIO, '--output', 'reports\demo.json')
Write-Host 'Verification commands completed. Review reports\tensor_specs.json and reports\demo.json before proceeding to Phase 2.'
