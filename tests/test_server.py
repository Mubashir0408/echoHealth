"""API contracts use an explicit test double; real inference is tested separately."""
import tempfile
import unittest
import io
import wave
from unittest.mock import patch
from pathlib import Path

try:
    from fastapi.testclient import TestClient
    from echohealth.server import create_app
except ImportError:
    TestClient = None

from echohealth.errors import EchoHealthError


class FixtureEngine:
    model = object()
    error = None

    def load(self):
        pass

    def pcm(self, data, threshold):
        if not data or len(data) % 2:
            raise EchoHealthError('Invalid PCM')
        return {'audio': {'duration_seconds': len(data) / 32000}, 'events': [], 'classes': []}

    def classify(self, audio, threshold):
        return {'audio': {'duration_seconds': audio.duration_seconds}, 'events': [], 'classes': []}


@unittest.skipIf(TestClient is None, 'FastAPI/httpx dependencies unavailable')
class ServerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.client = TestClient(create_app(Path(self.directory.name) / 'test.sqlite3', FixtureEngine()))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.directory.cleanup()

    def test_frontend_health_and_validation(self):
        self.assertEqual(self.client.get('/').status_code, 200)
        self.assertEqual(self.client.get('/static/app.js').status_code, 200)
        self.assertEqual(self.client.get('/api/health').json()['status'], 'ready')
        self.assertEqual(self.client.post('/api/analyze?threshold=2', content=b'a').status_code, 422)
        self.assertEqual(self.client.get('/api/sessions/missing').status_code, 404)
        self.assertEqual(self.client.delete('/api/sessions/missing').status_code, 404)

    def test_origin_protection(self):
        self.assertEqual(self.client.post('/api/analyze', headers={'Origin': 'https://other.example'}).status_code, 403)
        self.assertEqual(self.client.get('/', headers={'Host': 'other.example'}).status_code, 403)

    def test_recording_decode_persist_and_invalid_audio(self):
        try:
            import soundfile
            import scipy
        except ImportError:
            self.skipTest('Audio dependencies unavailable')
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as recording:
            recording.setnchannels(1)
            recording.setsampwidth(2)
            recording.setframerate(16000)
            recording.writeframes(b'\x00\x00' * 16000)
        from echohealth.audio import load_audio
        temporary_paths = []
        def track_upload(path):
            temporary_paths.append(Path(path))
            return load_audio(path)
        with patch('echohealth.audio.load_audio', side_effect=track_upload):
            response = self.client.post('/api/analyze', content=buffer.getvalue())
        self.assertTrue(temporary_paths)
        self.assertTrue(all(not p.exists() for p in temporary_paths))
        self.assertEqual(response.status_code, 200, response.text)
        identifier = response.json()['session_id']
        saved = self.client.get(f'/api/sessions/{identifier}').json()
        self.assertEqual(saved['source'], 'file')
        self.assertEqual(saved['duration'], 1)
        self.assertEqual(saved['status'], 'complete')
        self.assertEqual(self.client.post('/api/analyze', content=b'not audio').status_code, 422)

    def test_cannot_delete_active_session(self):
        with self.client.websocket_connect('/api/monitor', headers={'origin': 'http://testserver'}) as ws:
            ws.send_json({})
            identifier = ws.receive_json()['session_id']
            self.assertEqual(self.client.delete(f'/api/sessions/{identifier}').status_code, 409)
            ws.send_text('stop')
            ws.receive_json()

    def test_stream_persist_export_delete(self):
        with self.client.websocket_connect('/api/monitor', headers={'origin': 'http://testserver'}) as ws:
            ws.send_json({'threshold': 0.3})
            identifier = ws.receive_json()['session_id']
            ws.send_bytes(b'\x00\x00' * 16000)
            result = ws.receive_json()
            self.assertEqual(result['type'], 'result')
            self.assertEqual(result['offset_seconds'], 0)
            ws.send_bytes(b'\x00\x00' * 16000)
            self.assertEqual(ws.receive_json()['offset_seconds'], 1)
            ws.send_text('stop')
            self.assertEqual(ws.receive_json()['type'], 'stopped')
        result = self.client.get(f'/api/sessions/{identifier}').json()
        self.assertEqual(result['duration'], 2)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(len(result['reports']), 2)
        self.assertEqual(self.client.delete(f'/api/sessions/{identifier}').status_code, 200)
        self.assertEqual(self.client.get('/api/sessions').json(), [])

    def test_invalid_stream_has_error_status(self):
        with self.client.websocket_connect('/api/monitor', headers={'origin': 'http://testserver'}) as ws:
            ws.send_json({})
            identifier = ws.receive_json()['session_id']
            ws.send_bytes(b'odd')
            self.assertEqual(ws.receive_json()['type'], 'error')
        self.assertEqual(self.client.get(f'/api/sessions/{identifier}').json()['status'], 'error')

    def test_live_summary_matches_persisted_summary_and_cascade(self):
        def observations(data, threshold):
            return {'audio': {'duration_seconds': 1}, 'events': [], 'classes': [],
                    'respiratory_events': [{'respiratory_category': 'Coughing', 'model_label': 'Cough',
                        'class_index': 42, 'start_seconds': 0, 'end_seconds': 1, 'max_score': .8,
                        'mean_score': .8, 'window_count': 1}]}
        self.client.app.state.engine.pcm = observations
        with self.client.websocket_connect('/api/monitor', headers={'origin': 'http://testserver'}) as ws:
            ws.send_json({})
            identifier = ws.receive_json()['session_id']
            for _ in range(2):
                ws.send_bytes(b'\x00\x00')
                live = ws.receive_json()['summary']
            self.assertEqual(live['total_respiratory_events'], 1)
            self.assertEqual(live['monitoring_duration_seconds'], 2)
            ws.send_text('stop')
            ws.receive_json()
        saved = self.client.get('/api/sessions/' + identifier).json()
        self.assertEqual(saved['summary'], live)
        self.assertEqual(self.client.delete('/api/sessions/' + identifier).status_code, 200)
        with self.client.app.state.store.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM reports WHERE session_id=?', (identifier,)).fetchone()[0], 0)

    def test_model_missing_is_explicit(self):
        engine = self.client.app.state.engine
        engine.model = None
        engine.error = 'Model assets missing'
        def unavailable():
            raise EchoHealthError(engine.error)
        engine.load = unavailable
        with self.client.websocket_connect('/api/monitor', headers={'origin': 'http://testserver'}) as ws:
            ws.send_json({})
            self.assertEqual(ws.receive_json()['detail'], 'Model assets missing')
        self.assertEqual(self.client.get('/api/health').json()['status'], 'unavailable')
        self.assertEqual(self.client.get('/api/sessions').json(), [])
