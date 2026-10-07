#!/usr/bin/env python3
"""
Lucid Core — Backend queue processor.
"""

import sys
import os
import json
import re
import time
import threading
from llm_client import send_message as llm_send
from devlog import DevLog, ErrorSentinel, LOG_FILE, INDEX_FILE, set_current_agent


# === Queue (Phase 4) ===

QUEUE_DIR = os.path.join(os.path.dirname(__file__), 'queue')
LEGACY_QUEUE_FILE = os.path.join(os.path.dirname(__file__), 'queue.json')


def _task_path(task_id):
    return os.path.join(QUEUE_DIR, f'{task_id}.json')


def write_task(task):
    """Write a single task atomically to queue/{id}.json.
    Write-to-temp then os.replace is atomic on the same filesystem, which
    prevents a reader from seeing a partially-written file."""
    os.makedirs(QUEUE_DIR, exist_ok=True)
    fp = _task_path(task['id'])
    tmp = fp + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(task, f)
    os.replace(tmp, fp)


def read_task(task_id):
    fp = _task_path(task_id)
    if not os.path.exists(fp):
        return None
    try:
        with open(fp, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None


def list_queue():
    """Return all task records in queue/."""
    if not os.path.isdir(QUEUE_DIR):
        return []
    out = []
    for fn in sorted(os.listdir(QUEUE_DIR)):
        if not fn.endswith('.json'):
            continue
        try:
            with open(os.path.join(QUEUE_DIR, fn), 'r', encoding='utf-8') as f:
                out.append(json.load(f))
        except:
            pass
    return out


def delete_task(task_id):
    fp = _task_path(task_id)
    if os.path.exists(fp):
        try: os.remove(fp)
        except: pass


def finalize_task(task):
    """Remove a task file once it reaches a terminal state. Task outcomes are
    recorded in the log and, for failures, in context.jsonl as failed_ markers.
    The file itself does not need to persist, so we delete rather than update."""
    delete_task(task.get('id', ''))


def _has_response_after(msg_id, context_path):
    """Return True if a role='assistant' message appears after msg_id in
    context.jsonl. Used on restart to distinguish a task interrupted mid-flight
    (no response stored) from one that completed but whose task file was not
    updated before the app closed."""
    try:
        with open(context_path, 'r', encoding='utf-8') as f:
            lines = [l for l in f.read().split('\n') if l.strip()]
        found = False
        for line in lines:
            try:
                m = json.loads(line)
            except:
                continue
            if m.get('id') == msg_id:
                found = True
                continue
            if found and m.get('role') == 'assistant':
                return True
        return False
    except:
        return False


_running_agents = set()
_running_lock = threading.Lock()


def _run_task_worker(task):
    """Thread entry point for processing one task. Runs to completion
    independently of the main loop. The agent lock is released on exit so a
    subsequent pending task for the same agent can be picked up."""
    agent_id = task.get('agent_id')
    try:
        process_task(task)
    except Exception as e:
        DevLog.Error('QUEUE', f'Worker for {task.get("id", "?")} crashed: {e}')
        task['status'] = 'failed'
        task['error'] = str(e)
        write_task(task)
    finally:
        with _running_lock:
            _running_agents.discard(agent_id)
        # Only delete if the task reached a terminal state. If it was re-queued
        # or is still pending (which would mean a bug), leave the file alone.
        if task.get('status') in ('complete', 'failed', 'cancelled'):
            finalize_task(task)


def init_queue():
    """Ensure queue/ exists, remove legacy queue.json, and clear stale
    non-pending tasks from a previous run."""
    os.makedirs(QUEUE_DIR, exist_ok=True)
    if os.path.exists(LEGACY_QUEUE_FILE):
        try:
            os.remove(LEGACY_QUEUE_FILE)
            DevLog.Note('QUEUE', 'Removed legacy queue.json')
        except Exception as e:
            DevLog.Error('QUEUE', f'Could not remove legacy queue.json: {e}')
    removed = 0
    agents_dir = os.path.join(os.path.dirname(__file__), 'agents')
    for fn in os.listdir(QUEUE_DIR):
        if not fn.endswith('.json'):
            continue
        fp = os.path.join(QUEUE_DIR, fn)
        try:
            with open(fp, 'r', encoding='utf-8') as f:
                t = json.load(f)
        except:
            try: os.remove(fp)
            except: pass
            removed += 1
            continue
        status = t.get('status')
        if status in ('pending', 'processing'):
            # Task from the previous session never finished. No frontend poll
            # is running for it, so its response cannot be displayed. If no
            # assistant message follows the user message in context.jsonl,
            # mark it failed so the user sees the retry button on next load.
            msg_id = t.get('msg_id')
            agent_id = t.get('agent_id')
            if msg_id and agent_id:
                cp = os.path.join(agents_dir, agent_id, 'context.jsonl')
                if os.path.exists(cp) and not _has_response_after(msg_id, cp):
                    mark_user_message_failed(agent_id, msg_id, 'app closed before task completed', None)
        try: os.remove(fp)
        except: pass
        removed += 1
    DevLog.Note('QUEUE', f'Queue initialised ({removed} stale task(s) removed)')

def append_response_to_context(agent_id, response_content, reasoning=None, stillpoint=False, tool_calls=None, tool_summary=None, tool_record=None, parse_errors=None, retained_file=None):
    """Append an assistant response to the agent's context file.
    If reasoning is provided, write it to agents/{id}/reasoning/{msg_id}.txt.
    Reasoning is never included in context — it is display-only.
    For Ephemera, write to a dedicated response file instead.
    """
    import time as time_mod
    msg_id = f'msg_{int(time_mod.time() * 1000)}'

    # Ephemera: write to ephemera.json last.assistant directly
    if agent_id == '__ephemera__':
        ephemera_path = os.path.join(os.path.dirname(__file__), 'ephemera.json')
        try:
            with open(ephemera_path, 'r') as f:
                data = json.load(f)
        except:
            data = {'model': '', 'temperature': 0.7, 'last': None}
        assistant_msg = {
            'id': msg_id,
            'role': 'assistant',
            'content': response_content,
            'timestamp': time_mod.strftime('%Y-%m-%d %H:%M:%S'),
            'agent_id': agent_id
        }
        if not data.get('last'):
            data['last'] = {}
        data['last']['assistant'] = assistant_msg
        with open(ephemera_path, 'w') as f:
            json.dump(data, f, indent=2)
        DevLog.Note('QUEUE', f'Ephemera response stored ({len(response_content)} chars)')
        return

    agents_dir = os.path.join(os.path.dirname(__file__), 'agents')
    context_path = os.path.join(agents_dir, agent_id, 'context.jsonl')
    index_path = os.path.join(agents_dir, agent_id, 'context_index.json')

    if not os.path.exists(context_path):
        DevLog.Error('QUEUE', f'Context file not found for agent {agent_id}')
        return

    msg_id = f'msg_{int(time_mod.time() * 1000)}'
    tool_log_id = f'tl_{int(time_mod.time() * 1000)}' if tool_calls else None
    msg = {
        'id': msg_id,
        'role': 'assistant',
        'content': response_content,
        'timestamp': time_mod.strftime('%Y-%m-%d %H:%M:%S'),
        'agent_id': agent_id
    }
    if stillpoint:
        msg['stillpoint'] = True
    if tool_summary:
        msg['tool_calls'] = tool_summary
    if tool_log_id:
        msg['tool_log_id'] = tool_log_id
    if tool_record:
        msg['tool_record'] = tool_record
    if parse_errors:
        msg['parse_errors'] = parse_errors
    if retained_file:
        msg['retained_file'] = retained_file

    # Write reasoning block if present — never sent to API
    # Written BEFORE context so frontend can read it when the message appears
    if reasoning and reasoning.strip():
        reasoning_path = os.path.join(agents_dir, agent_id, 'reasoning.jsonl')
        entry = {'msg_id': msg_id, 'reasoning': reasoning.strip()}
        with open(reasoning_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry) + '\n')
        DevLog.Note('QUEUE', f'Reasoning block saved for {msg_id} ({len(reasoning)} chars)')

    # Append to context
    with open(context_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(msg) + '\n')

    # Update index
    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            idx = json.load(f)
        idx['active'].append(msg_id)
        with open(index_path, 'w') as f:
            json.dump(idx, f)

    # Write tool log entry if tool calls were made this turn
    if tool_calls:
        tool_log_path = os.path.join(agents_dir, agent_id, 'tool_log.jsonl')
        log_entries = []
        for tc in tool_calls:
            entry = {
                'tool': tc['tool'],
                'arguments': tc['args'],
                'status': tc['result'].get('status', 'unknown'),
            }
            if tc['result'].get('status') == 'ok':
                entry['content'] = tc['result'].get('content', '')
            else:
                entry['error'] = tc['result'].get('error', '')
            if tc.get('repairs'):
                entry['repairs'] = tc['repairs']
            log_entries.append(entry)
        tool_log = {
            'tool_log_id': tool_log_id,
            'timestamp': time_mod.strftime('%Y-%m-%d %H:%M:%S'),
            'tool_calls': log_entries,
        }
        with open(tool_log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(tool_log) + '\n')
        DevLog.Note('QUEUE', f'Tool log entry {tool_log_id} appended ({len(log_entries)} call(s))')
        return tool_log_id
    return None

def mark_user_message_failed(agent_id, msg_id, source, error=None):
    """Write a failed marker for a user message. Mirrors the shape the frontend
    writes when its timeout paths fire. Under Stage B, the backend is the
    primary author of these markers; the frontend writes its own only when the
    failure is frontend-detected (timeouts, cancel). Idempotent: returns True
    (without writing) if the marker already exists."""
    agents_dir = os.path.join(os.path.dirname(__file__), 'agents')
    context_path = os.path.join(agents_dir, agent_id, 'context.jsonl')
    index_path = os.path.join(agents_dir, agent_id, 'context_index.json')
    if not os.path.exists(context_path) or not os.path.exists(index_path):
        return False
    try:
        with open(context_path, 'r', encoding='utf-8') as f:
            lines = [l for l in f.read().split('\n') if l.strip()]
        original = None
        for line in lines:
            try:
                m = json.loads(line)
                if m.get('id') == msg_id:
                    original = m
                    break
            except:
                pass
        if not original:
            return False
        failed_id = 'failed_' + msg_id
        # Idempotent: if a marker already exists, do nothing
        for line in lines:
            try:
                m = json.loads(line)
                if m.get('id') == failed_id:
                    return True
            except:
                pass
        failed_msg = dict(original)
        failed_msg['id'] = failed_id
        failed_msg['failed'] = True
        failed_msg['fail_source'] = source
        if error:
            failed_msg['fail_error'] = error
        with open(context_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(failed_msg) + '\n')
        with open(index_path, 'r') as f:
            idx = json.load(f)
        idx['active'] = [i for i in idx['active'] if i != msg_id]
        idx['active'].append(failed_id)
        with open(index_path, 'w') as f:
            json.dump(idx, f)
        DevLog.Note('QUEUE', 'Marked user message ' + msg_id + ' as failed (' + source + ')')
        return True
    except Exception as e:
        DevLog.Error('QUEUE', 'mark_user_message_failed crashed: ' + str(e))
        return False


def _supersede_retained_file(agent_id, path):
    """Find any earlier message with a retained_file entry for this path and
    null out its contents, marking it superseded. Rewrites context.jsonl
    atomically (read-modify-write to a temp file, then rename). This is the
    only operation that edits context.jsonl in place; every other write is
    an append. Called before the current turn's message is appended, so the
    file is in a consistent state when the append follows."""
    agents_dir = os.path.join(os.path.dirname(__file__), 'agents')
    cp = os.path.join(agents_dir, agent_id, 'context.jsonl')
    if not os.path.exists(cp):
        return False
    try:
        with open(cp, 'r', encoding='utf-8') as f:
            lines = f.read().split('\n')
        modified = False
        out = []
        for line in lines:
            if not line.strip():
                out.append(line)
                continue
            try:
                m = json.loads(line)
            except:
                out.append(line)
                continue
            rf = m.get('retained_file')
            if rf and rf.get('path') == path and rf.get('contents'):
                rf = dict(rf)
                rf['contents'] = None
                rf['superseded_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
                m['retained_file'] = rf
                out.append(json.dumps(m))
                modified = True
            else:
                out.append(line)
        if modified:
            tmp = cp + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write('\n'.join(out))
            os.replace(tmp, cp)
        return modified
    except Exception as e:
        DevLog.Error('QUEUE', 'Failed to supersede retained file ' + path + ': ' + str(e))
        return False


def process_task(task):
    """Process a single task: send to DeepSeek, store response."""
    agent_id = task.get('agent_id')
    content = task.get('content')
    task_id = task.get('id', 'unknown')
    glimpse = task.get('glimpse', False)
    stillpoint = task.get('stillpoint', False)
    ephemeral_msg_id = task.get('ephemeral_msg_id')

    # Check for cancellation before processing
    streaming_dir = os.path.join(os.path.dirname(__file__), 'streaming')
    cancel_path = os.path.join(streaming_dir, f'cancel_{task_id}.txt')
    if os.path.exists(cancel_path):
        try: os.remove(cancel_path)
        except: pass
        task['status'] = 'cancelled'
        _msg_id = task.get('msg_id')
        if _msg_id:
            mark_user_message_failed(agent_id, _msg_id, 'user cancelled before processing', None)
        write_task(task)
        DevLog.Note('QUEUE', f'Task {task_id} cancelled before processing')
        return task

    mode = 'glimpse' if glimpse else ('stillpoint' if stillpoint else 'normal')
    # Log lines carry the agent's display name, not the directory id, for
    # legibility. Falls back to the id if meta.json is missing.
    display_name = agent_id
    try:
        _meta_path = os.path.join(os.path.dirname(__file__), 'agents', agent_id, 'meta.json')
        if os.path.exists(_meta_path):
            with open(_meta_path, 'r', encoding='utf-8') as _mf:
                display_name = json.load(_mf).get('name', agent_id)
    except Exception:
        pass
    set_current_agent(display_name)
    DevLog.Note('QUEUE', f'Processing task {task_id}: agent={agent_id}, mode={mode}, message={content[:80]}...')

    agents_dir = os.path.join(os.path.dirname(__file__), 'agents')
    context_path = os.path.join(agents_dir, agent_id, 'context.jsonl')
    index_path = os.path.join(agents_dir, agent_id, 'context_index.json')
    import time as time_mod

    result = llm_send(agent_id, user_message=None if glimpse else (content if (stillpoint or agent_id == '__ephemera__') else None), glimpse=False, task_id=task_id)

    # Cancellation during generation is reported by send_message via the
    # cancelled flag; the cancel file was already removed inside send_message.
    if result.get('cancelled'):
        task['status'] = 'cancelled'
        _msg_id = task.get('msg_id')
        if _msg_id:
            mark_user_message_failed(agent_id, _msg_id, 'user cancelled during generation', None)
        write_task(task)
        DevLog.Note('QUEUE', f'Task {task_id} cancelled during generation')
        return task

    if 'error' in result:
        DevLog.Error('QUEUE', f'Task {task_id} failed: {result["error"]}')
        task['status'] = 'failed'
        task['error'] = result['error']
        msg_id = task.get('msg_id')
        if msg_id:
            mark_user_message_failed(agent_id, msg_id, 'backend: task failed', result['error'])
    else:
        response_content = result['content']
        reasoning = result.get('reasoning', '')
        tool_calls = result.get('tool_calls', [])
        tool_call_records = result.get('tool_call_records', [])
        # Build tool_calls summary for storage
        tool_summary = [{'tool': tc['tool'], 'status': tc['result'].get('status', 'ok')} for tc in tool_calls]

        if response_content.strip() or tool_summary:
            # Legacy cleanup: strip any Lucid-internal markers the agent may have
            # imitated from older stored entries. New entries do not contain these
            # markers (see tool_record handling below), but existing context in
            # agents may still have them for a while as older turns phase out.
            def _sanitize(s):
                return s.replace('<<<TOOL_RECORD>>>', '').replace('<<<END_TOOL_RECORD>>>', '')
            response_content = _sanitize(response_content)
            response_content = re.sub(r'^\s*\[[\w, ]+completed\]\s*\n?', '', response_content)
            visible_tools = [tc for tc in tool_summary if tc['tool'] != 'get_tool_manifest']
            placeholder = ('[' + ', '.join(tc['tool'] for tc in visible_tools) + ' completed]') if visible_tools else ''
            # Store raw tool calls in a separate metadata field. They are
            # reconstructed into the API payload by build_context, but never
            # appear in the user-facing content. This prevents the agent from
            # treating the record wrapper as part of its own output format.
            tool_record = ''
            if tool_call_records:
                tool_record = '\n---\n'.join(_sanitize(r) for r in tool_call_records)
            # Extract parse-error diagnostics for persistent storage. The full
            # error message names the specific mistake (tag, position, context)
            # so the agent can recognise the pattern in future turns. Framed as
            # a correction, not a reproduced attempt, so no attractor risk.
            parse_errors = [
                {'tool': tc['tool'], 'error': tc['result'].get('error', '')}
                for tc in (tool_calls or [])
                if tc['tool'] == 'parse_error' and tc['result'].get('error')
            ]
            # Extract retain_file / refresh_file results. At most one retained
            # file is attached per message; if the agent retained multiple
            # files in one turn, only the last successful one is stored.
            retained_file_info = None
            for tc in (tool_calls or []):
                if tc['tool'] not in ('retain_file', 'refresh_file'):
                    continue
                if tc['result'].get('status') != 'ok':
                    continue
                rpath = tc['args'].get('path', '')
                rcontent = tc['result'].get('content', '')
                if not rpath or not rcontent:
                    continue
                if tc['tool'] == 'refresh_file':
                    _supersede_retained_file(agent_id, rpath)
                retained_file_info = {
                    'path': rpath,
                    'contents': rcontent,
                    'retained_at': time_mod.strftime('%Y-%m-%d %H:%M:%S'),
                }
            if placeholder:
                stored_content = placeholder + ('\n' + response_content.strip() if response_content.strip() else '')
            else:
                stored_content = response_content.strip()
            append_response_to_context(agent_id, stored_content, reasoning=reasoning, stillpoint=stillpoint, tool_calls=tool_calls, tool_summary=tool_summary if tool_summary else None, tool_record=tool_record if tool_record else None, parse_errors=parse_errors if parse_errors else None, retained_file=retained_file_info if retained_file_info else None)
            # Clear the ephemeral marker on the user message that carried attachments.
            # After this, the message is rendered with the reference block instead of
            # the inlined file content, keeping the persisted payload small.
            if ephemeral_msg_id:
                _idx_path = os.path.join(agents_dir, agent_id, 'context_index.json')
                try:
                    with open(_idx_path, 'r') as _f:
                        _idx = json.load(_f)
                    if _idx.get('ephemeral_attachments') and ephemeral_msg_id in _idx['ephemeral_attachments']:
                        _idx['ephemeral_attachments'] = [i for i in _idx['ephemeral_attachments'] if i != ephemeral_msg_id]
                        with open(_idx_path, 'w') as _f:
                            json.dump(_idx, _f)
                        DevLog.Note('QUEUE', 'Cleared ephemeral attachment marker for ' + ephemeral_msg_id)
                except Exception as _e:
                    DevLog.Error('QUEUE', 'Failed to clear ephemeral marker: ' + str(_e))
            # For glimpse: swap fullMsg out of active, put stub in
            if glimpse:
                import json as _json
                index_path_g = os.path.join(agents_dir, agent_id, 'context_index.json')
                if os.path.exists(index_path_g):
                    with open(index_path_g, 'r') as _f:
                        idx = _json.load(_f)
                    # Find the full message ID (glimpse without _stub suffix)
                    # It was the last glimpse entry added before the stub
                    full_ids = [i for i in idx.get('display_only', []) if not i.endswith('_stub')]
                    if full_ids:
                        latest_full_id = full_ids[-1]
                        stub_id = f'{latest_full_id}_stub'
                        idx['active'] = [i for i in idx['active'] if i != latest_full_id]
                        idx['active'].append(stub_id)
                        with open(index_path_g, 'w') as _f:
                            _json.dump(idx, _f)
                        DevLog.Note('QUEUE', f'Glimpse index swap: {latest_full_id} -> {stub_id}')
            DevLog.Note('QUEUE', f'Task {task_id} complete: {"glimpse " if glimpse else ""}response stored ({len(response_content)} chars)')
        else:
            DevLog.Note('QUEUE', f'Task {task_id} complete: empty response, not stored')
        task['status'] = 'complete'
        task['response'] = response_content[:200] + ('...' if len(response_content) > 200 else '')

    write_task(task)
    return task


# === Manifest cache ===

def regen_manifest_cache():
    """Write manifest_cache.json with both variants of the system instructions
    manifest. Called at startup, and by main.js after the MCP config is saved.
    The token estimator reads this file to determine the size of the manifest
    that will actually be injected for a given agent."""
    from mcp_executor import generate_manifest
    cache_path = os.path.join(os.path.dirname(__file__), 'manifest_cache.json')
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump({
            'enabled':  generate_manifest(True),
            'disabled': generate_manifest(False),
        }, f)


# === Startup ===

if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == 'regen-manifest':
        regen_manifest_cache()
        print('manifest_cache.json regenerated')
        sys.exit(0)
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    os.makedirs(os.path.join(os.path.dirname(__file__), 'incoming'), exist_ok=True)
    os.makedirs(os.path.join(os.path.dirname(__file__), 'approvals'), exist_ok=True)

    # Clear log on startup
    with open(LOG_FILE, 'w') as f:
        f.write(f'=== RUN {time.strftime("%H:%M:%S")} ===\n')

    ErrorSentinel.install()

    DevLog.Section('CORE')
    DevLog.Log('CORE', 'Lucid Core starting')
    DevLog.Assert('CORE', 'Python version', sys.version.split()[0], sys.version.split()[0])
    DevLog.Note('CORE', 'Log active')
    DevLog.Note('CORE', 'Queue active')

    init_queue()
    DevLog.Note('QUEUE', 'Queue initialised, watching for tasks')

    # Write manifest cache for token estimator (both enabled and disabled variants)
    regen_manifest_cache()
    DevLog.Note('CORE', 'Manifest cache written')

    DevLog.Note('CORE', 'Startup complete — core is running')
    DevLog.Toc()

    print('Lucid Core started. Processing queue...')
    print(f'Log: {LOG_FILE}')
    print(f'Queue dir: {QUEUE_DIR}')

    # Main loop: watch queue and process tasks
    try:
        while True:
            # Absorb incoming task files from Electron
            incoming_dir = os.path.join(os.path.dirname(__file__), 'incoming')
            if os.path.exists(incoming_dir):
                for filename in sorted(os.listdir(incoming_dir)):
                    if filename.endswith('.json'):
                        filepath = os.path.join(incoming_dir, filename)
                        try:
                            with open(filepath, 'r', encoding='utf-8') as f:
                                task = json.load(f)
                            write_task(task)
                            os.remove(filepath)
                            DevLog.Note('QUEUE', f'Absorbed incoming task: {task.get("id", "?")}')
                        except Exception as e:
                            DevLog.Error('QUEUE', f'Failed to absorb incoming task {filename}: {e}')
                            # Move the file aside so it is not retried on every loop iteration.
                            # The task is unrecoverable in this state, but the evidence is preserved.
                            try:
                                failed_path = filepath + '.failed'
                                if os.path.exists(failed_path):
                                    os.remove(failed_path)
                                os.rename(filepath, failed_path)
                                DevLog.Note('QUEUE', f'Moved failed task file aside: {filename}')
                            except Exception as mv_err:
                                DevLog.Error('QUEUE', f'Could not move failed task file aside: {mv_err}')
            
            tasks = list_queue()
            pending = [t for t in tasks if t.get('status') == 'pending']

            if pending:
                DevLog.Note('QUEUE', f'Found {len(pending)} pending task(s)')
                for task in pending:
                    agent_id = task.get('agent_id')
                    with _running_lock:
                        if agent_id in _running_agents:
                            continue
                        _running_agents.add(agent_id)
                    task['status'] = 'processing'
                    write_task(task)
                    t = threading.Thread(target=_run_task_worker, args=(task,), daemon=True, name=f'task-{task.get("id", "?")}')
                    t.start()
                DevLog.Note('QUEUE', f'Dispatched {len(pending)} task(s) to workers')

            time.sleep(2)  # Poll every 2 seconds
    except KeyboardInterrupt:
        DevLog.Note('CORE', 'Shutdown requested')
        DevLog.Toc()
        print('Core stopped.')
