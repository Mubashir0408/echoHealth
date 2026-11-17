"""Loopback-only MVP API and frontend. Run: python -m echohealth.server."""
import asyncio
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .database import Database
from .engine import Engine
from .errors import EchoHealthError
from .respiratory import PROFILE, summarize_segments

MAX_UPLOAD = 25 * 1024 * 1024


def create_app(database_path=None, engine=None):
    engine = engine or Engine(os.getenv('ECHOHEALTH_MODEL_DIR', 'models'))
    store = Database(database_path or os.getenv('ECHOHEALTH_DATABASE', 'data/echohealth.sqlite3'))
    gate = asyncio.Semaphore(1)

    @asynccontextmanager
    async def lifespan(app):
        store.recover()
        try:
            await asyncio.to_thread(engine.load)
        except EchoHealthError:
            pass  # UI remains available and exposes an actionable readiness error.
        yield

    app = FastAPI(title='EchoHealth', lifespan=lifespan)
    app.state.store, app.state.engine = store, engine

    @app.middleware('http')
    async def local_requests(request, call_next):
        # This MVP has no authentication: deny remote Host headers and cross-origin writes.
        host = request.url.hostname
        if host not in {'localhost', '127.0.0.1', '::1', 'testserver'}:
            return JSONResponse({'detail': 'Loopback access only'}, status_code=403)
        origin = request.headers.get('origin')
        if origin and origin != str(request.base_url).rstrip('/'):
            return JSONResponse({'detail': 'Cross-origin access denied'}, status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.get('/api/health')
    async def health():
        return {'status': 'ready' if engine.model is not None else 'unavailable',
                'model': 'YAMNet', 'detail': engine.error,
                'respiratory_thresholds': PROFILE, 'inference': 'local', 'raw_microphone_storage': False,
                'notice': 'Sound classification only. Scores are not diagnoses or medical probabilities.'}

    @app.get('/api/sessions')
    def sessions():
        return store.list()

    @app.get('/api/sessions/{identifier}')
    def session(identifier: str):
        result = store.get(identifier)
        if result is None:
            raise HTTPException(404, 'Session not found')
        return result

    @app.delete('/api/sessions/{identifier}')
    def delete(identifier: str):
        session = store.get(identifier)
        if session and session['status'] == 'active':
            raise HTTPException(409, 'Stop monitoring before deleting this session')
        if not store.delete(identifier):
            raise HTTPException(404, 'Session not found')
        return {'deleted': True}

    @app.post('/api/analyze')
    async def analyze(request: Request, threshold: float = 0.3):
        if not 0 <= threshold <= 1:
            raise HTTPException(422, 'Threshold must be between 0 and 1')
        size = 0
        # Spool with a hard byte bound; never use the supplied filename as a path.
        with tempfile.TemporaryDirectory(prefix='echohealth-') as directory:
            path = Path(directory) / 'audio'
            with path.open('wb') as stream:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise HTTPException(413, 'Maximum upload size is 25 MiB')
                    stream.write(chunk)
            try:
                from .audio import load_audio
                async with gate:
                    audio = await asyncio.to_thread(load_audio, path)
                    report = await asyncio.to_thread(engine.classify, audio, threshold)
            except EchoHealthError as exc:
                raise HTTPException(503 if engine.model is None else 422, str(exc)) from exc
        identifier = store.create('file')
        store.append(identifier, 0, 0, report)
        store.finish(identifier)
        return {'session_id': identifier, 'report': report}

    @app.websocket('/api/monitor')
    async def monitor(ws: WebSocket):
        if ws.url.hostname not in {'localhost', '127.0.0.1', '::1', 'testserver'}:
            await ws.close(code=1008)
            return
        expected_origin = str(ws.url).split('/api/')[0].replace('ws:', 'http:').replace('wss:', 'https:')
        if ws.headers.get('origin') != expected_origin:
            await ws.close(code=1008)
            return
        await ws.accept()
        identifier = None
        status = 'interrupted'
        try:
            setup = await asyncio.wait_for(ws.receive_json(), 15)
            threshold = setup.get('threshold', 0.3)
            if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not 0 <= threshold <= 1:
                raise EchoHealthError('Threshold must be between 0 and 1')
            async with gate:
                await asyncio.to_thread(engine.load)
            identifier = store.create('microphone')
            await ws.send_json({'type': 'ready', 'session_id': identifier})
            sequence, offset = 0, 0.0
            observations = []
            while True:
                message = await asyncio.wait_for(ws.receive(), 60)
                if message['type'] == 'websocket.disconnect':
                    break
                if message.get('text') == 'stop':
                    status = 'complete'
                    await ws.send_json({'type': 'stopped', 'session_id': identifier})
                    break
                data = message.get('bytes')
                if data is None:
                    raise EchoHealthError('Expected binary PCM or stop')
                async with gate:
                    report = await asyncio.to_thread(engine.pcm, data, threshold)
                store.append(identifier, sequence, offset, report)
                observations.append({'offset_seconds': offset, 'report': {
                    'respiratory_events': report.get('respiratory_events', report.get('events', []))}})
                await ws.send_json({'type': 'result', 'sequence': sequence,
                                    'offset_seconds': offset, 'report': report,
                                    'summary': summarize_segments(observations, offset + report['audio']['duration_seconds'])})
                offset += report['audio']['duration_seconds']
                sequence += 1
        except WebSocketDisconnect:
            pass
        except (EchoHealthError, ValueError, TypeError, AttributeError, asyncio.TimeoutError) as exc:
            status = 'error'
            try:
                await ws.send_json({'type': 'error', 'detail': str(exc) or 'Microphone connection timed out'})
            except (WebSocketDisconnect, RuntimeError):
                pass
        finally:
            if identifier:
                store.finish(identifier, status)
            try:
                await ws.close()
            except RuntimeError:
                pass

    static = Path(__file__).parent / 'web'
    app.mount('/static', StaticFiles(directory=static), name='static')

    @app.get('/')
    def index():
        return FileResponse(static / 'index.html')

    return app


def main():
    import uvicorn
    uvicorn.run(create_app(), host='127.0.0.1', port=8000, ws_max_size=320000)


if __name__ == '__main__':
    main()
