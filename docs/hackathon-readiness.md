# EchoHealth: reliability and hackathon demonstration

This is an incremental update to the working Phase 3 application. The original model, CLI, HTTP/WebSocket endpoints, SQLite schema and existing reports are preserved. No dependency or hosted service was added.

## Selection rules

All 521 raw YAMNet scores and original all-class threshold spans remain in reports as evidence. New `respiratory_events` are the source for new respiratory summaries. Verified label indices in the installed pinned mapping:

| Display category | Actual model label | Index | Entry score floor |
| --- | --- | --- | --- |
| Breathing | Breathing | 36 | 0.50 |
| Wheezing | Wheeze | 37 | 0.50 |
| Snoring | Snoring | 38 | 0.45 |
| Gasping | Gasp | 39 | 0.55 |
| Coughing | Cough | 42 | 0.45 |
| Throat clearing | Throat clearing | 43 | 0.50 |
| Sneezing | Sneeze | 44 | 0.50 |

These are conservative **development heuristics**, selected to require stronger evidence than the old uniform 0.30 threshold. They are not estimated from a labeled respiratory validation dataset. Higher thresholds can miss real sounds; this update does not establish improved sensitivity or specificity.

- Entry requires the greater of the requested threshold and class floor. CLI per-label overrides are honored as requested floors. Continuation uses 80% of the entry threshold to reduce threshold flicker.
- Windows below RMS 0.003 (approximately −50.5 dBFS) are excluded. This is a fixed digital-level gate, not calibrated microphone loudness. Quiet real respiratory sounds can be excluded.
- If the strongest Speech/Music/Noise/Silence score is at least 0.50, a respiratory score must reach 80% of that competing score. Mixed speech and respiratory sounds can be missed. This does not suppress every type of background sound.
- Timing uses non-overlapping cells separated halfway between neighboring model-window centers, clipped to actual audio duration. Same-category touching/overlapping spans merge within the session, including across microphone segments. This prevents overlapping model-window support from becoming multiple counted observations, but cannot resolve individual coughs inside a long span.
- Independent live segments still lack inference context across their boundary. The report merger prevents count duplication when selected spans touch; it cannot restore missed acoustic context. The last incomplete capture segment is discarded, and this is communicated in the interface.

## Transparent reporting

Totals count merged model-derived respiratory spans, not clinical episodes. Different categories may overlap and count separately. Distribution counts sum to the total. The hourly rate is `count × 3600 / analyzed audio seconds`, and the UI flags short-recording extrapolations. Zero-duration sessions have no hourly rate.

The most frequent categories are returned explicitly, including ties. Highest activity counts event **starts** in fixed 60-second bins; ties select the earliest bin. Clusters have at least three spans, each beginning within 10 seconds of the current group's latest end; clusters are descriptive and have no medical meaning. The full timeline is chronological; the interface limits display to 500 entries and exports all entries. Analyzed audio duration and wall-clock monitoring time are distinct.

Summaries are computed from stored observations without rewriting old reports. Legacy sessions use their original respiratory spans and are marked as legacy rather than silently claiming the new filters were applied. JSON export retrieves the complete selected session, including while monitoring.

## Executed verification

- **36 Python tests passed, zero skipped**, including all original tests, new gating/timing/hysteresis tests, exact summary arithmetic, ties, clusters, bin edges, legacy handling, cross-segment merging, live/persisted summary equivalence and deletion cascade.
- Real YAMNet loaded and classified with Python socket connections blocked. The available authorized tutorial recording, 4.92 seconds of speech/whistling, produced zero respiratory spans under both the old and new rules. Two explicitly synthetic controls (2 seconds digital silence and seeded white noise) also produced zero old/new respiratory spans. Actual outputs are in `reports/reliability-evaluation.json`. These controls establish pipeline execution and expected negative-control behavior, **not an empirical reduction in false positives**.
- No labeled positive respiratory recordings are available in this repository. Category sensitivity, onset accuracy, false-positive rates and clinical accuracy remain unvalidated. Synthetic score fixtures test rules only.
- Worklet PCM tests passed at 16, 44.1 and 48 kHz. JavaScript syntax checks passed.
- Final source and wheel packaging passed with the new respiratory module and existing frontend assets included. The refreshed application returned HTTP 200 and model status `ready` at `http://127.0.0.1:8000`.
- Real loopback HTTP/WebSocket smoke test passed: file decode/inference, streaming inference, ordered SQLite reports, session retrieval and associated-row deletion.
- Chrome passed actual permission denial, then fake-device capture through real local inference, measured input status, live counters, repeated start/stop with fresh tracks and both captures released, file upload, complete-session JSON download, history viewing/deletion and cleared selected report. Browser requests outside loopback were blocked; no nonlocal application requests and no browser runtime errors occurred. Desktop (1280px) and mobile (390px) screenshots were inspected. The fake device does not validate physical microphone quality.
- Upload tests check that temporary source paths no longer exist after analysis. Microphone PCM is processed in memory; SQLite stores scores/events/metadata only, with no waveform, PCM or recording files.

## Privacy and operational limits

Inference and frontend assets run locally after installation. Internet access is only required for explicit setup downloads. Keep the local server running; this is not a serverless or installed mobile app. There is no authentication, database encryption, validated overnight/background operation, or medical alerting. SQLite deletion removes associated logical rows, not forensic traces or exported files. The UI stops tracks immediately on stop and on page exit; browser suspension or device loss ends monitoring visibly.

## Demonstrate

1. In `C:\projects\echoHealth`, launch the existing local setup:
   `& 'C:/Program Files/LibreOffice/program/python.exe' scripts/dev_python.py echohealth.server`
2. Open `http://127.0.0.1:8000`. Confirm **Model ready · local**. Start microphone access; show the real waveform/input level, listening state and analyzed duration. Quiet input is a valid result.
3. Use audio you have permission to analyze. Show only the detections that actually occur. Do not promise that a particular sound will trigger or simulate a positive reading.
4. Stop. Confirm **Microphone off**, then inspect the session overview and chronological timeline. Explain that counts describe model spans and hourly rates extrapolate from actual analyzed duration.
5. Upload `samples/speech_whistling2.wav`. Expect zero respiratory observations on this control, while Speech/Whistling and other model scores remain available under unfiltered evidence.
6. Expand selection/calculation methods, download JSON, reopen the session from history, then delete it. Previously exported files are separate.
7. Turn off internet access while retaining localhost access; repeat monitoring/file analysis with the already downloaded model. Do not shut down the local backend.

Reproduce tests on this host:

```powershell
$env:ECHOHEALTH_TEST_AUDIO = 'C:/projects/echoHealth/samples/speech_whistling2.wav'
$env:ECHOHEALTH_EVALUATION_OUTPUT = 'C:/projects/echoHealth/reports/reliability-evaluation.json'
& 'C:/Program Files/LibreOffice/program/python.exe' scripts/dev_python.py unittest discover -s tests -v
node tests/test_worklet.cjs
& 'C:/Program Files/LibreOffice/program/python.exe' scripts/dev_python.py scripts.smoke_server --browser
```

The smoke test needs port 8765 free and installed Chrome at the path in the test; the application uses port 8000. All acceptance-test servers and browsers are closed after execution. Sandbox temporary-directory and socket restrictions on this workstation require approved execution outside the sandbox.
