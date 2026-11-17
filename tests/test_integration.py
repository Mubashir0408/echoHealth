import os
from pathlib import Path
import unittest
from unittest.mock import patch
import json


class RealInferenceTest(unittest.TestCase):
    def test_offline_engine_and_controls(self):
        audio_path = os.environ.get('ECHOHEALTH_TEST_AUDIO')
        if not audio_path:
            self.skipTest('Set ECHOHEALTH_TEST_AUDIO for real offline/control evaluation')
        import numpy as np
        from echohealth.audio import load_audio, Audio
        from echohealth.engine import Engine
        from echohealth.config import EXPECTED_LABELS
        directory = os.environ.get('ECHOHEALTH_MODEL_DIR', 'models')
        audio = load_audio(audio_path)
        results = {}
        with patch('socket.socket.connect', side_effect=AssertionError('Inference must not contact a network')):
            engine = Engine(directory)
            for name, recording in [('real_tutorial_speech_whistling', audio),
                                    ('synthetic_digital_silence', Audio(np.zeros(32000, dtype=np.float32), 2, 16000, 1, 0)),
                                    ('synthetic_seeded_white_noise', Audio(np.random.default_rng(42).normal(0,.03,32000).astype(np.float32), 2, 16000, 1, 0))]:
                report = engine.classify(recording)
                self.assertEqual(len(report['classes']), 521)
                self.assertEqual(report['summary']['monitoring_duration_seconds'], recording.duration_seconds)
                for index, label in EXPECTED_LABELS.items():
                    self.assertEqual(report['classes'][index]['model_label'], label)
                results[name] = {'duration_seconds': recording.duration_seconds,
                                 'raw_respiratory_spans': sum(bool(e['respiratory_category']) for e in report['events']),
                                 'filtered_respiratory_spans': len(report['respiratory_events']),
                                 'signal': report['signal'], 'summary': report['summary'],
                                 'respiratory_max_scores': {c['model_label']:c['max_score'] for c in report['classes'] if c['respiratory_category']}}
        self.assertEqual(results['synthetic_digital_silence']['filtered_respiratory_spans'], 0)
        if os.environ.get('ECHOHEALTH_EVALUATION_OUTPUT'):
            Path(os.environ['ECHOHEALTH_EVALUATION_OUTPUT']).write_text(json.dumps(results, indent=2), encoding='utf-8')

    def test_real_local_audio(self):
        audio_path = os.environ.get("ECHOHEALTH_TEST_AUDIO")
        if not audio_path:
            self.skipTest("Set ECHOHEALTH_TEST_AUDIO to a legitimate local audio file to run real inference")
        # When explicitly requested, missing assets/dependencies FAIL rather than skip.
        from echohealth.audio import load_audio
        from echohealth.config import DetectionConfig
        from echohealth.inference import Yamnet
        from echohealth.labels import load_labels
        from echohealth.output import build_report
        directory = Path(os.environ.get("ECHOHEALTH_MODEL_DIR", "models"))
        audio = load_audio(audio_path)
        model = Yamnet(directory)
        scores, starts, elapsed = model.classify(audio.waveform)
        self.assertGreater(elapsed, 0)
        self.assertTrue(scores)
        self.assertEqual(len(scores[0]), 521)
        report = build_report(scores, starts, load_labels(directory / "labels_yamnet.txt"),
                              audio.duration_seconds, DetectionConfig(), {"inference": elapsed}, {})
        self.assertEqual(len(report["classes"]), 521)
        self.assertLessEqual(report["windows"][-1]["end_seconds"], audio.duration_seconds)
