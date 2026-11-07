// The stats story shown before Brandon's report, the "thinking" loader and the
// report article. All numbers come from the server's deterministic statistics.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Share2, ShieldCheck, Sparkles } from "lucide-react";

const avatar = `${import.meta.env.BASE_URL}assets/images/brandon/avatar.webp`;
export const PERSON_COLORS = ["#f58bd8", "#f5c400", "#6fd6a8", "#b9a8f5", "#f7a77d", "#7aabef"];
const RTL = new Set(["עברית", "العربية"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const isRtl = (language) => RTL.has(language);
const n = (v) => Number(v || 0).toLocaleString();
const longDate = (iso) =>
  iso
    ? new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

function Avatar({ size = 44 }) {
  return <img className="face" src={avatar} width={size} height={size} alt="Brandon" />;
}

const Name = ({ children, color }) => (
  <span className="story-name" dir="auto">
    {color && <i style={{ borderColor: color }} />}
    {children}
  </span>
);

/** Counts up through the chat while real messages scroll past Brandon's scanner. */
export function ReadingIntro({ story, onDone }) {
  const [count, setCount] = useState(0);
  const total = story.messages;
  const reel = story.reel || [];
  useEffect(() => {
    const duration = Math.min(6500, 2500 + total / 40);
    const started = performance.now();
    let frame;
    const tick = (now) => {
      const p = Math.min(1, (now - started) / duration);
      setCount(Math.round(total * (1 - Math.pow(1 - p, 2))));
      if (p < 1) frame = requestAnimationFrame(tick);
      else setTimeout(onDone, 700);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total]);
  const shown = Math.min(reel.length - 1, Math.floor((count / Math.max(total, 1)) * reel.length));
  const visible = reel.slice(Math.max(0, shown - 3), shown + 5);
  return (
    <div className="reading-intro" role="status" aria-label="Reading your chat">
      <div className="reading-count">
        <strong>{n(count)}</strong>
        <span>of {n(total)} messages</span>
        <div className="reading-bar">
          <span style={{ width: (count / Math.max(total, 1)) * 100 + "%" }} />
        </div>
      </div>
      <div className="reading-reel" aria-hidden="true">
        {visible.map((m, i) => (
          <div
            className={"reel-bubble" + (i === 3 ? " scanning" : "")}
            key={shown + i}
            dir="auto"
          >
            <b style={{ color: PERSON_COLORS[colorIndex(story, m.sender)] }}>{m.sender}</b>
            <span>{m.text}</span>
            {m.time && <small>{m.time}</small>}
          </div>
        ))}
        <div className="reel-scanner">
          <Avatar size={64} />
        </div>
      </div>
      <button className="text-button reading-skip" onClick={onDone}>
        Skip <ArrowRight size={15} />
      </button>
    </div>
  );
}

function colorIndex(story, name) {
  const i = story.participants.findIndex((p) => p.name === name);
  return (i < 0 ? story.participants.length : i) % PERSON_COLORS.length;
}

/** Seven chapters of exact statistics; chapters without data are skipped. */
export function StoryChapters({ story, onDone, onExit }) {
  const chapters = useMemo(() => buildChapters(story), [story]);
  const [index, setIndex] = useState(0);
  const shell = useRef();
  useEffect(() => {
    shell.current?.scrollTo(0, 0);
  }, [index]);
  const last = index === chapters.length - 1;
  const [title, Body] = chapters[index];
  return (
    <div className="story-shell" ref={shell}>
      <header className="story-header">
        <button
          className="icon-button"
          aria-label="Back"
          onClick={() => (index ? setIndex(index - 1) : onExit())}
        >
          <ArrowLeft size={22} />
        </button>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={chapters.length}
          aria-valuenow={index + 1}
        >
          <span style={{ width: ((index + 1) / chapters.length) * 100 + "%" }} />
        </div>
        <span className="story-step">
          {index + 1} of {chapters.length}
        </span>
      </header>
      <main className="story">
        <h1>{title}</h1>
        <Body story={story} />
        <button
          className="button dark story-next"
          onClick={() => (last ? onDone() : setIndex(index + 1))}
        >
          {last ? (
            <>
              See what Brandon thinks <Sparkles size={18} />
            </>
          ) : (
            <>
              Continue <ArrowRight size={18} />
            </>
          )}
        </button>
      </main>
    </div>
  );
}

function buildChapters(story) {
  const list = [];
  if (story.calendar) list.push(["Your years, day by day.", CalendarChapter]);
  list.push(["Who talks, who starts.", PeopleChapter]);
  if (story.busiest_day || story.hours) list.push(["Your rhythm.", RhythmChapter]);
  if (story.longest?.length) list.push(["The longest messages.", LongestChapter]);
  list.push(["Where it all started.", FirstChapter]);
  list.push(["And here’s where it stands.", LastChapter]);
  list.push(["Your words.", WordsChapter]);
  return list;
}

function CalendarChapter({ story }) {
  const max = Math.max(...Object.values(story.calendar));
  const start = Number(story.range.start.slice(0, 4));
  const end = Number(story.range.end.slice(0, 4));
  const years = [];
  for (let y = Math.max(start, end - 5); y <= end; y++) years.push(y);
  return (
    <>
      <p className="story-sub">One square for every day. The brighter it is, the more you talked.</p>
      <div className="story-card navy calendar-card">
        <h3>The calendar</h3>
        {years.map((year) => (
          <div className="calendar-year" key={year}>
            <span className="calendar-label">{year}</span>
            {MONTHS.map((month, m) => (
              <div className="calendar-row" key={month}>
                <span>{month}</span>
                {Array.from({ length: new Date(year, m + 1, 0).getDate() }, (_, d) => {
                  const key = `${year}-${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
                  const v = story.calendar[key] || 0;
                  return (
                    <i
                      key={d}
                      title={v ? `${longDate(key)}: ${n(v)} messages` : undefined}
                      style={v ? { background: heat(v / max) } : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        {end - start > 5 && <p className="calendar-note">Showing the last six years.</p>}
      </div>
    </>
  );
}

const heat = (x) => `hsl(42 ${55 + x * 40}% ${28 + Math.sqrt(x) * 42}%)`;

function Donut({ people, others }) {
  const parts = [...people.map((p, i) => [p.share, PERSON_COLORS[i]]), ...(others > 0 ? [[others, "#cfc6ef"]] : [])];
  let at = 0;
  const stops = parts.map(([share, color]) => {
    const from = at;
    at += share;
    return `${color} ${from}% ${at}%`;
  });
  return <div className="donut" style={{ background: `conic-gradient(${stops.join(",")})` }} />;
}

function PeopleChapter({ story }) {
  const top = story.participants.slice(0, 5);
  const others = Math.max(0, 100 - top.reduce((s, p) => s + p.share, 0));
  return (
    <>
      <div className="story-card lavender">
        <h3>Share of the chat</h3>
        <div className="share-layout">
          <Donut people={top} others={others} />
          <ol className="rank-list">
            {top.map((p, i) => (
              <li key={p.name}>
                <Name color={PERSON_COLORS[i]}>{p.name}</Name>
                <b>{Math.round(p.share)}%</b>
              </li>
            ))}
            {others >= 1 && (
              <li>
                <Name color="#cfc6ef">Everyone else</Name>
                <b>{Math.round(others)}%</b>
              </li>
            )}
          </ol>
        </div>
      </div>
      {story.openers && (
        <div className="story-card pink">
          <h3>Who starts the conversation</h3>
          {story.openers.slice(0, 5).map((p, i) => (
            <div className="bar-row" key={p.name}>
              <Name>{p.name}</Name>
              <div className="bar">
                <span style={{ width: p.share + "%", background: PERSON_COLORS[i] }} />
              </div>
              <b>{p.share}%</b>
            </div>
          ))}
          <p className="card-note">A conversation starts after four quiet hours.</p>
        </div>
      )}
      {!!story.address?.length && (
        <div className="story-card peach">
          <h3>What you call each other</h3>
          <div className="word-grid">
            {story.address.map((a) => (
              <div key={a.name}>
                <Name color={PERSON_COLORS[colorIndex(story, a.name)]}>{a.name}</Name>
                <strong dir="auto">{a.word}</strong>
                <small>{n(a.count)} times</small>
              </div>
            ))}
          </div>
        </div>
      )}
      {!!story.love?.length && (
        <div className="story-card pink">
          <h3>How many “love you”s</h3>
          <div className="word-grid">
            {story.love.map((a) => (
              <div key={a.name}>
                <Name color={PERSON_COLORS[colorIndex(story, a.name)]}>{a.name}</Name>
                <strong>{n(a.count)}</strong>
                <small>times</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function RhythmChapter({ story }) {
  const max = story.hours ? Math.max(...story.hours) : 0;
  return (
    <>
      {story.busiest_day && (
        <div className="story-card peach">
          <h3>The busiest day</h3>
          <p className="big-stat">
            <strong>{n(story.busiest_day.count)}</strong> messages on {longDate(story.busiest_day.date)}
          </p>
        </div>
      )}
      {story.streak && (
        <div className="story-pair">
          <div className="story-card mint">
            <h3>Longest streak</h3>
            <p className="big-stat">
              <strong>{n(story.streak.days)}</strong> days in a row
            </p>
          </div>
          <div className="story-card pink">
            <h3>Longest silence</h3>
            <p className="big-stat">
              <strong>{n(story.silence.days)}</strong> days
            </p>
          </div>
        </div>
      )}
      {story.hours && (
        <div className="story-card yellow">
          <h3>By hour</h3>
          <div className="hour-chart">
            {story.hours.map((v, h) => (
              <span
                key={h}
                title={`${h}:00 · ${n(v)} messages`}
                className={h === story.peak_hour?.hour ? "peak" : ""}
                style={{ height: Math.max(3, (v / Math.max(max, 1)) * 100) + "%" }}
              />
            ))}
          </div>
          <div className="hour-axis">
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
          {story.peak_hour && (
            <p className="card-note">
              Peak at {story.peak_hour.hour}:00 · {story.peak_hour.share}% of all messages
            </p>
          )}
        </div>
      )}
    </>
  );
}

function LongestChapter({ story }) {
  return story.longest.map((m) => <LongMessage key={m.sender} m={m} story={story} />);
}

function LongMessage({ m, story }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="story-card beige">
      <h3>
        <Name color={PERSON_COLORS[colorIndex(story, m.sender)]}>{m.sender}</Name>
      </h3>
      <p className="big-stat">
        <strong>{n(m.words)}</strong> words{m.date && <small> · {longDate(m.date)}</small>}
      </p>
      <div className={"long-message" + (open ? " open" : "")} dir="auto">
        {m.text}
      </div>
      {m.text.length > 400 && (
        <button className="text-button center" onClick={() => setOpen(!open)}>
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function Moments({ items, story }) {
  const date = items.find((m) => m.date)?.date;
  return (
    <div className="story-card beige">
      {date && <h3>{longDate(date)}</h3>}
      <div className="moment-list">
        {items.map((m, i) => (
          <div className="moment" key={i} dir="auto">
            {(i === 0 || items[i - 1].sender !== m.sender) && (
              <b style={{ color: PERSON_COLORS[colorIndex(story, m.sender)] }}>{m.sender}</b>
            )}
            <span>{m.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FirstChapter = ({ story }) => <Moments items={story.first} story={story} />;
const LastChapter = ({ story }) => <Moments items={story.last} story={story} />;

function WordsChapter({ story }) {
  return (
    <>
      {!!story.laughs?.length && (
        <div className="story-card pink">
          <h3>Laugh signature</h3>
          <ol className="rank-list">
            {story.laughs.map((p) => (
              <li key={p.name}>
                <Name color={PERSON_COLORS[colorIndex(story, p.name)]}>{p.name}</Name>
                <b>{n(p.count)} laughs</b>
              </li>
            ))}
          </ol>
          {story.longest_laugh && (
            <p className="card-note">
              Longest laugh: {n(story.longest_laugh.length)} letters in a row, by{" "}
              <span dir="auto">{story.longest_laugh.sender}</span>
            </p>
          )}
        </div>
      )}
      {!!story.top_words?.length && (
        <div className="story-card mint">
          <h3>Most used words</h3>
          <ol className="top-words">
            {story.top_words.map((w) => (
              <li key={w.word}>
                <strong dir="auto">{w.word}</strong>
                <small>{n(w.count)}×</small>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!!story.top_emojis?.length && (
        <div className="story-card yellow">
          <h3>Most used emojis</h3>
          <div className="emoji-row">
            {story.top_emojis.map((e) => (
              <span key={e.emoji} title={`${n(e.count)} times`}>
                {e.emoji}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const THINKING = [
  [0, "🤔", "Brandon is reading…"],
  [40, "🔍", "Brandon is thinking…"],
  [83, "🧩", "Brandon is connecting everything…"],
  [92, "🎁", "Brandon is writing your report…"],
];

/** Waiting screen while the server's model works through the chat. */
export function ThinkingLoader({ chat }) {
  const [startedAt] = useState(() => ({ at: Date.now(), progress: chat.progress }));
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const [, emoji, label] = [...THINKING].reverse().find(([p]) => chat.progress >= p);
  const queued = chat.status === "queued";
  // Estimate from this page's own observed speed rather than promising a fixed time.
  const gained = chat.progress - startedAt.progress;
  const elapsed = (Date.now() - startedAt.at) / 1000;
  const remaining = gained > 2 && elapsed > 20 ? ((100 - chat.progress) / gained) * elapsed : null;
  return (
    <div className="thinking" role="status">
      <div className="thinking-face">
        <Avatar size={150} />
        <span className="thinking-bubble">{queued ? "⏳" : emoji}</span>
        <i className="dot d1" />
        <i className="dot d2" />
        <i className="dot d3" />
        <i className="dot d4" />
      </div>
      <p className="thinking-label">{queued ? "Brandon is getting ready…" : label}</p>
      <div className="rainbow-track">
        <span style={{ width: Math.max(4, chat.progress) + "%" }} />
      </div>
      <p className="thinking-eta">
        {queued
          ? "Your report is next in line on your server."
          : remaining
            ? `Your report should be ready in about ${formatWait(remaining)}.`
            : chat.stage}
      </p>
      <p className="thinking-note">
        <ShieldCheck size={15} /> You can close this page. Your report will be waiting in My reports.
      </p>
    </div>
  );
}

function formatWait(seconds) {
  if (seconds < 90) return "a minute";
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  const hours = seconds / 3600;
  return hours < 1.5 ? "an hour" : `${Math.round(hours)} hours`;
}

/** Split Brandon's Markdown into headline, opening, sections and the cast list. */
export function parseReport(markdown = "") {
  const lines = markdown.replace(/\r/g, "").split("\n");
  let title = "";
  const titleAt = lines.findIndex((l) => /^#\s+/.test(l));
  if (titleAt >= 0) {
    title = lines[titleAt].replace(/^#\s+/, "").trim();
    lines.splice(titleAt, 1);
  }
  const firstSection = lines.findIndex((l) => /^##\s+/.test(l));
  const intro = (firstSection < 0 ? lines : lines.slice(0, firstSection)).join("\n").trim();
  const body = firstSection < 0 ? "" : lines.slice(firstSection).join("\n");
  const sections = lines.filter((l) => /^##\s+/.test(l)).map((l) => l.replace(/^##\s+/, "").trim());
  const cast = [];
  for (const line of lines) {
    const m = line.match(/^[-*]\s+(.{0,8}?)\s*\*\*(.+?)\*\*\s*[—–-]\s*([^:：]+)/);
    if (m) cast.push({ emoji: m[1].trim(), name: m[2].trim(), title: m[3].replace(/\*/g, "").trim() });
  }
  return { title, intro, body, sections, cast };
}

/** The report header: headline, Brandon's byline, sharing and the two summary lists. */
export function ReportHeader({ chat, parsed, notify, Markdown }) {
  const rtl = isRtl(chat.metadata.language);
  async function share() {
    const text = `${parsed.title || chat.title}\n\n${chat.report.markdown}`;
    try {
      if (navigator.share) await navigator.share({ title: parsed.title || chat.title, text });
      else {
        await navigator.clipboard.writeText(text);
        notify("Report copied. Paste it wherever you like.");
      }
    } catch (e) {
      if (e?.name !== "AbortError") notify("Sharing is unavailable here. Download the report instead.");
    }
  }
  return (
    <header className="article-head" dir={rtl ? "rtl" : "ltr"}>
      <h1 className="headline">{parsed.title || chat.title}</h1>
      <div className="byline-card">
        <Avatar size={56} />
        <div>
          <strong>Brandon</strong>
          <small dir="ltr">AI with no filter, too many opinions and a soft spot for group chats.</small>
        </div>
      </div>
      <button className="share-button" onClick={share}>
        <Share2 size={18} /> Share report
      </button>
      <p className="private-note" dir="ltr">
        <ShieldCheck size={15} /> Stays on your server unless you share it.
      </p>
      {parsed.intro && <Markdown text={parsed.intro} />}
      {parsed.sections.length > 1 && (
        <nav className="inside-list" aria-label="In this report">
          <h2 dir="ltr">More inside:</h2>
          {parsed.sections.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </nav>
      )}
      {!!parsed.cast.length && (
        <div className="inside-list">
          <h2 dir="ltr">A close look at everyone</h2>
          {parsed.cast.map((c) => (
            <span key={c.name}>
              {c.emoji} {c.name} — {c.title}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
