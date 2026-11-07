"""Parse chat exports without running or extracting their contents to disk."""
import csv
import io
import json
import re
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import PurePosixPath

# The browser extracts only the chat text from an export of any size (media is
# never uploaded) and sends it as a compressed ZIP, so these bound text, not media.
MAX_BYTES = 128 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
MAX_MESSAGES = 1_000_000
# iOS: [11/06/2026, 14:06:00] Alex: ...; Android: 11/06/26, 14:06 - Alex: ...
WHATSAPP = re.compile(r'^\[?(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s*(?:[-–]\s*)?([^:]{1,100}):\s?(.*)$')
KAKAO = re.compile(r'^\[([^\]]{1,100})\]\s*\[([^\]]+)\]\s*(.*)$')
LINE = re.compile(r'^(\d{1,2}:\d{2})\t([^\t]{1,100})\t(.*)$')
PLAIN = re.compile(r'^([^:\n]{1,80}):\s+(.+)$')
SYSTEM = re.compile(r'(?i)(messages and calls are end-to-end encrypted|created group|added you|changed the subject|security code changed)')


def decode(data):
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        return data.decode('utf-16')
    try:
        return data.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise ValueError('Please export your chat as UTF-8 or UTF-16 text.')


def parse_chat(data: bytes, filename: str):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Choose a non-empty file. Uploads are limited to 128 MB after the app removes media.')
    # The browser repacks every export's chat text into a ZIP but keeps the original
    # filename for display, so recognise archives by content as well as extension.
    if filename.lower().endswith('.zip') or data.startswith(b'PK\x03\x04'):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                entries = [e for e in archive.infolist() if not e.is_dir()]
                # Media entries are never read, so only chat text counts toward the limits.
                candidates = [e for e in entries if not any(p.startswith('.') or p == '__MACOSX' for p in PurePosixPath(e.filename).parts)
                              and e.filename.lower().endswith(('.txt', '.json', '.csv'))]
                candidates.sort(key=lambda e: (not e.filename.endswith('_chat.txt'), e.filename))
                if not candidates:
                    raise ValueError('No .txt, .json or .csv chat export was found in this ZIP.')
                if len(candidates) > 2000 or sum(e.file_size for e in candidates) > MAX_EXPANDED:
                    raise ValueError('This chat has more than 256 MB of text, which is more than one report can hold. Export a shorter date range.')
                messages = []
                for entry in candidates:
                    if entry.flag_bits & 1:
                        raise ValueError('Password-protected ZIP files are not supported.')
                    messages.extend(parse_content(decode(archive.read(entry)), entry.filename))
                    if len(messages) > MAX_MESSAGES:
                        raise ValueError('Please upload at most 1,000,000 messages per report.')
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError):
            raise ValueError('The ZIP could not be read. Try exporting without media.')
    else:
        if not filename.lower().endswith(('.txt', '.json', '.csv')):
            raise ValueError('Use a .txt, .zip, .json or .csv chat export.')
        messages = parse_content(decode(data), filename)
    if messages and all(m['timestamp'].isdigit() for m in messages):
        messages.sort(key=lambda m: int(m['timestamp']))
    messages = [m for m in messages if m['text'].strip() and not SYSTEM.search(m['text'])]
    if len(messages) < 3:
        raise ValueError('At least three messages are needed. Try a full text export with sender names.')
    if len(messages) > MAX_MESSAGES:
        raise ValueError('Please upload at most 1,000,000 messages per report.')
    for i, m in enumerate(messages):
        m['id'] = i + 1
    return messages


def parse_content(text, filename):
    if filename.lower().endswith('.json'):
        try:
            raw = json.loads(text)
        except (ValueError, RecursionError):
            raise ValueError('This JSON file is invalid.')
        if isinstance(raw, dict):
            raw = raw.get('messages', [])
        if not isinstance(raw, list):
            raise ValueError('JSON must contain a messages array.')
        result = []
        for m in raw:
            if not isinstance(m, dict):
                continue
            sender = m.get('sender_name') or m.get('sender') or m.get('from') or m.get('author')
            content = m.get('content', m.get('text', m.get('body', '')))
            if isinstance(content, list):
                content = ''.join(v if isinstance(v, str) else str(v.get('text', '')) if isinstance(v, dict) else '' for v in content)
            stamp = m.get('timestamp_ms') or m.get('timestamp') or m.get('date') or ''
            if sender and isinstance(content, str) and content.strip():
                result.append({'sender': str(sender)[:100], 'text': content, 'timestamp': str(stamp)})
        # Instagram / Messenger exports usually have newest first.
        if len(result) > 1 and result[0]['timestamp'].isdigit() and result[-1]['timestamp'].isdigit():
            result.sort(key=lambda m: int(m['timestamp'] or 0))
        return result
    if filename.lower().endswith('.csv'):
        result = []
        for original in csv.DictReader(io.StringIO(text)):
            row = {str(k).lower().strip(): v for k, v in original.items() if k}
            sender = row.get('sender') or row.get('name') or row.get('sender_name') or row.get('from')
            content = row.get('text') or row.get('message') or row.get('content') or row.get('body')
            if sender and content:
                result.append({'sender': sender[:100], 'text': content, 'timestamp': row.get('timestamp') or row.get('date') or ''})
        return result
    result = []
    for line in text.replace('\r\n', '\n').split('\n'):
        line = line.strip('\u200e\u200f\ufeff')
        match = WHATSAPP.match(line)
        if match:
            date, time, sender, content = match.groups()
            result.append({'sender': sender.strip(), 'text': content, 'timestamp': date + ' ' + time})
            continue
        match = LINE.match(line)
        if match:
            time, sender, content = match.groups()
            result.append({'sender': sender, 'text': content, 'timestamp': time})
            continue
        match = KAKAO.match(line)
        if match:
            sender, time, content = match.groups()
            result.append({'sender': sender, 'text': content, 'timestamp': time})
            continue
        match = PLAIN.match(line)
        if match:
            sender, content = match.groups()
            result.append({'sender': sender.strip(), 'text': content, 'timestamp': ''})
        elif result and line.strip():
            result[-1]['text'] += '\n' + line
    return result


def statistics(messages):
    counts = Counter(m['sender'] for m in messages)
    people = []
    for sender, count in counts.most_common():
        own = [m for m in messages if m['sender'] == sender]
        people.append({'name': sender, 'messages': count,
                       'words': sum(len(m['text'].split()) for m in own),
                       'share': round(count / len(messages) * 100, 1),
                       'questions': sum(m['text'].count('?') for m in own)})
    return {'messages': len(messages), 'participants': people,
            'words': sum(len(m['text'].split()) for m in messages),
            'first_timestamp': messages[0]['timestamp'], 'last_timestamp': messages[-1]['timestamp']}
