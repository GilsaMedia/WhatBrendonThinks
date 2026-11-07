import asyncio
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from collections import Counter, defaultdict, deque
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from . import agent, ai, insights
from .parser import parse_chat, statistics, MAX_BYTES

DATA = Path(os.getenv('DATA_DIR', './data'))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'brandon.sqlite3'
# Set BRANDON_SIGNUPS=closed once your accounts exist, before exposing the API
# publicly, so strangers can't create accounts and run reports on your AI bill.
SIGNUPS_OPEN = os.getenv('BRANDON_SIGNUPS', 'open').strip().lower() != 'closed'
ORIGINS = [s.strip() for s in os.getenv('ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(',') if s.strip()]
SESSION_SECONDS = 7 * 24 * 3600
LANGUAGES = {'English', 'עברית', 'العربية', 'Español', 'Français', 'Deutsch', 'Português', 'Italiano', 'Türkçe', '日本語', '한국어', '中文', 'Nederlands', 'ไทย'}
limits = defaultdict(deque)


@contextmanager
def db():
    con = sqlite3.connect(DB, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON')
    try:
        with con:
            yield con
    finally:
        con.close()


def init_db():
    with db() as con:
        con.execute('PRAGMA journal_mode=WAL')
        con.executescript('''
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, filename TEXT NOT NULL,
          metadata TEXT NOT NULL, messages TEXT NOT NULL, stats TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0,
          stage TEXT NOT NULL DEFAULT 'Queued', report TEXT, error TEXT, created REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS chat_owner ON chats(user_id, created);
        CREATE TABLE IF NOT EXISTS followups(id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, question TEXT NOT NULL, answer TEXT NOT NULL);
        ''')
        con.execute("UPDATE chats SET status='queued', progress=0, stage='Resuming after restart' WHERE status='analyzing'")
        con.execute('DELETE FROM sessions WHERE expires < ?', (time.time(),))


def throttle(request, scope, count, window=60):
    key = (request.client.host if request.client else 'unknown', scope)
    now = time.time()
    if len(limits) > 10000:
        for k in list(limits):
            if not limits[k] or limits[k][-1] < now - 3600:
                del limits[k]
    q = limits[key]
    while q and q[0] < now - window:
        q.popleft()
    if len(q) >= count:
        raise HTTPException(429, 'Too many requests. Please try again shortly.')
    q.append(now)


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def user(request: Request):
    raw = request.headers.get('Authorization', '')
    if not raw.startswith('Bearer '):
        raise HTTPException(401, 'Sign in to continue.')
    with db() as con:
        row = con.execute('SELECT users.id, users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND expires>?', (token_hash(raw[7:]), time.time())).fetchone()
    if not row:
        raise HTTPException(401, 'Your session expired. Please sign in again.')
    return dict(row)


# The transcript can be hundreds of MB, so only load it where it is needed.
CHAT_SUMMARY = 'id, user_id, title, filename, metadata, stats, status, progress, stage, report, error, created'


def owned(chat_id, current, with_messages=False):
    columns = CHAT_SUMMARY + (', messages' if with_messages else '')
    with db() as con:
        row = con.execute(f'SELECT {columns} FROM chats WHERE id=? AND user_id=?', (chat_id, current['id'])).fetchone()
    if not row:
        raise HTTPException(404, 'Report not found.')
    return dict(row)


def public_chat(row, full=False):
    keys = ['id', 'title', 'filename', 'status', 'progress', 'stage', 'error', 'created']
    result = {k: row[k] for k in keys}
    result['stats'] = json.loads(row['stats'])
    result['metadata'] = json.loads(row['metadata'])
    if full:
        result['report'] = json.loads(row['report']) if row['report'] else None
        with db() as con:
            result['followups'] = [dict(r) for r in con.execute('SELECT id, question, answer FROM followups WHERE chat_id=? ORDER BY id', (row['id'],)).fetchall()]
    return result


async def worker():
    while True:
        with db() as con:
            row = con.execute("SELECT * FROM chats WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
            if row:
                con.execute("UPDATE chats SET status='analyzing', stage='Brandon is getting ready' WHERE id=?", (row['id'],))
        if not row:
            await asyncio.sleep(2)
            continue
        chat_id = row['id']
        def progress(value, stage):
            with db() as con:
                con.execute('UPDATE chats SET progress=?, stage=? WHERE id=?', (value, stage, chat_id))
        def cancelled():
            with db() as con:
                return not con.execute('SELECT id FROM chats WHERE id=?', (chat_id,)).fetchone()
        try:
            messages = await asyncio.to_thread(json.loads, row['messages'])
            brain = agent if agent.provider() == 'claude' else ai
            report = await brain.analyze(messages, json.loads(row['metadata']), json.loads(row['stats']), progress, cancelled)
            if report:
                with db() as con:
                    con.execute("UPDATE chats SET status='ready', progress=100, stage='Report ready', report=?, error=NULL WHERE id=?", (json.dumps(report), chat_id))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # RuntimeErrors carry a message written for the user; anything else stays generic.
            reason = str(exc) if isinstance(exc, RuntimeError) else (
                'Claude could not finish this report. Retry it.' if agent.provider() == 'claude' else
                'The local AI could not finish this report. Check Ollama and the configured model, then retry.')
            with db() as con:
                con.execute("UPDATE chats SET status='failed', stage='Could not finish', error=? WHERE id=?", (reason, chat_id))


@asynccontextmanager
async def lifespan(app):
    init_db()
    task = asyncio.create_task(worker())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title='Brandon — private chat analysis', lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=False,
                   allow_methods=['GET', 'POST', 'DELETE', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type'])


@app.middleware('http')
async def safeguards(request, call_next):
    if request.headers.get('origin') and request.headers['origin'] not in ORIGINS:
        return Response('Origin not allowed', status_code=403)
    length = request.headers.get('content-length')
    if length and (not length.isdigit() or int(length) > MAX_BYTES + 65536):
        return Response('Upload too large', status_code=413)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response


@app.get('/api/health')
async def health():
    if agent.provider() == 'claude':
        # The key is checked when a report runs; no request is spent on health checks.
        return {'status': 'ok', 'ai_ready': agent.has_key(), 'model': agent.MODEL, 'provider': 'claude'}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(ai.OLLAMA_URL + '/api/tags')
            response.raise_for_status()
            models = [m['name'] for m in response.json().get('models', [])]
        ready = ai.MODEL in models or ai.MODEL + ':latest' in models
    except (httpx.HTTPError, ValueError, KeyError):
        ready = False
    return {'status': 'ok', 'ai_ready': ready, 'model': ai.MODEL, 'provider': 'local'}


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r'^[a-zA-Z0-9_.-]+$')
    password: str = Field(min_length=10, max_length=200)


def session_for(uid, username):
    token = secrets.token_urlsafe(48)
    with db() as con:
        con.execute('INSERT INTO sessions VALUES(?,?,?)', (token_hash(token), uid, time.time() + SESSION_SECONDS))
    return {'token': token, 'user': {'id': uid, 'username': username}}


@app.post('/api/auth/register', status_code=201)
async def register(body: Credentials, request: Request):
    if not SIGNUPS_OPEN:
        raise HTTPException(403, 'Sign-ups are closed on this server. Ask its owner for an account.')
    throttle(request, 'register', 5, 3600)
    name, salt, uid = body.username.lower(), secrets.token_hex(16), str(uuid.uuid4())
    digest = await asyncio.to_thread(password_hash, body.password, salt)
    try:
        with db() as con:
            con.execute('INSERT INTO users VALUES(?,?,?,?)', (uid, name, salt, digest))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'That username is already taken.')
    return session_for(uid, name)


@app.post('/api/auth/login')
async def login(body: Credentials, request: Request):
    throttle(request, 'login', 10)
    with db() as con:
        row = con.execute('SELECT * FROM users WHERE username=?', (body.username.lower(),)).fetchone()
    digest = await asyncio.to_thread(password_hash, body.password, row['salt'] if row else '00' * 16)
    if not row or not hmac.compare_digest(digest, row['password']):
        raise HTTPException(401, 'Incorrect username or password.')
    return session_for(row['id'], row['username'])


@app.get('/api/auth/me')
async def me(current=Depends(user)):
    return current


@app.post('/api/auth/logout')
async def logout(request: Request, current=Depends(user)):
    with db() as con:
        con.execute('DELETE FROM sessions WHERE token=?', (token_hash(request.headers['Authorization'][7:]),))
    return {'ok': True}


@app.get('/api/chats')
async def chats(current=Depends(user)):
    with db() as con:
        rows = con.execute(f'SELECT {CHAT_SUMMARY} FROM chats WHERE user_id=? ORDER BY created DESC', (current['id'],)).fetchall()
    return [public_chat(r) for r in rows]


@app.post('/api/chats', status_code=202)
async def upload(request: Request, file: UploadFile = File(...), metadata: str = Form(...), current=Depends(user)):
    throttle(request, 'upload', 5, 3600)
    with db() as con:
        active = con.execute("SELECT COUNT(*) FROM chats WHERE user_id=? AND status IN ('queued','analyzing')", (current['id'],)).fetchone()[0]
    if active >= 2:
        raise HTTPException(429, 'You already have two reports in progress. Wait for one to finish.')
    try:
        meta = json.loads(metadata)
        if not isinstance(meta, dict):
            raise ValueError()
        # Brandon chooses the report's voice himself, so no tone is accepted here.
        safe = {key: str(meta.get(key, ''))[:2000 if key == 'note' else 100] for key in ['context', 'platform', 'identity', 'language', 'note', 'title']}
        if safe['language'] not in LANGUAGES:
            safe['language'] = 'English'
        names = meta.get('names') or {}
        if not isinstance(names, dict) or len(names) > 2000:
            raise ValueError('Invalid participant names.')
        data = await file.read(MAX_BYTES + 1)
        messages = await asyncio.to_thread(parse_chat, data, file.filename or '')
        messages = insights.rename(messages, names)
    except (ValueError, UnicodeError) as exc:
        raise HTTPException(400, str(exc) or 'Invalid upload metadata.')
    finally:
        await file.close()
    stats, chat_id = await asyncio.to_thread(statistics, messages), str(uuid.uuid4())
    title = safe['title'].strip() or ' & '.join(p['name'] for p in stats['participants'][:3])[:100]
    transcript = await asyncio.to_thread(json.dumps, messages)
    del messages
    with db() as con:
        con.execute('INSERT INTO chats(id,user_id,title,filename,metadata,messages,stats,created) VALUES(?,?,?,?,?,?,?,?)',
                    (chat_id, current['id'], title, (file.filename or 'chat')[:200], json.dumps(safe), transcript, json.dumps(stats), time.time()))
    return {'id': chat_id}


@app.post('/api/preview')
async def preview(request: Request, file: UploadFile = File(...)):
    """Count messages and people for the setup flow. Nothing is stored, so no account is needed."""
    throttle(request, 'preview', 30, 3600)
    try:
        data = await file.read(MAX_BYTES + 1)
        messages = await asyncio.to_thread(parse_chat, data, file.filename or '')
    except (ValueError, UnicodeError) as exc:
        raise HTTPException(400, str(exc) or 'This file could not be read.')
    finally:
        await file.close()
    counts = Counter(m['sender'] for m in messages)
    return {'messages': len(messages),
            'participants': [{'name': name, 'messages': n, 'share': round(n / len(messages) * 100, 1)}
                             for name, n in counts.most_common(200)]}


@app.get('/api/chats/{chat_id}')
async def get_chat(chat_id: str, current=Depends(user)):
    return public_chat(owned(chat_id, current), True)


@app.delete('/api/chats/{chat_id}')
async def delete_chat(chat_id: str, current=Depends(user)):
    owned(chat_id, current)
    with db() as con:
        con.execute('DELETE FROM chats WHERE id=? AND user_id=?', (chat_id, current['id']))
    return {'ok': True}


@app.post('/api/chats/{chat_id}/retry')
async def retry(chat_id: str, request: Request, current=Depends(user)):
    throttle(request, 'retry', 5, 3600)
    row = owned(chat_id, current)
    if row['status'] != 'failed':
        raise HTTPException(409, 'Only failed reports can be retried.')
    with db() as con:
        con.execute("UPDATE chats SET status='queued', progress=0, stage='Queued', error=NULL WHERE id=?", (chat_id,))
    return {'ok': True}


class Question(BaseModel):
    question: str = Field(min_length=2, max_length=1500)


ask_lock = asyncio.Lock()


@app.post('/api/chats/{chat_id}/ask')
async def ask(chat_id: str, body: Question, request: Request, current=Depends(user)):
    throttle(request, 'ask', 10, 3600)
    row = owned(chat_id, current, with_messages=True)
    if row['status'] != 'ready':
        raise HTTPException(409, 'Wait for your report to finish.')
    if ask_lock.locked():
        raise HTTPException(429, 'Another question is being answered. Please try again shortly.')
    async with ask_lock:
        with db() as con:
            history = [dict(r) for r in con.execute('SELECT question,answer FROM followups WHERE chat_id=? ORDER BY id', (chat_id,)).fetchall()]
        try:
            messages = await asyncio.to_thread(json.loads, row['messages'])
            brain = agent if agent.provider() == 'claude' else ai
            answer = await brain.answer(messages, json.loads(row['report']), body.question, history)
        except RuntimeError as exc:
            raise HTTPException(503, str(exc))
        owned(chat_id, current)
        with db() as con:
            con.execute('INSERT INTO followups(chat_id,question,answer) VALUES(?,?,?)', (chat_id, body.question, answer))
        return {'question': body.question, 'answer': answer}


@app.get('/api/chats/{chat_id}/export')
async def export(chat_id: str, current=Depends(user)):
    row = owned(chat_id, current)
    return public_chat(row, True)
