from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from echohealth.assets import download_assets, verify_model
from echohealth.config import MODEL_NAME
from echohealth.errors import EchoHealthError


class AssetTests(unittest.TestCase):
    def test_missing_or_corrupt_model_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / MODEL_NAME
            with self.assertRaisesRegex(EchoHealthError, "unavailable"):
                verify_model(path)
            path.write_bytes(b"corrupt fixture, not a model")
            with self.assertRaisesRegex(EchoHealthError, "checksum"):
                verify_model(path)

    def test_failed_download_cleans_temp_and_preserves_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / MODEL_NAME
            target.write_bytes(b"existing file")
            with patch("echohealth.assets.urllib.request.urlopen", side_effect=OSError("network blocked")):
                with self.assertRaisesRegex(EchoHealthError, "network blocked"):
                    download_assets(directory)
            self.assertEqual(target.read_bytes(), b"existing file")
            self.assertEqual(list(Path(directory).iterdir()), [target])

    def test_corrupt_download_does_not_replace_existing_asset(self):
        import io
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / MODEL_NAME
            target.write_bytes(b"existing file")
            with patch("echohealth.assets.urllib.request.urlopen", return_value=io.BytesIO(b"not a tflite model")):
                with self.assertRaisesRegex(EchoHealthError, "checksum"):
                    download_assets(directory)
            self.assertEqual(target.read_bytes(), b"existing file")
            self.assertEqual(len(list(Path(directory).iterdir())), 1)
