"""Real socket smoke test; requires installed dependencies, model and demo audio.

Starts an isolated loopback server, uses real YAMNet, and removes its temporary DB.
"""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import socket

import httpx
import websockets


async def stream_audio(waveform):
    import numpy as np
    async with websockets.connect('ws://127.0.0.1:8765/api/monitor',
                                  origin='http://127.0.0.1:8765') as ws:
        await ws.send(json.dumps({'threshold': 0.3}))
        ready = json.loads(await ws.recv())
        assert ready['type'] == 'ready', ready
        segment = waveform[:31200]
        pcm = (np.clip(segment, -1, 1) * 32767).astype('<i2').tobytes()
        await ws.send(pcm)
        result = json.loads(await ws.recv())
        assert result['type'] == 'result', result
        assert len(result['report']['classes']) == 521
        await ws.send('stop')
        assert json.loads(await ws.recv())['type'] == 'stopped'
        return ready['session_id']


def main():
    # Fail explicitly rather than accidentally testing a different running process.
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 8765))
    from echohealth.audio import load_audio
    audio_path = Path(os.environ.get('ECHOHEALTH_TEST_AUDIO', 'samples/speech_whistling2.wav'))
    audio = load_audio(audio_path)
    executable = Path(sys.executable)
    if executable.is_dir():
        executable = executable.parent / 'python.exe'
    with tempfile.TemporaryDirectory(prefix='echohealth-smoke-') as directory:
        environment = {**os.environ, 'ECHOHEALTH_DATABASE': str(Path(directory) / 'smoke.sqlite3')}
        with (Path(directory) / 'server.log').open('w+') as log:
            process = subprocess.Popen([str(executable), '-c',
                "import site; site.addsitedir('.deps'); import uvicorn; from echohealth.server import create_app; uvicorn.run(create_app(),host='127.0.0.1',port=8765,ws_max_size=320000)"],
                env=environment, stdout=log, stderr=log)
            try:
                with httpx.Client(base_url='http://127.0.0.1:8765', timeout=120, trust_env=False) as client:
                    for _ in range(120):
                        if process.poll() is not None:
                            raise RuntimeError('Server exited before readiness')
                        try:
                            health = client.get('/api/health')
                            if health.status_code == 200:
                                break
                        except httpx.ConnectError:
                            pass
                        time.sleep(0.5)
                    else:
                        raise RuntimeError('Server did not start')
                    assert health.json()['status'] == 'ready', health.text
                    assert client.get('/').status_code == 200
                    response = client.post('/api/analyze', content=audio_path.read_bytes())
                    assert response.status_code == 200, response.text
                    result = response.json()
                    assert len(result['report']['classes']) == 521
                    identifier = asyncio.run(stream_audio(audio.waveform))
                    # Socket close/finalization may trail the stop acknowledgement briefly.
                    for _ in range(20):
                        saved = client.get(f'/api/sessions/{identifier}').json()
                        if saved['status'] == 'complete':
                            break
                        time.sleep(0.05)
                    assert saved['status'] == 'complete', saved
                    assert len(saved['reports']) == 1
                    assert len(client.get('/api/sessions').json()) == 2
                    for session in client.get('/api/sessions').json():
                        assert client.delete('/api/sessions/' + session['id']).status_code == 200
                    assert client.get('/api/sessions').json() == []
                    print('PASS: real HTTP upload, YAMNet inference, WebSocket PCM, SQLite history, export and deletion')
                    if '--browser' in sys.argv:
                        subprocess.run(['node', 'tests/browser-smoke.cjs'], check=True, timeout=150)
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read(), file=sys.stderr)
                raise
            finally:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                else:
                    process.terminate()
                process.wait(timeout=15)
                # Allow Windows to release inherited file handles after process exit.
                time.sleep(0.2)


if __name__ == '__main__':
    main()
