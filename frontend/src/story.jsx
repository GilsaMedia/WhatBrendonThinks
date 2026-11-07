// The stats story shown before Brandon's report, the "thinking" loader and the
// report article. All numbers come from the server's deterministic statistics;
// every label follows the report's language.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Share2, ShieldCheck, Sparkles } from "lucide-react";
import { locale, translator } from "./i18n.js";

const avatar = `${import.meta.env.BASE_URL}assets/images/brandon/avatar.webp`;
export const PERSON_COLORS = ["#f58bd8", "#f5c400", "#6fd6a8", "#b9a8f5", "#f7a77d", "#7aabef"];
const RTL = new Set(["עברית", "العربية"]);

export const isRtl = (language) => RTL.has(language);

const Lang = createContext(null);
const useLang = () => useContext(Lang);

/** Wraps a screen in its report language: translations, number and date formats, direction. */
export function LanguageScope({ language, children }) {
  const value = useMemo(() => {
    const loc = locale(language);
    return {
      t: translator(language),
      loc,
      rtl: isRtl(language),
      n: (v) => Number(v || 0).toLocaleString(loc),
      date: (iso, opts = { day: "numeric", month: "long", year: "numeric" }) =>
        iso ? new Date(iso + "T12:00:00").toLocaleDateString(loc, opts) : "",
      month: (m) => new Date(2024, m, 1).toLocaleDateString(loc, { month: "short" }),
    };
  }, [language]);
  return <Lang.Provider value={value}>{children}</Lang.Provider>;
}

function Avatar({ size = 44 }) {
  return <img className="face" src={avatar} width={size} height={size} alt="" />;
}

const Name = ({ children, color }) => (
  <span className="story-name" dir="auto">
    {color && <i style={{ borderColor: color }} />}
    {children}
  </span>
);

/** Counts up through the chat while real messages scroll past Brandon's scanner. */
export function ReadingIntro({ story, onDone, language }) {
  return (
    <LanguageScope language={language}>
      <ReadingIntroBody story={story} onDone={onDone} />
    </LanguageScope>
  );
}

function ReadingIntroBody({ story, onDone }) {
  const { t, n, rtl } = useLang();
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
    <div className="reading-intro" role="status" dir={rtl ? "rtl" : "ltr"}>
      <div className="reading-count">
        <strong>{n(count)}</strong>
        <span>{t("of_messages", { n: n(total) })}</span>
        <div className="reading-bar">
          <span style={{ width: (count / Math.max(total, 1)) * 100 + "%" }} />
        </div>
      </div>
      <div className="reading-reel" aria-hidden="true">
        {visible.map((m, i) => (
          <div className={"reel-bubble" + (i === 3 ? " scanning" : "")} key={shown + i} dir="auto">
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
        {t("skip")} <ArrowRight size={15} className="flip-rtl" />
      </button>
    </div>
  );
}

function colorIndex(story, name) {
  const i = story.participants.findIndex((p) => p.name === name);
  return (i < 0 ? story.participants.length : i) % PERSON_COLORS.length;
}

/** The chapters this chat has something to say in; empty or dull ones are skipped. */
export function StoryChapters({ story, onDone, onExit, language }) {
  return (
    <LanguageScope language={language}>
      <ChaptersBody story={story} onDone={onDone} onExit={onExit} />
    </LanguageScope>
  );
}

function ChaptersBody({ story, onDone, onExit }) {
  const { t, rtl } = useLang();
  const chapters = useMemo(() => buildChapters(story), [story]);
  const [index, setIndex] = useState(0);
  const shell = useRef();
  useEffect(() => {
    shell.current?.scrollTo(0, 0);
  }, [index]);
  const last = index === chapters.length - 1;
  const [key, Body] = chapters[index];
  return (
    <div className="story-shell" ref={shell} dir={rtl ? "rtl" : "ltr"}>
      <header className="story-header">
        <button
          className="icon-button"
          aria-label={t("back")}
          onClick={() => (index ? setIndex(index - 1) : onExit())}
        >
          <ArrowLeft size={22} className="flip-rtl" />
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
        <span className="story-step">{t("step", { i: index + 1, n: chapters.length })}</span>
      </header>
      <main className="story">
        <h1>{t(key)}</h1>
        <Body story={story} />
        <button className="button dark story-next" onClick={() => (last ? onDone() : setIndex(index + 1))}>
          {last ? (
            <>
              {t("see_what")} <Sparkles size={18} />
            </>
          ) : (
            <>
              {t("continue")} <ArrowRight size={18} className="flip-rtl" />
            </>
          )}
        </button>
      </main>
    </div>
  );
}

// What counts as worth showing. A chapter appears only when its numbers say something.
const show = {
  calendar: (s) => s.calendar && s.range && daysBetween(s.range.start, s.range.end) >= 45,
  openers: (s) => s.openers?.length > 1 && Math.max(...s.openers.map((o) => o.share)) >= 30,
  busiest: (s) => s.busiest_day?.count >= 25,
  streak: (s) => s.streak?.days >= 4,
  silence: (s) => s.silence?.days >= 5,
  hours: (s) => s.hours && s.messages >= 80,
  awards: (s) => s.awards?.length >= 2,
  longest: (s) => s.longest?.length && s.longest[0].words >= 35,
  laughs: (s) => s.laughs?.reduce((a, p) => a + p.count, 0) >= 10,
  words: (s) => s.top_words?.[0]?.count >= 8,
  emojis: (s) => s.top_emojis?.[0]?.count >= 5,
};
const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 86400000;

export function buildChapters(story) {
  const list = [];
  if (show.calendar(story)) list.push(["ch_calendar", CalendarChapter]);
  if (story.participants.length > 1) list.push(["ch_people", PeopleChapter]);
  if (show.awards(story)) list.push(["ch_awards", AwardsChapter]);
  if (show.busiest(story) || show.streak(story) || show.silence(story) || show.hours(story))
    list.push(["ch_rhythm", RhythmChapter]);
  if (show.longest(story)) list.push(["ch_longest", LongestChapter]);
  if (story.first?.length) list.push(["ch_first", FirstChapter]);
  if (story.last?.length) list.push(["ch_last", LastChapter]);
  if (show.laughs(story) || show.words(story) || show.emojis(story)) list.push(["ch_words", WordsChapter]);
  return list.length ? list : [["ch_people", PeopleChapter]];
}

function CalendarChapter({ story }) {
  const { t, n, date, month } = useLang();
  const max = Math.max(...Object.values(story.calendar));
  const start = Number(story.range.start.slice(0, 4));
  const end = Number(story.range.end.slice(0, 4));
  const years = [];
  for (let y = Math.max(start, end - 5); y <= end; y++) years.push(y);
  return (
    <>
      <p className="story-sub">{t("calendar_sub")}</p>
      <div className="story-card navy calendar-card" dir="ltr">
        <h3>{t("calendar")}</h3>
        {years.map((year) => (
          <div className="calendar-year" key={year}>
            <span className="calendar-label">{year}</span>
            {Array.from({ length: 12 }, (_, m) => (
              <div className="calendar-row" key={m}>
                <span>{month(m)}</span>
                {Array.from({ length: new Date(year, m + 1, 0).getDate() }, (_, d) => {
                  const key = `${year}-${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`;
                  const v = story.calendar[key] || 0;
                  return (
                    <i
                      key={d}
                      title={v ? `${date(key)}: ${n(v)} ${t("u_messages")}` : undefined}
                      style={v ? { background: heat(v / max) } : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        {end - start > 5 && <p className="calendar-note">{t("calendar_note")}</p>}
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
  const { t } = useLang();
  const top = story.participants.slice(0, 5);
  const others = Math.max(0, 100 - top.reduce((s, p) => s + p.share, 0));
  return (
    <>
      <div className="story-card lavender">
        <h3>{t("share_title")}</h3>
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
                <Name color="#cfc6ef">{t("everyone_else")}</Name>
                <b>{Math.round(others)}%</b>
              </li>
            )}
          </ol>
        </div>
      </div>
      {show.openers(story) && (
        <div className="story-card pink">
          <h3>{t("openers")}</h3>
          {story.openers.slice(0, 5).map((p, i) => (
            <div className="bar-row" key={p.name}>
              <Name>{p.name}</Name>
              <div className="bar">
                <span style={{ width: p.share + "%", background: PERSON_COLORS[i] }} />
              </div>
              <b>{p.share}%</b>
            </div>
          ))}
          <p className="card-note">{t("openers_note")}</p>
        </div>
      )}
    </>
  );
}

const AWARD_ICONS = {
  double_texter: "📨", night_owl: "🦉", early_bird: "🐓", fast_replier: "⚡", slow_replier: "🐢",
  essayist: "📜", one_worder: "✂️", questions: "❓", sorry: "🙏", love: "❤️", laughs: "😂",
  ghost: "👻", signature: "🗣️",
};
const CARD_COLORS = ["pink", "yellow", "mint", "lavender", "peach", "beige"];

function AwardsChapter({ story }) {
  const { t, n } = useLang();
  const duration = (minutes) =>
    minutes >= 90 ? t("dur_h", { n: n(Math.round(minutes / 60)) }) : t("dur_min", { n: n(minutes) });
  return (
    <div className="award-grid">
      {story.awards.map((a, i) => (
        <div className={"story-card award " + CARD_COLORS[i % CARD_COLORS.length]} key={a.kind + a.name}>
          <span className="award-icon">{AWARD_ICONS[a.kind] || "🏆"}</span>
          <h3>{t("aw_" + a.kind)}</h3>
          <Name color={PERSON_COLORS[colorIndex(story, a.name)]}>{a.name}</Name>
          <p className="card-note">
            {t("aw_" + a.kind + "_d", { n: n(a.value), w: a.word || "", time: duration(a.value) })}
          </p>
        </div>
      ))}
    </div>
  );
}

function RhythmChapter({ story }) {
  const { t, n, date } = useLang();
  const max = story.hours ? Math.max(...story.hours) : 0;
  return (
    <>
      {show.busiest(story) && (
        <div className="story-card peach">
          <h3>{t("busiest")}</h3>
          <p className="big-stat">
            <strong>{n(story.busiest_day.count)}</strong> {t("u_messages")}
            <small> · {date(story.busiest_day.date)}</small>
          </p>
        </div>
      )}
      {(show.streak(story) || show.silence(story)) && (
        <div className="story-pair">
          {show.streak(story) && (
            <div className="story-card mint">
              <h3>{t("streak")}</h3>
              <p className="big-stat">
                <strong>{n(story.streak.days)}</strong> {t("u_days_row")}
              </p>
            </div>
          )}
          {show.silence(story) && (
            <div className="story-card pink">
              <h3>{t("silence")}</h3>
              <p className="big-stat">
                <strong>{n(story.silence.days)}</strong> {t("u_days")}
              </p>
            </div>
          )}
        </div>
      )}
      {show.hours(story) && (
        <div className="story-card yellow">
          <h3>{t("by_hour")}</h3>
          <div className="hour-chart" dir="ltr">
            {story.hours.map((v, h) => (
              <span
                key={h}
                title={`${h}:00 · ${n(v)} ${t("u_messages")}`}
                className={h === story.peak_hour?.hour ? "peak" : ""}
                style={{ height: Math.max(3, (v / Math.max(max, 1)) * 100) + "%" }}
              />
            ))}
          </div>
          <div className="hour-axis" dir="ltr">
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
          {story.peak_hour && (
            <p className="card-note">{t("peak", { h: story.peak_hour.hour, p: story.peak_hour.share })}</p>
          )}
        </div>
      )}
    </>
  );
}

function LongestChapter({ story }) {
  return story.longest.filter((m) => m.words >= 20).map((m) => <LongMessage key={m.sender} m={m} story={story} />);
}

function LongMessage({ m, story }) {
  const { t, n, date } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="story-card beige">
      <h3>
        <Name color={PERSON_COLORS[colorIndex(story, m.sender)]}>{m.sender}</Name>
      </h3>
      <p className="big-stat">
        <strong>{n(m.words)}</strong> {t("u_words")}
        {m.date && <small> · {date(m.date)}</small>}
      </p>
      <div className={"long-message" + (open ? " open" : "")} dir="auto">
        {m.text}
      </div>
      {m.text.length > 400 && (
        <button className="text-button center" onClick={() => setOpen(!open)}>
          {open ? t("less") : t("more")}
        </button>
      )}
    </div>
  );
}

function Moments({ items, story }) {
  const { date } = useLang();
  const day = items.find((m) => m.date)?.date;
  return (
    <div className="story-card beige">
      {day && <h3>{date(day)}</h3>}
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
  const { t, n } = useLang();
  return (
    <>
      {show.laughs(story) && (
        <div className="story-card pink">
          <h3>{t("laughs_title")}</h3>
          <ol className="rank-list">
            {story.laughs.map((p) => (
              <li key={p.name}>
                <Name color={PERSON_COLORS[colorIndex(story, p.name)]}>{p.name}</Name>
                <b>
                  {n(p.count)} {t("u_laughs")}
                </b>
              </li>
            ))}
          </ol>
          {story.longest_laugh && (
            <p className="card-note">
              {t("longest_laugh", { n: n(story.longest_laugh.length), name: story.longest_laugh.sender })}
            </p>
          )}
        </div>
      )}
      {show.words(story) && (
        <div className="story-card mint">
          <h3>{t("top_words")}</h3>
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
      {show.emojis(story) && (
        <div className="story-card yellow">
          <h3>{t("top_emojis")}</h3>
          <div className="emoji-row">
            {story.top_emojis.map((e) => (
              <span key={e.emoji} title={`${n(e.count)}×`}>
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
  [0, "🤔", "l_reading"],
  [40, "🔍", "l_thinking"],
  [83, "🧩", "l_connecting"],
  [92, "🎁", "l_writing"],
];

/** Waiting screen while the server's model works through the chat. */
export function ThinkingLoader({ chat }) {
  return (
    <LanguageScope language={chat.metadata?.language}>
      <ThinkingBody chat={chat} />
    </LanguageScope>
  );
}

function ThinkingBody({ chat }) {
  const { t, n, rtl } = useLang();
  const [startedAt] = useState(() => ({ at: Date.now(), progress: chat.progress }));
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((v) => v + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  const [, emoji, label] = [...THINKING].reverse().find(([p]) => chat.progress >= p);
  const queued = chat.status === "queued";
  // Estimate from this page's own observed speed rather than promising a fixed time.
  const gained = chat.progress - startedAt.progress;
  const elapsed = (Date.now() - startedAt.at) / 1000;
  const remaining = gained > 2 && elapsed > 20 ? ((100 - chat.progress) / gained) * elapsed : null;
  const wait = (seconds) => {
    if (seconds < 90) return t("w_minute");
    if (seconds < 3600) return t("w_minutes", { n: n(Math.round(seconds / 60)) });
    const hours = seconds / 3600;
    return hours < 1.5 ? t("w_hour") : t("w_hours", { n: n(Math.round(hours)) });
  };
  return (
    <div className="thinking" role="status" dir={rtl ? "rtl" : "ltr"}>
      <div className="thinking-face">
        <Avatar size={150} />
        <span className="thinking-bubble">{queued ? "⏳" : emoji}</span>
        <i className="dot d1" />
        <i className="dot d2" />
        <i className="dot d3" />
        <i className="dot d4" />
      </div>
      <p className="thinking-label">{queued ? t("l_ready") : t(label)}</p>
      <div className="rainbow-track">
        <span style={{ width: Math.max(4, chat.progress) + "%" }} />
      </div>
      <p className="thinking-eta" dir="auto">
        {queued ? t("l_queue") : remaining ? t("l_eta", { t: wait(remaining) }) : chat.stage}
      </p>
      <p className="thinking-note">
        <ShieldCheck size={15} /> {t("l_note")}
      </p>
    </div>
  );
}

/**
 * Split Brandon's Markdown into headline, opening, sections and the cast.
 * Sections are "## " headings; each person gets a "### Name — nickname" heading.
 */
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
    // "### Name — nickname title 🎭" (current) or "- 🎭 **Name** — title: …" (older reports).
    const heading = line.match(/^###\s+(?:\d+\.\s*)?\**(.+?)\**\s*[—–]\s*(.+?)\s*$/);
    const bullet = line.match(/^[-*]\s+(.{0,8}?)\s*\*\*(.+?)\*\*\s*[—–-]\s*([^:：]+)/);
    if (heading) {
      const raw = heading[2].replace(/\*/g, "").trim();
      const emoji = (raw.match(/(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*\s*)+$/u) || [""])[0];
      cast.push({ emoji: emoji.trim(), name: heading[1].replace(/\*/g, "").trim(), title: raw.slice(0, raw.length - emoji.length).trim() });
    } else if (bullet) {
      cast.push({ emoji: bullet[1].trim(), name: bullet[2].trim(), title: bullet[3].replace(/\*/g, "").trim() });
    }
  }
  return { title, intro, body, sections, cast };
}

export function shareLink(token) {
  return `${location.origin}${location.pathname}#/s/${token}`;
}

/** The report header: headline, Brandon's byline, sharing and the two summary lists. */
export function ReportHeader(props) {
  return (
    <LanguageScope language={props.chat.metadata.language}>
      <ReportHeaderBody {...props} />
    </LanguageScope>
  );
}

function ReportHeaderBody({ chat, parsed, notify, Markdown, getShareUrl, onStopSharing, shared }) {
  const { t, rtl } = useLang();
  const [busy, setBusy] = useState(false);
  // Sharing sends a link: whoever opens it sees the report, no account needed.
  async function share() {
    setBusy(true);
    try {
      const url = await getShareUrl();
      const title = parsed.title || chat.title;
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch (e) {
          if (e?.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        notify(t("copied"));
      } catch {
        // Some browsers block the clipboard; show the link so it can be copied by hand.
        window.prompt(t("copy_prompt"), url);
      }
    } catch (e) {
      notify(e?.message || "Sharing is unavailable here. Download the report instead.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="article-head" dir={rtl ? "rtl" : "ltr"}>
      <h1 className="headline">{parsed.title || chat.title}</h1>
      <div className="byline-card">
        <Avatar size={56} />
        <div>
          <strong>{t("brandon")}</strong>
          <small>{t("byline")}</small>
        </div>
      </div>
      <button className="share-button" onClick={share} disabled={busy}>
        <Share2 size={18} /> {t("share_btn")}
      </button>
      <p className="private-note">
        <ShieldCheck size={15} />
        {shared ? t("note_shared") : chat.share_token ? t("note_on") : t("note_private")}
        {!shared && chat.share_token && onStopSharing && (
          <button className="text-button stop-sharing" onClick={onStopSharing}>
            {t("turn_off")}
          </button>
        )}
      </p>
      {parsed.intro && <Markdown text={parsed.intro} />}
    </header>
  );
}

/** The recap at the end of the report: its sections and everyone's nickname. */
export function ReportContents({ chat, parsed }) {
  return (
    <LanguageScope language={chat.metadata.language}>
      <ContentsBody parsed={parsed} />
    </LanguageScope>
  );
}

function ContentsBody({ parsed }) {
  const { t, rtl } = useLang();
  return (
    <footer className="report-contents" dir={rtl ? "rtl" : "ltr"}>
      {parsed.sections.length > 1 && (
        <nav className="inside-list" aria-label={t("more_inside")}>
          <h2>{t("more_inside")}</h2>
          {parsed.sections.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </nav>
      )}
      {!!parsed.cast.length && (
        <div className="inside-list">
          <h2>{t("close_look")}</h2>
          {parsed.cast.map((c) => (
            <span key={c.name}>
              {c.emoji} {c.name} — {c.title}
            </span>
          ))}
        </div>
      )}
    </footer>
  );
}

/** Small translated pieces of the report page that live in main.jsx. */
export function useReportText(language) {
  return useMemo(() => translator(language), [language]);
}
