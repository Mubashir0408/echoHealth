"""Deterministic development heuristics, never clinical calibration.

Raw model scores and original all-class spans are retained in each report.
"""
from collections import Counter
from math import ceil, log10, sqrt

from .config import RESPIRATORY, SAMPLE_RATE, WINDOW_SAMPLES

PROFILE = {'Cough': .45, 'Wheeze': .50, 'Breathing': .50, 'Snoring': .45,
           'Sneeze': .50, 'Gasp': .55, 'Throat clearing': .50}
SILENCE_RMS = .003
COMPETITORS = {'Speech', 'Music', 'Noise', 'Silence'}


def detect(scores, starts, labels, waveform, duration, threshold, overrides=None):
    """Assign each window a non-overlapping time cell around its center.

    Enter at max(user threshold, per-class floor); hold at 80% of entry.
    Reject quiet windows and respiratory scores dominated by speech/music/noise.
    Cells estimate timing resolution, not an acoustic onset measurement.
    """
    competitors = [i for i, label in enumerate(labels) if label in COMPETITORS]
    rms = []
    for start in starts:
        samples = waveform[round(start * SAMPLE_RATE):round(start * SAMPLE_RATE) + WINDOW_SAMPLES]
        rms.append(sqrt(sum(float(x) ** 2 for x in samples) / max(1, len(samples))))
    boundaries = [0.0] + [min(duration, (a + b) / 2 + WINDOW_SAMPLES / SAMPLE_RATE / 2)
                               for a, b in zip(starts, starts[1:])] + [duration]
    events, rejected = [], Counter()
    for index, label in enumerate(labels):
        if label not in RESPIRATORY:
            continue
        entry = max((overrides or {}).get(label, threshold), PROFILE[label])
        active = None
        for frame in range(len(scores) + 1):
            selected = False
            if frame < len(scores):
                score = scores[frame][index]
                cutoff = entry if active is None else entry * .8
                competing = max((scores[frame][i] for i in competitors), default=0)
                audible = rms[frame] >= SILENCE_RMS
                dominant = competing < .5 or score >= .8 * competing
                selected = score >= cutoff and audible and dominant
                if score >= entry and not audible:
                    rejected['quiet'] += 1
                elif score >= entry and not dominant:
                    rejected['competing_sound'] += 1
            if selected and active is None:
                active = frame
            if active is not None and not selected:
                end = frame
                values = [scores[k][index] for k in range(active, end)]
                events.append({'class_index': index, 'model_label': label,
                               'respiratory_category': RESPIRATORY[label],
                               'start_seconds': boundaries[active], 'end_seconds': boundaries[end],
                               'max_score': max(values), 'mean_score': sum(values) / len(values),
                               'window_count': len(values), 'threshold': entry})
                active = None
    signal_rms = sqrt(sum(float(x) ** 2 for x in waveform) / max(1, len(waveform)))
    return {'events': sorted(events, key=lambda e: (e['start_seconds'], e['class_index'])),
            'signal': {'rms': signal_rms, 'dbfs': 20 * log10(signal_rms) if signal_rms else None,
                       'quiet': signal_rms < SILENCE_RMS,
                       'quiet_window_fraction': sum(r < SILENCE_RMS for r in rms) / len(rms)},
            'policy': {'version': 1, 'thresholds': {k: max((overrides or {}).get(k, threshold), v) for k, v in PROFILE.items()},
                       'exit_threshold_ratio': .8, 'silence_rms_floor': SILENCE_RMS,
                       'competitor_score_floor': .5, 'respiratory_to_competitor_ratio': .8,
                       'rejected_candidate_windows': dict(rejected),
                       'timing': 'Non-overlapping cells around window centers, clipped to recording duration.',
                       'notice': 'Unvalidated development heuristics can miss real sounds. Counts are model-derived spans.'}}


def summarize_segments(segments, duration):
    """Merge touching/overlapping spans of the same category, including segment edges."""
    candidates = []
    legacy = False
    for segment in segments:
        report = segment['report']
        legacy |= 'respiratory_events' not in report
        offset = segment.get('offset_seconds', 0)
        for event in report.get('respiratory_events', report.get('events', [])):
            if event.get('respiratory_category') not in RESPIRATORY.values():
                continue
            start = max(0, min(duration, offset + event['start_seconds']))
            end = max(start, min(duration, offset + event['end_seconds']))
            if end > start:
                candidates.append({**event, 'start_seconds': start, 'end_seconds': end})
    merged = []
    for category in RESPIRATORY.values():
        spans = sorted((e for e in candidates if e['respiratory_category'] == category),
                       key=lambda e: (e['start_seconds'], e['end_seconds']))
        for span in spans:
            if merged and merged[-1]['respiratory_category'] == category and span['start_seconds'] <= merged[-1]['end_seconds'] + 1e-8:
                previous = merged[-1]
                n, m = previous.get('window_count', 1), span.get('window_count', 1)
                previous['mean_score'] = (previous.get('mean_score', previous['max_score']) * n + span.get('mean_score', span['max_score']) * m) / (n + m)
                previous['window_count'] = n + m
                previous['end_seconds'] = max(previous['end_seconds'], span['end_seconds'])
                previous['max_score'] = max(previous['max_score'], span['max_score'])
            else:
                merged.append(dict(span))
    timeline = sorted(merged, key=lambda e: (e['start_seconds'], e['respiratory_category']))
    counts = Counter(e['respiratory_category'] for e in timeline)
    total = len(timeline)
    distribution = [{'category': category, 'count': counts[category],
                     'fraction': counts[category] / total if total else 0}
                    for category in RESPIRATORY.values()]
    bins = [{'start_seconds': i * 60, 'end_seconds': min(duration, (i + 1) * 60), 'count': 0}
            for i in range(ceil(duration / 60))]
    for event in timeline:
        if bins:
            bins[min(int(event['start_seconds'] // 60), len(bins) - 1)]['count'] += 1
    clusters, group = [], []
    for event in timeline:
        if group and event['start_seconds'] - max(e['end_seconds'] for e in group) > 10:
            if len(group) >= 3:
                clusters.append({'start_seconds': group[0]['start_seconds'], 'end_seconds': max(e['end_seconds'] for e in group), 'event_count': len(group)})
            group = []
        group.append(event)
    if len(group) >= 3:
        clusters.append({'start_seconds': group[0]['start_seconds'], 'end_seconds': max(e['end_seconds'] for e in group), 'event_count': len(group)})
    most = sorted(counts, key=lambda category: (-counts[category], category))
    return {'total_respiratory_events': total, 'events_per_hour': total * 3600 / duration if duration else None,
            'monitoring_duration_seconds': duration,
            'most_frequent_sound': most[0] if most else None,
            'most_frequent_sounds': [c for c in most if counts[c] == counts[most[0]]] if most else [],
            'highest_activity_period': max(bins, key=lambda b: b['count']) if total else None,
            'distribution': distribution, 'clusters': clusters, 'timeline': timeline, 'activity_bins': bins,
            'methodology': {'event': 'Touching or overlapping spans of the same sound are counted once; different sounds may overlap.',
                            'rate': 'Count × 3600 / analyzed audio seconds. Short recordings produce unstable extrapolations.',
                            'highest_activity': 'Events starting in fixed 60-second bins; earliest bin wins ties.',
                            'cluster': 'At least 3 spans, each starting within 10 seconds of the group end; descriptive only.',
                            'timing': 'Approximate model timing, not acoustic onset/offset annotation.',
                            'contains_legacy_reports': legacy}}
