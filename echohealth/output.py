import json
import math

from .config import HF_REVISION, MODEL_SHA256, RESPIRATORY, WINDOW_SAMPLES, SAMPLE_RATE
from .errors import EchoHealthError


def build_report(scores, starts, labels, duration, config, timing, audio_metadata):
    """Pure formatting: scores come only from the caller's real inference."""
    config.validate(labels)
    if len(labels) != 521 or not scores or len(scores) != len(starts):
        raise EchoHealthError("Invalid inference result dimensions.")
    if any(len(row) != 521 or any(not math.isfinite(x) or not 0 <= x <= 1 for x in row) for row in scores):
        raise EchoHealthError("Invalid inference result scores.")
    classes = []
    for i, label in enumerate(labels):
        values = [float(row[i]) for row in scores]
        peak = max(range(len(values)), key=values.__getitem__)
        classes.append({"class_index": i, "model_label": label,
                        "respiratory_category": RESPIRATORY.get(label),
                        "mean_score": sum(values) / len(values), "max_score": values[peak],
                        "peak_window_start_seconds": starts[peak],
                        "threshold": config.for_label(label)})
    events = []
    for i, label in enumerate(labels):
        active = None
        for frame in range(len(scores) + 1):
            selected = frame < len(scores) and scores[frame][i] >= config.for_label(label)
            if selected and active is None:
                active = frame
            if active is not None and not selected:
                last = frame - 1
                events.append({"class_index": i, "model_label": label, "respiratory_category": RESPIRATORY.get(label),
                               "start_seconds": starts[active],
                               "end_seconds": min(duration, starts[last] + WINDOW_SAMPLES / SAMPLE_RATE),
                               "max_score": max(float(scores[k][i]) for k in range(active, frame)),
                               "mean_score": sum(float(scores[k][i]) for k in range(active, frame)) / (frame - active),
                               "threshold": config.for_label(label), "window_count": frame - active})
                active = None
    events.sort(key=lambda event: (event["start_seconds"], event["model_label"]))
    windows = [{"start_seconds": start, "end_seconds": min(duration, start + WINDOW_SAMPLES / SAMPLE_RATE),
                "padded_seconds": max(0, start + WINDOW_SAMPLES / SAMPLE_RATE - duration),
                "scores": row} for start, row in zip(starts, scores)]
    return {"schema_version": 1, "model": {"name": "YAMNet", "source": "thelou1s/yamnet",
             "revision": HF_REVISION, "sha256": MODEL_SHA256, "runtime": "TensorFlow Lite CPU"},
            "notice": "Uncalibrated sound classification scores, not medical probabilities or diagnoses. No detected event does not rule out a health problem.",
            "audio": {"duration_seconds": duration, "model_sample_rate": SAMPLE_RATE, **audio_metadata},
            "timing_seconds": timing,
            "classes": classes, "events": events, "windows": windows}


def format_json(report):
    return json.dumps(report, ensure_ascii=False, allow_nan=False, indent=2)
