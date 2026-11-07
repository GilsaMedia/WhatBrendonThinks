# Deployment

## Native Linux deployment (used on the supplied server)

Keep the API and Ollama bound to loopback, then expose the API through a dedicated HTTPS reverse proxy. Do not expose Ollama's unauthenticated port.

```sh
git clone https://github.com/GilsaMedia/WhatBrendonThinks.git ~/apps/WhatBrendonThinks
cd ~/apps/WhatBrendonThinks
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

Install Ollama from its official distribution and download `qwen3:4b-instruct-2507-q4_K_M`. This model's quantized weights are about 2.5 GB; inference also needs context and runtime memory. The supplied server has about 14 GiB RAM, an Intel i7-1185G7 and no NVIDIA GPU. The 4B model reduces CPU latency compared with an 8B model. Larger models can be selected later.

Create `deploy/.env` (ignored by Git):

```dotenv
OLLAMA_MODEL=qwen3:4b-instruct-2507-q4_K_M
OLLAMA_URL=http://127.0.0.1:11434
ALLOWED_ORIGINS=https://gilsamedia.github.io
DATA_DIR=/home/gilsa/apps/WhatBrendonThinks/data
```

Run one Uvicorn worker. A system service example is provided; user services work too when lingering is enabled. Use restrictive permissions on `data/` and the environment file. Restart the API after code changes. Interrupted jobs return to the queue after restart; completed reports remain stored.

### Private Tailscale HTTPS

Preserve existing services and add a separate listener:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:8000
tailscale serve status
```

The API origin is `https://gilsa.tail016c50.ts.net:8443`. Only tailnet members can reach it. Set the GitHub repository Actions variable `VITE_API_URL` to this origin, then run the Pages workflow. A browser's local-network access controls may ask for permission to reach your private server.

### Public HTTPS alternative

To make analysis usable outside the tailnet, provide a domain pointing to the server and configure Caddy with `Caddyfile.example`. Set `VITE_API_URL` to that HTTPS origin and restart/rebuild as needed. This changes network exposure and is not enabled by the private deployment.

## Docker alternative

```sh
cd deploy
cp .env.example .env
docker compose up -d --build
docker compose exec ollama ollama pull qwen3:4b-instruct-2507-q4_K_M
```

Set `OLLAMA_MODEL=qwen3:4b-instruct-2507-q4_K_M` in `.env` before starting. If using NVIDIA hardware with a configured container runtime, add `-f compose.yaml -f compose.gpu.yaml` to the commands. `chats` stores SQLite and `models` stores model weights. Do not remove volumes during ordinary updates.

## Operations

- `GET /api/health` returns API status, configured model and whether its weights are installed. Actual inference must be tested with an uploaded sample.
- Watch the API and Ollama systemd journals for failures; do not add raw transcripts or tokens to logs.
- Back up SQLite with its backup API (or stop the API before copying its files). Backups contain private chats.
- Set `ALLOWED_ORIGINS` to exact frontend origins, comma separated. Do not include a repository path: all GitHub Pages repos for the same account share an origin.
- User accounts are created in the app. No default password is seeded. There is no email password-reset service.
- On CPU, a report may take minutes. Long chats require multiple inference calls. The queue survives restarts, but an interrupted report begins processing again from the first chunk.
