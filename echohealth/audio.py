from dataclasses import dataclass
from math import gcd
from pathlib import Path

from .config import SAMPLE_RATE
from .errors import EchoHealthError


@dataclass
class Audio:
    waveform: object
    duration_seconds: float
    source_sample_rate: int
    source_channels: int
    clipped_samples: int


def load_audio(path, max_seconds=600):
    """Decode using libsndfile, downmix, polyphase resample, clip to [-1,1]."""
    try:
        import numpy as np
        import soundfile as sf
        from scipy.signal import resample_poly
    except (ImportError, OSError, ValueError, AttributeError, RuntimeError) as exc:
        raise EchoHealthError("Audio dependencies unavailable. Install requirements.txt with Python 3.10-3.12 x64.") from exc
    path = Path(path)
    if not path.is_file():
        raise EchoHealthError(f"Audio file does not exist: {path}")
    try:
        with sf.SoundFile(path) as stream:
            rate, channels, frames = stream.samplerate, stream.channels, len(stream)
            if rate <= 0 or channels <= 0 or frames <= 0:
                raise EchoHealthError("Audio must contain at least one sample.")
            duration = frames / rate
            if duration > max_seconds:
                raise EchoHealthError(f"Audio exceeds the {max_seconds}s Phase 1 memory limit; split the recording first.")
            samples = stream.read(dtype="float32", always_2d=True)
        if not np.isfinite(samples).all():
            raise EchoHealthError("Audio contains NaN or infinite sample values.")
        waveform = samples.mean(axis=1)
        if rate != SAMPLE_RATE:
            divisor = gcd(rate, SAMPLE_RATE)
            waveform = resample_poly(waveform, SAMPLE_RATE // divisor, rate // divisor)
        clipped = int(np.count_nonzero(np.abs(waveform) > 1))
        # PCM decoding already scales integers to [-1,1]. No peak/loudness gain.
        waveform = np.ascontiguousarray(np.clip(waveform, -1, 1), dtype=np.float32)
        return Audio(waveform, duration, rate, channels, clipped)
    except EchoHealthError:
        raise
    except (OSError, RuntimeError, ValueError, OverflowError) as exc:
        raise EchoHealthError(f"Cannot decode audio: {exc}. Use a valid WAV, FLAC or OGG file supported by libsndfile.") from exc
