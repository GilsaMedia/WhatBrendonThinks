import unittest
from datetime import datetime

from backend import insights
from backend.parser import parse_chat


def chat(lines):
    return parse_chat('\n'.join(lines).encode(), 'chat.txt')


GROUP = [
    '[21/09/2025, 16:30:00] גילסא: החלטנו בשבת',
    '[21/09/2025, 16:31:00] גילסא: שמגיעים בשלישי',
    '[21/09/2025, 16:32:00] עדי: כן אחי',
    '[22/09/2025, 09:00:00] עדי: אחי מה קורה חחחחחחח',
    '[22/09/2025, 09:01:00] אור: אחי אוהב אותך 😂😂',
    '[23/09/2025, 22:00:00] אור: אחי בוא',
    '[23/09/2025, 22:05:00] עדי: חח אחי',
    '[13/10/2025, 22:10:00] גילסא: ‎<attached: 00000001-PHOTO-2025-10-13-22-10-00.jpg> תראו',
    '[13/10/2025, 22:11:00] עדי: ' + ' '.join(['מילה'] * 40),
]


class InsightTests(unittest.TestCase):
    def test_day_first_dates_and_rhythm(self):
        story = insights.build(chat(GROUP))
        self.assertTrue(story['has_dates'])
        self.assertEqual(story['range'], {'start': '2025-09-21', 'end': '2025-10-13'})
        self.assertEqual(story['busiest_day'], {'date': '2025-09-21', 'count': 3})
        self.assertEqual(story['streak']['days'], 3)
        self.assertEqual(story['silence'], {'days': 19, 'from': '2025-09-23', 'to': '2025-10-13'})
        self.assertEqual(story['peak_hour']['hour'], 22)
        self.assertEqual(sum(story['calendar'].values()), 9)

    def test_month_first_exports_are_detected(self):
        times = insights.parse_times([{'timestamp': '12/31/25 11:15 PM'}, {'timestamp': '1/2/26 9:00 AM'}])
        self.assertEqual(times, [datetime(2025, 12, 31, 23, 15), datetime(2026, 1, 2, 9, 0)])

    def test_people_words_laughs_love_and_openers(self):
        story = insights.build(chat(GROUP))
        self.assertEqual(story['participants'][0]['name'], 'עדי')
        self.assertEqual(story['address'][0], {'name': 'עדי', 'word': 'אחי', 'count': 3})
        self.assertEqual(story['love'], [{'name': 'אור', 'count': 1}])
        laughs = {row['name']: row['count'] for row in story['laughs']}
        self.assertEqual(laughs, {'עדי': 2, 'אור': 2})
        self.assertEqual(story['longest_laugh']['sender'], 'עדי')
        self.assertEqual(story['top_words'][0]['word'], 'מילה')
        self.assertEqual(story['top_emojis'][0], {'emoji': '😂', 'count': 2})
        self.assertEqual(story['longest'][0]['words'], 40)
        # Conversations start after a 4h gap: 21/09 16:30, 22/09 09:00, 23/09 22:00, 13/10 22:10.
        openers = {row['name']: row['share'] for row in story['openers']}
        self.assertEqual(openers['גילסא'], 50)
        self.assertEqual(openers['עדי'], 25)

    def test_media_placeholders_are_not_words(self):
        story = insights.build(chat(GROUP))
        self.assertNotIn('jpg', [w['word'] for w in story['top_words']])
        self.assertEqual(story['first'][0]['text'], 'החלטנו בשבת')
        self.assertEqual(story['last'][-1]['sender'], 'עדי')

    def test_undated_chats_skip_calendar_chapters(self):
        story = insights.build([{'sender': 'A', 'text': 'hi there', 'timestamp': ''},
                                {'sender': 'B', 'text': 'haha hello', 'timestamp': ''}])
        self.assertFalse(story['has_dates'])
        self.assertNotIn('calendar', story)
        self.assertEqual(story['laughs'], [{'name': 'B', 'count': 1}])

    def test_rename_merges_people(self):
        messages = insights.rename(chat(GROUP), {'אור': 'Or', 'עדי': 'Or', 'גילסא': '  '})
        self.assertEqual({m['sender'] for m in messages}, {'Or', 'גילסא'})


if __name__ == '__main__':
    unittest.main()
