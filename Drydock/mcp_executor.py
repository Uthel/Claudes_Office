#!/usr/bin/env python3
"""
mcp_executor.py — Filesystem MCP tool executor for Lucid.

Implements all 15 filesystem tools and enforces permission policy
from mcp_config.json before executing any tool call.

Permission levels:
  allow — execute immediately, return result
  ask   — caller must obtain approval before calling execute()
  block — always refuse, return error result

Tool call format (from LLM):
  {
    "name": "read_file",
    "arguments": { "path": "..." }
  }

Result format returned to caller:
  {
    "tool": "read_file",
    "status": "ok" | "blocked" | "error",
    "content": "...",        # on ok
    "error": "...",          # on blocked/error
    "needs_approval": True   # only when permission == "ask"
  }
"""

import os
import json
import shutil
import re
import threading
from pathlib import Path
from datetime import datetime

# ── Config ───────────────────────────────────────────────────────────────────

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'mcp_config.json')

_config_cache = None
_config_mtime = 0

def load_config():
    global _config_cache, _config_mtime
    if not os.path.exists(CONFIG_PATH):
        return {}
    try:
        mtime = os.path.getmtime(CONFIG_PATH)
        if _config_cache is not None and mtime == _config_mtime:
            return _config_cache
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            _config_cache = json.load(f)
        _config_mtime = mtime
        return _config_cache
    except Exception:
        return {}

def get_filesystem_config():
    cfg = load_config()
    return cfg.get('filesystem', {})

def get_allowed_directories():
    cfg = get_filesystem_config()
    return [os.path.normpath(d) for d in cfg.get('allowed_directories', []) if d.strip()]

def get_permission(tool_name):
    # retain_file and refresh_file are always-ask. The config cannot override
    # this: a single unapproved retain commits the user to a permanent context
    # expansion, and an agent that learns to call it freely will accumulate
    # copies of files (and their bugs) faster than the user can notice.
    if tool_name in ('retain_file', 'refresh_file'):
        return 'ask'
    cfg = get_filesystem_config()
    perms = cfg.get('permissions', {})
    defaults = {
        'read_file': 'allow', 'read_text_file': 'allow',
        'read_multiple_files': 'allow', 'list_directory': 'allow',
        'list_directory_with_sizes': 'allow', 'directory_tree': 'allow',
        'search_surrounding': 'allow', 'get_file_info': 'allow',
        'list_allowed_directories': 'allow', 'get_tool_manifest': 'allow',
        'edit_file': 'ask', 'write_file': 'ask',
        'create_file': 'ask', 'create_directory': 'ask',
        'delete_file': 'block', 'move_file': 'block',
    }
    return perms.get(tool_name, defaults.get(tool_name, 'block'))

def is_filesystem_enabled():
    return get_filesystem_config().get('enabled', False)

# ── Path safety ───────────────────────────────────────────────────────────────

def is_path_allowed(path_str):
    """Check that the resolved path is within an allowed directory."""
    allowed = get_allowed_directories()
    if not allowed:
        return False
    try:
        target = os.path.normpath(os.path.abspath(path_str))
        return any(
            target == allowed_dir or target.startswith(allowed_dir + os.sep)
            for allowed_dir in allowed
        )
    except Exception:
        return False

def require_allowed(path_str):
    """Returns (resolved_path, error_string_or_None).
    If a relative path is given, tries to resolve it against each allowed
    directory before falling back to abspath.
    """
    if not os.path.isabs(path_str):
        for allowed_dir in get_allowed_directories():
            candidate = os.path.normpath(os.path.join(allowed_dir, path_str))
            if os.path.exists(candidate) and is_path_allowed(candidate):
                return candidate, None
        # Not found in allowed dirs — fall through to standard check which will fail
    if not is_path_allowed(path_str):
        return None, f"Access denied: '{path_str}' is outside allowed directories."
    return os.path.normpath(os.path.abspath(path_str)), None

# ── Result helpers ────────────────────────────────────────────────────────────

# Per-path locks. Concurrent agents writing the same file would otherwise
# interleave: two in-memory read-modify-write cycles can pass validation
# against the same pre-write content, and the second writer silently drops
# the first writer's changes. The lock serializes mutating file operations
# on the same resolved path; different paths remain concurrent.
_path_locks = {}
_path_locks_registry = threading.Lock()


def _path_lock(path):
    with _path_locks_registry:
        lock = _path_locks.setdefault(path, threading.RLock())
    return lock


def ok(tool, content):
    return {'tool': tool, 'status': 'ok', 'content': str(content)}

def err(tool, message):
    return {'tool': tool, 'status': 'error', 'error': message}

def blocked(tool):
    return {'tool': tool, 'status': 'blocked', 'error': f"Tool '{tool}' is blocked by permission policy."}

def needs_approval(tool, arguments):
    return {'tool': tool, 'status': 'needs_approval', 'arguments': arguments,
            'message': f"Agent requested '{tool}' — approve or deny."}

# ── Permission gate ───────────────────────────────────────────────────────────

def check_permission(tool_name, arguments):
    """
    Returns None if execution should proceed,
    or a result dict if it should be short-circuited.
    Callers check needs_approval and surface to user before calling execute().
    """
    if not is_filesystem_enabled():
        return err(tool_name, "Filesystem MCP is not enabled.")
    perm = get_permission(tool_name)
    if perm == 'block':
        return blocked(tool_name)
    if perm == 'ask':
        return needs_approval(tool_name, arguments)
    return None  # allow — proceed

# ── Tool implementations ──────────────────────────────────────────────────────

def _read_file(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('read_file', e)
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            return ok('read_file', f.read())
    except Exception as ex:
        return err('read_file', str(ex))

def _read_text_file(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('read_text_file', e)
    head = args.get('head')
    tail = args.get('tail')
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
        if head is not None:
            lines = lines[:int(head)]
        elif tail is not None:
            lines = lines[-int(tail):]
        return ok('read_text_file', ''.join(lines))
    except Exception as ex:
        return err('read_text_file', str(ex))

def _read_multiple_files(args):
    paths = args.get('paths', [])
    results = []
    for p in paths:
        resolved, e = require_allowed(p)
        if e:
            results.append(f"=== {p} ===\nERROR: {e}\n")
            continue
        try:
            with open(resolved, 'r', encoding='utf-8', errors='replace') as f:
                results.append(f"=== {p} ===\n{f.read()}\n")
        except Exception as ex:
            results.append(f"=== {p} ===\nERROR: {ex}\n")
    return ok('read_multiple_files', '\n'.join(results))

def _list_directory(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('list_directory', e)
    try:
        entries = sorted(os.listdir(path))
        lines = []
        for entry in entries:
            full = os.path.join(path, entry)
            tag = '[DIR] ' if os.path.isdir(full) else '[FILE]'
            lines.append(f"{tag} {entry}")
        return ok('list_directory', '\n'.join(lines))
    except Exception as ex:
        return err('list_directory', str(ex))

def _list_directory_with_sizes(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('list_directory_with_sizes', e)
    try:
        entries = sorted(os.listdir(path))
        lines = []
        for entry in entries:
            full = os.path.join(path, entry)
            if os.path.isdir(full):
                lines.append(f"[DIR]  {entry}")
            else:
                size = os.path.getsize(full)
                lines.append(f"[FILE] {entry} ({size:,} bytes)")
        return ok('list_directory_with_sizes', '\n'.join(lines))
    except Exception as ex:
        return err('list_directory_with_sizes', str(ex))

def _directory_tree(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('directory_tree', e)
    max_depth = int(args.get('max_depth', 3))
    lines = []
    def walk(current, prefix, depth):
        if depth > max_depth:
            return
        try:
            entries = sorted(os.listdir(current))
        except PermissionError:
            return
        for i, entry in enumerate(entries):
            if entry.startswith('.'):
                continue
            full = os.path.join(current, entry)
            connector = '└── ' if i == len(entries) - 1 else '├── '
            lines.append(f"{prefix}{connector}{entry}")
            if os.path.isdir(full):
                extension = '    ' if i == len(entries) - 1 else '│   '
                walk(full, prefix + extension, depth + 1)
    lines.append(os.path.basename(path) or path)
    walk(path, '', 1)
    return ok('directory_tree', '\n'.join(lines))

def _search_surrounding(args):
    """Keyword search with context lines. Supports single-query and multi-query forms."""
    path, e = require_allowed(args.get('path', ''))
    if e: return err('search_surrounding', e)
    context_lines = int(args.get('context_lines', 3))
    single_q = args.get('query')
    multi_q = args.get('queries')
    if single_q is not None and multi_q is not None:
        return err('search_surrounding', '[Automated system message] search_surrounding: supply either <query> or <queries>, not both.')
    if single_q is None and multi_q is None:
        return err('search_surrounding', '[Automated system message] search_surrounding: no query supplied. Provide a <query> tag or a <queries> block containing one or more <query> children.')
    if single_q is not None:
        if not single_q.strip():
            return err('search_surrounding', '[Automated system message] search_surrounding: <query> cannot be empty.')
        queries = [single_q]
        is_multi = False
    else:
        queries = multi_q if isinstance(multi_q, list) else [multi_q]
        for i, q in enumerate(queries, start=1):
            if not q.strip():
                return err('search_surrounding', '[Automated system message] search_surrounding: query ' + str(i) + ' in <queries> is empty.')
        is_multi = True
    def run_query(query):
        results = []
        def search_file(fpath):
            try:
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                    all_lines = f.readlines()
                for i, line in enumerate(all_lines):
                    if query.lower() in line.lower():
                        start = max(0, i - context_lines)
                        end = min(len(all_lines), i + context_lines + 1)
                        block = ''.join(
                            ('>>>' if j == i else '   ') + ' ' + str(j+1) + ': ' + all_lines[j]
                            for j in range(start, end)
                        )
                        results.append('--- ' + fpath + ' ---\n' + block)
            except Exception:
                pass
        try:
            if os.path.isfile(path):
                search_file(path)
            else:
                for root, dirs, files in os.walk(path):
                    dirs[:] = [d for d in dirs if not d.startswith('.')]
                    for fname in files:
                        fpath = os.path.join(root, fname)
                        if is_path_allowed(fpath):
                            search_file(fpath)
        except Exception:
            pass
        if not results:
            return 'No matches found for ' + query + ' in ' + path
        return '\n\n'.join(results)
    if not is_multi:
        return ok('search_surrounding', run_query(queries[0]))
    blocks = []
    for i, q in enumerate(queries, start=1):
        blocks.append('=== Query ' + str(i) + ': ' + q + ' ===\n' + run_query(q))
    return ok('search_surrounding', '\n\n'.join(blocks))

def _get_file_info(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('get_file_info', e)
    try:
        stat = os.stat(path)
        info = {
            'path': path,
            'size_bytes': stat.st_size,
            'is_directory': os.path.isdir(path),
            'is_file': os.path.isfile(path),
            'modified': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
            'created': datetime.fromtimestamp(stat.st_ctime).strftime('%Y-%m-%d %H:%M:%S'),
        }
        return ok('get_file_info', json.dumps(info, indent=2))
    except Exception as ex:
        return err('get_file_info', str(ex))

def _list_allowed_directories(args):
    allowed = get_allowed_directories()
    if not allowed:
        return ok('list_allowed_directories', '(no directories configured)')
    return ok('list_allowed_directories', '\n'.join(allowed))

def _edit_file(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('edit_file', e)
    edits = args.get('edits', [])
    with _path_lock(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            failures = []
            for i, edit in enumerate(edits, start=1):
                old = edit.get('oldText', '')
                new = edit.get('newText', None)
                if not old:
                    failures.append(f'item {i}: oldText is empty')
                    continue
                if new is None:
                    failures.append(f'item {i}: newText is missing (supply an empty <newText> tag to delete content)')
                    continue
                if old not in content:
                    failures.append(f'item {i}: oldText not found verbatim')
                    continue
                content = content.replace(old, new, 1)
            if failures:
                return err('edit_file', '[Automated system message] edit_file failed - the following items could not be applied: ' + '; '.join(failures) + '. No edits were written to the file. Use search_surrounding to locate the correct oldText for each failed item, then resubmit the full batch.')
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            return ok('edit_file', f"Applied {len(edits)} edit(s) to {path}")
        except Exception as ex:
            return err('edit_file', str(ex))

def _write_file(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('write_file', e)
    content = args.get('content', '')
    with _path_lock(path):
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            return ok('write_file', f"Written {len(content)} chars to {path}")
        except Exception as ex:
            return err('write_file', str(ex))

def _create_file(args):
    # Alias for write_file — creates new, errors if exists
    path, e = require_allowed(args.get('path', ''))
    if e: return err('create_file', e)
    if os.path.exists(path):
        return err('create_file', f"File already exists: {path}")
    return _write_file(args)

def _create_directory(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('create_directory', e)
    try:
        os.makedirs(path, exist_ok=True)
        return ok('create_directory', f"Directory created: {path}")
    except Exception as ex:
        return err('create_directory', str(ex))

def _delete_file(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('delete_file', e)
    try:
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
        return ok('delete_file', f"Deleted: {path}")
    except Exception as ex:
        return err('delete_file', str(ex))

def _move_file(args):
    src, e = require_allowed(args.get('source', ''))
    if e: return err('move_file', e)
    dst, e = require_allowed(args.get('destination', ''))
    if e: return err('move_file', e)
    try:
        shutil.move(src, dst)
        return ok('move_file', f"Moved: {src} → {dst}")
    except Exception as ex:
        return err('move_file', str(ex))


# ── Retain / refresh ──────────────────────────────────────────────────────────

_RETAIN_SIZE_LIMIT = 1024 * 1024  # 1 MiB


def _read_whole_file(path):
    """Read a file in full for retain/refresh. Returns (content, None) on
    success or (None, error_string) on failure. Shared between the two tools
    since they perform the same read; only the storage step in process_task
    distinguishes them."""
    try:
        size = os.path.getsize(path)
        if size > _RETAIN_SIZE_LIMIT:
            return None, 'File too large to retain (' + format(size, ',') + ' bytes; limit is 1 MiB). Retain is intended for reference material, not large data files.'
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            return f.read(), None
    except Exception as ex:
        return None, str(ex)


def _retain_file(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('retain_file', e)
    content, e2 = _read_whole_file(path)
    if e2: return err('retain_file', e2)
    return ok('retain_file', content)


def _refresh_file(args):
    path, e = require_allowed(args.get('path', ''))
    if e: return err('refresh_file', e)
    content, e2 = _read_whole_file(path)
    if e2: return err('refresh_file', e2)
    return ok('refresh_file', content)


# ── Tool categories (authoritative, independent of permission settings) ──────

READ_ONLY_TOOLS = {
    'read_file', 'read_text_file', 'read_multiple_files',
    'list_directory', 'list_directory_with_sizes', 'directory_tree',
    'search_surrounding', 'get_file_info', 'list_allowed_directories',
    'retain_file', 'refresh_file',
}

WRITE_TOOLS = {
    'edit_file', 'write_file', 'create_file', 'create_directory',
    'delete_file', 'move_file',
}

# ── Dispatch table ────────────────────────────────────────────────────────────

def _get_tool_manifest_tool(args):
    """Returns the full tool manifest. Call this before your first tool operation."""
    manifest = get_tool_manifest()
    return ok('get_tool_manifest', manifest)

TOOLS = {
    'read_file':                 _read_file,
    'read_text_file':            _read_text_file,
    'read_multiple_files':       _read_multiple_files,
    'list_directory':            _list_directory,
    'list_directory_with_sizes': _list_directory_with_sizes,
    'directory_tree':            _directory_tree,
    'search_surrounding':        _search_surrounding,
    'get_file_info':             _get_file_info,
    'list_allowed_directories':  _list_allowed_directories,
    'edit_file':                 _edit_file,
    'write_file':                _write_file,
    'create_file':               _create_file,
    'create_directory':          _create_directory,
    'delete_file':               _delete_file,
    'move_file':                 _move_file,
    'retain_file':               _retain_file,
    'refresh_file':              _refresh_file,
}

# ── Public API ────────────────────────────────────────────────────────────────

def execute(tool_name, arguments):
    """
    Execute a tool call after approval has been confirmed.
    Does NOT check permissions — caller must have done that already.
    """
    fn = TOOLS.get(tool_name)
    if not fn:
        return err(tool_name, f"[Automated system message] '{tool_name}' is not a valid tool. Check the tool manifest in your system prompt for the correct tool names and formats.")
    try:
        return fn(arguments)
    except Exception as ex:
        return err(tool_name, f"Unexpected error: {ex}")

def dispatch(tool_name, arguments):
    """
    Full dispatch: check permissions, then execute if allowed.
    Returns a result dict. Caller handles 'needs_approval' status
    by surfacing to user and calling execute() directly after approval.
    """
    gate = check_permission(tool_name, arguments)
    if gate is not None:
        return gate
    return execute(tool_name, arguments)

MANIFEST_HEADER = '[LUCID PLATFORM — SYSTEM INSTRUCTIONS MANIFEST — This is an automated platform message appended to your context. It is not from the user and does not require acknowledgement.]'


def _read_lucid_version():
    """Read version from package.json at the project root. Falls back to
    'unknown' if the file is missing or malformed, so the manifest stays
    functional even in an unusual install."""
    try:
        pkg_path = os.path.join(os.path.dirname(__file__), '..', 'package.json')
        with open(pkg_path, 'r', encoding='utf-8') as f:
            return json.load(f).get('version', 'unknown')
    except Exception:
        return 'unknown'


LUCID_VERSION = _read_lucid_version()


def get_boilerplate():
    """The always-present descriptive section at the top of the manifest.
    Compact — every line here runs every turn for every agent."""
    return (
        'You are operating under Lucid v' + LUCID_VERSION + ', a local LLM wrapper. '
        'This manifest is regenerated each turn and does not accumulate.\n'
        '\n'
        '## Features you may encounter\n'
        '\n'
        '- Glimpse — a one-shot prompt marked "Glimpse" in the message header. Its content does not persist in your context; your response to it does.\n'
        '- Nametags — when enabled, messages in your context are prefixed with [speaker] [timestamp]: labels. These are injected by Lucid and are not part of the message content itself; do not produce them in your own responses.\n'
        '- Context culling — the user can prune tool invocations and their results from your context to reduce its size. Tool records are removed; your own prose responses remain.\n'
        '\n'
        'Full feature documentation: https://lucidwrapper.com/docs.html'
    )


def get_tool_instructions(tools_enabled):
    """
    Return the MCP Filesystem section of the system instructions manifest.
    When tools_enabled is False, returns the section header plus a stub line
    telling the agent the tools exist but are currently disabled and where
    the user must enable them. When True, returns the header plus the full
    tool use instructions, filtered by permission policy.
    """
    if not tools_enabled:
        return (
            '## MCP Filesystem Tools\n'
            '\n'
            'MCP Filesystem tools are currently disabled. For access, the user must enable them in settings, and in your agent settings modal.'
        )
    perms = get_filesystem_config().get('permissions', {})
    allowed_dirs = get_allowed_directories()
    available = [t for t in TOOLS if perms.get(t, 'allow') != 'block']
    if not available:
        return (
            '## MCP Filesystem Tools\n'
            '\n'
            'MCP Filesystem tools are currently disabled. For access, the user must enable them in settings, and in your agent settings modal.'
        )

    lines = [
        '## MCP Filesystem Tools',
        f'Allowed directories: {", ".join(allowed_dirs) if allowed_dirs else "(none)"}',
        '',
        'The following filesystem tools are available. Use them proactively to complete tasks that involve reading, writing, or searching files.',
        '',
        'Tool call format — wrap every tool call in a <lucid> block:',
        '<lucid>',
        '  <tool_name>',
        '    <argument_name>value</argument_name>',
        '  </tool_name>',
        '</lucid>',
        '',
        'Example — search_surrounding:',
        '<lucid>',
        '  <search_surrounding>',
        '    <path>D:\\\\Echo\'s House\\\\project\\\\file.js</path>',
        '    <query>functionName</query>',
        '    <context_lines>5</context_lines>',
        '  </search_surrounding>',
        '</lucid>',
        '',
        'Example — edit_file with edits array:',
        '<lucid>',
        '  <edit_file>',
        '    <path>D:\\\\Echo\'s House\\\\project\\\\file.js</path>',
        '    <edits>',
        '      <item>',
        '        <oldText>exact text to replace</oldText>',
        '        <newText>replacement text</newText>',
        '      </item>',
        '    </edits>',
        '  </edit_file>',
        '</lucid>',
        '',
        'IMPORTANT: This is the ONLY valid format. The tool name is the tag directly inside <lucid>. Arguments are child tags of the tool name tag. Both <lucid> and </lucid> must be present.',
        '',
        'Do not narrate intent before acting. When a tool call is needed, output the <lucid> block immediately — no "let me check" or "I will now" phrasing.',
        '',
        'When a task requires multiple tool calls, complete all steps autonomously. Only write a prose response when the full task is done. Never include prose within a tool call turn — your summary should be in a separate turn following the tool call(s).',
        '',
        'For different tools, or when one result is needed before the next call, use separate turns. You may include multiple <lucid> blocks in a single response only when they all call the same tool and each targets a different file.',
        '',
        'Batching: Every tool turn sends the entire conversation context to the API, so batching multiple calls into one turn is far more efficient than spreading them across several turns. When making multiple edits to the same file, submit them as a single edit_file call with multiple <item> entries — the batch is atomic (all succeed or none are written), and if any item fails the error names each failed item by index. When making edits to different files, submit one <lucid> block per file in the same response. When searching for multiple terms in the same file, submit them as a single search_surrounding call with a <queries> block. Only fall back to separate turns when the calls use different tools, or when the result of one call is needed to construct the next.',
        '',
        'Always use full absolute paths. Use list_allowed_directories if unsure of the base path.',
        '',
        'Edit workflow: Do not call search_surrounding pre-emptively before an edit_file. Attempt the edit first with your best guess at oldText drawn from context. If it returns an oldText mismatch, the error message will tell you exactly what to do — use search_surrounding to locate the exact text, then resubmit the edit. An oldText mismatch is not a failure state — it is the intended signal to look at the file.',
        '',
        'Parse error recovery: If a tool call fails to parse, do not attempt to repair the malformed block. Discard it and write a complete new tool call from scratch, following the format examples above exactly. The error message names the specific problem — fix that in the fresh call.',
        '',
        'Auto-repair notices: When a malformed tool call is corrected automatically during parsing, the repair is recorded in the tool log and is visible to the user. Do not mention repairs in your response — the user can see them in the tool log if they wish to.',
        '',
        'Reading policy: Do not use read_file to read entire files. Use search_surrounding or read_text_file (with head or tail) for targeted reads. Only use read_file when the user has explicitly instructed you to read the complete file.',
        '',
        'Available tools:',
    ]
    descriptions = {
        'read_file':                 'Read entire file. AVOID unless the user explicitly instructs you to read the complete file — use search_surrounding or read_text_file (with head/tail) for targeted reads instead. Args: path',
        'read_text_file':            'Read file with optional head/tail line count. Args: path, head?, tail?',
        'read_multiple_files':       'Read several files at once. Args: paths (array)',
        'list_directory':            'List directory contents. Args: path',
        'list_directory_with_sizes': 'List directory with file sizes. Args: path',
        'directory_tree':            'Recursive directory tree. Args: path, max_depth? (default 3)',
        'search_surrounding':        'Search for one or more keywords within a file or directory, returning matching lines with surrounding context. Single query: <query>term</query>. Multiple queries: <queries><query>term1</query><query>term2</query></queries> — each query is labeled by index in the results. Args: path, query or queries, context_lines? (default 3)',
        'get_file_info':             'Get file metadata. Args: path',
        'list_allowed_directories':  'List directories this tool can access. Args: (none)',
        'edit_file':                 'Edit one file by replacing exact text. oldText must be non-empty and exist verbatim in the file. Each edit_file call targets a single file; to edit multiple files in one turn, use one <lucid> block per file. Use multiple <item> entries in <edits> to batch several edits to the same file in one call — the batch is atomic, so if any item fails, none are written and the error names each failed item by index. Attempt the edit with your best guess at oldText drawn from context before doing any read. If it fails with an oldText mismatch, use search_surrounding to locate the exact text, then resubmit. To prepend content, use the current first line as oldText and include your new content before it in newText. To append content, use the current last line as oldText and include your new content after it in newText. NEVER submit edit_file with an empty oldText — this will always fail. Args: path, edits — see the edit_file example above for structure.',
        'write_file':                'Write or overwrite a file. Args: path, content',
        'create_file':               'Create a new file (errors if exists). Args: path, content',
        'create_directory':          'Create a directory. Args: path',
        'delete_file':               'Delete a file or directory. Args: path',
        'move_file':                 'Move or rename. Args: source, destination',
        'retain_file':               'Load a file\u2019s complete contents into your context, persistent across turns. Requires user approval. Use sparingly \u2014 retained contents accumulate and can only be removed by culling. Intended for reference material you will consult repeatedly. Args: path',
        'refresh_file':              'Replace an existing retained copy with the current disk contents. Same permission and cost as retain_file. If no retained copy exists for this path, behaves identically to retain_file. Use when a retained file has changed on disk. Args: path',
    }
    for tool in available:
        lines.append(f'- {tool}: {descriptions.get(tool, "")}')
    return '\n'.join(lines)


def generate_manifest(tools_enabled):
    """
    Assemble the complete system instructions manifest injected into the
    agent's context each turn. Composed of the platform header, the boilerplate
    (Lucid version and feature descriptions), the Attachments section, and the
    MCP Filesystem section (full instructions or stub depending on enable state).
    """
    from attachments import get_attachments_instructions as _get_attach
    parts = [MANIFEST_HEADER, get_boilerplate(), _get_attach(), get_tool_instructions(tools_enabled)]
    return '\n\n'.join(p for p in parts if p)


def get_tool_manifest():
    """
    Deprecated. Retained for backward compatibility with the token estimator
    cache write in main.py. New code should call generate_manifest().
    """
    return generate_manifest(is_filesystem_enabled())


if __name__ == '__main__':
    # Quick smoke test
    import sys
    print('mcp_executor loaded.')
    print(f'Filesystem enabled: {is_filesystem_enabled()}')
    print(f'Allowed dirs: {get_allowed_directories()}')
    print(f'Manifest:\n{get_tool_manifest()}')
