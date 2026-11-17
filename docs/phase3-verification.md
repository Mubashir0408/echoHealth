# Phase 3 integration verification

Working directory verified as `C:\projects\echoHealth` on 2026-11-17. The initial repository contained only the Phase 1 implementation and historical verification notes. There was no backend, frontend, or Phase 2/3 requirements document to resume. The current user instruction authorizes continuing beyond the old Phase 1 stop instruction. Existing classifier source and tests were retained.

Implemented:

- Lazy shared YAMNet engine with serialized access to the TFLite interpreter.
- FastAPI health, bounded raw-file analysis, session list/detail/delete and microphone WebSocket endpoints.
- SQLite reports with ordered segments, offsets, statuses, foreign keys and cascading deletion. Connections close explicitly. Interrupted sessions are recovered on startup.
- Same-origin browser frontend, microphone permissions, AudioWorklet PCM capture, waveform display, respiratory scores, all-class detected spans, history and JSON export.
- Loopback binding, Host/origin checks, bounded upload/PCM sizes, temporary upload cleanup, explicit model readiness failures and no synthetic production fallback.
- Package data configuration and local launch instructions.

## Executed results

- **26 Python tests passed, zero skipped**, including the opt-in real inference test against the downloaded speech/whistling tutorial clip. Audio decoding, stereo downmix, resampling/alias suppression, clipping, model/label integrity, report formatting, SQLite lifecycle, HTTP validation, upload persistence, WebSocket sequencing, unavailable-model errors, origin restrictions and active-session deletion protection passed.
- `node tests/test_worklet.cjs` passed: actual worklet execution at 16, 44.1 and 48 kHz, chunk length, little-endian PCM and signal preservation.
- Source distribution and wheel built successfully, including all four browser assets. A final rebuild followed the label validation fix.
- `pip check`: no broken requirements found.
- Real CLI inference produced `reports/demo.json`: 4.92 seconds of mono 16 kHz audio, all 521 classes; measured inference 0.09469 seconds, initialization 2.963 seconds, total before formatting 3.745 seconds for that run. These are one-host observations, not performance guarantees or accuracy metrics.
- `scripts/smoke_server.py --browser` passed against a real loopback Uvicorn server and real YAMNet: HTTP file upload, binary WebSocket audio, ordered stored reports, JSON retrieval, cascading deletion and empty history after deletion.
- Hidden Chrome passed microphone permission/capture with its fake audio device, AudioWorklet → WebSocket → real model → UI scores/history, stop, file selection/upload and responsive desktop/mobile layout checks. Screenshots saved to `reports/desktop.png` and `reports/mobile.png` and visually inspected. The fake device verifies the browser pipeline; it does not verify a physical microphone.
- Test server and browser were closed after checks. The application can run separately on port 8000.

## Resolved issues

Network access worked after approved execution outside the sandbox; repeated package/asset transfer failures required retries. Model checksum rejection was preserved. The final downloaded binary matches the original pinned SHA256. TensorFlow 2.16.1 and backend/audio dependencies are installed in project-local `.deps`, not LibreOffice's installation.

The real pinned label artifact repeats `Inside` at indices 500/501/502 and `Outside` at 503/504. Original validation incorrectly rejected it. Validation now permits only those exact duplicate groups, with a regression test, and event reports include `class_index` to distinguish them. Name-based threshold overrides apply to every matching abbreviated name.

SQLite context managers originally committed without closing connections, which caused Windows file-lock failures; connections now close explicitly. The bundled Python reports a directory as `sys.executable` and does not process project-local `.pth` hooks from `PYTHONPATH` alone. `scripts/dev_python.py` activates those hooks and corrects the executable path without modifying the host installation. Smoke-test cleanup terminates the Python launcher process tree on Windows.

## Reproduce on this host

```powershell
$env:ECHOHEALTH_TEST_AUDIO = 'C:/projects/echoHealth/samples/speech_whistling2.wav'
& 'C:/Program Files/LibreOffice/program/python.exe' scripts/dev_python.py unittest discover -s tests -v
& 'C:/Program Files/LibreOffice/program/python.exe' scripts/dev_python.py scripts.smoke_server --browser
& 'C:/Program Files/LibreOffice/program/python.exe' scripts/dev_python.py build --no-isolation
& 'C:/Program Files/LibreOffice/program/python.exe' scripts/dev_python.py echohealth.server
```

Sandboxed temporary-directory access and socket operations failed on this host; these checks required approved execution outside the sandbox. Normal virtual environments can use the README commands. The partial original `.venv` has been preserved, but remains unusable.

Known scope: one local user, no authentication/encryption, no clinical validation, no overnight/background monitoring guarantee. Microphone reports analyze independent 1.95-second segments and discard the final partial segment. Browser microphone hardware and UI interactions require browser acceptance on the user's device.
