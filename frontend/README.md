# EchoHealth — Frontend

React + TypeScript + Vite + Tailwind CSS + Recharts + Lucide.
Local-only dashboard for the EchoHealth respiratory sound monitor. It is **not** a diagnostic tool.

## Run

```bash
cd frontend
npm install

npm run dev        # real backend at VITE_API_URL (default http://127.0.0.1:8000)
npm run dev:demo   # in-browser mock API, labelled "Demo Mode" everywhere
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Open http://127.0.0.1:5173

## Configuration

Copy `.env.example` to `.env` and set:

| Variable        | Default                  | Meaning                                                  |
| --------------- | ------------------------ | -------------------------------------------------------- |
| `VITE_API_URL`  | `http://127.0.0.1:8000`  | Backend base URL                                         |
| `VITE_API_MODE` | `http`                   | `http` = real backend, `mock` = in-browser Demo Mode API |

The client is chosen once at startup in `src/api/client.ts`. If the real backend is unreachable, the UI shows
**Backend offline**. It never falls back to mock data on its own.

## Backend integration checklist

1. **CORS.** The frontend runs on `http://127.0.0.1:5173` (or `http://localhost:5173`), so the backend must allow
   that origin. For FastAPI:

   ```python
   from fastapi.middleware.cors import CORSMiddleware
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

2. **Contract.** `src/api/types.ts` mirrors the fixed contract exactly: `/api/health`, `/api/monitor/start|stop|status`
   and `/api/sessions[/{id}]`. Errors must be JSON with a `detail` string (FastAPI's `HTTPException` already does this).
3. **Event types** must be one of `cough, wheezing, breathing, sneezing, snoring, gasping, throat_clearing`. Unknown
   types still render, in grey.
4. **Timestamps** must be ISO 8601 UTC, e.g. `2026-11-17T09:30:00Z`.
5. **Stop.** `POST /api/monitor/stop` with no active session should return 4xx with a `detail` message.
6. **Demo mode.** The Overview's "Run demo session" button sends `{"mode":"demo"}` to the real backend. Sessions with
   `mode: "demo"` are badged "Demo" in the UI.

## Behaviour notes

- **Polling.** Live view polls `GET /api/monitor/status` every 750 ms using a chained timeout, so requests never
  overlap. Polling stops on unmount and while stopping. Health is checked every 5 s.
- **Audio visualisation.** Each bar is one real `audioLevel` value received from the backend. Nothing is interpolated.
- **Scores.** Shown as uncalibrated model scores, never as medical probabilities.
- **Session ended elsewhere.** If the backend stops a session, the live view redirects to its report.
- **Reports.** Print uses a print stylesheet. CSV/JSON export is generated in the browser.

## Structure

```
src/
  api/        types.ts (contract) · httpClient.ts · mockClient.ts (Demo Mode) · client.ts (switch)
  hooks/      usePolling · useAsync · HealthContext
  lib/        events (labels/colours) · format · analysis (buckets/peaks) · export (CSV/JSON)
  components/ Layout · ui · AudioLevelMeter · ActivityChart · BreakdownChart · CountGrid · EventTimeline · ScoreBars
  pages/      Overview · Live · Report · History
```
