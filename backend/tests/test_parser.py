import io
import json
import unittest
import zipfile
from unittest.mock import patch
from backend import parser
from backend.parser import parse_chat, statistics

CHAT = '[06/11/2026, 14:06:00] Alex: Are we still on?\n[06/11/2026, 14:10:00] Jamie: Yes!\nThis is a continuation\n[06/11/2026, 14:14:00] Alex: Great 😊'


class ParserTests(unittest.TestCase):
    def test_ios_multiline_and_counts(self):
        result = parse_chat(CHAT.encode(), 'chat.txt')
        self.assertEqual(len(result), 3)
        self.assertEqual(result[1]['text'], 'Yes!\nThis is a continuation')
        self.assertEqual(result[2]['id'], 3)
        stats = statistics(result)
        self.assertEqual(stats['participants'][0]['messages'], 2)
        self.assertEqual(stats['participants'][0]['questions'], 1)

    def test_poll_and_event_lines_are_not_people(self):
        raw = ('[06/11/2026, 14:06:00] נרי: סקר:\nמה עושים בשבת?\nאפשרות: ים (3 הצבעות)\nאפשרות: בית (1 הצבעות)\n'
               '[06/11/2026, 14:10:00] דנדי: אירוע:\nתיאור האירוע: מנגל\nמיקום האירוע: הפארק\nשעת ההתחלה של האירוע: 20:00\n'
               '[06/11/2026, 14:14:00] אדם: מאחורי ההצעה עומד רעיון פשוט: לנוח')
        result = parse_chat(raw.encode(), 'chat.txt')
        self.assertEqual([m['sender'] for m in result], ['נרי', 'דנדי', 'אדם'])
        self.assertIn('אפשרות: ים', result[0]['text'])
        self.assertEqual(result[2]['text'], 'מאחורי ההצעה עומד רעיון פשוט: לנוח')

    def test_only_typed_text_is_kept(self):
        raw = ('[06/11/2026, 20:44:47] גיל: \u200e<attached: 00026612-PHOTO-2026-11-06-20-44-47.jpg> פלוס אז כאילו\n'
               '[06/11/2026, 20:45:00] יובל: \u200e<attached: 00026613-AUDIO-2026-11-06-20-45-00.opus>\n'
               '[06/11/2026, 20:46:00] יובל: \u200eMissed voice call, \u200eTap to call back\n'
               '[06/11/2026, 20:47:00] גיל: שיחה קולית שלא נענתה\n'
               '[06/11/2026, 20:48:00] יובל: סבבה אני אבקש מאבא\n'
               '[06/11/2026, 20:49:00] גיל: \u200eimage omitted\n'
               '[06/11/2026, 20:50:00] יובל: הודעה זו נמחקה\n'
               '[06/11/2026, 20:51:00] גיל: https://www.whatbrandonthinks.com/c/2105811f/reports/1\n'
               '[06/11/2026, 20:52:00] גיל: חחחחחחח <This message was edited>\n'
               '[06/11/2026, 20:53:00] יובל: שיחה קולית מחר בשמונה? https://meet.example.com/x')
        result = parse_chat(raw.encode(), 'chat.txt')
        self.assertEqual([m['text'] for m in result],
                         ['פלוס אז כאילו', 'סבבה אני אבקש מאבא', 'חחחחחחח', 'שיחה קולית מחר בשמונה? https://meet.example.com/x'])
        self.assertEqual([m['id'] for m in result], [1, 2, 3, 4])

    def test_android_media_and_calls_are_dropped(self):
        raw = ('13/10/2025, 22:10 - Dana: IMG-20251013-WA0001.jpg (file attached)\nlook at this\n'
               '13/10/2025, 22:11 - Omer: <Media omitted>\n'
               '13/10/2025, 22:12 - Omer: Voice call, 12 min\n'
               '13/10/2025, 22:13 - Dana: null\n'
               '13/10/2025, 22:14 - Omer: video call tonight?\n'
               '13/10/2025, 22:15 - Dana: sure')
        result = parse_chat(raw.encode(), 'chat.txt')
        self.assertEqual([m['text'] for m in result], ['look at this', 'video call tonight?', 'sure'])

    def test_android_am_pm_unicode(self):
        raw = '\u200e6/11/26, 2:06 PM - Alex: hey\n6/11/26, 2:07 PM - יעל: שלום\n6/11/26, 2:08 PM - Alex: hi'
        result = parse_chat(raw.encode(), 'chat.txt')
        self.assertEqual([m['sender'] for m in result], ['Alex', 'יעל', 'Alex'])

    def test_meta_json_newest_first(self):
        raw = {'messages': [{'sender_name': 'A', 'content': str(n), 'timestamp_ms': n} for n in [300,200,100]]}
        result = parse_chat(json.dumps(raw).encode(), 'message_1.json')
        self.assertEqual([m['text'] for m in result], ['100','200','300'])

    def test_csv(self):
        raw = b'sender,text,timestamp\nAlex,"hi, friend",1\nJamie,Hello,2\nAlex,Great,3'
        self.assertEqual(parse_chat(raw, 'imessage.csv')[0]['text'], 'hi, friend')

    def test_line(self):
        raw = '14:06\tAlex\tHey\n14:07\tJamie\tHello\n14:08\tAlex\tHow are you?'
        self.assertEqual(parse_chat(raw.encode(), 'line.txt')[1]['sender'], 'Jamie')

    def test_kakao(self):
        raw = '[Alex] [오후 2:06] Hey\n[Jamie] [오후 2:07] Hello\n[Alex] [오후 2:08] Hi'
        self.assertEqual(parse_chat(raw.encode(), 'kakao.txt')[1]['sender'], 'Jamie')

    def test_zip_never_extracts_path(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('chat/_chat.txt', CHAT)
            z.writestr('__MACOSX/._chat.txt', 'junk')
        self.assertEqual(len(parse_chat(buf.getvalue(), 'export.zip')), 3)

    def test_zip_hidden_and_traversal_names_are_ignored(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('../../_chat.txt', CHAT)
        with self.assertRaises(ValueError):
            parse_chat(buf.getvalue(), 'export.zip')

    def test_browser_repacked_zip_keeps_original_name_and_lifts_old_limits(self):
        # The browser uploads a ZIP of only the chat text under the export's own name.
        lines = [f'[06/11/2026, 14:{i % 60:02}:00] {"Alex" if i % 2 else "Jamie"}: message number {i} with some padding text' for i in range(150_000)]
        text = '\n'.join(lines).encode()
        self.assertGreater(len(text), 10 * 1024 * 1024)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('_chat.txt', text)
        result = parse_chat(buf.getvalue(), 'WhatsApp Chat with Alex.txt')
        self.assertEqual(len(result), 150_000)
        self.assertEqual(result[-1]['text'], 'message number 149999 with some padding text')

    def test_media_in_zip_does_not_count_toward_text_limit(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('_chat.txt', CHAT)
            z.writestr('VID-0001.mp4', b'\0' * 5000)
        with patch.object(parser, 'MAX_EXPANDED', 1000):
            self.assertEqual(len(parse_chat(buf.getvalue(), 'export.zip')), 3)
            big = io.BytesIO()
            with zipfile.ZipFile(big, 'w') as z:
                z.writestr('_chat.txt', CHAT * 20)
            with self.assertRaisesRegex(ValueError, '256 MB of text'):
                parse_chat(big.getvalue(), 'export.zip')

    def test_bad_inputs(self):
        for data, filename in [(b'', 'a.txt'), (b'PKbad','a.zip'),(b'{bad','a.json'),(b'hello','a.txt'),(b'hello','a.exe')]:
            with self.subTest(filename=filename):
                with self.assertRaises(ValueError):
                    parse_chat(data, filename)

    def test_utf16(self):
        self.assertEqual(len(parse_chat(CHAT.encode('utf-16'), 'chat.txt')), 3)
