import hashlib
import os
from pathlib import Path
import tempfile
import urllib.request

from .config import HF_BASE, MODEL_NAME, MODEL_SHA256
from .errors import EchoHealthError
from .labels import load_labels


def verify_model(path):
    try:
        digest = hashlib.sha256(Path(path).read_bytes()).hexdigest()
        if digest != MODEL_SHA256:
            raise EchoHealthError("Model checksum mismatch; run python -m echohealth download to restore the selected artifact.")
    except OSError as exc:
        raise EchoHealthError(f"Model unavailable at {path}. Run python -m echohealth download.") from exc


def download_assets(directory):
    """Explicit download only. Classification never makes network requests."""
    directory = Path(directory)
    try:
        directory.mkdir(parents=True, exist_ok=True)
        for name in (MODEL_NAME, "labels_yamnet.txt"):
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=directory, delete=False) as output:
                    temporary = Path(output.name)
                    request = urllib.request.Request(f"{HF_BASE}/{name}", headers={"User-Agent": "EchoHealth/0.1"})
                    with urllib.request.urlopen(request, timeout=60) as response:
                        total = 0
                        while chunk := response.read(1024 * 1024):
                            total += len(chunk)
                            if total > 25 * 1024 * 1024:
                                raise EchoHealthError("Unexpected asset size; download stopped.")
                            output.write(chunk)
                verify_model(temporary) if name == MODEL_NAME else load_labels(temporary)
                os.replace(temporary, directory / name)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
    except EchoHealthError:
        raise
    except (OSError, ValueError) as exc:
        raise EchoHealthError(f"Asset download failed: {exc}. Check network access, or copy verified assets into {directory}.") from exc
