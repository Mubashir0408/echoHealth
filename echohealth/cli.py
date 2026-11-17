import argparse
import sys
from pathlib import Path
from time import perf_counter

from .assets import download_assets
from .config import load_config
from .errors import EchoHealthError
from .labels import load_labels
from .output import build_report, format_json


def main(argv=None):
    parser = argparse.ArgumentParser(description="EchoHealth: offline sound classification; no diagnosis.")
    commands = parser.add_subparsers(dest="command", required=True)
    download = commands.add_parser("download", help="Explicitly download public model and label assets")
    download.add_argument("--model-dir", default="models")
    classify = commands.add_parser("classify", help="Classify a local audio file; no network access")
    classify.add_argument("audio")
    classify.add_argument("--model-dir", default="models")
    classify.add_argument("--config")
    classify.add_argument("--threshold", type=float, help="Override default threshold (0 to 1)")
    classify.add_argument("--threads", type=int, default=2)
    classify.add_argument("--output", help="Write JSON here instead of stdout; may contain sensitive information")
    args = parser.parse_args(argv)
    try:
        if args.command == "download":
            download_assets(args.model_dir)
            print(f"Verified assets saved to {args.model_dir}")
            return 0
        if not 1 <= args.threads <= 64:
            raise EchoHealthError("--threads must be between 1 and 64.")
        started = perf_counter()
        config = load_config(args.config, args.threshold)
        labels = load_labels(Path(args.model_dir) / "labels_yamnet.txt")
        config.validate(labels)
        from .audio import load_audio
        from .inference import Yamnet
        before = perf_counter()
        audio = load_audio(args.audio)
        preprocessing = perf_counter() - before
        before = perf_counter()
        model = Yamnet(args.model_dir, args.threads)
        model_load = perf_counter() - before
        scores, starts, elapsed = model.classify(audio.waveform)
        report = build_report(scores, starts, labels, audio.duration_seconds, config,
                              {"preprocessing": preprocessing, "model_load": model_load,
                               "inference": elapsed, "total_before_formatting": perf_counter() - started},
                              {"source_sample_rate": audio.source_sample_rate,
                               "source_channels": audio.source_channels,
                               "clipped_samples_after_resampling": audio.clipped_samples})
        from .respiratory import detect, summarize_segments
        observations = detect(scores, starts, labels, audio.waveform, audio.duration_seconds,
                              config.threshold, config.thresholds)
        report.update(respiratory_events=observations['events'], signal=observations['signal'],
                      detection_policy=observations['policy'])
        report['summary'] = summarize_segments([{'report': report}], audio.duration_seconds)
        result = format_json(report)
        if args.output:
            Path(args.output).write_text(result + "\n", encoding="utf-8")
        else:
            print(result)
        return 0
    except (EchoHealthError, OSError, ValueError) as exc:
        print(f"EchoHealth error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("EchoHealth interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
