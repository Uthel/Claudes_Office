#!/usr/bin/env python3
"""
Proto-Hearth Core — Backend server for the Hearth.
Phase 0: Tinlog foundation.
Phase 1: API shell with status endpoint.
Phase 4: Task queue processing with DeepSeek API integration.
"""

import sys
import os
import json
import time
from deepseek_client import send_message as deepseek_send

# === Tinlog (Phase 0) ===

LOG_FILE = os.path.join(os.path.dirname(__file__), 'logs', 'dev_log.txt')
INDEX_FILE = os.path.join(os.path.dirname(__file__), 'logs', 'tinlog_index.txt')

class DevLog:
    """Structured logging for LLM-readable diagnostics."""
    _sections = []
    _current_section = None

    @classmethod
    def _write(cls, line):
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')

    @classmethod
    def Section(cls, name):
        if name not in cls._sections:
            cls._sections.append(name)
            cls._write(f'=== [{name}] ===')
        cls._current_section = name

    @classmethod
    def Log(cls, system, label, value=None):
        msg = f'[{system}] {label}'
        if value is not None:
            msg += f': {value}'
        cls._write(msg)

    @classmethod
    def Assert(cls, system, label, value, expected):
        passed = value == expected
        marker = '✓' if passed else '✗ FAIL'
        cls._write(f'[{system}] {label}: {value} (expected {expected}) {marker}')

    @classmethod
    def Note(cls, system, message):
        cls._write(f'[{system}] {message}')

    @classmethod
    def Error(cls, system, message):
        cls._write(f'[{system}] ✗ ERROR: {message}')

    @classmethod
    def Toc(cls):
        with open(INDEX_FILE, 'w', encoding='utf-8') as f:
            for section in cls._sections:
                f.write(f'  - {section}\n')


class TinlogErrorSentinel:
    """Captures unhandled Python exceptions and routes them to Tinlog."""
    _installed = False

    @classmethod
    def install(cls):
        if cls._installed:
            return
        sys.excepthook = cls._handle_exception
        cls._installed = True
        DevLog.Section('SENTINEL')
        DevLog.Note('SENTINEL', 'TinlogErrorSentinel installed — monitoring runtime errors ✓')

    @classmethod
    def _handle_exception(cls, exc_type, exc_value, exc_tb):
        DevLog.Error('SENTINEL', f'{exc_type.__name__}: {exc_value}')
        sys.__excepthook__(exc_type, exc_value, exc_tb)


# === Queue (Phase 4) ===

QUEUE_FILE = os.path.join(os.path.dirname(__file__), 'queue.json')

def init_queue():
    if not os.path.exists(QUEUE_FILE):
        with open(QUEUE_FILE, 'w') as f:
            json.dump([], f)
        DevLog.Note('QUEUE', 'Queue file initialised')

def read_queue():
    """Read all tasks from the queue file."""
    if not os.path.exists(QUEUE_FILE):
        return []
    with open(QUEUE_FILE, 'r') as f:
        try:
            return json.load(f)
        except:
            return []

def write_queue(tasks):
    """Write tasks to the queue file."""
    with open(QUEUE_FILE, 'w') as f:
        json.dump(tasks, f)

def append_response_to_context(agent_id, response_content):
    """Append an assistant response to the agent's context file."""
    import time as time_mod
    agents_dir = os.path.join(os.path.dirname(__file__), 'agents')
    context_path = os.path.join(agents_dir, agent_id, 'context.jsonl')
    index_path = os.path.join(agents_dir, agent_id, 'context_index.json')

    if not os.path.exists(context_path):
        DevLog.Error('QUEUE', f'Context file not found for agent {agent_id}')
        return

    msg = {
        'id': f'msg_{int(time_mod.time() * 1000)}',
        'role': 'assistant',
        'content': response_content,
        'timestamp': time_mod.strftime('%Y-%m-%d %H:%M:%S'),
        'agent_id': agent_id
    }

    # Append to context
    with open(context_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(msg) + '\n')

    # Update index
    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            idx = json.load(f)
        idx['active'].append(msg['id'])
        with open(index_path, 'w') as f:
            json.dump(idx, f)

def process_task(task):
    """Process a single task: send to DeepSeek, store response."""
    agent_id = task.get('agent_id')
    content = task.get('content')
    task_id = task.get('id', 'unknown')
    glimpse = task.get('glimpse', False)

    mode = 'glimpse' if glimpse else 'normal'
    DevLog.Note('QUEUE', f'Processing task {task_id}: agent={agent_id}, mode={mode}, message={content[:80]}...')

    result = deepseek_send(agent_id, user_message=content if glimpse else None, glimpse=glimpse)

    if 'error' in result:
        DevLog.Error('QUEUE', f'Task {task_id} failed: {result["error"]}')
        task['status'] = 'failed'
        task['error'] = result['error']
    else:
        response_content = result['content']
        if glimpse:
            DevLog.Note('QUEUE', f'Task {task_id} complete: glimpse response ({len(response_content)} chars) — not saved to context')
        else:
            append_response_to_context(agent_id, response_content)
            DevLog.Note('QUEUE', f'Task {task_id} complete: response stored ({len(response_content)} chars)')
        task['status'] = 'complete'
        task['response'] = response_content[:200] + ('...' if len(response_content) > 200 else '')

    return task


# === Startup ===

if __name__ == '__main__':
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

    # Clear log on startup
    with open(LOG_FILE, 'w') as f:
        f.write(f'=== RUN {time.strftime("%H:%M:%S")} ===\n')

    TinlogErrorSentinel.install()

    DevLog.Section('CORE')
    DevLog.Log('CORE', 'Proto-Hearth Core starting')
    DevLog.Assert('CORE', 'Python version', sys.version.split()[0], sys.version.split()[0])
    DevLog.Note('CORE', 'Phase 0 (Tinlog) active')
    DevLog.Note('CORE', 'Phase 1 (shell) active')
    DevLog.Note('CORE', 'Phase 4 (queue + API) active')

    init_queue()
    DevLog.Note('QUEUE', 'Queue initialised, watching for tasks')

    DevLog.Note('CORE', 'Startup complete — core is running')
    DevLog.Toc()

    print('Proto-Hearth Core started. Processing queue...')
    print(f'Log: {LOG_FILE}')
    print(f'Queue: {QUEUE_FILE}')

    # Main loop: watch queue and process tasks
    try:
        while True:
            tasks = read_queue()
            pending = [t for t in tasks if t.get('status') == 'pending']

            if pending:
                DevLog.Note('QUEUE', f'Found {len(pending)} pending task(s)')
                for task in pending:
                    try:
                        task = process_task(task)
                    except Exception as e:
                        DevLog.Error('QUEUE', f'Task {task.get("id", "?")} crashed: {e}')
                        task['status'] = 'failed'
                        task['error'] = str(e)
                write_queue(tasks)
                DevLog.Note('QUEUE', f'Queue processed, {len(pending)} task(s) complete')

            time.sleep(2)  # Poll every 2 seconds
    except KeyboardInterrupt:
        DevLog.Note('CORE', 'Shutdown requested')
        DevLog.Toc()
        print('Core stopped.')
