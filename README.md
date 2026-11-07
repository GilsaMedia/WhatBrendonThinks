# What Brandon Thinks — self-hosted edition

An independent recreation of the public [What Brandon Thinks](https://www.whatbrandonthinks.com/) experience, with a GitHub Pages frontend and a private Python API that stores chats and runs a local AI model through Ollama. No paid AI API or original-site backend is used.

## Included

- Responsive landing page, chat categories, platform guides, FAQ and reference-image lightbox.
- Seven-step setup: chat type, platform, export, identity, report language, background/tone, review.
- Text, ZIP, JSON and CSV imports for WhatsApp, Meta exports, LINE, KakaoTalk and exported iMessage conversations.
- Server accounts, per-account report history, asynchronous analysis with progress and restart recovery.
- Every parsed message processed in bounded chunks; long chats use hierarchical evidence summaries.
- Participant statistics, narrative reports, follow-up questions using retrieved messages, copy/download and deletion.
- No billing or paywall. Your hardware provides inference.

This is **not a verified reproduction of every private feature** of the original service. Original accounts, payments, email/WhatsApp intake, native iMessage extraction, screen-recording analysis, proprietary prompts and paid reports are not replicated. The UI is English; generated reports can use the languages offered in setup. AI interpretations are fallible.

## Local development

Requires Node.js 22+, Python 3.11+, and a separately installed [Ollama](https://docs.ollama.com/download).

```sh
npm ci
npm run dev
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
ollama pull qwen3:4b
OLLAMA_MODEL=qwen3:4b .venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open the frontend at `http://127.0.0.1:5173`, then set the server address to `http://127.0.0.1:8000` in Settings. Create a server account. A synthetic sample chat is available in the upload step. No inference responses are faked in production; unavailable AI produces a visible retryable failure.

## Deployment used for this project

- Frontend: `https://gilsamedia.github.io/WhatBrendonThinks/`
- Backend target: `https://gilsa.tail016c50.ts.net:8443`
- Model target: `qwen3:4b` through Ollama, CPU inference.
- The backend address is private to the owner's Tailscale network. The GitHub Pages UI is public; using chat analysis requires access to that tailnet and a server account.
- The existing Tailscale service on port 443 is preserved. This app uses a separate HTTPS listener on 8443.

See [deployment instructions](deploy/README.md). This section describes the intended configuration; consult the deployment status recorded in the delivery message for what was actually verified.

## GitHub Pages

The Pages workflow builds `dist/` and deploys it. Enable Pages with **GitHub Actions** as the source. Set the repository Actions variable `VITE_API_URL` to the HTTPS API origin, with no `/api` suffix. The Settings dialog can override it per browser. The Vite relative base and hash routes work in a repository subpath, including refreshed report links.

## Storage and privacy

SQLite defaults to `./data/brandon.sqlite3` (`DATA_DIR` overrides it). It stores accounts, hashed session tokens, parsed messages, metadata, reports and follow-ups. Passwords use salted scrypt. Bearer sessions expire in seven days and are kept in browser session storage. The app never sends SSH credentials to the browser or repository.

The API enforces ownership on every chat operation and exact allowed origins. Configure HTTPS and restrict filesystem access. Database files are not encrypted by the application; the server owner controls disk encryption and backups. Deletion removes records from the active database, not independent backups. ZIPs are read in memory without extracting paths. Input size, expanded archive size, message count and request rates are bounded. At most two reports per user can be pending. Run one API worker; it owns the serial inference queue.

## Validation

```sh
npm run build
.venv/bin/python -m unittest discover -s backend/tests -v
```

Tests cover parser formats, Unicode, archive handling, lossless chunking, model request handling, authentication, ownership isolation and deletion. Tests use a mocked local Ollama transport; a real server/model smoke test is a separate deployment check.

## Research and assets

Public app behavior was inspected with browser observation and selected shipped JavaScript was analyzed using REA. [Research notes](research/RECONSTRUCTION.md) explain coverage and limitations. The avatars, messaging icons and clearly labelled reference reactions are downloaded public assets from the original website, retained to satisfy the requested recreation. They are not new testimonials or evidence of usage of this edition. Branding and third-party asset rights remain with their respective owners; no license to those assets is asserted here.
