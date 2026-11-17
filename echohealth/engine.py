"""Shared, serialized inference engine for HTTP and streaming clients."""
import threading
import time
from pathlib import Path

from .config import DetectionConfig, SAMPLE_RATE
from .errors import EchoHealthError
from .labels import load_labels
from .output import build_report
from .respiratory import detect, summarize_segments


class Engine:
    def __init__(self, model_dir):
        self.model_dir = Path(model_dir)
        self.lock = threading.Lock()
        self.model = None
        self.labels = None
        self.error = None

    def load(self):
        with self.lock:
            if self.model is None:
                try:
                    from .inference import Yamnet
                    labels = load_labels(self.model_dir / 'labels_yamnet.txt')
                    model = Yamnet(self.model_dir)
                    self.labels, self.model = labels, model
                    self.error = None
                except EchoHealthError as exc:
                    self.error = str(exc)
                    raise

    def classify(self, audio, threshold=0.3):
        config = DetectionConfig(threshold)
        config.validate([])
        self.load()
        before = time.perf_counter()
        with self.lock:
            scores, starts, elapsed = self.model.classify(audio.waveform)
        report = build_report(scores, starts, self.labels, audio.duration_seconds, config,
                            {'inference': elapsed, 'total_before_formatting': time.perf_counter() - before},
                            {'source_sample_rate': audio.source_sample_rate,
                             'source_channels': audio.source_channels,
                             'clipped_samples_after_resampling': audio.clipped_samples})
        observations = detect(scores, starts, self.labels, audio.waveform, audio.duration_seconds, threshold)
        report['respiratory_events'] = observations['events']
        report['signal'] = observations['signal']
        report['detection_policy'] = observations['policy']
        report['summary'] = summarize_segments([{'report': report}], audio.duration_seconds)
        return report

    def pcm(self, data, threshold):
        import numpy as np
        from .audio import Audio
        if not data or len(data) % 2 or len(data) > SAMPLE_RATE * 2 * 10:
            raise EchoHealthError('Send 16-bit little-endian mono PCM at 16000 Hz, up to 10 seconds.')
        waveform = np.frombuffer(data, dtype='<i2').astype(np.float32) / 32768.0
        return self.classify(Audio(waveform, len(waveform) / SAMPLE_RATE, SAMPLE_RATE, 1, 0), threshold)
