# What Brandon Thinks — self-hosted edition

An independent recreation of the public [What Brandon Thinks](https://www.whatbrandonthinks.com/) experience, with a GitHub Pages frontend and a private Python API that stores chats and writes reports with a Claude agent (when an Anthropic API key is set) or a local Ollama model. No original-site backend is used.

## Included

- Responsive landing page, chat categories, platform guides, FAQ and reference-image lightbox.
- Seven-step setup: chat type, platform, upload with an instant message count, the people in the chat (pick yourself, name the group), name clean-up, report language, backstory. Brandon picks the report's tone himself.
- A seven-chapter stats story before the report, counted exactly on the server: a daily calendar, who talks and who starts, what you call each other, "love you"s, busiest day, streaks, silences, hours, longest messages, first and latest messages, laughs, top words and emojis.
- A report page with a headline, Brandon's byline, a share button, a "More inside" list and a one-line cast list. Hebrew and Arabic reports read right to left.
- Text, ZIP, JSON and CSV imports for WhatsApp, Meta exports, LINE, KakaoTalk and exported iMessage conversations.
- Exports of any size, including WhatsApp ZIPs with media: the browser reads the archive lazily, keeps only the chat text and uploads that compressed. One report holds up to 256 MB of text and 1,000,000 messages.
- Server accounts, per-account report history, asynchronous analysis with progress and restart recovery.
- **Claude agent** (the default; needs `ANTHROPIC_API_KEY`): Brandon runs on Claude and reads the chat through tools (read a stretch, search, profile a person, read a day) before writing the report and answering follow-ups.
- **Local model** (no key): every parsed message is processed in bounded chunks with hierarchical evidence summaries.
- Participant statistics, narrative reports, follow-up questions using retrieved messages, copy/download and deletion.
- No billing or paywall. With Claude, reports are billed to the server owner's Anthropic account; with Ollama, your hardware provides inference.

This is **not a verified reproduction of every private feature** of the original service. Original accounts, payments, email/WhatsApp intake, native iMessage extraction, screen-recording analysis, proprietary prompts and paid reports are not replicated. The UI is English; generated reports can use the languages offered in setup. AI interpretations are fallible.

## Local development

Requires Node.js 22+, Python 3.11+, and a separately installed [Ollama](https://docs.ollama.com/download).

```sh
npm ci
npm run dev
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
ollama pull qwen3:4b-instruct-2507-q4_K_M
OLLAMA_MODEL=qwen3:4b-instruct-2507-q4_K_M .venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open the frontend at `http://127.0.0.1:5173`, then set the server address to `http://127.0.0.1:8000` in Settings. Create a server account. A synthetic sample chat is available in the upload step. No inference responses are faked in production; unavailable AI produces a visible retryable failure.

## Deployment used for this project

- Frontend: `https://gilsamedia.github.io/WhatBrendonThinks/`
- Backend target: `https://gilsa.tail016c50.ts.net:8443`
- Model: Claude (`claude-opus-5-5`) through the Anthropic API, as a tool-using agent. The Ollama model `qwen3:4b-instruct-2507-q4_K_M` remains available with `BRANDON_PROVIDER=local`.
- The backend address is private to the owner's Tailscale network. The GitHub Pages UI is public; using chat analysis requires access to that tailnet and a server account.
- The existing Tailscale service on port 443 is preserved. This app uses a separate HTTPS listener on 8443.

See [deployment instructions](deploy/README.md). This section describes the intended configuration; consult the deployment status recorded in the delivery message for what was actually verified.

## GitHub Pages

The Pages workflow builds `dist/` and deploys it. Enable Pages with **GitHub Actions** as the source. Set the repository Actions variable `VITE_API_URL` to the HTTPS API origin, with no `/api` suffix. The Settings dialog can override it per browser. The Vite relative base and hash routes work in a repository subpath, including refreshed report links.

## Claude agent

Claude writes every report. Set `ANTHROPIC_API_KEY` in the server environment (for example `deploy/.env`) and restart the API; without it, reports fail with a message saying the key is missing, and nothing falls back to another model. `BRANDON_PROVIDER=local` deliberately switches the server to Ollama instead, and `/api/health` reports which one is active. The chat text is sent to Anthropic's API, and the last setup step tells users so.

Brandon gets the exact computed statistics plus the chat. A chat up to `BRANDON_CLAUDE_FULL_BYTES` (default 400000 UTF-8 bytes) is sent whole; a longer one starts from an evenly spread sample of about 200 KB. Either way Brandon can use four read-only tools on the stored messages: `read_messages`, `search_messages`, `person_profile` and `messages_on_date`. He explores for at most `BRANDON_CLAUDE_MAX_TURNS` turns (default 14), then writes the report in the fixed headline, cast and sections format.

Other settings: `BRANDON_CLAUDE_MODEL` (default `claude-opus-5-5`) and `BRANDON_CLAUDE_EFFORT` (default `high`). Requests stream, cache the chat between turns, and opt into Anthropic's server-side fallback when a request is declined. A typical report costs from a few cents for a short chat to a dollar or two for a long one, mostly the first read of the chat.

## Long chats (local model)

Every message is read. The model reads a chat in pieces of `BRANDON_CHUNK_BYTES` (default 24000 UTF-8 bytes) with an Ollama context of `OLLAMA_NUM_CTX` (default 16384 tokens), then merges the summaries. Bigger pieces mean fewer model calls; on a low-memory machine lower both together, for example 10000 and 8192. On CPU a chat of hundreds of thousands of messages can still take hours.

## Storage and privacy

SQLite defaults to `./data/brandon.sqlite3` (`DATA_DIR` overrides it). It stores accounts, hashed session tokens, parsed messages, metadata, reports and follow-ups. Passwords use salted scrypt. Bearer sessions expire in seven days and are kept in browser session storage. The app never sends SSH credentials to the browser or repository.

The API enforces ownership on every chat operation and exact allowed origins. Configure HTTPS and restrict filesystem access. Database files are not encrypted by the application; the server owner controls disk encryption and backups. Deletion removes records from the active database, not independent backups. ZIPs are read in memory without extracting paths. Uploaded text (128 MB compressed, 256 MB expanded), message count (1,000,000) and request rates are bounded; media never leaves the browser. At most two reports per user can be pending. Run one API worker; it owns the serial inference queue.

## Validation

```sh
npm run build
.venv/bin/python -m unittest discover -s backend/tests -v
```

Tests cover parser formats, Unicode, archive handling, lossless chunking, model request handling, authentication, ownership isolation and deletion. Tests use a mocked local Ollama transport and a scripted fake Claude client; a real server/model smoke test is a separate deployment check.

## Research and assets

Public app behavior was inspected with browser observation and selected shipped JavaScript was analyzed using REA. [Research notes](research/RECONSTRUCTION.md) explain coverage and limitations. The avatars, messaging icons and clearly labelled reference reactions are downloaded public assets from the original website, retained to satisfy the requested recreation. They are not new testimonials or evidence of usage of this edition. Branding and third-party asset rights remain with their respective owners; no license to those assets is asserted here.
