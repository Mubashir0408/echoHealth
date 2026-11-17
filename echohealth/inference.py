import os
from pathlib import Path
from time import perf_counter

from .assets import verify_model
from .config import HOP_SAMPLES, MODEL_NAME, SAMPLE_RATE, WINDOW_SAMPLES
from .errors import EchoHealthError


def window_starts(sample_count):
    """Match upstream end-padding to a whole number of 0.48s hops."""
    if sample_count <= 0:
        raise EchoHealthError("Cannot classify empty audio.")
    count = 1 + max(0, (sample_count - WINDOW_SAMPLES + HOP_SAMPLES - 1) // HOP_SAMPLES)
    return [i * HOP_SAMPLES for i in range(count)]


class Yamnet:
    def __init__(self, directory, threads=2):
        path = Path(directory) / MODEL_NAME
        verify_model(path)
        try:
            # CPU only; avoid GPU initialization and keep logs off JSON stdout.
            os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
            os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
            import numpy as np
            import tensorflow as tf
            self.np = np
            self.interpreter = tf.lite.Interpreter(model_path=str(path), num_threads=threads)
            inputs = self.interpreter.get_input_details()
            if len(inputs) != 1 or inputs[0]["dtype"] != np.float32 or len(inputs[0]["shape"]) != 1:
                raise EchoHealthError("Incompatible model: expected one rank-1 float32 waveform input.")
            self.input_index = inputs[0]["index"]
            self.interpreter.resize_tensor_input(self.input_index, [WINDOW_SAMPLES], strict=True)
            self.interpreter.allocate_tensors()
            # Never assume output ordering: embeddings/spectrogram are also outputs.
            outputs = [d for d in self.interpreter.get_output_details()
                       if tuple(d["shape"]) == (1, 521) and d["dtype"] == np.float32]
            if len(outputs) != 1:
                raise EchoHealthError("Incompatible model: expected exactly one [1,521] float32 score output.")
            self.output_index = outputs[0]["index"]
        except EchoHealthError:
            raise
        except (ImportError, OSError) as exc:
            raise EchoHealthError("TensorFlow Lite CPU runtime unavailable. Install requirements.txt using Python 3.10-3.12 x64; Windows also requires the Microsoft VC++ runtime.") from exc
        except Exception as exc:
            raise EchoHealthError(f"Cannot initialize TFLite model: {exc}") from exc

    def classify(self, waveform):
        """Return all class scores, window starts, and CPU invocation wall time."""
        np = self.np
        if waveform.ndim != 1 or waveform.dtype != np.float32 or not np.isfinite(waveform).all() or np.any(np.abs(waveform) > 1):
            raise EchoHealthError("Expected finite mono float32 audio in [-1,1].")
        starts = window_starts(len(waveform))
        scores, elapsed = [], 0.0
        try:
            for start in starts:
                window = np.zeros(WINDOW_SAMPLES, dtype=np.float32)
                available = waveform[start:start + WINDOW_SAMPLES]
                window[:len(available)] = available
                before = perf_counter()
                self.interpreter.set_tensor(self.input_index, window)
                self.interpreter.invoke()
                score = self.interpreter.get_tensor(self.output_index)[0]
                elapsed += perf_counter() - before
                if not np.isfinite(score).all() or np.any((score < 0) | (score > 1)):
                    raise EchoHealthError("Model returned invalid classification scores.")
                scores.append(score.tolist())
            return scores, [s / SAMPLE_RATE for s in starts], elapsed
        except EchoHealthError:
            raise
        except Exception as exc:
            raise EchoHealthError(f"Local model inference failed: {exc}") from exc
