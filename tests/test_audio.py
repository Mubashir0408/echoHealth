from pathlib import Path
import tempfile
import unittest

from echohealth.audio import load_audio
from echohealth.errors import EchoHealthError

try:
    import numpy as np
    import scipy.signal
    import soundfile as sf
    AVAILABLE = True
except (ImportError, OSError):
    AVAILABLE = False


@unittest.skipUnless(AVAILABLE, "Audio dependencies not installed: numpy, scipy, soundfile")
class AudioTests(unittest.TestCase):
    def test_stereo_resample_pcm_scaling_and_no_peak_gain(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stereo.wav"
            sf.write(path, np.full((48000, 2), 0.25), 48000, subtype="PCM_16")
            audio = load_audio(path)
            self.assertEqual(audio.waveform.shape, (16000,))
            self.assertEqual(audio.waveform.dtype, np.float32)
            self.assertAlmostEqual(float(audio.waveform[100:15900].mean()), 0.25, places=4)
            self.assertEqual(audio.duration_seconds, 1)
            self.assertEqual(audio.source_channels, 2)

    def test_downmix(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cancel.wav"
            sf.write(path, np.tile([0.5, -0.5], (16000, 1)), 16000, subtype="FLOAT")
            self.assertTrue(np.all(load_audio(path).waveform == 0))

    def test_clips_out_of_range_float_and_rejects_nonfinite(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "float.wav"
            sf.write(path, np.array([2, -2, 0], dtype=np.float32), 16000, subtype="FLOAT")
            audio = load_audio(path)
            np.testing.assert_array_equal(audio.waveform, [1, -1, 0])
            self.assertEqual(audio.clipped_samples, 2)
            sf.write(path, np.array([np.nan], dtype=np.float32), 16000, subtype="FLOAT")
            with self.assertRaises(EchoHealthError):
                load_audio(path)

    def test_empty_corrupt_missing_and_too_long(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.wav"
            with self.assertRaises(EchoHealthError):
                load_audio(path)
            path.write_bytes(b"not audio")
            with self.assertRaises(EchoHealthError):
                load_audio(path)
            sf.write(path, np.zeros(0), 16000)
            with self.assertRaises(EchoHealthError):
                load_audio(path)
            sf.write(path, np.zeros(16000), 16000)
            with self.assertRaises(EchoHealthError):
                load_audio(path, max_seconds=0.5)

    def test_resampling_suppresses_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "high-frequency.wav"
            signal = 0.5 * np.sin(2 * np.pi * 12000 * np.arange(48000) / 48000)
            sf.write(path, signal, 48000, subtype="FLOAT")
            converted = load_audio(path).waveform[100:-100]
            self.assertLess(float(np.sqrt(np.mean(converted ** 2))), 0.01)
