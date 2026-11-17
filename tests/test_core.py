import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from echohealth.cli import main
from echohealth.config import DetectionConfig, EXPECTED_LABELS, RESPIRATORY, load_config
from echohealth.errors import EchoHealthError
from echohealth.inference import window_starts
from echohealth.labels import load_labels
from echohealth.output import build_report, format_json


def fixture_labels():
    # Schema fixture only, not a replacement for the downloaded 521 model labels.
    labels = [f"fixture class {i}" for i in range(521)]
    for index, label in EXPECTED_LABELS.items():
        labels[index] = label
    return labels


class CoreTests(unittest.TestCase):
    def test_label_mapping_and_order(self):
        labels = fixture_labels()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "labels.txt"
            path.write_text(json.dumps({str(i): x for i, x in enumerate(labels)}))
            self.assertEqual(load_labels(path), labels)
            data = {str(i): x for i, x in enumerate(labels)}
            data["42"], data["43"] = data["43"], data["42"]
            path.write_text(json.dumps(data))
            with self.assertRaises(EchoHealthError):
                load_labels(path)
            path.write_text("Speech\nCough")
            with self.assertRaises(EchoHealthError):
                load_labels(path)

    def test_all_requested_categories(self):
        self.assertEqual(set(RESPIRATORY.values()), {"Coughing", "Wheezing", "Breathing", "Sneezing", "Snoring", "Gasping", "Throat clearing"})

    def test_known_mirror_abbreviations_preserve_indices(self):
        labels = fixture_labels()
        for index in (500, 501, 502):
            labels[index] = 'Inside'
        for index in (503, 504):
            labels[index] = 'Outside'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'labels.txt'
            path.write_text(json.dumps(dict(enumerate(labels))))
            self.assertEqual(load_labels(path), labels)
            labels[499] = 'Inside'
            path.write_text(json.dumps(dict(enumerate(labels))))
            with self.assertRaises(EchoHealthError):
                load_labels(path)

    def test_bad_thresholds(self):
        for value in (-0.1, 1.1, float("nan"), float("inf"), "0.3", True):
            with self.subTest(value=value), self.assertRaises(EchoHealthError):
                DetectionConfig(value).validate(fixture_labels())
        with self.assertRaises(EchoHealthError):
            DetectionConfig(thresholds={"Coughing": 0.2}).validate(fixture_labels())

    def test_config_override_and_invalid_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text('{"threshold": 0.4, "thresholds": {"Cough": 0.6}}')
            config = load_config(path, 0.2)
            self.assertEqual(config.for_label("Speech"), 0.2)
            self.assertEqual(config.for_label("Cough"), 0.6)
            path.write_text('{"thresholds": []}')
            with self.assertRaises(EchoHealthError):
                load_config(path)

    def test_window_padding_and_tail(self):
        for count, expected in [(1, [0]), (15600, [0]), (15601, [0, 7680]), (23280, [0, 7680]), (23281, [0, 7680, 15360])]:
            self.assertEqual(window_starts(count), expected)
        with self.assertRaises(EchoHealthError):
            window_starts(0)

    def test_report_preserves_environmental_scores_and_timestamps(self):
        # Deliberate synthetic score fixture tests formatting, never model accuracy.
        scores = [[0.0] * 521 for _ in range(4)]
        for frame in (0, 1, 3):
            scores[frame][42] = 0.8
        scores[2][0] = 0.9
        scores[0][132] = 0.7
        report = build_report(scores, [0, 0.48, 0.96, 1.44], fixture_labels(), 1.6,
                              DetectionConfig(), {"inference": 0.1}, {})
        self.assertEqual(len(report["classes"]), 521)
        self.assertEqual(report["windows"][0]["scores"][132], 0.7)
        coughs = [event for event in report["events"] if event["model_label"] == "Cough"]
        self.assertEqual(len(coughs), 2)
        self.assertEqual(coughs[0]["end_seconds"], 1.455)
        self.assertEqual(coughs[1]["end_seconds"], 1.6)
        self.assertEqual(coughs[0]["respiratory_category"], "Coughing")
        self.assertEqual(json.loads(format_json(report)), report)
        self.assertTrue(any(x["model_label"] == "Speech" for x in report["events"]))
        self.assertNotIn("probability", report["classes"][0])

    def test_invalid_inference_output(self):
        with self.assertRaises(EchoHealthError):
            build_report([[float("nan")] * 521], [0], fixture_labels(), 1, DetectionConfig(), {}, {})

    def test_missing_model_error_is_clean(self):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = main(["classify", "missing.wav", "--model-dir", "nonexistent-model-directory"])
        self.assertEqual(code, 2)
        self.assertIn("download", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())
