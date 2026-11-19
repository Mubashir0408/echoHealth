# EchoHealth — React frontend

React + TypeScript + Vite + Tailwind CSS + Recharts + Lucide. A dashboard for the local EchoHealth
Python backend (`echohealth.server`). Not a diagnostic tool.

## Run (two terminals)

```powershell
# 1) Backend: project root
.\.venv\Scripts\python.exe -m echohealth.server      # http://127.0.0.1:8000

# 2) Frontend: frontend/
npm install          # first time only
npm run dev          # http://127.0.0.1:5173 (opens the browser)
```

Other commands: `npm run build` (type-check + production build), `npm run preview` (serves the build on
http://127.0.0.1:4173 with the same proxy).

## How it connects

The backend sends no CORS headers and rejects any request whose `Origin` is not its own. So the browser
talks only to the Vite server, which proxies to the backend (`vite.config.ts`):

| Path | Backend use |
| --- | --- |
| `/api/*` | REST endpoints and the `/api/monitor` WebSocket |
| `/static/pcm-worklet.js` | The backend's own AudioWorklet, reused for PCM conversion |

The proxy forwards only same-origin requests (or ones with no `Origin`) and refuses requests from
other websites with HTTP 403, so the backend's cross-origin protection still holds. Change the backend
address with `VITE_API_URL` in `frontend/.env` (see `.env.example`).

## Backend API used

| Feature | Endpoint |
| --- | --- |
| Readiness | `GET /api/health`: `status` `ready`/`unavailable`, `detail` |
| Live monitoring | WebSocket `/api/monitor`: send `{"threshold"}`, receive `ready`, send 1.95 s 16 kHz int16 PCM chunks, receive `result` (segment report and cumulative summary), send `stop`, receive `stopped` |
| File analysis | `POST /api/analyze?threshold=` with the raw file as the body |
| History | `GET /api/sessions` (id, date, source, duration, status) |
| Report | `GET /api/sessions/{id}` (all segment reports and the server-computed summary) |
| Delete | `DELETE /api/sessions/{id}` (409 while active) |

Microphone readiness is checked in the browser, because the backend receives audio from this page.
The audio level meter shows the level measured by the browser. Sound labels come only from backend results.

## Structure

```
src/
  api/        types.ts (backend wire + view types) · client.ts (REST) · adapters.ts (backend → view)
  monitor/    MonitorContext.tsx (microphone + WebSocket protocol, lives at app root)
  hooks/      HealthContext · usePolling · useAsync · useSessionDetails (cached per-session summaries)
  lib/        events · format · analysis · export (CSV/JSON)
  components/ Layout · ui · AudioLevelMeter · ActivityChart · BreakdownChart · CountGrid · EventTimeline · ScoreBars
  pages/      Overview · Live · Report · History
```

## Known limitations

- `GET /api/sessions` has no event counts, so History and Overview fetch each session's full detail
  (one at a time, cached, newest 20 or 7). Long sessions have large detail payloads because they include
  every model score.
- It needs the Vite server (dev or preview) for the proxy. The backend does not serve the React build.
- Counts are merged model spans, not clinical episodes. Scores are uncalibrated.
