import asyncio
import importlib
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from backend import ai
from backend.tests.test_parser import CHAT


class ChunkTests(unittest.TestCase):
    def test_all_characters_survive_chunking(self):
        text = 'שלום😊' * 3000
        chunks = ai.pack_texts([text], 1000)
        self.assertEqual(''.join(chunks), text)
        self.assertTrue(all(len(c.encode()) <= 1000 for c in chunks))

    def test_every_message_reaches_analysis_and_failures_propagate(self):
        from backend.parser import parse_chat, statistics
        messages = parse_chat(CHAT.encode(), 'chat.txt')
        calls = []
        async def fake_generate(payload, max_tokens=1800):
            calls.append(payload)
            return '## The big picture\nEvidence [#1] [#2] [#3].'
        with patch.object(ai, 'generate', fake_generate):
            result = asyncio.run(ai.analyze(messages, {'language':'English'}, statistics(messages), lambda *_:None, lambda:False))
        self.assertEqual(result['coverage']['messages'], 3)
        self.assertEqual(len(calls), 1, 'Small chats should use one direct inference call.')
        for i in range(1,4):
            self.assertIn(f'[#{i}]', calls[0][1]['content'])


    def test_long_chats_process_every_message(self):
        messages = [{'id': i, 'sender': 'Alex' if i % 2 else 'Jamie',
                     'timestamp': '', 'text': ('evidence ' * 30) + str(i)} for i in range(1, 101)]
        calls = []
        async def fake_generate(payload, max_tokens=1800):
            calls.append(payload[1]['content'])
            return 'Evidence summary with references.'
        with patch.object(ai, 'generate', fake_generate):
            result = asyncio.run(ai.analyze(messages, {'language': 'English'}, {'messages': 100}, lambda *_: None, lambda: False))
        self.assertGreater(result['coverage']['chunks'], 1)
        self.assertEqual(result['coverage']['messages'], 100)
        evidence_calls = '\n'.join(calls[:-1])
        for i in range(1, 101):
            self.assertIn(f'[#{i}]', evidence_calls)


    def test_only_final_model_content_is_used(self):
        self.assertEqual(ai.clean_response('draft notes</think>Final answer.'), 'Final answer.')
        self.assertEqual(ai.clean_response('<think>draft</think>Final answer.'), 'Final answer.')
        with self.assertRaises(RuntimeError):
            ai.clean_response('<think>unfinished notes')

    def test_truncated_model_output_is_rejected(self):
        original_client = httpx.AsyncClient
        async def respond(request):
            payload = json.loads(request.content)
            self.assertEqual(payload['messages'][-1]['content'], 'test')
            self.assertNotIn('think', payload)
            return httpx.Response(200, json={'done_reason': 'length', 'message': {'content': 'Incomplete report'}})
        def fixture_client(**kwargs):
            return original_client(transport=httpx.MockTransport(respond), **kwargs)
        with patch.object(ai.httpx, 'AsyncClient', fixture_client):
            with self.assertRaises(RuntimeError):
                asyncio.run(ai.generate([{'role': 'user', 'content': 'test'}]))


class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        os.environ['DATA_DIR'] = cls.temp.name
        # Never reach the real Claude API from tests, even with a key in the environment.
        os.environ['BRANDON_PROVIDER'] = 'local'
        import backend.app as module
        cls.module = importlib.reload(module)
        cls.client_context = TestClient(cls.module.app)
        cls.client = cls.client_context.__enter__()
        cls.token = cls.client.post('/api/auth/register', json={'username':'alice','password':'a safe test password'}).json()['token']
        cls.bob = cls.client.post('/api/auth/register', json={'username':'bob','password':'another test password'}).json()['token']
        cls.headers = {'Authorization':'Bearer '+cls.token}

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None,None,None)
        cls.temp.cleanup()

    def upload(self):
        response = self.client.post('/api/chats', headers=self.headers, files={'file':('chat.txt', CHAT)}, data={'metadata':json.dumps({'language':'English','identity':'Alex'})})
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()['id']

    def test_anonymous_and_cross_account_isolation(self):
        self.assertEqual(self.client.get('/api/chats').status_code, 401)
        cid = self.upload()
        wrong = {'Authorization':'Bearer '+self.bob}
        self.assertEqual(self.client.get('/api/chats/'+cid, headers=wrong).status_code, 404)
        self.assertEqual(self.client.delete('/api/chats/'+cid, headers=wrong).status_code, 404)
        self.assertEqual(self.client.get('/api/chats/'+cid, headers=self.headers).json()['stats']['messages'],3)
        self.client.delete('/api/chats/'+cid, headers=self.headers)

    def test_deletion_cascades_and_removes_report(self):
        cid=self.upload()
        with self.module.db() as con:
            con.execute('INSERT INTO followups(chat_id,question,answer) VALUES(?,?,?)',(cid,'q','a'))
        self.assertEqual(self.client.delete('/api/chats/'+cid,headers=self.headers).status_code,200)
        self.assertEqual(self.client.get('/api/chats/'+cid,headers=self.headers).status_code,404)
        with self.module.db() as con:
            self.assertEqual(con.execute('SELECT COUNT(*) FROM followups WHERE chat_id=?',(cid,)).fetchone()[0],0)

    def test_disallowed_origins(self):
        response=self.client.get('/api/chats',headers={**self.headers,'Origin':'https://evil.example'})
        self.assertEqual(response.status_code,403)

    def test_closed_signups_reject_new_accounts_but_keep_logins(self):
        with patch.object(self.module, 'SIGNUPS_OPEN', False):
            response = self.client.post('/api/auth/register', json={'username': 'stranger', 'password': 'a safe test password'})
            self.assertEqual(response.status_code, 403)
            self.assertIn('Sign-ups are closed', response.json()['detail'])
            login = self.client.post('/api/auth/login', json={'username': 'alice', 'password': 'a safe test password'})
            self.assertEqual(login.status_code, 200)

    def test_login_and_logout(self):
        response=self.client.post('/api/auth/login',json={'username':'ALICE','password':'a safe test password'})
        self.assertEqual(response.status_code,200)
        headers={'Authorization':'Bearer '+response.json()['token']}
        self.assertEqual(self.client.get('/api/auth/me',headers=headers).status_code,200)
        self.client.post('/api/auth/logout',headers=headers)
        self.assertEqual(self.client.get('/api/auth/me',headers=headers).status_code,401)

    def test_ollama_pipeline_with_http_fixture(self):
        async def mock_response(request):
            payload=json.loads(request.content)
            self.assertEqual(payload['model'], ai.MODEL)
            self.assertFalse(payload['stream'])
            return httpx.Response(200,json={'message':{'content':'## The big picture\nAlex asks about plans [#1]. Jamie answers [#2].'}})
        # Exercise the actual HTTP request/response parser using an in-process transport.
        original_client=httpx.AsyncClient
        def fixture_client(**kwargs):
            return original_client(transport=httpx.MockTransport(mock_response),**kwargs)
        with patch.object(ai.httpx,'AsyncClient',fixture_client):
            output=asyncio.run(ai.generate([{'role':'user','content':'test'}]))
        self.assertIn('[#1]',output)

    def test_browser_prepared_zip_upload(self):
        import io, zipfile
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('_chat.txt', CHAT)
        response = self.client.post('/api/chats', headers=self.headers, files={'file': ('WhatsApp Chat.zip', buf.getvalue(), 'application/zip')},
                                    data={'metadata': json.dumps({'language': 'English', 'identity': 'Alex'})})
        self.assertEqual(response.status_code, 202, response.text)
        cid = response.json()['id']
        chat = self.client.get('/api/chats/' + cid, headers=self.headers).json()
        self.assertEqual((chat['filename'], chat['stats']['messages']), ('WhatsApp Chat.zip', 3))
        self.assertNotIn('messages', self.client.get('/api/chats', headers=self.headers).json()[0])
        self.client.delete('/api/chats/' + cid, headers=self.headers)

    def test_preview_counts_people_without_an_account_or_storage(self):
        response = self.client.post('/api/preview', files={'file': ('chat.txt', CHAT)})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {'messages': 3, 'participants': [
            {'name': 'Alex', 'messages': 2, 'share': 66.7}, {'name': 'Jamie', 'messages': 1, 'share': 33.3}]})
        self.assertEqual(self.client.post('/api/preview', files={'file': ('x.exe', b'junk')}).status_code, 400)

    def test_upload_applies_clean_names_and_builds_the_story(self):
        meta = {'language': 'English', 'identity': 'Al', 'tone': 'Give me the roast', 'names': {'Alex': 'Al', 'Jamie': ''}}
        response = self.client.post('/api/chats', headers=self.headers, files={'file': ('chat.txt', CHAT)}, data={'metadata': json.dumps(meta)})
        self.assertEqual(response.status_code, 202, response.text)
        chat = self.client.get('/api/chats/' + response.json()['id'], headers=self.headers).json()
        self.assertEqual([p['name'] for p in chat['stats']['participants']], ['Al', 'Jamie'])
        self.assertEqual(chat['stats']['story']['busiest_day']['count'], 3)
        self.assertNotIn('tone', chat['metadata'])
        self.client.delete('/api/chats/' + response.json()['id'], headers=self.headers)

    def test_bad_upload_never_stored(self):
        response=self.client.post('/api/chats',headers=self.headers,files={'file':('bad.exe',b'junk')},data={'metadata':'{}'})
        self.assertEqual(response.status_code,400)
