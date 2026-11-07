import asyncio
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend import agent


def chat(n=30):
    people = ['Dana', 'Omer', 'Lior']
    return [{'id': i, 'timestamp': f'0{1 + i % 9}/03/2025, 1{i % 10}:00', 'sender': people[i % 3],
             'text': f'message {i} about pizza' if i % 5 == 0 else f'message {i}'} for i in range(1, n + 1)]


def block(kind, **fields):
    return SimpleNamespace(type=kind, **fields)


class FakeStream:
    def __init__(self, message):
        self.message = message

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get_final_message(self):
        return self.message


class FakeClient:
    """Plays back scripted Claude turns and records every request."""

    def __init__(self, turns):
        self.turns = list(turns)
        self.requests = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self.stream))

    def stream(self, **params):
        # Copy the history: the agent keeps appending to the same list.
        self.requests.append({**params, 'messages': [dict(m) for m in params['messages']]})
        return FakeStream(self.turns.pop(0))

    async def close(self):
        pass


REPORT = '# Pizza diplomacy\n\nHello all.\n\n## 🎬 The cast\n- 🍕 **Dana** — Pizza minister: Talks pizza [#5].'


class AgentTests(unittest.TestCase):
    def run_analyze(self, turns, messages=None, cancelled=lambda: False):
        fake = FakeClient(turns)
        stages = []
        with patch.object(agent, 'client', lambda: fake):
            result = asyncio.run(agent.analyze(messages or chat(), {'language': 'English'},
                                               {'messages': 30, 'participants': [{'name': 'Dana'}]},
                                               lambda value, stage: stages.append((value, stage)), cancelled))
        return result, fake, stages

    def test_tool_loop_runs_tools_and_returns_report(self):
        turns = [
            SimpleNamespace(stop_reason='tool_use', content=[
                block('tool_use', id='t1', name='search_messages', input={'query': 'pizza', 'sender': '', 'limit': 3})]),
            SimpleNamespace(stop_reason='end_turn', content=[block('text', text='Notes first.\n' + REPORT)]),
        ]
        result, fake, stages = self.run_analyze(turns)
        self.assertTrue(result['markdown'].startswith('# Pizza diplomacy'))
        self.assertEqual(result['model'], agent.MODEL)
        first = fake.requests[0]
        self.assertEqual(first['model'], 'claude-opus-5-5')
        self.assertEqual(first['fallbacks'], 'default')
        self.assertEqual(first['tool_choice'], {'type': 'auto'})
        self.assertIn('[#1]', first['messages'][0]['content'][0]['text'])  # small chats go in verbatim
        tool_turn = fake.requests[1]['messages'][-1]['content'][0]
        self.assertEqual(tool_turn['tool_use_id'], 't1')
        self.assertIn('6 messages match; showing 3', tool_turn['content'])
        self.assertFalse(tool_turn['is_error'])
        self.assertTrue(any('Searching' in stage for _, stage in stages))

    def test_bad_tool_input_is_reported_to_claude(self):
        turns = [
            SimpleNamespace(stop_reason='tool_use', content=[
                block('tool_use', id='t1', name='person_profile', input={'name': 'Nobody'})]),
            SimpleNamespace(stop_reason='end_turn', content=[block('text', text=REPORT)]),
        ]
        _, fake, _ = self.run_analyze(turns)
        result = fake.requests[1]['messages'][-1]['content'][0]
        self.assertTrue(result['is_error'])
        self.assertIn('No participant is named', result['content'])

    def test_last_turn_forbids_tools(self):
        call = SimpleNamespace(stop_reason='tool_use', content=[
            block('tool_use', id='t', name='read_messages', input={'from_id': 1, 'count': 2})])
        turns = [call] * (agent.MAX_TURNS - 1) + [SimpleNamespace(stop_reason='end_turn', content=[block('text', text=REPORT)])]
        _, fake, _ = self.run_analyze(turns)
        self.assertEqual(len(fake.requests), agent.MAX_TURNS)
        self.assertEqual(fake.requests[-1]['tool_choice'], {'type': 'none'})
        self.assertIn('one turn left', fake.requests[-1]['messages'][-1]['content'][-1]['text'])

    def test_refusal_and_cancel(self):
        with self.assertRaisesRegex(RuntimeError, 'declined'):
            self.run_analyze([SimpleNamespace(stop_reason='refusal', content=[])])
        result, fake, _ = self.run_analyze([], cancelled=lambda: True)
        self.assertIsNone(result)
        self.assertEqual(fake.requests, [])

    def test_long_chats_get_a_sample_and_tools(self):
        long_chat = [{'id': i, 'timestamp': '', 'sender': 'A' if i % 2 else 'B', 'text': 'x' * 300} for i in range(1, 4001)]
        full, text = agent.overview(long_chat)
        self.assertFalse(full)
        self.assertIn('[#1]', text)
        self.assertIn('[#4000]', text)
        self.assertIn('messages not shown', text)
        self.assertLess(len(text.encode()), agent.SAMPLE_BYTES + 20000)

    def test_tools(self):
        tools = agent.ChatTools(chat())
        self.assertTrue(tools.read(29, 10).startswith('[#29]'))
        self.assertIn('No messages at or after', tools.read(99, 5))
        self.assertIn('2 messages match', tools.search('pizza', 'Omer', 10))
        profile = tools.person('Dana')
        self.assertIn('"messages": 10', profile)
        self.assertIn('[#3]', profile)
        self.assertIn('messages on 2025-03-02', tools.on_date('2025-03-02'))
        with self.assertRaises(ValueError):
            tools.on_date('March 2')

    def test_provider_choice(self):
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': '', 'BRANDON_PROVIDER': ''}):
            # Claude is the engine even without a key: no silent switch to Ollama.
            self.assertEqual(agent.provider(), 'claude')
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'k', 'BRANDON_PROVIDER': 'local'}):
            self.assertEqual(agent.provider(), 'local')

    def test_missing_key_is_a_clear_error(self):
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': '', 'ANTHROPIC_AUTH_TOKEN': ''}):
            with self.assertRaisesRegex(RuntimeError, 'no Anthropic API key'):
                asyncio.run(agent.analyze(chat(), {'language': 'English'}, {'messages': 30}, lambda *_: None, lambda: False))


if __name__ == '__main__':
    unittest.main()
