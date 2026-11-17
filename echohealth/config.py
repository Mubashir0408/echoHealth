from dataclasses import dataclass, field
import json
import math
from pathlib import Path

from .errors import EchoHealthError

SAMPLE_RATE = 16000
WINDOW_SAMPLES = 15600  # 0.975 s: 96 mel frames plus final STFT support
HOP_SAMPLES = 7680  # 0.48 s
MODEL_NAME = "lite-model_yamnet_tflite_1.tflite"
MODEL_SHA256 = "141fba1cdaae842c816f28edc4937e8b4f0af4c8df21862ccc6b52dc567993c3"
HF_REVISION = "156527d"
HF_BASE = f"https://huggingface.co/thelou1s/yamnet/resolve/{HF_REVISION}"
RESPIRATORY = {
    "Cough": "Coughing", "Wheeze": "Wheezing", "Breathing": "Breathing",
    "Sneeze": "Sneezing", "Snoring": "Snoring", "Gasp": "Gasping",
    "Throat clearing": "Throat clearing",
}
EXPECTED_LABELS = {0: "Speech", 36: "Breathing", 37: "Wheeze", 38: "Snoring",
                   39: "Gasp", 42: "Cough", 43: "Throat clearing", 44: "Sneeze", 132: "Music"}


@dataclass
class DetectionConfig:
    threshold: float = 0.3
    thresholds: dict[str, float] = field(default_factory=dict)

    def validate(self, labels):
        for name, value in {"default": self.threshold, **self.thresholds}.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1:
                raise EchoHealthError(f"Threshold for {name} must be a finite number from 0 to 1.")
        unknown = set(self.thresholds) - set(labels)
        if unknown:
            raise EchoHealthError(f"Unknown model labels in thresholds: {sorted(unknown)}")

    def for_label(self, label):
        return self.thresholds.get(label, self.threshold)


def load_config(path, threshold=None):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8")) if path else {}
        if not isinstance(data, dict) or set(data) - {"threshold", "thresholds"}:
            raise ValueError("expected only threshold and thresholds keys")
        if not isinstance(data.get("thresholds", {}), dict):
            raise ValueError("thresholds must be an object keyed by exact model label")
        return DetectionConfig(threshold if threshold is not None else data.get("threshold", 0.3), data.get("thresholds", {}))
    except (OSError, ValueError, TypeError) as exc:
        raise EchoHealthError(f"Cannot read configuration: {exc}") from exc
