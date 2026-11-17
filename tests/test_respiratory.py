"""Score fixtures verify deterministic rules, not classifier accuracy."""
import unittest

from echohealth.respiratory import detect, summarize_segments
from echohealth.config import EXPECTED_LABELS


def fixture():
    labels = [f'class {i}' for i in range(521)]
    for i, label in EXPECTED_LABELS.items():
        labels[i] = label
    return labels


def span(start, end, category='Coughing', score=.8):
    return {'start_seconds': start, 'end_seconds': end,
            'respiratory_category': category, 'max_score': score, 'mean_score': score, 'window_count': 1}


class RespiratoryTests(unittest.TestCase):
    def detection(self, coughs, speech=None, amplitude=.1):
        scores = [[0.] * 521 for _ in coughs]
        for i, score in enumerate(coughs):
            scores[i][42] = score
            scores[i][0] = speech[i] if speech else 0
        duration = .975 + .48 * (len(scores) - 1)
        return detect(scores, [i * .48 for i in range(len(scores))], fixture(),
                      [amplitude] * round(duration * 16000), duration, .3)

    def test_silence_suppresses_even_high_scores(self):
        result = self.detection([.95], amplitude=0)
        self.assertEqual(result['events'], [])
        self.assertIsNone(result['signal']['dbfs'])
        self.assertEqual(result['policy']['rejected_candidate_windows']['quiet'], 1)

    def test_speech_competition_and_strong_respiratory(self):
        self.assertEqual(self.detection([.6], [.95])['events'], [])
        self.assertEqual(len(self.detection([.9], [.95])['events']), 1)

    def test_profile_floor_and_hysteresis(self):
        self.assertEqual(self.detection([.4])['events'], [])
        events = self.detection([.6, .4, .6])['events']
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['window_count'], 3)

    def test_disjoint_timing_avoids_overlapping_duplicate_windows(self):
        events = self.detection([.8, .1, .8])['events']
        self.assertEqual(len(events), 2)
        self.assertLess(events[0]['end_seconds'], events[1]['start_seconds'])
        self.assertEqual(events[0]['start_seconds'], 0)
        self.assertAlmostEqual(events[-1]['end_seconds'], 1.935)

    def test_summary_merge_edges_rates_bins_and_clusters(self):
        segments = [dict(offset_seconds=0, report={'respiratory_events': [span(0, 2), span(4, 5, 'Wheezing')]}),
                    dict(offset_seconds=2, report={'respiratory_events': [span(0, 1), span(6, 7), span(70, 71)]})]
        result = summarize_segments(segments, 120)
        self.assertEqual(result['total_respiratory_events'], 4)
        self.assertEqual(result['events_per_hour'], 120)
        self.assertEqual(result['most_frequent_sound'], 'Coughing')
        self.assertEqual(result['highest_activity_period']['count'], 3)
        self.assertEqual(result['timeline'][0]['end_seconds'], 3)
        self.assertEqual(result['clusters'], [{'start_seconds': 0, 'end_seconds': 9, 'event_count': 3}])
        self.assertEqual(sum(d['count'] for d in result['distribution']), 4)

    def test_empty_and_legacy_reports(self):
        result = summarize_segments([], 0)
        self.assertEqual(result['total_respiratory_events'], 0)
        self.assertIsNone(result['events_per_hour'])
        self.assertIsNone(result['highest_activity_period'])
        self.assertEqual(result['timeline'], [])
        result = summarize_segments([{'report': {'events': [span(0, 1), {'respiratory_category': None}]}}], 1)
        self.assertEqual(result['total_respiratory_events'], 1)
        self.assertTrue(result['methodology']['contains_legacy_reports'])

    def test_different_categories_overlap_and_ties_are_explicit(self):
        result = summarize_segments([{'report': {'respiratory_events': [span(0, 1), span(0, 1, 'Wheezing')]}}], 1)
        self.assertEqual(result['total_respiratory_events'], 2)
        self.assertEqual(result['most_frequent_sounds'], ['Coughing', 'Wheezing'])

    def test_duration_clipping_and_bin_edges(self):
        result = summarize_segments([{'report': {'respiratory_events': [span(60, 65), span(120, 125)]}}], 120)
        self.assertEqual(result['total_respiratory_events'], 1)
        self.assertEqual(result['highest_activity_period']['start_seconds'], 60)
