import json
from pathlib import Path

from .config import EXPECTED_LABELS
from .errors import EchoHealthError


def load_labels(path):
    """The HF .txt artifact is a JSON object, not a newline label list."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(data, dict) or set(data) != {str(i) for i in range(521)}:
            raise ValueError("expected JSON keys 0 through 520")
        labels = [data[str(i)] for i in range(521)]
        if any(not isinstance(label, str) or not label.strip() for label in labels):
            raise ValueError("empty or invalid class name")
        # The pinned mirror abbreviates several environmental display names.
        # Preserve its index mapping while rejecting any unexpected collisions.
        duplicates = {name: [i for i, value in enumerate(labels) if value == name]
                      for name in set(labels) if labels.count(name) > 1}
        if any(name not in {'Inside': [500, 501, 502], 'Outside': [503, 504]}
               or indices != {'Inside': [500, 501, 502], 'Outside': [503, 504]}[name]
               for name, indices in duplicates.items()):
            raise ValueError("unexpected duplicate class names")
        if any(labels[i] != name for i, name in EXPECTED_LABELS.items()):
            raise ValueError("label order does not match YAMNet")
        return labels
    except (OSError, ValueError, TypeError) as exc:
        raise EchoHealthError(f"Cannot load labels at {path}: {exc}. Run python -m echohealth download.") from exc
