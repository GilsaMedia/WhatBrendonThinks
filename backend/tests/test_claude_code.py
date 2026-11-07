import asyncio
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import agent, claude_code

REPORT = '# Pizza diplomacy\n\nHello all.\n\n## 🎬 The cast\n- 🍕 **Dana** — Pizza minister: Talks pizza [#5].'

# A stand-in for `claude -p`: records its arguments, environment and folder,
# then prints stream-json events like the real CLI.
FAKE = '''#!{python}
import json, os, sys
prompt = sys.stdin.read()
record = {{"args": sys.argv[1:], "cwd": os.getcwd(), "files": sorted(os.listdir(".")),
          "chat": open("chat.txt", encoding="utf-8").read(), "prompt": prompt,
          "has_api_key": "ANTHROPIC_API_KEY" in os.environ, "token": os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")}}
# The runner passes only a short environment list, so write the record next to this script.
json.dump(record, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "record.json"), "w"))
mode = {mode!r}
print(json.dumps({{"type": "system", "subtype": "init", "tools": ["Glob", "Grep", "Read"]}}))
print(json.dumps({{"type": "assistant", "message": {{"content": [{{"type": "tool_use", "name": "Grep", "input": {{"pattern": "pizza"}}}}]}}}}))
if mode == "ok":
    print(json.dumps({{"type": "result", "subtype": "success", "is_error": False, "result": "Notes.\\n" + {report!r}}}))
elif mode == "limit":
    print(json.dumps({{"type": "result", "subtype": "success", "is_error": True, "result": "Claude usage limit reached"}}))
'''


def chat(n=30):
    people = ['Dana', 'Omer', 'Lior']
    return [{'id': i, 'timestamp': '', 'sender': people[i % 3],
             'text': f'message {i} about pizza\nsecond line' if i % 5 == 0 else f'message {i}'} for i in range(1, n + 1)]


class ClaudeCodeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.record = Path(self.temp.name, 'record.json')

    def tearDown(self):
        self.temp.cleanup()

    def fake(self, mode):
        script = Path(self.temp.name, 'fake_claude.py')
        script.write_text(FAKE.format(python=sys.executable, mode=mode, report=REPORT).split('\n', 1)[1])
        # A shell wrapper, because a shebang can't hold a path with spaces.
        path = Path(self.temp.name, 'claude')
        path.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{script}" "$@"\n')
        path.chmod(path.stat().st_mode | stat.S_IEXEC)
        return str(path)

    def analyze(self, mode, cancelled=lambda: False, token='oauth-token'):
        stages = []
        env = {'BRANDON_CLAUDE_BIN': self.fake(mode), 'FAKE_RECORD': str(self.record),
               'CLAUDE_CODE_OAUTH_TOKEN': token, 'ANTHROPIC_API_KEY': 'should-not-pass'}
        with patch.dict(os.environ, env):
            result = asyncio.run(claude_code.analyze(chat(), {'language': 'English'},
                                                     {'messages': 30, 'participants': [{'name': 'Dana'}]},
                                                     lambda v, s: stages.append(s), cancelled))
        return result, stages

    def test_runs_restricted_read_only_session_and_returns_report(self):
        result, stages = self.analyze('ok')
        self.assertTrue(result['markdown'].startswith('# Pizza diplomacy'))
        self.assertEqual(result['model'], 'Claude Code (opus)')
        record = json.loads(self.record.read_text())
        args = record['args']
        for flag in ('-p', '--restricted', '--strict-mcp-config', '--safe-mode', '--no-session-persistence'):
            self.assertIn(flag, args)
        self.assertEqual(args[args.index('--tools') + 1], 'Read,Grep,Glob')
        self.assertEqual(args[args.index('--permission-mode') + 1], 'dontAsk')
        self.assertEqual(record['files'], ['chat.txt', 'facts.json'])
        # Message #N is on line N, with line breaks inside messages flattened.
        lines = record['chat'].splitlines()
        self.assertEqual(len(lines), 30)
        self.assertTrue(lines[4].startswith('[#5]') and '⏎' in lines[4])
        self.assertIn("Write Brandon's report", record['prompt'])
        self.assertIn('Read all of it', record['prompt'])  # 30 messages: read in full
        self.assertIn('Never cite message numbers', record['prompt'])
        self.assertFalse(record['has_api_key'])
        self.assertEqual(record['token'], 'oauth-token')
        self.assertIn('Searching for “pizza”', stages)
        self.assertFalse(Path(record['cwd']).exists())  # the private folder is removed

    def test_usage_limit_and_missing_result_are_clear_errors(self):
        with self.assertRaisesRegex(RuntimeError, 'usage limit'):
            self.analyze('limit')
        with self.assertRaisesRegex(RuntimeError, 'stopped before finishing'):
            self.analyze('crash')

    def test_missing_token_and_cancel(self):
        with self.assertRaisesRegex(RuntimeError, 'claude setup-token'):
            self.analyze('ok', token='')
        result, _ = self.analyze('ok', cancelled=lambda: True)
        self.assertIsNone(result)

    def test_provider_prefers_the_subscription_token(self):
        with patch.dict(os.environ, {'CLAUDE_CODE_OAUTH_TOKEN': 't', 'ANTHROPIC_API_KEY': 'k', 'BRANDON_PROVIDER': ''}):
            self.assertEqual(agent.provider(), 'claude-code')
        with patch.dict(os.environ, {'CLAUDE_CODE_OAUTH_TOKEN': 't', 'BRANDON_PROVIDER': 'claude'}):
            self.assertEqual(agent.provider(), 'claude')
        with patch.dict(os.environ, {'CLAUDE_CODE_OAUTH_TOKEN': '', 'BRANDON_PROVIDER': ''}):
            self.assertEqual(agent.provider(), 'claude')


if __name__ == '__main__':
    unittest.main()
