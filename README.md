# EchoHealth — Phase 3 integration

## Quick start: one command

From the project root in PowerShell:

```powershell
npm run dev
```

This starts **both** servers:

1. **Backend** (`.venv` Python, `-m echohealth.server`) on http://127.0.0.1:8000. The launcher waits until the AI model has loaded (`/api/health` answers) before continuing. If an EchoHealth backend is already running on port 8000, it is reused and no duplicate is started.
2. **Frontend** (React/Vite) on http://127.0.0.1:5173. It opens in your browser and proxies `/api`, the monitoring WebSocket and `/static` to the backend.

Logs are prefixed `[backend]` and `[frontend]`. If either server crashes, the launcher prints a clear error with that server's last output and stops the other one. Press **Ctrl+C** once to stop everything it started.

**First-time setup** (once per machine):

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m echohealth download
npm run setup                      # installs the frontend's npm packages
```

Other root commands:

| Command | What it does |
| --- | --- |
| `npm run dev -- --open false` | Same as `npm run dev`, without opening a browser (extra arguments go to Vite) |
| `npm test` | Runs the Python test suite with the project `.venv` |
| `npm run build` | Type-checks and builds the frontend |

Settings: `ECHOHEALTH_STARTUP_TIMEOUT` (seconds to wait for the backend, default 120), plus the existing `ECHOHEALTH_DATABASE` and `ECHOHEALTH_MODEL_DIR`. The launcher is `scripts/dev.mjs`: plain Node, no extra packages. If port 8000 is held by another program, the launcher stops and tells you how to find it.

The backend's own built-in page is still available at http://127.0.0.1:8000. Frontend details are in [frontend/README.md](frontend/README.md).

**Hackathon polish update:** per-sound respiratory selection safeguards, merged session timelines, deterministic activity summaries, measured live microphone levels, complete-session exports and refreshed desktop/mobile UI are implemented. **36 tests pass**, plus real inference/socket and Chrome acceptance checks. See [demonstration instructions and current verification](docs/hackathon-readiness.md). Detection heuristics remain unvalidated; no clinical accuracy is claimed. The Phase 3 notes below are preserved as historical context.

The existing classifier is now integrated with a local FastAPI server, SQLite session history, and a browser frontend. The frontend supports file analysis, microphone capture through AudioWorklet, live results, session export and deletion. Raw microphone audio is not saved. File uploads use temporary storage and are deleted after processing. Read the current [integration verification](docs/phase3-verification.md) for actual test results and remaining limitations.

## Run the integrated application

Use Python 3.10–3.12 x64 in a project virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m echohealth download
.\.venv\Scripts\python.exe -m echohealth.server
```

Open **http://127.0.0.1:8000**. The server binds to loopback. This MVP has no authentication and is intended for one local user; do not expose it through a public proxy. Microphone access requires a modern browser and localhost or HTTPS. The server remains available when assets are missing and shows the readiness error. Installing the model is explicit; inference makes no network calls.

On this workstation, dependencies and verified assets are already installed locally. The existing partial `.venv` is unusable. Launch with the tested bundled interpreter helper:

```powershell
& 'C:/Program Files/LibreOffice/program/python.exe' scripts/dev_python.py echohealth.server
```

Current verification: **26/26 Python tests passed**, real model inference and HTTP/WebSocket smoke tests passed, Chrome microphone flow passed with a fake capture device, desktop/mobile layouts reviewed, and Python source/wheel builds passed. Physical microphone quality and respiratory detection accuracy remain unvalidated.

SQLite defaults to `data/echohealth.sqlite3`. Set `ECHOHEALTH_DATABASE` to change it and `ECHOHEALTH_MODEL_DIR` to change the model directory. Reports contain sensitive observations; the database is unencrypted. Session deletion removes logical rows, not forensic traces from disk or previously exported files. The API documentation is at `/docs`.

Microphone audio is converted by the browser to 16 kHz and sent as mono signed little-endian 16-bit PCM in 1.95-second segments over a same-origin WebSocket. Results arrive after each segment and inference. Offsets in saved reports place segments on the session timeline. Model windows and events are calculated within each segment, so boundary events may be split; this is not a validated event counter. A partial final segment is discarded. If inference falls behind capture, monitoring stops visibly instead of silently dropping segments. Browser suspension and device disconnection interrupt monitoring; this is not an unattended overnight recorder.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node tests/test_worklet.cjs
.\.venv\Scripts\python.exe -m build
```

`requirements-dev.txt` adds the API test client and package builder. The browser frontend is buildless HTML/CSS/JavaScript, and its assets are included in Python distributions. Existing CLI commands remain available. API tests use explicit fixtures; they do not establish model inference success. The real inference test below remains opt-in with authorized audio.

## Preserved Phase 1 notes

The following is the original Phase 1 record. Its status statements describe that earlier stage; the Phase 3 verification record supersedes them for current integration status.

Local respiratory **sound classification** proof of concept using pretrained Google YAMNet from Hugging Face. This project does not diagnose disease, detect sleep apnea, measure oxygen levels, or establish clinical accuracy. Model scores are uncalibrated classification scores, not medical probabilities.

**Current status:** implementation is present, but Phase 1 has not passed end-to-end acceptance on this host. Eleven unit tests passed; five preprocessing tests and one integration test were skipped. Dependency, model and example-audio downloads are blocked by Windows socket permissions (WinError 10013). No real model inference or accuracy result is available. See [verification record](docs/verification.md). No frontend, mobile app, backend, authentication or HeAR integration is included.

## Install

Use a normal **Python 3.10–3.12 x64** installation on Windows x64 or Linux x64. Python 3.11 is a convenient baseline. The Windows Store execution alias alone is insufficient. TensorFlow 2.16.1 supplies `tf.lite.Interpreter`; CUDA and GPUs are unnecessary. Windows may require the Microsoft Visual C++ Redistributable runtime. ARM desktop and other Python versions are outside this dependency baseline.

PowerShell, from the project root:

```powershell
python --version
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m echohealth download
```

On Linux use `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`. No account, API token, paid API or hosted inference is required. The initial package/asset downloads require internet access; classification then runs locally. Direct dependency versions are pinned in `requirements.txt`; this is a compatibility baseline, not a fully locked or locally validated environment.

If network access is unavailable, install the dependencies from an approved wheel directory and copy these two files into `models/` from [the pinned Hugging Face revision](https://huggingface.co/thelou1s/yamnet/tree/156527d):

- `lite-model_yamnet_tflite_1.tflite`
- `labels_yamnet.txt`

The model SHA256 must be `141fba1cdaae842c816f28edc4937e8b4f0af4c8df21862ccc6b52dc567993c3`. The downloader verifies it before replacement, and the runtime checks it before loading. Label validation checks 521 sequential indices, unique names, and important anchor mappings. The label artifact is JSON despite its `.txt` suffix. Label validation does not cryptographically authenticate every label.

## Run

```powershell
.\.venv\Scripts\python.exe -m echohealth classify .\samples\recording.wav
.\.venv\Scripts\python.exe -m echohealth classify .\samples\recording.wav --threshold 0.4 --config .\config\thresholds.example.json --output .\reports\recording.json
```

`--threshold` overrides the default threshold. Per-label overrides in the JSON configuration still take precedence. Overrides use exact model names (`Cough`, not `Coughing`). The example value 0.3 is an arbitrary development setting with no clinical calibration. Thresholds apply to every class, including speech, music and environmental sounds. Setting a threshold to zero selects even zero-scoring windows and is usually unhelpful.

The JSON output contains:

- `classes`: all 521 model labels in index order, respiratory aliases where applicable, mean and maximum scores, peak-window start, and applied thresholds.
- `windows`: all 521 scores per window, timestamps and any final silence padding. The score-vector order matches `classes`.
- `events`: consecutive above-threshold windows merged separately for each class, with start/end, mean/maximum score and window count. Classes may overlap.
- `timing_seconds`: preprocessing, model initialization, inference and total time before report formatting. Inference time includes tensor copying and invocation, including the first cold invocation; it excludes initialization and preprocessing.
- `audio`: duration, source rate/channels, model rate and post-resampling clipped sample count. Input filenames are omitted.

An empty `events` list means no score exceeded the chosen thresholds. It does not establish absence of respiratory sounds or a health problem. Event spans are approximate model-window supports, not precise acoustic onset/offset annotations. Separate merged spans are not validated cough counts or medical episode counts. Mean scores are averages across overlapping, sometimes padded windows.

Success returns exit code 0. Invalid input, missing assets, dependency failures, configuration errors and model failures return 2 with an error on stderr. Argument syntax errors also return 2. Interruptions return 130. JSON is written to stdout unless `--output` is provided; diagnostic messages use stderr.

## Architecture

```text
local audio file
  → audio.py: decode → mean downmix → polyphase resample → float32/clipping
  → inference.py: overlapping waveform windows → local TFLite CPU interpreter
  → output.py: preserve all scores → thresholds → merged sound spans → JSON
```

| File | Responsibility |
| --- | --- |
| `echohealth/audio.py` | libsndfile decoding, finite-value validation, mono conversion, 16 kHz resampling and bounds |
| `echohealth/inference.py` | model identity/input/output validation, CPU runtime, silence padding and window inference |
| `echohealth/config.py` | model identity, waveform constants, label aliases and configurable thresholds |
| `echohealth/labels.py` | ordered label loading and mapping validation |
| `echohealth/assets.py` | explicit asset downloads, checksum verification and atomic per-file replacement |
| `echohealth/output.py` | all-class report and merged timestamp formatting |
| `echohealth/cli.py` | commands, timing and actionable errors |
| `tests/` | core, audio preprocessing and opt-in real model tests |

Audio decoding uses SoundFile/libsndfile. WAV, FLAC and OGG are intended inputs; codec availability depends on libsndfile. MP3 may work in some builds but is not guaranteed. AAC/M4A from phones requires prior conversion; no external converter is invoked. Integer PCM decoding scales to floating point. Channels are averaged; this can cancel out-of-phase stereo signals. SciPy's polyphase resampler limits aliasing. Values are clipped to [-1,1] and converted to contiguous mono float32; no peak normalization, gain boost, denoising or medical filtering is applied.

Each inference input has 15,600 samples (0.975 seconds) with 7,680-sample hops (0.48 seconds). YAMNet's 0.96-second patch comprises 96 spectrogram frames; the final 25 ms STFT window adds 15 ms of waveform support beyond the last 10 ms hop. The last waveform window is zero-padded, matching the upstream whole-hop padding scheme. The model includes feature extraction; this code does not compute a second spectrogram. Tensor validation selects the `[1,521]` float32 output by shape rather than assuming an output index. Other model outputs are discarded. The exact downloaded binary contract still requires confirmation by running the integration test on an enabled host.

Phase 1 limits files to 600 seconds and holds decoded audio and results in memory. Inference processes one short window at a time. This is not yet an overnight recorder or streaming engine. A later Android implementation can reuse the TFLite artifact and input contract, but Android decoding, resampling, lifecycle, power consumption and inference parity require separate validation.

## Model investigation and licenses

The [Hugging Face repository](https://huggingface.co/thelou1s/yamnet/tree/main) lists these artifacts:

| Artifact | Repository size | Decision |
| --- | --- | --- |
| `lite-model_yamnet_tflite_1.tflite` | 16.1 MB | Selected waveform TFLite export; natural Android path |
| `lite-model_yamnet_classification_tflite_1.tflite` | 4.13 MB | Different classification variant; not treated as interchangeable |
| `coral-model_yamnet_classification_coral_1.tflite` | 4.21 MB | Coral-specific artifact; excluded from CPU MVP |
| `yamnet_1.tar` | 18.3 MB | TF Hub archive; not selected |
| `yamnet-tfjs.tar` | 16.1 MB | Browser-oriented archive; not selected |
| `labels_yamnet.txt` | 10.4 kB | 521-entry JSON index-to-label mapping |

The repository card describes copies of Google's YAMNet releases and declares Apache-2.0. This is a third-party mirror with a minimal model card, not independent provenance verification. Its published model SHA256 is pinned in code. The archive internals and alternative binaries were not downloaded or inspected on this host. No pickle, remote Python model code or custom model training is used.

The [official YAMNet export source](https://github.com/tensorflow/models/blob/master/research/audioset/yamnet/export.py) documents mono 16 kHz float32 waveform input in [-1,1] and outputs comprising frame scores, 1024-dimensional embeddings and log-mel features. The [feature implementation](https://github.com/tensorflow/models/blob/master/research/audioset/yamnet/features.py) establishes padding and STFT support. The [official README](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet) describes 521 AudioSet classes and training provenance. The [Lite interpreter API](https://ai.google.dev/edge/litert/api_docs/python/tf/lite/Interpreter) documents resizing, allocation and tensor inspection.

The requested aliases map to verified HF indices: Coughing → Cough (42), Wheezing → Wheeze (37), Breathing (36), Sneezing → Sneeze (44), Snoring (38), Gasping → Gasp (39), Throat clearing (43). Speech (0), Music (132) and every other class remain available. The HF mapping abbreviates some official display names; reports use the HF artifact verbatim.

Model and upstream TensorFlow source are declared Apache-2.0. TensorFlow is Apache-2.0, NumPy and SciPy use BSD licenses, and SoundFile uses BSD licensing with libsndfile under LGPL; consult bundled distribution notices for complete terms. See [third-party notes](THIRD_PARTY_NOTICES.md). A model license does not grant unrestricted rights to its training data or downloaded audio. No project-wide license for EchoHealth's original code has been chosen here.

## Tests and real inference

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe scripts\fetch_demo_audio.py
$env:ECHOHEALTH_TEST_AUDIO = (Resolve-Path .\samples\speech_whistling2.wav).Path
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_integration.py -v
.\.venv\Scripts\python.exe -m echohealth classify .\samples\speech_whistling2.wav --output .\reports\demo.json
```

The optional download script fetches the public speech/whistling example linked in [Google's YAMNet tutorial](https://www.tensorflow.org/hub/tutorials/yamnet). Its URL and source are in the script. No redistribution license for this clip is asserted; use it for local evaluation and check rights before redistribution. Alternatively point `ECHOHEALTH_TEST_AUDIO` at a recording you are authorized to use. Model downloads are separate and explicit. `ECHOHEALTH_MODEL_DIR` can override the integration test's default `models/` directory.

With `ECHOHEALTH_TEST_AUDIO` unset, integration is explicitly skipped. With it set, missing dependencies, bad audio or missing models fail the test. Audio tests explicitly skip if their dependencies cannot import. Core tests require only the standard library. Synthetic audio and score fixtures test preprocessing and formatting only; they are never presented as successful model inference. Integration checks real execution and output validity, not clinical accuracy or a guaranteed predicted label.

## Privacy and limitations

Classification does not contact a service, upload recordings or write audio copies. Explicit `download` and the example script access public URLs. Reports may reveal sensitive sound events; storage, encryption, retention, consent and sharing controls are not implemented in this CLI. Keep patient recordings and reports private. Generated assets and reports are excluded by `.gitignore`.

YAMNet is a general AudioSet classifier, not a validated respiratory monitoring or diagnostic model. Quiet sounds, microphone placement, blankets, background speech/music, multiple people, compression and phone processing can substantially affect scores. Seven label mappings do not prove seven reliable detectors. No clinical calibration, sensitivity/specificity measurement, respiratory benchmark or overnight validation has been performed. No disease inference should be derived from these outputs. HeAR remains out of scope.

Phase 1 acceptance still requires dependency installation, verified asset download, passing preprocessing and integration tests, reviewing real JSON output, and evaluation with authorized respiratory recordings plus non-respiratory controls. Stop at Phase 1; Phase 2 has not begun.
