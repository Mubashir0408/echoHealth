import tempfile
import unittest
from pathlib import Path

from echohealth.database import Database


class DatabaseTests(unittest.TestCase):
    def test_persistence_order_and_cascade(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'database.sqlite3'
            db = Database(path)
            identifier = db.create('microphone')
            report = {'audio': {'duration_seconds': 1.95}, 'events': []}
            db.append(identifier, 0, 0, report)
            db.append(identifier, 1, 1.95, report)
            db.finish(identifier)
            reopened = Database(path)
            session = reopened.get(identifier)
            self.assertEqual(session['duration'], 3.9)
            self.assertEqual(session['status'], 'complete')
            self.assertEqual([r['sequence'] for r in session['reports']], [0, 1])
            self.assertEqual(len(reopened.list()), 1)
            self.assertTrue(reopened.delete(identifier))
            self.assertIsNone(reopened.get(identifier))
            with reopened.connect() as connection:
                self.assertEqual(connection.execute('SELECT count(*) FROM reports').fetchone()[0], 0)
