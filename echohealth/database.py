"""Local session storage. Raw microphone audio is never persisted."""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
from .respiratory import summarize_segments


class Database:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT
                (strftime('%Y-%m-%dT%H:%M:%fZ','now')), source TEXT NOT NULL,
                duration REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active')""")
            db.execute("""CREATE TABLE IF NOT EXISTS reports (
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                sequence INTEGER NOT NULL, offset REAL NOT NULL, payload TEXT NOT NULL,
                PRIMARY KEY(session_id, sequence))""")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, source):
        identifier = uuid4().hex
        with self.connect() as db:
            db.execute('INSERT INTO sessions(id,source) VALUES (?,?)', (identifier, source))
        return identifier

    def append(self, identifier, sequence, offset, report):
        with self.connect() as db:
            db.execute('INSERT INTO reports VALUES (?,?,?,?)',
                       (identifier, sequence, offset, json.dumps(report, allow_nan=False)))
            db.execute('UPDATE sessions SET duration=MAX(duration,?) WHERE id=?',
                       (offset + report['audio']['duration_seconds'], identifier))

    def finish(self, identifier, status='complete'):
        with self.connect() as db:
            db.execute('UPDATE sessions SET status=? WHERE id=?', (status, identifier))

    def recover(self):
        with self.connect() as db:
            db.execute("UPDATE sessions SET status='interrupted' WHERE status='active'")

    def list(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100')]

    def get(self, identifier):
        with self.connect() as db:
            row = db.execute('SELECT * FROM sessions WHERE id=?', (identifier,)).fetchone()
            if row is None:
                return None
            result = {**dict(row), 'reports': [dict(sequence=r['sequence'], offset_seconds=r['offset'],
                    report=json.loads(r['payload'])) for r in db.execute(
                        'SELECT * FROM reports WHERE session_id=? ORDER BY sequence', (identifier,))]}
            result['summary'] = summarize_segments(result['reports'], result['duration'])
            return result

    def delete(self, identifier):
        with self.connect() as db:
            return db.execute('DELETE FROM sessions WHERE id=?', (identifier,)).rowcount > 0
