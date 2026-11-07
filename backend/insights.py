"""Deterministic chat statistics for the story shown before Brandon's report.

Everything here is counted from the parsed messages; no model is involved, so
the numbers are exact and available as soon as a chat is uploaded.
"""
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

# A new conversation starts after this much silence; its first sender "opened" it.
CONVERSATION_GAP = timedelta(hours=4)
TOP_PEOPLE = 6

WORD = re.compile(r"[^\W\d_](?:[^\W\d_]|['’׳״\"])*", re.UNICODE)
LAUGH = re.compile(r"^(?:ח{2,}|חח+|(?:ha){2,}h?|(?:he){2,}h?|(?:ja){2,}|(?:je){2,}|(?:ah){2,}a?|lo+l|lmf?ao+|k{3,}|(?:xa){2,}|(?:kk){2,}k*|(?:rs){2,}|5{3,}|ㅋ{2,}|ㅎ{2,}|w{3,}|هه+|(?:js){2,})$", re.IGNORECASE)
LAUGH_EMOJI = {'😂', '🤣', '😹', '😆'}
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿⭐⭕❤‼⁉]')
SKIP_EMOJI = set('♀♂⚕♾✔✖™')
MEDIA = re.compile(r"(?i)(<[^>]*(omitted|attached|הושמט|נערכה|eliminado|omis)[^>]*>|\.(jpe?g|png|webp|gif|mp4|opus|mp3|pdf|vcf)\b|‎?(image|video|audio|sticker|gif|document) omitted|this message was deleted|הודעה זו נמחקה|you deleted this message)")
LOVE = re.compile(r"(?i)(\blove (?:you|u|ya)\b|\bily\b|\blove you too\b|אוהב(?:ת)? אות(?:ך|כם)|אוהב(?:ת)? אותך|אוהבת אותך|\bte (?:quiero|amo)\b|\bje t'aime\b|\bich liebe dich\b|\bti amo\b|\bti voglio bene\b|\beu te amo\b|\bik hou van je\b|\bseni seviyorum\b|أحبك|사랑해|愛してる|我爱你)")

# Common function words across the supported report languages. Names and
# nicknames are kept on purpose: they are what makes a chat recognisable.
STOP = set('''
the a an and or but if so to of in on at for with from by is are was were be been am i you he she it we they me him her us them my your his its our their
this that these those there here what when where who why how not no yes ok okay just like do does did dont don't im i'm its it's thats that's can will would
should could have has had get got go going all some any one too very really also then than about up out more much now well yeah yep oh u ur ya lol
את של על עם זה זו לא כן גם אני אתה את הוא היא אנחנו הם הן מה מי איך למה כי אם או רק עוד כל יש אין היה היו להיות אבל אז שלי שלך שלו שלה שלנו
לי לך לו לה לנו להם אותי אותך אותו אותה פה שם הזה הזאת כבר עכשיו מאוד ממש סתם טוב בסדר אוקיי אחד אחת יותר פחות ב ל ה ו ש מ כ זהו נו
el la los las un una y o pero que de en es por con para no si lo le se me te mi tu su al del ya muy
le la les un une et ou mais que de en est pour avec pas oui je tu il elle nous vous ils ce ça
der die das ein eine und oder aber dass zu in ist nicht ja ich du er sie wir es mit auf für
o a os as um uma e ou mas que de em é por com para não sim eu tu ele ela nós
il lo la gli le un una e o ma che di in è per con non si io tu lui lei noi
de het een en of maar dat in is niet ja ik jij hij zij wij met op voor
ve bir bu da de ne için ile ama evet hayır ben sen o biz
و في من على إلى أن لا نعم أنا أنت هو هي نحن هذا هذه ما مع
'''.split())

WHATSAPP_DATE = re.compile(r'^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s?([APap][Mm])?$')
TIME_ONLY = re.compile(r'^(?:\S+\s)?(\d{1,2}):(\d{2})')


def _date_order(stamps):
    """Decide day/month order once for the whole export, as WhatsApp uses one locale."""
    first_big = second_big = False
    for s in stamps:
        m = WHATSAPP_DATE.match(s)
        if not m or len(m.group(1)) == 4:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        first_big |= a > 12
        second_big |= b > 12
    return 'mdy' if second_big and not first_big else 'dmy'


def parse_times(messages):
    """Best-effort datetime per message (naive local time), or None when unknown."""
    stamps = [str(m.get('timestamp', '')).strip() for m in messages]
    order = _date_order(stamps)
    result = []
    for s in stamps:
        when = None
        if s.isdigit() and len(s) >= 9:
            n = int(s)
            try:
                when = datetime.fromtimestamp(n / 1000 if n > 10**11 else n, timezone.utc).replace(tzinfo=None)
            except (OverflowError, OSError, ValueError):
                when = None
        else:
            m = WHATSAPP_DATE.match(s)
            if m:
                a, b, c, hh, mm, ss, ampm = m.groups()
                if len(a) == 4:
                    year, month, day = int(a), int(b), int(c)
                elif order == 'mdy':
                    month, day, year = int(a), int(b), int(c)
                else:
                    day, month, year = int(a), int(b), int(c)
                year += 2000 if year < 100 else 0
                hour = int(hh) % 12 + (12 if ampm and ampm.lower() == 'pm' else 0) if ampm else int(hh)
                try:
                    when = datetime(year, month, day, hour, int(mm), int(ss or 0))
                except ValueError:
                    when = None
            elif s:
                try:
                    when = datetime.fromisoformat(s.replace('Z', '+00:00')).replace(tzinfo=None)
                except ValueError:
                    when = None
        result.append(when)
    return result


def _hour(stamp, when):
    if when:
        return when.hour
    m = TIME_ONLY.match(str(stamp))
    return int(m.group(1)) % 24 if m else None


def _laughs(text):
    count, longest = 0, ''
    for token in re.split(r'\s+', text):
        clean = token.strip('.,!?;:()[]"\'')
        if clean and LAUGH.match(clean):
            count += 1
            if len(clean) > len(longest):
                longest = clean
    count += sum(text.count(e) for e in LAUGH_EMOJI)
    return count, longest


def _date(when):
    return when.date().isoformat() if when else None


def build(messages):
    """Return the JSON-serialisable story for a parsed, renamed chat."""
    times = parse_times(messages)
    dated = [t for t in times if t]
    has_dates = len(dated) >= max(3, len(messages) // 2)

    counts = Counter()
    words_by = Counter()
    address = defaultdict(Counter)
    love = Counter()
    laughs = Counter()
    longest_laugh = {'sender': None, 'text': '', 'length': 0}
    word_counts = Counter()
    emoji_counts = Counter()
    hours = [0] * 24
    days = Counter()
    longest = {}
    openers = Counter()
    conversations = 0
    previous = None

    for m, when in zip(messages, times):
        sender, text = m['sender'], m['text']
        counts[sender] += 1
        media = bool(MEDIA.search(text))
        tokens = [] if media else [w.lower() for w in WORD.findall(text)]
        words_by[sender] += len(tokens)
        if tokens:
            # Vocatives sit at the edges of a message: "bro, come" / "coming bro".
            for edge in {tokens[0], tokens[-1]}:
                if len(edge) > 1 and edge not in STOP and not LAUGH.match(edge):
                    address[sender][edge] += 1
            for w in tokens:
                if len(w) > 1 and w not in STOP and not LAUGH.match(w):
                    word_counts[w] += 1
        if not media:
            love[sender] += len(LOVE.findall(text))
            n, laugh = _laughs(text)
            laughs[sender] += n
            if len(laugh) > longest_laugh['length']:
                longest_laugh = {'sender': sender, 'text': laugh[:60], 'length': len(laugh)}
            for e in EMOJI.findall(text):
                if e not in SKIP_EMOJI:
                    # Older symbols like ❤ need U+FE0F to render as colour emoji.
                    emoji_counts[e + '\ufe0f' if ord(e) < 0x1F000 else e] += 1
            size = len(text.split())
            if size > longest.get(sender, {}).get('words', 0):
                longest[sender] = {'sender': sender, 'words': size, 'date': _date(when), 'text': text[:4000]}
        hour = _hour(m.get('timestamp', ''), when)
        if hour is not None:
            hours[hour] += 1
        if when:
            days[when.date()] += 1
            if previous is None or when - previous >= CONVERSATION_GAP:
                openers[sender] += 1
                conversations += 1
            previous = when

    total = len(messages)
    people = [{'name': name, 'messages': n, 'share': round(n / total * 100, 1), 'words': words_by[name]}
              for name, n in counts.most_common()]
    top_names = [p['name'] for p in people[:TOP_PEOPLE]]

    story = {
        'messages': total,
        'has_dates': has_dates,
        'participants': people,
        'first': [_brief(m, t) for m, t in list(zip(messages, times))[:5]],
        'last': [_brief(m, t) for m, t in list(zip(messages, times))[-5:]],
        'reel': [_brief(messages[i], times[i], 140) for i in _spread(total, 48)],
        'longest': sorted(longest.values(), key=lambda v: -v['words'])[:3],
        'address': [{'name': n, 'word': address[n].most_common(1)[0][0], 'count': address[n].most_common(1)[0][1]}
                    for n in top_names if address[n] and address[n].most_common(1)[0][1] >= 3][:4],
        'love': [{'name': n, 'count': c} for n, c in love.most_common() if c][:4],
        'laughs': [{'name': n, 'count': c} for n, c in laughs.most_common() if c][:5],
        'longest_laugh': longest_laugh if longest_laugh['length'] >= 4 else None,
        'top_words': [{'word': w, 'count': c} for w, c in word_counts.most_common(5)],
        'top_emojis': [{'emoji': e, 'count': c} for e, c in emoji_counts.most_common(5)],
        'hours': hours if any(hours) else None,
    }
    if any(hours):
        peak = max(range(24), key=hours.__getitem__)
        story['peak_hour'] = {'hour': peak, 'share': round(hours[peak] / sum(hours) * 100)}
    if has_dates and days:
        ordered = sorted(days)
        busiest = max(ordered, key=lambda d: days[d])
        story['calendar'] = {d.isoformat(): n for d, n in days.items()}
        story['range'] = {'start': ordered[0].isoformat(), 'end': ordered[-1].isoformat()}
        story['busiest_day'] = {'date': busiest.isoformat(), 'count': days[busiest]}
        story['streak'] = _streak(ordered)
        story['silence'] = _silence(ordered)
        if conversations:
            story['openers'] = [{'name': n, 'share': round(openers[n] / conversations * 100)} for n in top_names]
    story['awards'] = awards(messages, times, love, laughs)
    return story


SORRY = re.compile(r"(?i)(\bsorry\b|\bsry\b|\bmy bad\b|סליחה|מצטער|מצטערת|\bperd[oó]n|lo siento|d[ée]sol[ée]|entschuldig|tut mir leid|desculp|\bscusa|mi dispiace|[öo]z[üu]r|ごめん|すみません|미안|죄송|对不起|抱歉|آسف|اسف|ขอโทษ)")
QUESTION = re.compile(r'[?？؟]')


def awards(messages, times, love, laughs):
    """The stats that stand out in this chat, strongest first.

    Every award has to clear a threshold, so a chat only gets the ones that are
    true and notable for it: no "love you" card for a chat where nobody says it.
    """
    people = Counter(m['sender'] for m in messages)
    regulars = {p for p, n in people.items() if n >= 30 and n >= len(messages) * 0.02}
    if len(people) < 2 or not regulars:
        return []
    run, best_run, previous = 0, Counter(), None
    night, early, words, questions, sorry = Counter(), Counter(), Counter(), Counter(), Counter()
    replies = defaultdict(list)
    last_seen = {}
    gaps = Counter()
    since = Counter()
    vocab = defaultdict(Counter)
    for i, (m, when) in enumerate(zip(messages, times)):
        sender, text = m['sender'], m['text']
        run = run + 1 if sender == previous else 1
        best_run[sender] = max(best_run[sender], run)
        words[sender] += len(text.split())
        questions[sender] += bool(QUESTION.search(text))
        sorry[sender] += len(SORRY.findall(text))
        for w in WORD.findall(text):
            w = w.lower()
            if len(w) > 2 and w not in STOP and not LAUGH.match(w):
                vocab[sender][w] += 1
        if when:
            night[sender] += when.hour < 5
            early[sender] += 5 <= when.hour < 8
            if previous and previous != sender and i and times[i - 1]:
                minutes = (when - times[i - 1]).total_seconds() / 60
                if 0 <= minutes <= 12 * 60:
                    replies[sender].append(minutes)
            # How long someone vanished while the others kept talking.
            if sender in last_seen and since[sender] >= 30:
                gaps[sender] = max(gaps[sender], (when - last_seen[sender]).days)
            last_seen[sender] = when
            since[sender] = 0
            for other in last_seen:
                if other != sender:
                    since[other] += 1
        previous = sender

    found = []

    def add(kind, name, value, score, **extra):
        if name in regulars:
            found.append({'kind': kind, 'name': name, 'value': value, 'score': round(score, 2), **extra})

    def top(counter):
        ranked = [(n, c) for n, c in counter.most_common() if n in regulars]
        return ranked[0] if ranked else (None, 0)

    def standout(counter, name, value):
        # How much one person owns this behaviour (their share of it), plus a little for volume.
        total = sum(counter.values()) or 1
        return 1 + 2 * value / total + min(math.log10(max(value, 1)), 2) * 0.3

    name, value = top(best_run)
    if value >= 6:
        add('double_texter', name, value, 1 + min(value / 6, 3))
    name, value = top(night)
    if value >= 10:
        add('night_owl', name, value, standout(night, name, value))
    name, value = top(early)
    if value >= 10:
        add('early_bird', name, value, standout(early, name, value))
    medians = {p: sorted(r)[len(r) // 2] for p, r in replies.items() if p in regulars and len(r) >= 15}
    if len(medians) >= 2:
        fast = min(medians, key=medians.get)
        slow = max(medians, key=medians.get)
        if medians[fast] <= 5:
            add('fast_replier', fast, max(1, round(medians[fast])), 2)
        if medians[slow] >= 30 and medians[slow] >= medians[fast] * 4:
            add('slow_replier', slow, round(medians[slow]), 1.5 + min(medians[slow] / 240, 1.5))
    averages = {p: words[p] / people[p] for p in regulars}
    if len(averages) >= 2:
        long_p = max(averages, key=averages.get)
        short_p = min(averages, key=averages.get)
        if averages[long_p] >= 12 and averages[long_p] >= averages[short_p] * 2:
            add('essayist', long_p, round(averages[long_p], 1), 1 + min(averages[long_p] / 12, 3))
        if averages[short_p] <= 4:
            add('one_worder', short_p, round(averages[short_p], 1), 1 + min(4 / max(averages[short_p], 1), 2.5))
    name, value = top(questions)
    if value >= 20 and value / people[name] >= 0.15:
        add('questions', name, value, standout(questions, name, value))
    name, value = top(sorry)
    if value >= 5:
        add('sorry', name, value, standout(sorry, name, value))
    name, value = top(love)
    if value >= 3:
        add('love', name, value, standout(love, name, value))
    name, value = top(laughs)
    if value >= 15:
        add('laughs', name, value, standout(laughs, name, value))
    name, value = top(gaps)
    if value >= 14:
        add('ghost', name, value, 1 + min(value / 30, 2.5))
    # Signature words: something one person says far more than anyone else.
    totals = Counter()
    for counts in vocab.values():
        totals.update(counts)
    signatures = []
    for person in regulars:
        best = None
        for word, count in vocab[person].most_common(200):
            if count >= 6 and count / totals[word] >= 0.7 and word not in {p.lower() for p in people}:
                score = count * count / totals[word]
                if not best or score > best[2]:
                    best = (word, count, score)
        if best:
            signatures.append((person, best))
    for person, (word, count, score) in sorted(signatures, key=lambda s: -s[1][2])[:2]:
        add('signature', person, count, 2 + min(score, 60) / 30, word=word)
    # Strongest first, at most two awards per person so everyone gets a turn.
    chosen, per_person = [], Counter()
    for award in sorted(found, key=lambda a: -a['score']):
        if per_person[award['name']] < 2:
            chosen.append(award)
            per_person[award['name']] += 1
    return chosen[:8]


def _brief(m, when, limit=300):
    return {'sender': m['sender'], 'text': m['text'][:limit], 'date': _date(when),
            'time': when.strftime('%H:%M') if when else None}


def _spread(total, count):
    if total <= count:
        return range(total)
    step = total / count
    return sorted({int(i * step) for i in range(count)})


def _streak(days):
    best = run = 1
    best_end = days[0]
    for a, b in zip(days, days[1:]):
        run = run + 1 if (b - a).days == 1 else 1
        if run > best:
            best, best_end = run, b
    return {'days': best, 'end': best_end.isoformat()}


def _silence(days):
    if len(days) < 2:
        return {'days': 0}
    a, b = max(zip(days, days[1:]), key=lambda p: (p[1] - p[0]).days)
    return {'days': (b - a).days - 1, 'from': a.isoformat(), 'to': b.isoformat()}


def rename(messages, names):
    """Apply the setup step's name clean-up; two people mapped to one name merge."""
    clean = {str(k)[:100]: str(v).strip()[:60] for k, v in (names or {}).items() if str(v).strip()}
    if clean:
        for m in messages:
            m['sender'] = clean.get(m['sender'], m['sender'])
    return messages
