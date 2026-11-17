"""Download the public example used in Google's YAMNet tutorial, never patient audio.

Source: https://www.tensorflow.org/hub/tutorials/yamnet
No redistribution license for the clip is asserted; download for local evaluation.
"""
from pathlib import Path
import sys
import urllib.request


def main():
    target = Path("samples/speech_whistling2.wav")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen("https://storage.googleapis.com/audioset/speech_whistling2.wav", timeout=30) as response:
            data = response.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
            raise ValueError("Expected the small tutorial WAV file")
        target.write_bytes(data)
        print(f"Downloaded tutorial example to {target}")
        return 0
    except (OSError, ValueError) as exc:
        print(f"Example audio download failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
