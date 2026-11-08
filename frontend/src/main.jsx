import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowLeft,
  X,
  Upload,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  Check,
  FileText,
  MessageCircle,
  Settings,
  LogOut,
  Plus,
  Download,
  Trash2,
  RefreshCw,
  LoaderCircle,
  LockKeyhole,
  ExternalLink,
  Sparkles,
  Copy,
  Menu,
  CheckCircle2,
  AlertCircle,
  Send,
  Pencil,
  Play,
} from "lucide-react";
import { translator as translate } from "./i18n.js";
import { api, getServer, setServer, getToken, forgetToken } from "./api";
import {
  PERSON_COLORS,
  ReadingIntro,
  StoryChapters,
  ThinkingLoader,
  ReportHeader,
  ReportContents,
  parseReport,
  isRtl,
  shareLink,
  snapshotLink,
  readSnapshot,
  useReportText,
} from "./story.jsx";
import "./style.css";

const A = `${import.meta.env.BASE_URL}assets/`;
const avatar = A + "images/brandon/avatar.webp";
const contexts = [
  ["💌", "Romantic", "Partner, situationship, ex…", "pink"],
  ["😂", "Friends group", "Uni crew, trip chat, sports team…", "yellow"],
  ["🫶", "Any friend", "Best friend, childhood friend, work bestie…", "peach"],
  ["🏠", "Family", "Family group, mum or dad, siblings…", "mint"],
  ["📋", "Work / team", "Team chat, colleagues, boss…", "blue"],
  ["🤷‍♂️", "Other", "Roommates, neighbours, anything else…", "lavender"],
];
const platforms = [
  "WhatsApp",
  "iMessage",
  "Instagram",
  "Messenger",
  "LINE",
  "KakaoTalk",
];
const languages = [
  "English",
  "עברית",
  "العربية",
  "Español",
  "Français",
  "Deutsch",
  "Português",
  "Italiano",
  "Türkçe",
  "日本語",
  "한국어",
  "中文",
  "Nederlands",
  "ไทย",
];
const iconPath = (name) => A + "icons/" + name.toLowerCase() + ".svg";
const sampleChat = `[06/11/2026, 14:06:00] Alex: Are we still on for Saturday?\n[06/11/2026, 14:10:00] Alex: Booked the table for 8 btw\n[06/11/2026, 14:14:00] Jamie: omg sorry only just seen this 😅\n[06/11/2026, 14:18:00] Jamie: it's been a crazy week\n[06/11/2026, 14:18:30] Alex: you posted a story at 2am\n[06/11/2026, 14:22:00] Jamie: that's different lol\n[06/11/2026, 14:26:00] Alex: how\n[06/11/2026, 14:30:00] Jamie: ok you're being a bit much\n[06/11/2026, 14:30:30] Alex: I'm literally asking about Saturday\n[06/11/2026, 14:34:00] Jamie: yeah should be!!\n[06/11/2026, 14:38:00] Alex: should be or yes\n[06/11/2026, 14:42:00] Jamie: yes 🙄 x\n[06/11/2026, 14:42:30] Alex: ok\n[06/11/2026, 14:46:00] Jamie: don't do the ok thing\n[06/11/2026, 14:50:00] Jamie: I'll call you after work, promise\n[06/11/2026, 14:54:00] Alex: you said that on Tuesday`;
const bubbles = sampleChat.split("\n").map((line) => {
  const m = line.match(/\] (.*?): (.*)/);
  return { name: m[1], text: m[2] };
});
const tips = {
  WhatsApp: [
    "Open the conversation in WhatsApp.",
    "Tap the person or group name at the top.",
    "Choose Export Chat (Android: ⋮ → More → Export chat).",
    "Select Without Media, then save the .txt or .zip file.",
    "Upload the saved file here.",
  ],
  Instagram: [
    "In Instagram, open Accounts Center → Your information and permissions.",
    "Choose Export your information → Create export.",
    "Select your Instagram profile and export to your device.",
    "Choose Messages, JSON format, and the date range you need.",
    "Download the export and upload the conversation’s message_*.json files in a ZIP.",
  ],
  Messenger: [
    "Open Meta Accounts Center → Your information and permissions.",
    "Choose Export your information → your Facebook profile.",
    "Select Messages and the JSON format.",
    "Download the export and locate your conversation.",
    "Upload the message_*.json file or a ZIP of that conversation.",
  ],
  iMessage: [
    "Use an iMessage export tool on your Mac to export the selected conversation.",
    "Choose a text, CSV or JSON export with sender names.",
    "CSV columns should include sender, text and timestamp.",
    "Upload the export here. Native chat.db files and screenshots are not supported.",
  ],
  LINE: [
    "Open your LINE conversation.",
    "Open the menu → Settings → Export chat history.",
    "Save the text export to your device.",
    "Upload the .txt file here.",
  ],
  KakaoTalk: [
    "Open your KakaoTalk conversation.",
    "Open the menu → Settings → Export messages.",
    "Choose text only and save the export.",
    "Upload the .txt file here.",
  ],
};
const faqs = [
  [
    "What does Brandon actually analyse?",
    "The text you upload: how people communicate, recurring patterns, reciprocity, green flags, friction and moments that stand out. Your report includes profiles, message counts, practical next steps and follow-up questions.",
  ],
  [
    "Does my chat leave my server?",
    "The frontend sends your chat text to the server address you configure, which stores it in SQLite. It sends the text to Claude (Anthropic's API) to write the report, unless the administrator has switched the server to a local Ollama model, in which case analysis stays on that machine. The last setup step tells you which one your server uses. GitHub Pages only hosts the interface.",
  ],
  [
    "Which files can I upload?",
    "WhatsApp .txt or .zip, Instagram and Messenger JSON exports, LINE and KakaoTalk text exports, and iMessage text/CSV/JSON exports. Files must contain sender names. Screenshots, voice notes, attachments and native iMessage databases are not analysed. Exports of any size work, including ZIPs with media: your browser keeps only the chat text and uploads that. One report holds up to 256 MB of text and 1,000,000 messages.",
  ],
  [
    "Will it read my whole chat?",
    "With Claude, Brandon reads the whole chat when it fits; longer chats start from a spread sample and Brandon reads, searches and profiles the rest with tools before writing. With a local model, every message is processed in chunks whose summaries are combined, so fine detail can be lost. Follow-up questions can look up the original messages.",
  ],
  [
    "Is the AI free?",
    "There is no paywall in this edition. With a local Ollama model there is no per-report fee; your server supplies the processing power. With Claude, each report is billed to the server owner's Anthropic account, roughly cents to a dollar or two depending on the chat's length.",
  ],
  [
    "Can I delete a chat?",
    "Yes. Open My reports and delete the report. This removes its stored transcript, report and follow-up messages from the active database. Administrators must manage any separate disk backups.",
  ],
  [
    "Can Brandon be wrong?",
    "Yes. A chat cannot reveal someone’s thoughts, intentions or the full context of a relationship. Treat the analysis as one perspective and check its evidence. It is not a diagnosis.",
  ],
  [
    "Is this the official What Brandon Thinks service?",
    "This is an independent, self-hosted recreation. Accounts, chats and reports are separate from the original service. It does not connect to the original service’s private API, billing or accounts.",
  ],
];
function Button({ children, variant = "", className = "", ...props }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function Face({ size = 44 }) {
  return (
    <img
      className="face"
      src={avatar}
      width={size}
      height={size}
      alt="Brandon"
    />
  );
}
const EMOJI_LEAD = /^((?:\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*\s*)+)(.*)$/u;

function inline(s) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((v, j) =>
    v.startsWith("**") && v.endsWith("**") && v.length > 4 ? <strong key={j}>{v.slice(2, -2)}</strong> : v,
  );
}

function Markdown({ text = "" }) {
  // Render only plain text and a deliberately small Markdown subset. No raw HTML.
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^>\s?/.test(line)) {
      // Consecutive "> " lines form one quote card: a message, or a short exchange.
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      i--;
      out.push(
        <blockquote className="chat-quote" key={i} dir="auto">
          {quote.filter((q) => q.trim()).map((q, j) => {
            const who = q.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/);
            return who ? (
              <p key={j}>
                <b>{who[1].replace(/:$/, "")}</b>
                {who[2]}
              </p>
            ) : (
              <p key={j}>{inline(q)}</p>
            );
          })}
        </blockquote>,
      );
      continue;
    }
    const section = line.match(/^##\s+(.+)/);
    if (section && !/^###/.test(line)) {
      const parts = section[1].match(EMOJI_LEAD);
      out.push(
        <h3 className="section-head" key={i}>
          {parts && <span className="section-icon">{parts[1].trim()}</span>}
          {inline(parts ? parts[2] : section[1])}
        </h3>,
      );
      continue;
    }
    const person = line.match(/^###\s+(.+)/);
    if (person) {
      out.push(
        <h4 className="person-head" key={i}>
          {inline(person[1])}
        </h4>,
      );
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)/);
    if (heading) out.push(<h3 key={i}>{inline(heading[1])}</h3>);
    else if (/^[-*]\s/.test(line))
      out.push(
        <p className="bullet-line" key={i}>
          {inline(line.replace(/^[-*]\s/, ""))}
        </p>,
      );
    else if (line.trim()) out.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="markdown">{out}</div>;
}
function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  const [currentUser, setCurrentUser] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [health, setHealth] = useState(null);
  const [serverVersion, setServerVersion] = useState(0);
  const [authMode, setAuthMode] = useState("login");
  const [afterAuth, setAfterAuth] = useState(null);
  const [file, setFile] = useState(null);
  const [draft, setDraft] = useState({
    context: "",
    platform: "",
    identity: "",
    language: "English",
    note: "",
    names: {},
    title: "",
  });
  const step = route.startsWith("/setup/") ? Number(route.split("/")[2]) : 0;
  const navigate = (path) => {
    location.hash = path;
    setRoute(path);
    window.scrollTo(0, 0);
  };
  const notify = (text) => setToast(text);
  useEffect(() => {
    const onHash = () => {
      setRoute(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    setCurrentUser(null);
    setHealth(null);
    if (getServer()) {
      const checkHealth = () =>
        api("/health")
          .then(setHealth)
          .catch(() => setHealth({ status: "offline" }));
      checkHealth();
      const healthTimer = setInterval(checkHealth, 30000);
      if (getToken())
        api("/auth/me")
          .then(setCurrentUser)
          .catch(() => forgetToken());
      return () => clearInterval(healthTimer);
    }
  }, [serverVersion]);
  useEffect(() => {
    if (!modal) return;
    const f = (e) => {
      if (e.key === "Escape") setModal(null);
    };
    document.addEventListener("keydown", f);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", f);
      document.body.style.overflow = old;
    };
  }, [modal]);
  const start = (context) => {
    setDraft((d) => ({ ...d, context: context || "" }));
    setFile(null);
    navigate(context ? "/setup/2" : "/setup/1");
  };
  const auth = (next) => {
    setAfterAuth(next ? () => next : null);
    setAuthMode("login");
    setModal("auth");
  };
  const needAccount = (next) => {
    if (!getServer()) {
      setModal("settings");
      return;
    }
    if (!currentUser) {
      auth(next);
      return;
    }
    next();
  };
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    forgetToken();
    setCurrentUser(null);
    navigate("/");
  };
  const link = (path, label) => <a href={"#" + path}>{label}</a>;
  return (
    <>
      {!step && (
        <header className="header">
          <div className="nav-inner">
            <a className="brand" href="#/" aria-label="What Brandon Thinks">
              <Face />
              <span>
                what brandon thinks<span className="brand-dot">.</span>
              </span>
            </a>
            <nav>
              <button className="nav-link" onClick={() => navigate("/reports")}>
                My reports
              </button>
              <button
                className="icon-button"
                aria-label="Server settings"
                onClick={() => setModal("settings")}
              >
                <Settings size={19} />
              </button>
              <Button className="nav-cta" onClick={() => start()}>
                Try It Now <ArrowRight size={17} />
              </Button>
            </nav>
          </div>
        </header>
      )}
      {route === "/" && (
        <>
          <section className="hero">
            <div className="hero-orbit" aria-hidden="true">
              <span className="orbit-badge yellow">
                <img src={A + "images/brandon/avatars/original.webp"} />
              </span>
              <span className="orbit-badge mint">
                <img src={iconPath("WhatsApp")} />
              </span>
              <span className="orbit-badge pink">💔</span>
              <span className="orbit-badge blue">
                <Face size={66} />
              </span>
              <span className="orbit-badge lavender">😂</span>
              <span className="orbit-badge mint">🫶</span>
              <span className="orbit-badge green">
                <img src={iconPath("iMessage")} />
              </span>
            </div>
            <h1>
              Upload a chat.
              <br className="desktop-break" /> Brandon tells you
              <br className="desktop-break" /> what's{" "}
              <span className="underlined">really</span> going on.
            </h1>
            <p className="hero-sub">
              Brandon reads every message and writes what he really thinks about
              everyone in it.
            </p>
            <Button className="hero-cta" onClick={() => start()}>
              Try It Now <ArrowRight size={23} />
            </Button>
            <p className="hero-fine">
              <LockKeyhole size={13} /> Your chat. Your server. Just between us.
            </p>
            <div className="chat-stage">
              <div className="chat-fade top" />
              <div className="chat-stream">
                {[...bubbles, ...bubbles].map((b, i) => (
                  <div
                    key={i}
                    className={
                      "chat-bubble " + (b.name === "Alex" ? "sent" : "received")
                    }
                  >
                    <span className="sender">
                      {b.name === "Jamie" ? "Jamie" : ""}
                    </span>
                    <span>{b.text}</span>
                    <small>
                      14:{String(6 + ((i * 2) % 54)).padStart(2, "0")}{" "}
                      <span className="ticks">
                        {b.name === "Alex" ? "✓✓" : ""}
                      </span>
                    </small>
                  </div>
                ))}
              </div>
              <div className="chat-fade bottom" />
              <div className="floating-face">
                <Face size={76} />
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          </section>
          <section className="section chat-types">
            <div className="section-heading">
              <span className="eyebrow">
                THE GROUP CHAT HAS ENTERED THE CHAT
              </span>
              <h2>Not sure which chat to try?</h2>
              <p>Everyone has a story. Yours is in the messages.</p>
            </div>
            <div className="type-pills">
              {[
                ["🍻", "The friend group", "Friends group"],
                ["❤️‍🔥", "Your relationship", "Romantic"],
                ["🏡", "The family group", "Family"],
                ["🫠", "The situationship", "Romantic"],
                ["🥀", "Your ex", "Romantic"],
                ["💼", "The work chat", "Work / team"],
                ["👀", "Your crush", "Romantic"],
                ["👯", "Your best friend", "Any friend"],
                ["📱", "The talking stage", "Romantic"],
                ["✈️", "Long-distance", "Romantic"],
                ["🦋", "The new one", "Romantic"],
                ["💍", "Married", "Romantic"],
              ].map(([emoji, label, c], i) => (
                <button
                  className={
                    "type-pill " +
                    ["pink", "yellow", "mint", "lavender", "peach", "blue"][
                      i % 6
                    ]
                  }
                  key={label}
                  onClick={() => start(c)}
                >
                  <span>{emoji}</span>
                  {label}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
            <p className="muted center">And any other chat.</p>
          </section>
          <section className="section platforms">
            <h2>Works with your chat app</h2>
            <div className="platform-row">
              {platforms.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setDraft((d) => ({ ...d, platform: p }));
                    setModal("tutorial");
                  }}
                >
                  <img src={iconPath(p)} alt="" />
                  <span>{p}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="privacy-band">
            <div className="privacy-illustration">
              <ShieldCheck size={42} />
              <span>🔒</span>
            </div>
            <div>
              <span className="eyebrow">A LITTLE NOSY. VERY PRIVATE.</span>
              <h2>The tea stays with you.</h2>
              <p>
                Your chats and reports live on your server. Your own AI does the
                reading. No AI subscriptions, no paywall.
              </p>
              <button
                className="text-button"
                onClick={() => navigate("/privacy")}
              >
                How your data is handled <ArrowRight size={16} />
              </button>
            </div>
            <div className="privacy-stamp">
              <CheckCircle2 size={21} />
              <span>
                Self-hosted
                <br />
                <strong>By you, for you.</strong>
              </span>
            </div>
          </section>
          <section className="section wall-section">
            <div className="section-heading">
              <span className="eyebrow">THE REACTIONS SAY IT ALL</span>
              <h2>
                Wall of Love<span className="pink-dot">.</span>
              </h2>
              <p>
                Examples from the original site. Tap a screenshot to take a
                look.
              </p>
            </div>
            <div className="wall">
              {["S01", "T04", "S09", "T01", "S11", "T05", "S06", "S02"].map(
                (name, i) => (
                  <button
                    key={name}
                    className={"wall-card card-" + i}
                    onClick={() =>
                      setModal({
                        image: A + `images/wall-of-love/en/${name}.webp`,
                      })
                    }
                    aria-label={`Open reference reaction ${i + 1}`}
                  >
                    <img
                      loading="lazy"
                      src={A + `images/wall-of-love/en/${name}.webp`}
                      alt={`Reference-site chat reaction ${i + 1}`}
                    />
                  </button>
                ),
              )}
            </div>
            <p className="caption">
              Reference-site examples, not testimonials about this self-hosted
              edition.
            </p>
          </section>
          <section className="section home-faq">
            <span className="eyebrow">BEFORE YOU SPILL</span>
            <h2>A few things to know</h2>
            <FAQ items={faqs.slice(0, 5)} />
            <a className="text-button" href="#/faq">
              All questions <ArrowRight size={16} />
            </a>
          </section>
          <section className="final-cta">
            <Face size={88} />
            <h2>Your chat is next.</h2>
            <p>There’s a whole story hiding between the lines.</p>
            <Button onClick={() => start()}>
              Let’s hear it <ArrowRight size={21} />
            </Button>
          </section>
        </>
      )}
      {!!step && (
        <Wizard
          key="wizard"
          {...{
            step,
            navigate,
            draft,
            setDraft,
            file,
            setFile,
            setModal,
            needAccount,
            currentUser,
            notify,
          }}
        />
      )}
      {route === "/reports" && (
        <Reports
          {...{ currentUser, auth, navigate, start, notify, setModal }}
        />
      )}
      {route.startsWith("/s/") && (
        <SharedReport token={route.split("/")[2]} navigate={navigate} notify={notify} />
      )}
      {route.startsWith("/v/") && (
        <SharedReport key={route} data={route.slice(3)} navigate={navigate} notify={notify} />
      )}
      {route.startsWith("/report/") && (
        <Report
          id={route.split("/")[2]}
          {...{ navigate, currentUser, auth, notify, setModal }}
        />
      )}
      {route === "/faq" && (
        <main className="content-page">
          <span className="eyebrow">GOOD QUESTIONS</span>
          <h1>Let’s clear things up.</h1>
          <FAQ items={faqs} />
        </main>
      )}
      {["/privacy", "/terms", "/about", "/support"].includes(route) && (
        <InfoPage {...{ route, start, setModal }} />
      )}
      {!step && (
        <footer>
          <div className="footer-inner">
            <div className="footer-brand">
              <a className="brand" href="#/">
                <Face size={34} />
                <span>what brandon thinks.</span>
              </a>
              <p>
                An independent, self-hosted recreation.
                <br />
                Your chats, decoded on your own terms.
              </p>
              <span
                className={
                  "server-indicator " + (health?.ai_ready ? "online" : "")
                }
              >
                <i />
                {health?.ai_ready
                  ? "Your AI is ready"
                  : health?.status === "offline"
                    ? "Server offline"
                    : getServer()
                      ? "Server connected · AI not ready"
                      : "Your server, waiting to connect"}
              </span>
            </div>
            <div>
              <h4>Chats</h4>
              {link("/", "Home")}
              <button onClick={() => start("Romantic")}>
                Relationship chats
              </button>
              <button onClick={() => start("Friends group")}>
                Friends & groups
              </button>
              <button onClick={() => start("Family")}>Family chats</button>
            </div>
            <div>
              <h4>Good to know</h4>
              {link("/reports", "My reports")}
              {link("/faq", "FAQ")}
              {link("/privacy", "Privacy")}
              {link("/terms", "Terms")}
            </div>
            <div>
              <h4>Your corner</h4>
              <button onClick={() => setModal("settings")}>
                Server settings
              </button>
              {link("/support", "Help & support")}
              {link("/about", "About this edition")}
              {currentUser && (
                <button onClick={logout}>
                  Sign out ({currentUser.username})
                </button>
              )}
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} · Made for your own server.
            </span>
            <span>Powered by your PC, not a paid AI API.</span>
          </div>
        </footer>
      )}
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal close={() => setModal(null)} wide={!!modal.image}>
          {modal === "settings" && (
            <ServerSettings
              onSaved={() => {
                setServerVersion((v) => v + 1);
                setModal(null);
                notify("Server address saved. Sign in to your server.");
              }}
            />
          )}
          {modal === "auth" && (
            <Auth
              mode={authMode}
              setMode={setAuthMode}
              onSuccess={(u) => {
                setCurrentUser(u);
                setModal(null);
                if (afterAuth) afterAuth();
              }}
            />
          )}
          {modal === "tutorial" && (
            <Tutorial platform={draft.platform || "WhatsApp"} />
          )}
          {modal.image && (
            <img
              className="lightbox-image"
              src={modal.image}
              alt="Reaction from the original site's Wall of Love"
            />
          )}
          {modal.confirm && <Confirm {...modal} close={() => setModal(null)} />}
        </Modal>
      )}
    </>
  );
}
function FAQ({ items }) {
  return (
    <div className="faq-list">
      {items.map(([q, a]) => (
        <details key={q}>
          <summary>
            {q}
            <Plus size={18} />
          </summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
function Modal({ children, close, wide }) {
  const ref = useRef();
  useEffect(() => {
    const prior = document.activeElement;
    ref.current?.focus();
    return () => prior?.focus?.();
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Brandon dialog"
        className={"modal " + (wide ? "image-modal" : "")}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const els = [
              ...ref.current.querySelectorAll(
                "button,input,select,textarea,a[href]",
              ),
            ].filter((x) => !x.disabled);
            if (!els.length) {
              e.preventDefault();
              return;
            }
            if (e.shiftKey && document.activeElement === els[0]) {
              e.preventDefault();
              els.at(-1).focus();
            }
            if (!e.shiftKey && document.activeElement === els.at(-1)) {
              e.preventDefault();
              els[0].focus();
            }
          }
        }}
      >
        <button
          className="modal-close icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
        {children}
      </section>
    </div>
  );
}
function ServerSettings({ onSaved }) {
  const [url, setUrl] = useState(getServer()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null);
  async function test(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const u = new URL(url);
      if (!["https:", "http:"].includes(u.protocol))
        throw new Error("Enter an HTTPS URL.");
      const r = await fetch(u.href.replace(/\/$/, "") + "/api/health", {
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error("Server returned " + r.status);
      setResult(await r.json());
    } catch {
      setError(
        "Could not connect. Check the address, HTTPS and ALLOWED_ORIGINS on your server.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="modal-icon blue">
        <Settings />
      </div>
      <h2>Your server, your rules.</h2>
      <p className="muted">
        Connect the server that stores your chats and runs your AI.
      </p>
      <form onSubmit={test}>
        <label>
          Server address
          <input
            type="url"
            required
            placeholder="https://api.your-domain.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setResult(null);
            }}
          />
        </label>
        <p className="field-note">
          Only connect a server you trust. Chat exports and account credentials
          go to this address.
        </p>
        {error && <ErrorBox text={error} />}{" "}
        {result && (
          <div className="notice success">
            <CheckCircle2 size={19} />
            {result.provider === "claude-code"
              ? result.ai_ready
                ? "Connected. Brandon runs on Claude Code with your Claude subscription."
                : "Connected, but reports will fail until Claude Code and CLAUDE_CODE_OAUTH_TOKEN are set up on the server."
              : result.provider === "claude"
              ? result.ai_ready
                ? `Connected. Brandon runs on ${result.model}.`
                : "Connected, but reports will fail until ANTHROPIC_API_KEY is set on the server."
              : result.ai_ready
                ? "Connected. Your local AI is ready."
                : `Connected. Download or start ${result.model} in Ollama.`}
          </div>
        )}
        <div className="button-row">
          <Button variant="secondary" disabled={busy} type="submit">
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <RefreshCw size={17} />
            )}
            Test connection
          </Button>
          <Button
            type="button"
            onClick={() => {
              try {
                setServer(url);
                onSaved();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Save address <Check size={17} />
          </Button>
        </div>
      </form>
    </>
  );
}
function Auth({ mode, setMode, onSuccess }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api("/auth/" + mode, {
        method: "POST",
        body: { username, password },
      });
      onSuccess(r.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Face size={62} />
      <h2>
        {mode === "login" ? "Welcome back." : "Your private little corner."}
      </h2>
      <p className="muted">
        {mode === "login"
          ? "Sign in to your server to see your reports."
          : "Create an account on your own server. No email needed."}
      </p>
      <form onSubmit={submit}>
        <label>
          Username
          <input
            autoComplete="username"
            required
            minLength={3}
            maxLength={40}
            pattern="[a-zA-Z0-9_.-]+"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={10}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 10 characters"
          />
        </label>
        {error && <ErrorBox text={error} />}
        <Button className="full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={19} />
          ) : (
            <>
              {mode === "login" ? "Sign in" : "Create account"}{" "}
              <ArrowRight size={19} />
            </>
          )}
        </Button>
      </form>
      <p className="center muted small">
        {mode === "login" ? "First time here?" : "Already have an account?"}{" "}
        <button
          className="text-button inline"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "Create account" : "Sign in"}
        </button>
      </p>
      <p className="field-note">
        Your account is separate from the original What Brandon Thinks service.
        Keep your password safe; this edition has no email reset.
      </p>
    </>
  );
}
function Tutorial({ platform }) {
  return (
    <>
      <div className="modal-icon mint">
        <img src={iconPath(platform)} alt="" />
      </div>
      <h2>Bring your {platform} chat.</h2>
      <p className="muted">A text export is all Brandon needs.</p>
      <ol className="tutorial-steps">
        {tips[platform].map((t, i) => (
          <li key={t}>
            <span>{i + 1}</span>
            <p>{t}</p>
          </li>
        ))}
      </ol>
      <div className="notice">
        <ShieldCheck size={20} />
        Export without media. Images, audio and attachments are not analysed.
      </div>
    </>
  );
}
function ErrorBox({ text }) {
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={19} />
      <span>{text}</span>
    </div>
  );
}
function Confirm({ title, description, onConfirm, close }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <div className="modal-icon pink">
        <Trash2 />
      </div>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {error && <ErrorBox text={error} />}
      <div className="button-row">
        <Button variant="secondary" onClick={close}>
          Keep it
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              close();
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Trash2 size={18} />
          )}
          Delete report
        </Button>
      </div>
    </>
  );
}

function Wizard({
  step,
  navigate,
  draft,
  setDraft,
  file,
  setFile,
  setModal,
  needAccount,
  currentUser,
  notify,
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [paste, setPaste] = useState(false),
    [text, setText] = useState(""),
    [consent, setConsent] = useState(false),
    [drag, setDrag] = useState(false),
    [preparing, setPreparing] = useState(null),
    [engine, setEngine] = useState(null);
  const input = useRef();
  // The consent note names where the text goes, so ask the server which AI it uses.
  useEffect(() => {
    if (step !== 7 || engine) return;
    api("/health")
      .then((h) => setEngine(h.provider || "local"))
      .catch(() => {});
  }, [step, engine]);
  useEffect(() => {
    setError("");
  }, [step]);
  // Every later step needs the counted chat; send people back to upload after a reload.
  // Earlier answers live only in memory, so after a reload send people back to
  // the first step that is missing; otherwise "Create my report" stays disabled.
  useEffect(() => {
    if (step > 1 && !draft.context) navigate("/setup/1");
    else if (step > 2 && !draft.platform) navigate("/setup/2");
    else if (step > 3 && !file?.preview) navigate("/setup/3");
  }, [step, file, draft.context, draft.platform]);
  const update = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const next = () => navigate("/setup/" + (step + 1));
  const people = file?.preview?.participants || [];
  const group = people.length > 2;
  const headings = [
    "",
    "What type of chat would you like Brandon to analyze?",
    "Where’s your chat from?",
    `Upload your ${draft.platform || ""} chat`,
    group ? "Who’s in this chat?" : "Who’s who?",
    "Clean up the names",
    "Choose the language for your report",
    "Anything I should know?",
  ];
  // Exports of any size are opened here in the browser; only their chat text
  // is compressed and uploaded, never photos, videos or voice notes.
  async function chooseFile(f) {
    setError("");
    if (!f || preparing !== null) return;
    setPreparing(0);
    try {
      // Loaded on demand so the ZIP reader doesn't weigh down the landing page.
      const { prepareUpload } = await import("./prepareUpload.js");
      const prepared = await prepareUpload(f, (p) =>
        setPreparing(Math.min(95, Math.round(p * 95))),
      );
      const body = new FormData();
      body.append("file", prepared.upload);
      const preview = await api("/preview", { method: "POST", body });
      setFile({
        name: f.name,
        upload: prepared.upload,
        mediaFiles: prepared.mediaFiles,
        preview,
      });
      setDraft((d) => ({ ...d, identity: "", names: {}, title: "" }));
    } catch (e) {
      setError(
        e.name === "NotReadableError"
          ? "This file isn't fully downloaded yet. Make it available offline in your cloud drive, then try again."
          : e.message || "This file could not be read.",
      );
    } finally {
      setPreparing(null);
      if (input.current) input.current.value = "";
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const names = Object.fromEntries(
        Object.entries(draft.names).filter(
          ([from, to]) => to.trim() && to.trim() !== from,
        ),
      );
      // In a group, saying which one is you is optional.
      const identity = draft.identity
        ? (names[draft.identity] || draft.identity).trim()
        : group
          ? ""
          : "Observer";
      const body = new FormData();
      body.append("file", file.upload);
      body.append(
        "metadata",
        JSON.stringify({ ...draft, identity, names }),
      );
      const result = await api("/chats", { method: "POST", body });
      setFile(null);
      setDraft((d) => ({ ...d, note: "", names: {}, title: "", identity: "" }));
      navigate("/report/" + result.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const valid =
    step === 1
      ? !!draft.context
      : step === 2
        ? !!draft.platform
        : step === 3
          ? !!file?.preview && preparing === null
          : step === 4
            ? group || draft.identity !== ""
            : true;
  const topShare = people[0]?.messages || 1;
  return (
    <div className="wizard-shell">
      <header className="wizard-header">
        <button
          className="icon-button"
          aria-label="Back"
          onClick={() => navigate(step > 1 ? "/setup/" + (step - 1) : "/")}
        >
          <ArrowLeft size={22} />
        </button>
        <a href="#/" aria-label="Home">
          <Face size={37} />
        </a>
        <button
          className="icon-button"
          aria-label="Close setup"
          onClick={() => navigate("/")}
        >
          <X size={21} />
        </button>
      </header>
      <main className="wizard">
        <div className="progress-label">
          <span>{step} of 7</span>
          <span>
            {
              [
                "",
                "The context",
                "The app",
                "The evidence",
                "The people",
                "The names",
                "Your language",
                "The backstory",
              ][step]
            }
          </span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={7}
          aria-valuenow={step}
          aria-label={`Step ${step} of 7`}
        >
          <span style={{ width: (step / 7) * 100 + "%" }} />
        </div>
        <h1>{headings[step]}</h1>
        {step === 1 && (
          <div className="choices">
            {contexts.map(([emoji, title, desc, color]) => (
              <button
                className={
                  "choice " + (draft.context === title ? "selected" : "")
                }
                key={title}
                onClick={() => {
                  update("context", title);
                  next();
                }}
              >
                <span className={"choice-icon " + color}>{emoji}</span>
                <span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </span>
                <ChevronRight size={21} />
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="choices">
            {platforms.map((p) => (
              <button
                key={p}
                className={"choice " + (draft.platform === p ? "selected" : "")}
                onClick={() => {
                  update("platform", p);
                  next();
                }}
              >
                <img
                  className="platform-choice-icon"
                  src={iconPath(p)}
                  alt=""
                />
                <strong>{p}</strong>
                <ChevronRight size={21} />
              </button>
            ))}
          </div>
        )}
        {step === 3 && (
          <>
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept=".txt,.zip,.json,.csv"
              aria-label="Chat export file"
              onChange={(e) => chooseFile(e.target.files[0])}
            />
            {file?.preview && preparing === null ? (
              <>
                <button
                  className="count-card"
                  onClick={() => input.current.click()}
                  aria-label={`${file.preview.messages} messages found. Choose a different chat`}
                >
                  <span className="confetti" aria-hidden="true">
                    {Array.from({ length: 18 }, (_, i) => (
                      <i key={i} style={{ "--i": i }} />
                    ))}
                  </span>
                  <strong>{file.preview.messages.toLocaleString()}</strong>
                  <span>messages</span>
                  <small>Click to change the conversation</small>
                </button>
                {draft.platform === "WhatsApp" && file.mediaFiles > 0 && (
                  <p className="field-note">
                    Was this exported without media? WhatsApp includes less
                    history when media is attached.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="muted step-sub">
                  The whole story, straight from the source.
                </p>
                <button
                  className={"dropzone " + (drag ? "dragging " : "")}
                  onClick={() => input.current.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    chooseFile(e.dataTransfer.files[0]);
                  }}
                >
                  <span className="upload-icon blue">
                    {preparing !== null ? (
                      <LoaderCircle className="spin" size={28} />
                    ) : (
                      <Upload size={28} />
                    )}
                  </span>
                  <strong>
                    {preparing !== null
                      ? "Reading your export…"
                      : "Click to upload"}
                  </strong>
                  <span aria-live="polite">
                    {preparing !== null
                      ? `${preparing}% · only the chat text is kept`
                      : "or drop your chat export here"}
                  </span>
                  <small>TXT, ZIP, JSON or CSV · Any size, media is skipped</small>
                </button>
                <p className="secure-note">
                  <ShieldCheck size={16} /> Photos, videos and voice notes never
                  leave this browser.
                </p>
              </>
            )}
            <button
              className="tutorial-card"
              onClick={() => setModal("tutorial")}
            >
              <span>See the tutorial</span>
              <i>
                <Play size={18} />
              </i>
            </button>
            {!file?.preview && (
              <>
                <div className="upload-tools">
                  <button
                    className="text-button"
                    onClick={() => setPaste(!paste)}
                  >
                    {paste ? "Hide text box" : "Paste a chat instead"}{" "}
                    <MessageCircle size={15} />
                  </button>
                </div>
                {paste && (
                  <div className="paste-area">
                    <label>
                      Conversation text
                      <textarea
                        rows={7}
                        placeholder={
                          "Alex: Hey, are we still on for Saturday?\nJamie: Of course!"
                        }
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </label>
                    <Button
                      variant="secondary"
                      disabled={text.trim().length < 10}
                      onClick={() => {
                        chooseFile(
                          new File([text], "pasted-chat.txt", {
                            type: "text/plain",
                          }),
                        );
                        setPaste(false);
                      }}
                    >
                      Use this text <Check size={16} />
                    </Button>
                  </div>
                )}
                <button
                  className="sample-button"
                  onClick={() =>
                    chooseFile(
                      new File([sampleChat], "sample-alex-and-jamie.txt", {
                        type: "text/plain",
                      }),
                    )
                  }
                >
                  <Sparkles size={17} />
                  <span>
                    Just curious? <strong>Try the sample chat.</strong>
                  </span>
                  <ChevronRight size={17} />
                </button>
              </>
            )}
          </>
        )}
        {step === 4 && (
          <>
            {group && (
              <label className="group-name">
                <span className="sr-only">Group name</span>
                <input
                  value={draft.title}
                  maxLength={100}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="Name this group…"
                  dir="auto"
                />
                <Pencil size={17} />
              </label>
            )}
            <p className="muted step-sub">
              {group
                ? "Optional: tap your name if you’re in it, or just continue."
                : "Tap your name so Brandon knows which one is you."}
            </p>
            <div className="people-list">
              {people.slice(0, 60).map((p, i) => (
                <button
                  key={p.name}
                  className={
                    "person-row " +
                    (draft.identity === p.name ? "selected" : "")
                  }
                  onClick={() =>
                    update(
                      "identity",
                      group && draft.identity === p.name ? "" : p.name,
                    )
                  }
                  aria-pressed={draft.identity === p.name}
                >
                  <span className="person-top">
                    <i style={{ background: PERSON_COLORS[i % 6] }} />
                    <strong dir="auto">{p.name}</strong>
                    {draft.identity === p.name && <em>You</em>}
                    <span>
                      {p.messages.toLocaleString()} <MessageCircle size={14} />
                    </span>
                    <b>{Math.round(p.share)}%</b>
                  </span>
                  <span className="person-bar">
                    <span
                      style={{
                        width: (p.messages / topShare) * 100 + "%",
                        background: PERSON_COLORS[i % 6],
                      }}
                    />
                  </span>
                </button>
              ))}
              {people.length > 60 && (
                <p className="field-note">
                  And {(people.length - 60).toLocaleString()} more people.
                </p>
              )}
            </div>
            {!group && (
              <button
                className={
                  "choice observer " +
                  (draft.identity === "Observer" ? "selected" : "")
                }
                onClick={() => update("identity", "Observer")}
              >
                <span>👀</span>
                <strong>I’m not in this chat</strong>
                {draft.identity === "Observer" && <Check size={18} />}
              </button>
            )}
          </>
        )}
        {step === 5 && (
          <>
            <p className="muted step-sub">
              Replace nicknames and emojis with simple first names, so Brandon
              knows who’s who.
            </p>
            <div className="rename-list">
              {people.slice(0, 60).map((p, i) => (
                <label key={p.name} className="rename-row">
                  <span
                    className="rename-initial"
                    style={{ background: PERSON_COLORS[i % 6] }}
                    aria-hidden="true"
                  >
                    {Array.from(
                      (draft.names[p.name] ?? p.name).replace(/[^\p{L}\p{N}]/gu, ""),
                    )[0] || "?"}
                  </span>
                  <span className="sr-only">New name for {p.name}</span>
                  <input
                    value={draft.names[p.name] ?? p.name}
                    maxLength={60}
                    dir="auto"
                    onChange={(e) =>
                      update("names", { ...draft.names, [p.name]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </>
        )}
        {step === 6 && (
          <>
            <p className="muted step-sub">It can differ from your chat.</p>
            <div className="language-grid">
              {languages.map((l) => (
                <button
                  className={
                    "language-choice " +
                    (draft.language === l ? "selected" : "")
                  }
                  key={l}
                  onClick={() => {
                    update("language", l);
                    next();
                  }}
                >
                  {l}
                  {draft.language === l && <Check size={17} />}
                </button>
              ))}
            </div>
          </>
        )}
        {step === 7 && (
          <>
            <p className="muted step-sub">
              A little context goes a long way. Add the backstory, or let the
              chat speak for itself. Brandon picks the tone himself.
            </p>
            <label>
              The backstory <span className="optional">optional</span>
              <textarea
                value={draft.note}
                maxLength={2000}
                rows={5}
                dir="auto"
                onChange={(e) => update("note", e.target.value)}
                placeholder="How do you know each other? Anything you want me to look out for?"
              />
            </label>
            <span className="character-count">{draft.note.length} / 2,000</span>
            <div className="notice">
              <ShieldCheck size={21} />
              <span>
                Only the chat text goes to{" "}
                <strong>
                  {getServer() || "your server (connect in Settings)"}
                </strong>
                {engine === "claude" || engine === "claude-code"
                  ? ", which stores it and sends it to Claude (Anthropic) to write your report."
                  : engine === "local"
                    ? ", which stores it and runs the analysis on its own local model."
                    : ", which stores it and runs the analysis."}
              </span>
            </div>
            <label className="consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I’m allowed to share this chat with my server for storage and AI
                analysis.
              </span>
            </label>
          </>
        )}
        {error && <ErrorBox text={error} />}
        {step > 2 && step < 7 && step !== 6 && (
          <Button
            className="full continue-button"
            disabled={!valid}
            onClick={next}
          >
            Continue <ArrowRight size={20} />
          </Button>
        )}
        {step === 7 && (
          <>
            <Button
              className="full continue-button create-button"
              disabled={
                busy ||
                !consent ||
                !file?.preview ||
                !draft.context ||
                !draft.platform
              }
              onClick={() => needAccount(submit)}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={20} />
                  Uploading your chat…
                </>
              ) : (
                <>
                  <Sparkles size={20} /> Create my report
                </>
              )}
            </Button>
            <p className="field-note center">
              {engine === "claude-code"
                ? "No payment here. Brandon uses the server owner's Claude subscription."
                : engine === "claude"
                ? "No payment here. Claude's usage is billed to your server's Anthropic account."
                : "No payment. No AI API fees. Just your own server doing its thing."}
            </p>
            <button
              className="text-button center"
              onClick={() => setModal("settings")}
            >
              <Settings size={15} /> Server settings
            </button>
          </>
        )}
      </main>
      <div className="wizard-bottom">
        <LockKeyhole size={14} />
        <span>Private by design. Powered by your server.</span>
      </div>
    </div>
  );
}

function Reports({ currentUser, auth, navigate, start, notify, setModal }) {
  const [chats, setChats] = useState([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      setChats(await api("/chats"));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (currentUser) {
      load();
      const t = setInterval(load, 5000);
      return () => clearInterval(t);
    }
    setLoading(false);
  }, [currentUser]);
  const remove = (c) =>
    setModal({
      confirm: true,
      title: "Delete this report?",
      description:
        "This removes the stored chat, report and follow-up messages from your server’s active database. This cannot be undone here.",
      onConfirm: async () => {
        await api("/chats/" + c.id, { method: "DELETE" });
        await load();
        notify("Chat and report deleted.");
      },
    });
  return (
    <main className="reports-page">
      <div className="page-top">
        <div>
          <span className="eyebrow">YOUR PRIVATE CORNER</span>
          <h1>
            My reports<span className="blue-dot">.</span>
          </h1>
          <p className="muted">The stories behind your conversations.</p>
        </div>
        <Button onClick={() => start()}>
          <Plus size={18} />
          New report
        </Button>
      </div>
      {!currentUser ? (
        <div className="empty-state">
          <div className="modal-icon blue">
            <LockKeyhole size={28} />
          </div>
          <h2>Your reports live on your server.</h2>
          <p className="muted">
            {getServer()
              ? "Sign in to pick up where you left off."
              : "Connect your server to save and analyse your chats."}
          </p>
          <Button onClick={() => (getServer() ? auth() : setModal("settings"))}>
            {getServer() ? "Sign in" : "Connect server"}
            <ArrowRight size={18} />
          </Button>
        </div>
      ) : loading ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
        </div>
      ) : (
        <>
          {error && <ErrorBox text={error} />}{" "}
          {!chats.length && !error ? (
            <div className="empty-state">
              <Face size={80} />
              <h2>Your first story starts here.</h2>
              <p className="muted">
                Upload a chat. Let Brandon connect the dots.
              </p>
              <Button onClick={() => start()}>
                Analyze a chat <ArrowRight size={18} />
              </Button>
            </div>
          ) : (
            <div className="report-list">
              {chats.map((c) => (
                <article className="report-card" key={c.id}>
                  <button
                    className="report-card-main"
                    onClick={() => navigate("/report/" + c.id)}
                  >
                    <div
                      className={
                        "report-icon " +
                        (contexts.find(
                          (x) => x[1] === c.metadata.context,
                        )?.[3] || "blue")
                      }
                    >
                      <span>
                        {contexts.find(
                          (x) => x[1] === c.metadata.context,
                        )?.[0] || "💬"}
                      </span>
                    </div>
                    <div>
                      <h3>{c.title}</h3>
                      <p>
                        {c.stats.messages.toLocaleString()} messages ·{" "}
                        {c.stats.participants.length} people ·{" "}
                        {new Date(c.created * 1000).toLocaleDateString()}
                      </p>
                      <span className={"status " + c.status}>
                        {c.status === "ready"
                          ? "Ready to read"
                          : c.status === "failed"
                            ? "Needs attention"
                            : `${c.stage} · ${c.progress}%`}
                      </span>
                    </div>
                    <ChevronRight size={21} />
                  </button>
                  <button
                    className="icon-button delete-button"
                    aria-label={"Delete " + c.title}
                    onClick={() => remove(c)}
                  >
                    <Trash2 size={18} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
function ReportFootnote({ report, language }) {
  const t = useReportText(language);
  return (
    <div className="report-footnote">
      <ShieldCheck size={17} />
      <p>
        {t("footnote", {
          n: report.coverage.messages.toLocaleString(),
          model: report.model,
        })}
      </p>
    </div>
  );
}

// A report opened from its share link: read-only, no account, no follow-ups.
// `data` is a self-contained link (#/v/...) that opens without any server;
// `token` is an older server share link (#/s/...).
function SharedReport({ token, data, navigate, notify }) {
  const [chat, setChat] = useState(null),
    [error, setError] = useState(""),
    [phase, setPhase] = useState(null);
  const storyKey = "brandon-shared-" + (token || data.slice(0, 40));
  useEffect(() => {
    setChat(null);
    setPhase(null);
    setError("");
    (data
      ? readSnapshot(data).catch(() => {
          throw new Error("This link is incomplete. Ask for the link again and copy all of it.");
        })
      : api("/shared/" + token)
    )
      .then(setChat)
      .catch((e) => setError(e.message));
  }, [token, data]);
  useEffect(() => {
    if (!chat || phase) return;
    let seen = false;
    try {
      seen = localStorage.getItem(storyKey) === "1";
    } catch {}
    setPhase(chat.stats.story && !seen ? "intro" : "report");
  }, [chat, phase]);
  const finishStory = () => {
    try {
      localStorage.setItem(storyKey, "1");
    } catch {}
    setPhase("report");
    window.scrollTo(0, 0);
  };
  if (error)
    return (
      <main className="content-page center">
        <h1>This report can’t be opened.</h1>
        <ErrorBox text={error} />
        <Button onClick={() => navigate("/")}>
          Analyze your own chat <ArrowRight size={18} />
        </Button>
      </main>
    );
  if (!chat || !phase)
    return (
      <main className="empty-state">
        <LoaderCircle className="spin" />
        <p>Opening the report…</p>
      </main>
    );
  const story = chat.stats.story;
  if (phase === "intro")
    return <ReadingIntro story={story} language={chat.metadata.language} onDone={() => setPhase("chapters")} />;
  if (phase === "chapters")
    return <StoryChapters story={story} language={chat.metadata.language} onDone={finishStory} onExit={finishStory} />;
  const parsed = parseReport(chat.report.markdown);
  return (
    <main className="report-page">
      <div className="report-topbar">
        <span />
        <Button onClick={() => navigate("/setup/1")}>
          <Plus size={17} /> Analyze your own chat
        </Button>
      </div>
      <article className="report-article" dir={isRtl(chat.metadata.language) ? "rtl" : "ltr"}>
        <ReportHeader
          chat={chat}
          parsed={parsed}
          notify={notify}
          Markdown={Markdown}
          shared
          getShareUrl={async () => (data ? location.href : shareLink(token))}
        />
        <Markdown text={parsed.body} />
        <ReportContents chat={chat} parsed={parsed} />
        <ReportFootnote report={chat.report} language={chat.metadata.language} />
        {story && (
          <button className="text-button center replay" onClick={() => setPhase("chapters")}>
            <RefreshCw size={15} /> {translate(chat.metadata.language)("replay")}
          </button>
        )}
      </article>
    </main>
  );
}

function Report({ id, navigate, currentUser, auth, notify, setModal }) {
  const [chat, setChat] = useState(null),
    [error, setError] = useState(""),
    [question, setQuestion] = useState(""),
    [asking, setAsking] = useState(false),
    [askError, setAskError] = useState(""),
    [tab, setTab] = useState("report"),
    [phase, setPhase] = useState(null);
  const storyKey = "brandon-story-" + id;
  const load = async () => {
    try {
      setChat(await api("/chats/" + id));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  // New reports open with the counting intro and the stats story, once.
  useEffect(() => {
    if (!chat || phase) return;
    let seen = false;
    try {
      seen = localStorage.getItem(storyKey) === "1";
    } catch {}
    setPhase(chat.stats.story && !seen ? "intro" : "report");
  }, [chat, phase]);
  const finishStory = () => {
    try {
      localStorage.setItem(storyKey, "1");
    } catch {}
    setPhase("report");
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    setChat(null);
    setPhase(null);
    if (currentUser) {
      load();
      const t = setInterval(load, 4000);
      return () => clearInterval(t);
    }
  }, [id, currentUser]);
  async function ask(e) {
    e.preventDefault();
    setAsking(true);
    setAskError("");
    try {
      const r = await api("/chats/" + id + "/ask", {
        method: "POST",
        body: { question },
      });
      setChat((c) => ({ ...c, followups: [...c.followups, r] }));
      setQuestion("");
    } catch (e) {
      setAskError(e.message);
    } finally {
      setAsking(false);
    }
  }
  function download() {
    const content =
      "# " +
      chat.title +
      "\n\n" +
      chat.report.markdown +
      "\n\n---\n" +
      chat.report.coverage.method +
      "\nModel: " +
      chat.report.model +
      "\n\n" +
      chat.followups
        .map((f) => "## " + f.question + "\n\n" + f.answer)
        .join("\n\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "brandon-report.md";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!currentUser)
    return (
      <main className="content-page center">
        <h1>Your report is private.</h1>
        <p className="muted">Sign in to the same server account to open it.</p>
        <Button onClick={() => (getServer() ? auth() : setModal("settings"))}>
          {getServer() ? "Sign in" : "Connect server"}
          <ArrowRight size={18} />
        </Button>
      </main>
    );
  if (error)
    return (
      <main className="content-page">
        <ErrorBox text={error} />
        <Button variant="secondary" onClick={load}>
          Try again
        </Button>
      </main>
    );
  if (!chat)
    return (
      <main className="empty-state">
        <LoaderCircle className="spin" />
        <p>Opening your report…</p>
      </main>
    );
  const story = chat.stats.story;
  if (phase === "intro")
    return <ReadingIntro story={story} language={chat.metadata.language} onDone={() => setPhase("chapters")} />;
  if (phase === "chapters")
    return (
      <StoryChapters
        language={chat.metadata.language}
        story={story}
        onDone={finishStory}
        onExit={() => navigate("/reports")}
      />
    );
  const parsed = chat.report ? parseReport(chat.report.markdown) : null;
  const replay = story && (
    <button className="text-button center replay" onClick={() => setPhase("chapters")}>
      <RefreshCw size={15} /> {translate(chat.metadata.language)("replay")}
    </button>
  );
  return (
    <main className="report-page">
      <div className="report-topbar">
        <button
          className="text-button back-link"
          onClick={() => navigate("/reports")}
        >
          <ArrowLeft size={17} /> My reports
        </button>
        <Button onClick={() => navigate("/setup/1")}>
          <Plus size={17} /> Analyze another chat
        </Button>
      </div>
      {chat.status === "queued" || chat.status === "analyzing" ? (
        <>
          <ThinkingLoader chat={chat} />
          {replay}
        </>
      ) : chat.status === "failed" ? (
        <div className="analysis-state">
          <AlertCircle size={42} />
          <h2>Let’s try that again.</h2>
          <ErrorBox text={chat.error} />
          <Button
            onClick={async () => {
              try {
                await api("/chats/" + id + "/retry", { method: "POST" });
                load();
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            <RefreshCw size={18} />
            Retry analysis
          </Button>
        </div>
      ) : (
        <>
          <div className="report-toolbar">
            <div className="tabs">
              <button
                className={tab === "report" ? "active" : ""}
                onClick={() => setTab("report")}
              >
                <FileText size={17} />
                The report
              </button>
              <button
                className={tab === "ask" ? "active" : ""}
                onClick={() => setTab("ask")}
              >
                <MessageCircle size={17} />
                Ask Brandon
              </button>
            </div>
            <div className="button-row">
              <button
                className="icon-button"
                aria-label="Copy report"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(chat.report.markdown);
                    notify("Report copied.");
                  } catch {
                    notify(
                      "Copy is unavailable in this browser. Download the report instead.",
                    );
                  }
                }}
              >
                <Copy size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Download report"
                onClick={download}
              >
                <Download size={19} />
              </button>
            </div>
          </div>
          {tab === "report" ? (
            <article
              className="report-article"
              dir={isRtl(chat.metadata.language) ? "rtl" : "ltr"}
            >
              <ReportHeader
                chat={chat}
                parsed={parsed}
                notify={notify}
                Markdown={Markdown}
                getShareUrl={async () => {
                  // Short link served by the API; the long self-contained link is
                  // only a fallback for when the server can't make one.
                  try {
                    const { token } = await api("/chats/" + id + "/share", {
                      method: "POST",
                    });
                    setChat((c) => ({ ...c, share_token: token }));
                    return shareLink(token);
                  } catch {
                    return snapshotLink(chat);
                  }
                }}
                onStopSharing={async () => {
                  try {
                    await api("/chats/" + id + "/share", { method: "DELETE" });
                    setChat((c) => ({ ...c, share_token: null }));
                    notify("Link turned off. Anyone who had it can no longer open this report.");
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              />
              <Markdown text={parsed.body} />
        <ReportContents chat={chat} parsed={parsed} />
              <ReportFootnote report={chat.report} language={chat.metadata.language} />
              {replay}
            </article>
          ) : (
            <section className="ask-panel">
              <div className="ask-intro">
                <Face size={62} />
                <h2>Go on. Ask me.</h2>
                <p className="muted">
                  The report is a starting point. What else is on your mind?
                </p>
              </div>
              {!chat.followups.length && (
                <div className="suggestions">
                  {[
                    "What patterns should I pay attention to?",
                    "Who puts in more effort?",
                    "What would you suggest I say next?",
                  ].map((q) => (
                    <button key={q} onClick={() => setQuestion(q)}>
                      {q}
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
              )}
              <div className="followups">
                {chat.followups.map((f, i) => (
                  <div className="followup" key={f.id || i}>
                    <div className="question-bubble">{f.question}</div>
                    <div className="answer-bubble">
                      <Face size={30} />
                      <Markdown text={f.answer} />
                    </div>
                  </div>
                ))}
                {asking && (
                  <div className="answer-bubble">
                    <Face size={30} />
                    <span className="muted">
                      <LoaderCircle className="spin" size={18} /> Brandon is
                      thinking…
                    </span>
                  </div>
                )}
              </div>
              {askError && <ErrorBox text={askError} />}
              <form className="question-form" onSubmit={ask}>
                <label className="sr-only" htmlFor="question">
                  Ask a follow-up question
                </label>
                <input
                  id="question"
                  value={question}
                  maxLength={1500}
                  minLength={2}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What do you really want to know?"
                  required
                />
                <Button
                  disabled={asking || question.trim().length < 2}
                  aria-label="Send question"
                >
                  <Send size={19} />
                </Button>
              </form>
              <p className="field-note center">
                Uses your report and relevant original messages. Replies stay on
                your server.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
function InfoPage({ route, start, setModal }) {
  const pages = {
    "/privacy": {
      eyebrow: "YOUR CHAT IS YOUR BUSINESS",
      title: "The tea stays with you.",
      paragraphs: [
        [
          "Where your data goes",
          "This static interface is hosted on GitHub Pages. When you generate a report, your export and setup answers are sent to the API server you choose in Settings. The server stores parsed messages, metadata, reports and follow-up questions in its SQLite database.",
        ],
        [
          "How analysis works",
          "The backend sends chat text to Claude through Anthropic's API, which writes the report and answers follow-ups. An administrator can instead switch the server to its own Ollama model, and then the text stays on that server. The last setup step shows which applies.",
        ],
        [
          "Your account",
          "Passwords are salted and hashed with scrypt. Your sign-in is remembered in this browser’s local storage for 30 days, until you sign out. Your server address is stored in local storage. Your chats are available only to your account through the API, and server administrators can access the database.",
        ],
        [
          "Deleting your data",
          "Delete a report from My reports to remove its transcript, report and follow-ups from the active database. Server administrators control backups, disk access, retention and HTTPS. No public report-sharing links are created.",
        ],
        [
          "This edition",
          "There are no advertising pixels or analytics integrations in this app. GitHub and your hosting provider may keep ordinary access logs. Reference images were downloaded from the original site; they are served as local static assets.",
        ],
      ],
    },
    "/terms": {
      eyebrow: "A LITTLE COMMON SENSE",
      title: "A perspective, not a verdict.",
      paragraphs: [
        [
          "Use chats you are allowed to share",
          "Only upload conversations you have permission to send to your chosen server. You control the server configuration and who can access it.",
        ],
        [
          "AI has limits",
          "The app looks for communication patterns in text. It cannot know people’s private thoughts or the full context of a relationship. Outputs may be inaccurate and are not medical, legal or professional advice.",
        ],
        [
          "Independent edition",
          "This is an independent recreation, not the official What Brandon Thinks service. Its accounts, reports and storage are separate. There is no billing integration or subscription.",
        ],
      ],
    },
    "/about": {
      eyebrow: "SAME CURIOSITY. YOUR OWN SERVER.",
      title: "Meet your self-hosted Brandon.",
      paragraphs: [
        [
          "A second look at the group chat",
          "Upload an exported conversation and get a candid, evidence-based look at how people communicate. This edition recreates the public experience of What Brandon Thinks with a backend you control.",
        ],
        [
          "Built to live on your terms",
          "GitHub Pages hosts the interface. Your server stores chats and writes reports with Claude or a local Ollama model. The app includes reports, participant statistics, follow-up questions, downloads and deletion.",
        ],
        [
          "Source and inspiration",
          "The design and reference assets come from whatbrandonthinks.com. The implementation and private backend are independent. No private source, account or paid report from the original service was accessed.",
        ],
      ],
    },
    "/support": {
      eyebrow: "LET’S GET YOU UNSTUCK",
      title: "A little help goes a long way.",
      paragraphs: [
        [
          "Can’t connect?",
          "Open Server settings and test the connection. Use the HTTPS address of your backend. ALLOWED_ORIGINS must include the exact GitHub Pages origin. A private Tailscale address requires your device to be on the same tailnet.",
        ],
        [
          "AI isn’t ready?",
          "Set ANTHROPIC_API_KEY on the server and restart the API. If the server is switched to a local model, start Ollama and download the model named in OLLAMA_MODEL. The Settings connection test shows which AI the server uses and whether it is ready. Retry failed reports after fixing it.",
        ],
        [
          "Upload won’t parse?",
          "Use the export tutorial for your messaging app. Upload text, JSON or CSV that contains sender names. ZIP files must contain text exports, not just images. At least three messages are required.",
        ],
        [
          "Lost your password?",
          "This self-hosted edition has no email password reset. Ask the server administrator to recover access. Do not create a new account expecting the old account’s chats to appear.",
        ],
      ],
    },
  };
  const p = pages[route];
  return (
    <main className="content-page">
      <span className="eyebrow">{p.eyebrow}</span>
      <h1>{p.title}</h1>
      {p.paragraphs.map(([title, text]) => (
        <section className="prose-section" key={title}>
          <h2>{title}</h2>
          <p>{text}</p>
        </section>
      ))}
      <div className="button-row">
        <Button onClick={() => start()}>
          Try a chat <ArrowRight size={19} />
        </Button>
        {route === "/support" && (
          <Button variant="secondary" onClick={() => setModal("settings")}>
            Server settings <Settings size={18} />
          </Button>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
