#!/usr/bin/env python3
"""
Lucid LLM client.
Platform-agnostic: routes to the correct provider based on model prefix.
Handles context assembly and message generation.
"""

import os
import json
import time
import codecs
import requests
from mcp_executor import dispatch as mcp_dispatch, execute as mcp_execute, get_tool_manifest, is_filesystem_enabled, get_permission, READ_ONLY_TOOLS, WRITE_TOOLS
from attachments import execute as attachment_execute, TOOLS as ATTACHMENT_TOOLS

# === Provider endpoints ===

PROVIDERS = {
    "openrouter": {
        "url": "https://openrouter.ai/api/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "openrouter_api_key",
        "key_env": "OPENROUTER_API_KEY",
    },
    "anthropic": {
        "url": "https://api.anthropic.com/v1/messages",
        "auth": "x-api-key",
        "key_config": "anthropic_api_key",
        "key_env": "ANTHROPIC_API_KEY",
    },
    "openai": {
        "url": "https://api.openai.com/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "openai_api_key",
        "key_env": "OPENAI_API_KEY",
    },
    "openai_direct": {
        "url": "https://api.openai.com/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "openai_api_key",
        "key_env": "OPENAI_API_KEY",
        "strip_prefix": "openai-direct/",
    },
    "xai": {
        "url": "https://api.x.ai/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "xai_api_key",
        "key_env": "XAI_API_KEY",
        "strip_prefix": "xai/",
    },
    "mistral_direct": {
        "url": "https://api.mistral.ai/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "mistral_api_key",
        "key_env": "MISTRAL_API_KEY",
        "strip_prefix": "mistral-direct/",
    },
    "cohere": {
        "url": "https://api.cohere.com/compatibility/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "cohere_api_key",
        "key_env": "COHERE_API_KEY",
        "strip_prefix": "cohere/",
    },
    "together": {
        "url": "https://api.together.xyz/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "together_api_key",
        "key_env": "TOGETHER_API_KEY",
        "strip_prefix": "together/",
    },
    "deepseek_direct": {
        "url": "https://api.deepseek.com/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "deepseek_api_key",
        "key_env": "DEEPSEEK_API_KEY",
        "strip_prefix": "deepseek-direct/",
    },
    "groq": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "groq_api_key",
        "key_env": "GROQ_API_KEY",
        "strip_prefix": "groq/",
    },
    "local": {
        "url": "",  # populated at runtime from config local_base_url
        "auth": "Bearer",
        "key_config": "",
        "key_env": "",
        "strip_prefix": "local/",
    },
    "kimi": {
        "url": "https://api.moonshot.ai/v1/chat/completions",
        "auth": "Bearer",
        "key_config": "kimi_api_key",
        "key_env": "MOONSHOT_API_KEY",
        "strip_prefix": "kimi/",
    },
    "gemini": {
        "url": "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse",
        "auth": "x-goog-api-key",
        "key_config": "gemini_api_key",
        "key_env": "GEMINI_API_KEY",
        "strip_prefix": "gemini/",
    },
}

# Model prefix -> provider routing.
# Explicit prefixes (openai-direct/, xai/, etc.) always route to their direct provider.
# Bare prefixes (openai/, mistral/, etc.) route to OpenRouter if key available,
# otherwise fall through to direct provider if that key is available.
PREFIX_ROUTING = {
    "anthropic/":      "anthropic",
    "openai-direct/":  "openai_direct",
    "xai/":            "xai",
    "mistral-direct/": "mistral_direct",
    "deepseek-direct/":"deepseek_direct",
    "groq/":           "groq",
    "local/":          "local",
    "cohere/":          "cohere",
    "together/":        "together",
    "gemini/":          "gemini",
    "kimi/":            "kimi",
    # These route to OpenRouter by default; resolve_provider handles fallback
    "openai/":         "openrouter",
    "deepseek/":       "openrouter",
    "google/":         "openrouter",
    "meta-llama/":     "openrouter",
    "meta/":           "openrouter",
    "mistralai/":      "openrouter",
    "mistral/":        "openrouter",
    "qwen/":           "openrouter",
}

STREAMING_DIR = os.path.join(os.path.dirname(__file__), 'streaming')

# === Per-provider dispatch sequencer ===
# API rate limits apply per key. Agents on different keys can dispatch freely;
# agents on the same key must be staggered to avoid tripping the safeguard.
# The lock is held only during the wait-and-stamp; the HTTP call itself runs
# outside the lock so multiple in-flight requests are possible.
import threading as _threading
_dispatch_locks = {}
_dispatch_times = {}
_dispatch_registry_lock = _threading.Lock()
DISPATCH_INTERVAL = 2.0


def wait_for_dispatch_slot(provider_name):
    """Block until this provider has been quiet for DISPATCH_INTERVAL seconds,
    then stamp the dispatch time. Called immediately before requests.post."""
    with _dispatch_registry_lock:
        lock = _dispatch_locks.setdefault(provider_name, _threading.Lock())
    with lock:
        now = time.time()
        earliest = _dispatch_times.get(provider_name, 0) + DISPATCH_INTERVAL
        if now < earliest:
            time.sleep(earliest - now)
        _dispatch_times[provider_name] = time.time()


# === Config loading ===

_config_cache = None

def load_config():
    global _config_cache
    if _config_cache is not None:
        return _config_cache
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                _config_cache = json.load(f)
                return _config_cache
        except:
            pass
    _config_cache = {}
    return _config_cache

def get_api_key(provider_name):
    """Get API key for a provider from config or environment."""
    if provider_name == 'local':
        return 'local'  # no key needed; return non-empty sentinel
    provider = PROVIDERS.get(provider_name)
    if not provider:
        return ""
    config = load_config()
    key = config.get(provider["key_config"], "")
    if key:
        return key
    return os.environ.get(provider["key_env"], "")

def get_local_base_url():
    """Read the local LLM base URL from config. Defaults to Ollama default."""
    return load_config().get('local_base_url', 'http://localhost:11434').rstrip('/')

def invalidate_config_cache():
    """Call this after config.json is updated."""
    global _config_cache
    _config_cache = None

def get_user_name():
    """Read the user's display name from config. Defaults to 'User'."""
    return load_config().get('user_name', 'User')


# === Model/provider resolution ===

def resolve_provider(model):
    """
    Determine which provider to use for a given model string.
    Returns (provider_name, model_string).
    """
    for prefix, provider_name in PREFIX_ROUTING.items():
        if model.startswith(prefix):
            return provider_name, model
    # No prefix match — default to OpenRouter, pass model as-is
    return "openrouter", model

EPHEMERA_ID = '__ephemera__'

def get_agent_model(agent_id):
    """Read the agent's model preference from meta.json."""
    if agent_id == EPHEMERA_ID:
        ephemera_path = os.path.join(os.path.dirname(__file__), 'ephemera.json')
        if os.path.exists(ephemera_path):
            try:
                with open(ephemera_path, 'r') as f:
                    return json.load(f).get('model', 'deepseek/deepseek-v4-flash')
            except: pass
        return 'deepseek/deepseek-v4-flash'
    meta_path = os.path.join(os.path.dirname(__file__), 'agents', agent_id, 'meta.json')
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r') as f:
                meta = json.load(f)
                model = meta.get('model', 'deepseek/deepseek-v4-flash')
                # Normalise bare deepseek model names from legacy config
                if not '/' in model:
                    model = f"deepseek/{model}"
                return model
        except:
            pass
    return "deepseek/deepseek-v4-flash"

def get_agent_temperature(agent_id):
    if agent_id == EPHEMERA_ID:
        ephemera_path = os.path.join(os.path.dirname(__file__), 'ephemera.json')
        if os.path.exists(ephemera_path):
            try:
                with open(ephemera_path, 'r') as f:
                    return json.load(f).get('temperature', 0.7)
            except: pass
        return 0.7
    meta_path = os.path.join(os.path.dirname(__file__), 'agents', agent_id, 'meta.json')
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r') as f:
                return json.load(f).get('temperature', 0.7)
        except:
            pass
    return 0.7


def get_agent_reasoning(agent_id):
    """Read the agent's reasoning config from meta.json (or ephemera.json for Ephemera).
    Returns a dict with 'enabled' and 'effort' keys, or None if not set.
    """
    if agent_id == EPHEMERA_ID:
        ephemera_path = os.path.join(os.path.dirname(__file__), 'ephemera.json')
        if os.path.exists(ephemera_path):
            try:
                with open(ephemera_path, 'r') as f:
                    return json.load(f).get('reasoning', None)
            except:
                pass
        return None
    meta_path = os.path.join(os.path.dirname(__file__), 'agents', agent_id, 'meta.json')
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r') as f:
                return json.load(f).get('reasoning', None)
        except:
            pass
    return None


def _log_note(tag, msg):
    """Route to the shared DevLog writer. Was previously a direct file write;
    now uses devlog so log writes share a single lock with main.py. The tag is
    passed through DevLog.Note, which applies the agent suffix if the current
    thread has declared an agent via set_current_agent().
    """
    from devlog import DevLog
    DevLog.Note(tag, msg)


AGENTS_DIR = os.path.join(os.path.dirname(__file__), 'agents')

def get_agent_mcp_enabled(agent_id):
    """Return True if this agent has MCP filesystem tools enabled.
    Defaults to False — opt-in per agent.
    Ephemera never gets tools.
    """
    if agent_id == EPHEMERA_ID:
        return False
    meta_path = os.path.join(AGENTS_DIR, agent_id, 'meta.json')
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r') as f:
                return bool(json.load(f).get('mcp_enabled', False))
        except:
            pass
    return False


# === Context assembly ===

def build_context(agent_id, inject_message=None):
    """
    Read the agent's context and assemble the messages payload.
    If inject_message is provided, append it to the payload (glimpse mode).
    Nametags are prepended per user message when enabled in agent settings.
    """
    if agent_id == EPHEMERA_ID:
        # Ephemera: no history, no identity, no manifest — bare prompt only
        if inject_message:
            return [{'role': 'user', 'content': inject_message}]
        return []
    agents_dir = os.path.join(os.path.dirname(__file__), 'agents')
    agent_dir  = os.path.join(agents_dir, agent_id)
    identity_path = os.path.join(agent_dir, 'identity.md')
    context_path  = os.path.join(agent_dir, 'context.jsonl')
    index_path    = os.path.join(agent_dir, 'context_index.json')
    meta_path     = os.path.join(agent_dir, 'meta.json')

    agent_name   = agent_id
    use_nametags = False
    user_name    = get_user_name()
    if os.path.exists(meta_path):
        try:
            with open(meta_path, 'r') as f:
                meta = json.load(f)
                agent_name   = meta.get('name', agent_id)
                use_nametags = meta.get('nametags', False)
        except:
            pass

    messages = []

    # System prompt from identity anchor
    if os.path.exists(identity_path):
        with open(identity_path, 'r', encoding='utf-8') as f:
            identity = f.read().strip()
            if identity:
                messages.append({"role": "system", "content": identity})

    # Load active messages from context
    if os.path.exists(context_path) and os.path.exists(index_path):
        with open(index_path, 'r') as f:
            index = json.load(f)
        active_ids = set(index.get('active', []))
        ephemeral_attachment_ids = set(index.get('ephemeral_attachments', []))
        culled_record_ids = set(index.get('culled_records', []))
        with open(context_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    msg     = json.loads(line)
                    if msg.get('id') not in active_ids:
                        continue
                    # display_only messages are shown in the UI but never sent to API
                    if msg.get('display_only'):
                        continue
                    # Tool indicator messages are display-only — never sent to API
                    if msg.get('role') == 'tool':
                        continue
                    role    = msg.get('role', 'user')
                    content = msg.get('content', '')
                    system_note = msg.get('system_note', False)
                    tool_record = msg.get('tool_record', '')
                    parse_errors = msg.get('parse_errors', [])
                    retained_file = msg.get('retained_file')
                    # Culled records are excluded from the payload but the
                    # message itself (prose and placeholder) remains. The
                    # records stay on disk; only their presence in the
                    # reconstruction is skipped. Retained files are treated
                    # the same way: culled means the record-related payload
                    # content is gone, and the retained file is part of that.
                    if msg.get('id') in culled_record_ids:
                        tool_record = ''
                        parse_errors = []
                        retained_file = None
                    ts      = msg.get('timestamp', '')
                    # Reconstruct the tool record into the payload between the
                    # placeholder (first line of content) and the prose. The
                    # record is stored as a separate metadata field so it never
                    # appears in user-facing content, but the agent needs it
                    # in context for episodic memory of its own past calls.
                    if role == 'assistant' and (tool_record or parse_errors or retained_file):
                        insertion_parts = []
                        if parse_errors:
                            error_lines = '\n'.join('- ' + pe['error'] for pe in parse_errors)
                            insertion_parts.append('[Earlier parse errors in this turn:\n' + error_lines + ']')
                        if tool_record:
                            insertion_parts.append(tool_record)
                        if retained_file:
                            rf_path = retained_file.get('path', '?')
                            rf_contents = retained_file.get('contents')
                            if rf_contents:
                                insertion_parts.append('[Retained file: ' + rf_path + ']\n' + rf_contents + '\n[End of retained file]')
                            else:
                                insertion_parts.append('[Retained file: ' + rf_path + ' \u2014 superseded by a later refresh]')
                        insertion = '\n'.join(insertion_parts)
                        if '\n' in content:
                            first_line, rest = content.split('\n', 1)
                            content = first_line + '\n' + insertion + '\n' + rest
                        else:
                            content = content + '\n' + insertion
                    # Attachment handling: text attachments are inlined on the
                    # turn they were received (message id is in the ephemeral
                    # list), and referenced by filename on later turns. The
                    # ephemeral list lives in context_index.json so JSONL stays
                    # append-only; process_task clears the entry after the
                    # response is stored.
                    msg_attachments = msg.get('attachments', [])
                    if role == 'user' and msg_attachments:
                        att_dir = os.path.join(agents_dir, agent_id, 'attachments')
                        if msg.get('id') in ephemeral_attachment_ids:
                            text_blocks = []
                            image_blocks = []
                            for att in msg_attachments:
                                att_path = os.path.join(att_dir, att.get('filename', ''))
                                if not os.path.exists(att_path):
                                    text_blocks.append('--- attachment: ' + att.get('filename', '?') + ' (missing) ---')
                                    continue
                                if att.get('type') == 'image':
                                    try:
                                        with open(att_path, 'rb') as _af:
                                            raw = _af.read()
                                        import base64 as _b64
                                        ext = os.path.splitext(att_path)[1].lstrip('.').lower()
                                        mime = 'image/jpeg' if ext in ('jpg', 'jpeg') else 'image/' + ext
                                        data_url = 'data:' + mime + ';base64,' + _b64.b64encode(raw).decode('ascii')
                                        image_blocks.append({'type': 'image_url', 'image_url': {'url': data_url}})
                                    except Exception as _ie:
                                        text_blocks.append('--- attachment: ' + att.get('filename', '?') + ' (image read failed: ' + str(_ie) + ') ---')
                                else:
                                    try:
                                        with open(att_path, 'r', encoding='utf-8', errors='replace') as _af:
                                            att_content = _af.read()
                                        text_blocks.append('--- attachment: ' + att['filename'] + ' ---\n' + att_content + '\n--- end attachment ---')
                                    except Exception:
                                        text_blocks.append('--- attachment: ' + att['filename'] + ' (unreadable) ---')
                            if image_blocks:
                                # Multimodal message: content becomes a parts array. Order:
                                # text (message + inlined text attachments), then images.
                                text_part = content
                                if text_blocks:
                                    text_part = text_part + '\n\n' + '\n\n'.join(text_blocks)
                                content = [{'type': 'text', 'text': text_part}] + image_blocks
                            elif text_blocks:
                                content = content + '\n\n' + '\n\n'.join(text_blocks)
                        else:
                            names = ', '.join(a.get('filename', '?') for a in msg_attachments)
                            content = content + '\n\n[Attachments: ' + names + ' - use list_attachments / read_attachment to access]'
                    # Prepend nametags at payload assembly time — never stored on disk.
                    # If content is a multimodal parts array (image attachment),
                    # prepend the nametag to the first text part rather than to
                    # the array itself.
                    if use_nametags and not system_note:
                        if role == 'user':
                            _prefix = (f"[{user_name}] [{ts}]: " if ts else f"[{user_name}]: ")
                            if isinstance(content, list):
                                for _j, _part in enumerate(content):
                                    if _part.get('type') == 'text':
                                        content[_j] = {'type': 'text', 'text': _prefix + _part.get('text', '')}
                                        break
                            else:
                                content = _prefix + content
                        elif role == 'assistant':
                            content = f"[{agent_name}] [{ts}]: {content}" if ts else f"[{agent_name}]: {content}"
                    _entry = {"role": role, "content": content}
                    if system_note:
                        _entry['system_note'] = True
                    messages.append(_entry)
                except:
                    pass

    # Inject the system instructions manifest every turn. Composed of the
    # platform header (boilerplate) plus the MCP Filesystem section. When
    # MCP tools are enabled for this agent, the section contains the full
    # tool use instructions; otherwise it contains a stub informing the agent
    # that the tools exist but are disabled. Appended to the last user message
    # so it arrives immediately before generation, after all conversation
    # history — positional salience matters for imported agents whose context
    # contains many examples of other tool call formats.
    mcp_tools_enabled = is_filesystem_enabled() and get_agent_mcp_enabled(agent_id)
    from mcp_executor import generate_manifest as _gen_manifest
    manifest = _gen_manifest(mcp_tools_enabled)
    if manifest and messages:
        for i in range(len(messages) - 1, -1, -1):
            if messages[i]['role'] == 'user' and not messages[i].get('system_note'):
                messages[i] = dict(messages[i])
                _mc = messages[i]['content']
                _appended = f'\n\n---\n{manifest}'
                if isinstance(_mc, list):
                    # Multimodal content — append manifest text to the first text
                    # part, or add a new text part if none exists.
                    _mc = list(_mc)
                    _done = False
                    for _j, _part in enumerate(_mc):
                        if _part.get('type') == 'text':
                            _mc[_j] = {'type': 'text', 'text': _part.get('text', '') + _appended}
                            _done = True
                            break
                    if not _done:
                        _mc.append({'type': 'text', 'text': _appended.lstrip()})
                    messages[i]['content'] = _mc
                else:
                    messages[i]['content'] = _mc + _appended
                break

    # Glimpse injection
    if inject_message:
        content = inject_message
        if use_nametags:
            content = f"[{user_name}] [Glimpse]: {content}"
        messages.append({"role": "user", "content": content})

    return messages


# === Provider-specific request builders ===

def _build_openrouter_request(model, messages, temperature, stream):
    headers = {
        "Authorization": f"Bearer {get_api_key('openrouter')}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": stream,
    }
    return PROVIDERS["openrouter"]["url"], headers, payload

def _to_anthropic_content(parts):
    """Convert an OpenAI-style content parts array to Anthropic content blocks.
    Handles text and image_url (data URL) parts. Unknown parts are dropped."""
    out = []
    for part in parts:
        ptype = part.get('type')
        if ptype == 'text':
            out.append({'type': 'text', 'text': part.get('text', '')})
        elif ptype == 'image_url':
            url = (part.get('image_url') or {}).get('url', '')
            if url.startswith('data:'):
                try:
                    meta, b64 = url.split(',', 1)
                    mime = meta.split(';')[0].split(':', 1)[1]
                    out.append({'type': 'image', 'source': {'type': 'base64', 'media_type': mime, 'data': b64}})
                except Exception:
                    pass
    return out


def _to_gemini_parts(parts):
    """Convert an OpenAI-style content parts array to Gemini parts.
    Handles text and image_url (data URL) parts. Unknown parts are dropped."""
    out = []
    for part in parts:
        ptype = part.get('type')
        if ptype == 'text':
            out.append({'text': part.get('text', '')})
        elif ptype == 'image_url':
            url = (part.get('image_url') or {}).get('url', '')
            if url.startswith('data:'):
                try:
                    meta, b64 = url.split(',', 1)
                    mime = meta.split(';')[0].split(':', 1)[1]
                    out.append({'inline_data': {'mime_type': mime, 'data': b64}})
                except Exception:
                    pass
    return out


def _build_anthropic_request(model, messages, temperature, stream):
    """
    Anthropic uses a different API shape:
    - system prompt is a top-level field, not a message role
    - model string drops the 'anthropic/' prefix
    """
    system_content = ""
    filtered = []
    for msg in messages:
        if msg["role"] == "system":
            system_content = msg["content"]
        else:
            if isinstance(msg.get("content"), list):
                msg = dict(msg)
                msg["content"] = _to_anthropic_content(msg["content"])
            filtered.append(msg)

    # Strip provider prefix for direct Anthropic calls
    bare_model = model.replace("anthropic/", "")

    headers = {
        "x-api-key": get_api_key("anthropic"),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": bare_model,
        "messages": filtered,
        "max_tokens": 64000,  # Required by Anthropic API - set to their maximum
        "temperature": temperature,
        "stream": stream,
    }
    if system_content:
        payload["system"] = system_content

    return PROVIDERS["anthropic"]["url"], headers, payload

def _build_openai_request(model, messages, temperature, stream):
    bare_model = model.replace("openai/", "")
    headers = {
        "Authorization": f"Bearer {get_api_key('openai')}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": bare_model,
        "messages": messages,
        "temperature": temperature,
        "stream": stream,
    }
    return PROVIDERS["openai"]["url"], headers, payload


# === Response parsers ===

def _parse_openai_compatible_stream(response):
    """Parse SSE stream from OpenRouter/DeepSeek/OpenAI-compatible endpoints.
    Yields ('reasoning', token), ('content', token), or ('content_hidden', token) tuples.
    Uses an incremental UTF-8 decoder to handle multi-byte characters split
    across chunk boundaries (common with Cohere and some other providers).

    Tool call suppression:
    All tokens always reach the caller via yield so response_content stays complete.
    Tokens inside a ```lucid ... ``` block are yielded as 'content_hidden' so
    send_message can accumulate them for extract_tool_call without writing them
    to the stream file (and therefore never showing them in the UI).

    ```json blocks receive two-tier treatment:
    - Tokens are buffered as 'content_hidden' until the closing fence
    - If the block contains a tool_call/tool_calls key, it is treated as a tool call (suppressed)
    - If not, the buffered content is flushed back as visible tokens (rendered as a code block)

    The accumulated buffer tracks the full response so far to detect
    block open/close boundaries reliably across token boundaries.
    """
    decoder = codecs.getincrementaldecoder('utf-8')(errors='replace')
    buffer = ''
    in_lucid_block = False
    in_json_block  = False   # two-tier: buffer until close fence, then decide
    json_block_buffer = ''   # accumulates raw tokens inside ```json block
    accumulated = ''  # full response content so far, for boundary detection

    for chunk in response.iter_content(chunk_size=None):
        if not chunk:
            continue
        buffer += decoder.decode(chunk)
        while '\n' in buffer:
            line, buffer = buffer.split('\n', 1)
            line_stripped = line.strip()
            if not line_stripped:
                continue
            if line_stripped.startswith('data: '):
                data_str = line_stripped[6:]
                if data_str == '[DONE]':
                    return
                try:
                    data      = json.loads(data_str)
                    delta     = data.get('choices', [{}])[0].get('delta', {})
                    reasoning = delta.get('reasoning_content', '')
                    token     = delta.get('content', '')
                    if reasoning:
                        yield ('reasoning', reasoning)
                    if token:
                        prev = accumulated
                        accumulated += token

                        # --- lucid block ---
                        # Count-based detection handles multiple consecutive <lucid>
                        # blocks in a single response. A token is hidden if we were
                        # inside a block before it, end up inside after it, or the
                        # token itself contains an opening or closing tag. The
                        # previous boolean-flag approach could only flip on once
                        # per response, so a second block streamed as raw text.
                        if not in_json_block:
                            prev_inside = prev.count('<lucid>') > prev.count('</lucid>')
                            now_inside = accumulated.count('<lucid>') > accumulated.count('</lucid>')
                            token_has_tag = '<lucid>' in token or '</lucid>' in token
                            in_lucid_block = prev_inside or now_inside or token_has_tag

                        if in_lucid_block:
                            yield ('content_hidden', token)

                        # --- json block (two-tier) ---
                        elif not in_json_block and '```json' in accumulated and '```json' not in prev:
                            in_json_block = True
                            json_block_buffer = token
                            yield ('content_hidden', token)

                        elif in_json_block:
                            json_block_buffer += token
                            yield ('content_hidden', token)
                            # Detect closing fence
                            after_open = accumulated.find('```json')
                            tail = accumulated[after_open + len('```json'):]
                            if '\n```' in tail:
                                in_json_block = False
                                # Two-tier decision: is this a tool call?
                                is_tool_call = '"tool_call"' in json_block_buffer or '"tool_calls"' in json_block_buffer
                                if not is_tool_call:
                                    # Not a tool call — flush buffer back as visible content
                                    yield ('content_flush', json_block_buffer)
                                json_block_buffer = ''

                        else:
                            yield ('content', token)

                except Exception:
                    pass
    # Flush remaining bytes
    final = decoder.decode(b'', final=True)
    if final:
        buffer += final

def _build_gemini_request(model, messages, temperature, stream):
    """
    Gemini uses a completely different API shape:
    - system prompt is a top-level 'systemInstruction' field
    - roles are 'user' and 'model' (not 'assistant')
    - content is parts:[{text:...}] not a plain string
    - model goes in the URL, not the body
    - auth via x-goog-api-key header
    Thinking config differs by generation:
    - Gemini 2.x: thinkingBudget (integer tokens), includeThoughts
    - Gemini 3.x: thinking_level (minimal/low/medium/high), includeThoughts
    """
    bare_model = model.replace('gemini/', '')
    system_content = ''
    contents = []
    for msg in messages:
        if msg['role'] == 'system':
            system_content = msg['content']
        else:
            role = 'model' if msg['role'] == 'assistant' else 'user'
            if isinstance(msg.get('content'), list):
                contents.append({'role': role, 'parts': _to_gemini_parts(msg['content'])})
            else:
                contents.append({'role': role, 'parts': [{'text': msg['content']}]})

    url = PROVIDERS['gemini']['url'].replace('{model}', bare_model)
    headers = {
        'x-goog-api-key': get_api_key('gemini'),
        'Content-Type': 'application/json',
    }
    payload = {
        'contents': contents,
        'generationConfig': {'temperature': temperature},
    }
    if system_content:
        payload['systemInstruction'] = {'parts': [{'text': system_content}]}

    # Always request thoughts to be surfaced in the stream.
    # Use the correct param for the model generation.
    is_gemini3 = bare_model.startswith('gemini-3')
    if is_gemini3:
        payload['generationConfig']['thinkingConfig'] = {'includeThoughts': True}
    else:
        payload['generationConfig']['thinkingConfig'] = {'includeThoughts': True, 'thinkingBudget': 8192}

    return url, headers, payload


def _parse_gemini_stream(response):
    """Parse SSE stream from Gemini streamGenerateContent?alt=sse.
    Each data line is a GenerateContentResponse JSON object.
    Parts with 'thought: true' are reasoning; all others are content.
    Yields ('reasoning', token) or ('content', token) tuples.
    """
    for line in response.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: '):
                data_str = line[6:]
                if data_str.strip() == '[DONE]':
                    return
                try:
                    data = json.loads(data_str)
                    parts = (data.get('candidates') or [{}])[0].get('content', {}).get('parts', [])
                    for part in parts:
                        text = part.get('text', '')
                        if not text:
                            continue
                        if part.get('thought'):
                            yield ('reasoning', text)
                        else:
                            yield ('content', text)
                except:
                    pass


def _parse_anthropic_stream(response):
    """Parse SSE stream from Anthropic Messages API.
    Yields ('reasoning', token) or ('content', token) tuples.
    thinking blocks arrive as content_block_delta with delta.type == 'thinking_delta'.
    """
    for line in response.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: '):
                data_str = line[6:]
                try:
                    data = json.loads(data_str)
                    if data.get('type') == 'content_block_delta':
                        delta = data.get('delta', {})
                        delta_type = delta.get('type', '')
                        if delta_type == 'thinking_delta':
                            token = delta.get('thinking', '')
                            if token:
                                yield ('reasoning', token)
                        else:
                            token = delta.get('text', '')
                            if token:
                                yield ('content', token)
                except:
                    pass


# === Tool call detection ===

import re

def _repair_lucid_fence(content):
    """
    Attempt to repair an unclosed ```lucid fence.
    Returns (repaired_content, error_message).
    If repair succeeds, error_message is None.
    If repair fails, returns (None, native_json_error).
    """
    open_idx = content.find('```lucid')
    if open_idx == -1:
        return None, 'No lucid fence found'
    after_open = content[open_idx + len('```lucid'):].lstrip('\n')
    # Check if there's already a closing fence
    if '\n```' in after_open:
        return content, None  # already closed, no repair needed
    # Try to repair by closing unclosed braces
    json_candidate = after_open
    # Count unclosed braces and brackets
    depth_brace   = 0
    depth_bracket = 0
    in_string     = False
    escape_next   = False
    for ch in json_candidate:
        if escape_next:
            escape_next = False
            continue
        if ch == '\\':
            escape_next = True
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
            continue
        if not in_string:
            if ch == '{': depth_brace += 1
            elif ch == '}': depth_brace -= 1
            elif ch == '[': depth_bracket += 1
            elif ch == ']': depth_bracket -= 1
    # Close any unclosed structures
    repair = json_candidate
    if in_string:
        repair += '"'  # close unclosed string
    repair += ']' * max(0, depth_bracket)
    repair += '}' * max(0, depth_brace)
    # Try parsing
    try:
        json.loads(repair)
        repaired = content[:open_idx] + '```lucid\n' + repair + '\n```'
        return repaired, None
    except json.JSONDecodeError as e:
        return None, str(e)


def strip_lucid_fence(content):
    """Remove <lucid>...</lucid> blocks from content. Returns cleaned content.
    Only complete blocks are removed — orphaned tags in prose are left intact,
    since prose mentions are not tool-call attempts (see send_message's
    detection logic) and stripping them hides legitimate user-visible text."""
    return re.sub(r'<lucid>.*?</lucid>', '', content, flags=re.DOTALL).strip()


# Schema for the <lucid> tool call format
LUCID_SCHEMA = {
    'edit_file':                 {'kind': 'container', 'children': {'path': (1, 1), 'edits': (1, 1)}},
    'read_file':                 {'kind': 'container', 'children': {'path': (1, 1)}},
    'read_text_file':            {'kind': 'container', 'children': {'path': (1, 1), 'head': (0, 1), 'tail': (0, 1)}},
    'list_directory':            {'kind': 'container', 'children': {'path': (1, 1)}},
    'list_directory_with_sizes': {'kind': 'container', 'children': {'path': (1, 1)}},
    'directory_tree':            {'kind': 'container', 'children': {'path': (1, 1), 'max_depth': (0, 1)}},
    'search_surrounding':        {'kind': 'container', 'children': {'path': (1, 1), 'query': (0, 1), 'queries': (0, 1), 'context_lines': (0, 1)}},
    'get_file_info':             {'kind': 'container', 'children': {'path': (1, 1)}},
    'list_allowed_directories':  {'kind': 'container', 'children': {}},
    'write_file':                {'kind': 'container', 'children': {'path': (1, 1), 'content': (1, 1)}},
    'create_file':               {'kind': 'container', 'children': {'path': (1, 1), 'content': (1, 1)}},
    'create_directory':          {'kind': 'container', 'children': {'path': (1, 1)}},
    'delete_file':               {'kind': 'container', 'children': {'path': (1, 1)}},
    'move_file':                 {'kind': 'container', 'children': {'source': (1, 1), 'destination': (1, 1)}},
    'retain_file':               {'kind': 'container', 'children': {'path': (1, 1)}},
    'refresh_file':              {'kind': 'container', 'children': {'path': (1, 1)}},
    'edits':                     {'kind': 'container', 'children': {'item': (1, None)}},
    'item':                      {'kind': 'container', 'children': {'oldText': (1, 1), 'newText': (1, 1)}},
    'queries':                   {'kind': 'container', 'children': {'query': (1, None)}},
    'list_attachments':          {'kind': 'container', 'children': {}},
    'read_attachment':           {'kind': 'container', 'children': {'filename': (1, 1)}},
    'search_attachment':         {'kind': 'container', 'children': {'filename': (1, 1), 'query': (1, 1), 'context_lines': (0, 1)}},
    'view_image':                {'kind': 'container', 'children': {'filename': (1, 1)}},
    'path':          {'kind': 'content'},
    'content':       {'kind': 'content'},
    'query':         {'kind': 'content'},
    'filename':      {'kind': 'content'},
    'oldText':       {'kind': 'content'},
    'newText':       {'kind': 'content'},
    'context_lines': {'kind': 'content'},
    'head':          {'kind': 'content'},
    'tail':          {'kind': 'content'},
    'max_depth':     {'kind': 'content'},
    'source':        {'kind': 'content'},
    'destination':   {'kind': 'content'},
}

LUCID_TOOLS = {
    'edit_file', 'read_file', 'read_text_file', 'list_directory',
    'list_directory_with_sizes', 'directory_tree', 'search_surrounding',
    'get_file_info', 'list_allowed_directories', 'write_file',
    'create_file', 'create_directory', 'delete_file', 'move_file',
    'list_attachments', 'read_attachment', 'search_attachment', 'view_image',
    'retain_file', 'refresh_file',
}

# Tags rejected inside content elements. Narrowed to Lucid-specific names:
# argument names like path, content, query, head, source commonly appear in
# HTML, JSX, and SVG content and would false-positive on legitimate file text.
LUCID_RESERVED = LUCID_TOOLS | {
    'lucid', 'edits', 'item', 'queries',
    'oldText', 'newText', 'filename',
    'context_lines', 'max_depth', 'destination', 'tail',
}

LUCID_TAG = re.compile(r'</?[a-zA-Z_][a-zA-Z0-9_]*>')


def _lex_lucid(body):
    i = 0
    n = len(body)
    while i < n:
        lt = body.find('<', i)
        if lt == -1:
            yield ('text', body[i:], i)
            return
        if lt > i:
            yield ('text', body[i:lt], i)
        m = LUCID_TAG.match(body, lt)
        if m:
            raw = m.group(0)
            if raw.startswith('</'):
                yield ('close', raw[2:-1], lt)
            else:
                yield ('open', raw[1:-1], lt)
            i = m.end()
        else:
            yield ('text', '<', lt)
            i = lt + 1


def _parse_lucid_elem(tokens, si, spec, name, siblings=None, repairs=None):
    if siblings is None:
        siblings = set()
    if repairs is None:
        repairs = []
    if spec['kind'] == 'content':
        parts = []
        i = si + 1
        while i < len(tokens):
            t, v, p = tokens[i]
            if t == 'text':
                parts.append(v)
                i += 1
                continue
            if t == 'close' and v == name:
                return ''.join(parts), i
            # Repair: the parser is inside a content element and encounters a
            # close tag belonging to a sibling. Known tags cannot legitimately
            # appear inside a content element, so the only sensible reading is
            # that this was meant to close the current element. Repair in place.
            if t == 'close' and v in siblings:
                repairs.append('</' + v + '> closed as </' + name + '> at position ' + str(p))
                return ''.join(parts), i
            if v in LUCID_RESERVED:
                tag = ('</' + v + '>') if t == 'close' else ('<' + v + '>')
                raise ValueError('Unexpected tag ' + tag + ' at position ' + str(p) + ' inside <' + name + '>')
            parts.append(('</' + v + '>') if t == 'close' else ('<' + v + '>'))
            i += 1
        raise ValueError('Unclosed <' + name + '> - reached end of block')

    children_spec = spec['children']
    child_sibling_names = set(children_spec.keys())
    collected = {}
    i = si + 1
    closed = False
    while i < len(tokens):
        t, v, p = tokens[i]
        if t == 'text':
            if v.strip() == '':
                i += 1
                continue
            raise ValueError('Unexpected text inside <' + name + '> at position ' + str(p))
        if t == 'close':
            if v != name:
                raise ValueError('Expected </' + name + '>, got </' + v + '> at position ' + str(p))
            closed = True
            break
        if v not in children_spec:
            raise ValueError('Unexpected element <' + v + '> inside <' + name + '> at position ' + str(p))
        child_value, close_idx = _parse_lucid_elem(tokens, i, LUCID_SCHEMA[v], v, child_sibling_names, repairs)
        collected.setdefault(v, []).append(child_value)
        i = close_idx + 1

    if not closed:
        raise ValueError('Unclosed <' + name + '> - reached end of block')

    for child_name, (lo, hi) in children_spec.items():
        count = len(collected.get(child_name, []))
        if count < lo:
            raise ValueError('<' + name + '> requires at least ' + str(lo) + ' <' + child_name + '>, found ' + str(count))
        if hi is not None and count > hi:
            raise ValueError('<' + name + '> allows at most ' + str(hi) + ' <' + child_name + '>, found ' + str(count))

    if len(children_spec) == 1:
        only_child, (_, hi) = next(iter(children_spec.items()))
        if hi is None:
            return collected.get(only_child, []), i

    result = {}
    for child_name, values in collected.items():
        result[child_name] = values[0] if len(values) == 1 else values
    return result, i


def _parse_lucid_xml(xml_body):
    tokens = list(_lex_lucid(xml_body))
    i = 0
    while i < len(tokens) and tokens[i][0] == 'text' and tokens[i][1].strip() == '':
        i += 1
    if i >= len(tokens):
        raise ValueError('Empty <lucid> block')
    if tokens[i][0] != 'open':
        raise ValueError('Expected a tool tag at position ' + str(tokens[i][2]))
    tool_name = tokens[i][1]
    if tool_name not in LUCID_TOOLS:
        raise ValueError('Unknown tool <' + tool_name + '> at position ' + str(tokens[i][2]))
    repairs = []
    args, end_idx = _parse_lucid_elem(tokens, i, LUCID_SCHEMA[tool_name], tool_name, set(), repairs)
    for t in tokens[end_idx + 1:]:
        if t[0] == 'text' and t[1].strip() == '':
            continue
        raise ValueError('Unexpected content after </' + tool_name + '> at position ' + str(t[2]))
    return tool_name, args, repairs


def extract_tool_calls(content):
    """
    Extract tool calls from <lucid>...</lucid> blocks in response content.
    Returns (results, parse_error) where results is a list of (tool_name, arguments)
    tuples and parse_error is an error string if any block failed to parse, else None.
    """
    results = []
    last_parse_error = None
    pos = 0
    OPEN  = '<lucid>'
    CLOSE = '</lucid>'

    # Repair: bracket-form openers. If the content has more </lucid> closers
    # than <lucid> openers, one or more blocks lost their opening tag, most
    # commonly by being typed as [lucid] instead of <lucid>. Substitute
    # [lucid] (immediately followed by a tag-shaped element) as <lucid>, up
    # to the number of missing openers. If the counts are balanced, [lucid]
    # is left alone as prose. Substitution is position-preserving, since
    # <lucid> and [lucid] are both 7 characters, so downstream positions
    # remain valid.
    missing_openers = content.count(CLOSE) - content.count(OPEN)
    opener_repair_positions = []
    if missing_openers > 0:
        def _bracket_opener_sub(m):
            if len(opener_repair_positions) >= missing_openers:
                return m.group(0)
            opener_repair_positions.append(m.start())
            return '<lucid>' + m.group(1)
        content = re.sub(r'\[lucid\](\s*<[a-zA-Z_][a-zA-Z0-9_]*>)', _bracket_opener_sub, content)
        opener_repair_positions.sort()

    while pos < len(content):
        open_idx = content.find(OPEN, pos)
        close_idx = content.find(CLOSE, pos)

        # Detect orphaned closing tags: a </lucid> that appears before the
        # next <lucid> (or with no <lucid> at all). This is the signature of
        # a mistyped or missing opening tag — e.g. the agent writes [lucid]
        # instead of <lucid> — and the block's contents were silently dropped.
        # Report it so the turn aborts and the agent can resubmit cleanly.
        if close_idx != -1 and (open_idx == -1 or close_idx < open_idx):
            last_parse_error = f'Orphaned </lucid> at position {close_idx} — block opening tag is missing or malformed'
            pos = close_idx + len(CLOSE)
            continue

        if open_idx == -1:
            break
        close_idx = content.find(CLOSE, open_idx + len(OPEN))
        if close_idx == -1:
            # Unclosed block - but only flag it if this opener looks like a real
            # attempt (<lucid> immediately followed by a tag-shaped element).
            # Prose mentions of <lucid> are not attempts; skip them and keep
            # scanning so an unclosed real block later in the response still
            # gets detected.
            tail = content[open_idx + len(OPEN):]
            if re.match(r'\s*<[a-zA-Z_][a-zA-Z0-9_]*>', tail):
                last_parse_error = 'Unclosed <lucid> at position ' + str(open_idx) + ' - no matching </lucid> found'
                break
            pos = open_idx + len(OPEN)
            continue
        xml_body = content[open_idx + len(OPEN):close_idx]
        pos = close_idx + len(CLOSE)
        # Attribute any opener repairs at this block's start position to this
        # block's tool call. Position matching is exact because substitution
        # is length-preserving.
        block_repairs = []
        while opener_repair_positions and opener_repair_positions[0] == open_idx:
            rpos = opener_repair_positions.pop(0)
            block_repairs.append('[lucid] treated as <lucid> at position ' + str(rpos))
        try:
            tool_name, args, repairs = _parse_lucid_xml(xml_body)
            results.append((tool_name, args, block_repairs + repairs))
        except ValueError as e:
            last_parse_error = str(e)
        except Exception as e:
            last_parse_error = f'Unexpected parse error: {e}'

    # De-duplicate while preserving order
    seen = set()
    unique = []
    for item in results:
        try:
            key = (item[0], json.dumps(item[1], sort_keys=True))
        except Exception:
            key = (item[0], str(item[1]))
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique, last_parse_error


def extract_tool_call(content):
    """Backward-compatible wrapper. Returns (name, args) or (None, None)."""
    calls, _ = extract_tool_calls(content)
    if calls:
        name, args, _ = calls[0]
        return name, args
    return None, None


# === Approval file protocol ===
# main.py writes approval decisions here; send_message polls.

APPROVAL_DIR = os.path.join(os.path.dirname(__file__), 'approvals')

def write_approval_request(agent_id, task_id, tool_name, arguments, batch_calls=None):
    """
    Write an approval request file.
    batch_calls: list of (tool_name, arguments) tuples for batch approval.
    If provided, the approval covers all calls in the batch; tool_name/arguments
    are the first call and kept for backward-compatibility with the UI.
    """
    os.makedirs(APPROVAL_DIR, exist_ok=True)
    req = {
        'agent_id': agent_id,
        'task_id': task_id,
        'tool_name': tool_name,
        'arguments': arguments,
        'status': 'pending',
    }
    if batch_calls and len(batch_calls) > 1:
        req['batch_calls'] = [
            {'tool_name': n, 'arguments': a, 'repairs': r} for n, a, r in batch_calls
        ]
    path = os.path.join(APPROVAL_DIR, f'{task_id}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(req, f)
    return path

def poll_approval(task_id, timeout=300):
    """
    Block until the user approves or denies the tool call.
    Returns 'approved' or 'denied'.
    Timeout raised to 300s to give users plenty of time.
    """
    path = os.path.join(APPROVAL_DIR, f'{task_id}.json')
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    raw = f.read()
                if not raw.strip():
                    time.sleep(0.25)
                    continue
                data = json.loads(raw)
                status = data.get('status', 'pending')
                if status in ('approved', 'denied'):
                    try: os.remove(path)
                    except: pass
                    _log_note('QUEUE', f'poll_approval: task={task_id} status={status}')
                    return status
            except Exception as e:
                _log_note('QUEUE', f'poll_approval read error: {e}')
        time.sleep(0.5)
    # Timeout
    _log_note('QUEUE', f'poll_approval: task={task_id} TIMED OUT after {timeout}s')
    try: os.remove(path)
    except: pass
    return 'denied'




def send_message(agent_id, user_message=None, glimpse=False, task_id=None):
    """
    Send a message to the configured LLM provider and return the response.
    If glimpse=True, the message is injected into the payload but not saved to context.
    If glimpse=False, user_message should be None (already in context).
    Supports MCP tool call loop: detects tool calls in responses, executes them,
    injects results, and re-prompts until a clean response is returned.
    """
    inject   = user_message if (glimpse or agent_id == EPHEMERA_ID or user_message is not None) else None
    try:
        messages = build_context(agent_id, inject_message=inject)
    except Exception as e:
        return {"error": f"build_context failed: {e}"}
    model    = get_agent_model(agent_id)
    temp     = get_agent_temperature(agent_id)
    reasoning_cfg = get_agent_reasoning(agent_id)

    provider_name, resolved_model = resolve_provider(model)

    # Validate API key
    key = get_api_key(provider_name)
    if not key:
        return {"error": f"No API key configured for provider '{provider_name}'. Add it to config.json."}

    # Build request components
    provider_def = PROVIDERS.get(provider_name, {})
    strip = provider_def.get('strip_prefix', '')
    bare_model = resolved_model[len(strip):] if strip and resolved_model.startswith(strip) else resolved_model

    if provider_name == "anthropic":
        parse_stream = _parse_anthropic_stream
        def make_request(msgs, suppress_reasoning=False):
            url, headers, payload = _build_anthropic_request(bare_model, msgs, temp, stream=True)
            if reasoning_cfg and reasoning_cfg.get('enabled', False) and not suppress_reasoning:
                effort = reasoning_cfg.get('effort', 'high')
                is_adaptive = (
                    'opus-4-7' in bare_model or 'opus-4-8' in bare_model or
                    'claude-5' in bare_model or '-5-' in bare_model or
                    'fable' in bare_model
                )
                if is_adaptive:
                    mapped = {'low': 'standard', 'medium': 'high', 'high': 'high', 'max': 'max'}
                    final_effort = mapped.get(effort, 'high')
                    payload['thinking'] = {'type': 'adaptive'}
                    payload['output_config'] = {'effort': final_effort}
                else:
                    is_sonnet = 'sonnet' in bare_model
                    budget = {'low': 2000, 'medium': 5000, 'high': 8000, 'max': 16000}.get(effort, 8000)
                    if is_sonnet:
                        budget = min(budget, 8000)
                    payload['thinking'] = {'type': 'enabled', 'budget_tokens': budget}
                payload['temperature'] = 1
            return url, headers, payload
    elif provider_name == "gemini":
        parse_stream = _parse_gemini_stream
        def make_request(msgs, suppress_reasoning=False):
            url, headers, payload = _build_gemini_request(bare_model, msgs, temp, stream=True)
            is_gemini3 = bare_model.startswith('gemini-3')
            if reasoning_cfg and not suppress_reasoning:
                effort = reasoning_cfg.get('effort', 'high')
                if is_gemini3:
                    level_map = {'low': 'low', 'medium': 'medium', 'high': 'high', 'max': 'high'}
                    payload['generationConfig']['thinkingConfig'] = {
                        'includeThoughts': True,
                        'thinking_level': level_map.get(effort, 'medium'),
                    }
                else:
                    budget_map = {'low': 1024, 'medium': 4096, 'high': 8192, 'max': 24576}
                    payload['generationConfig']['thinkingConfig'] = {
                        'includeThoughts': True,
                        'thinkingBudget': budget_map.get(effort, 8192),
                    }
            return url, headers, payload
    elif provider_name == "local":
        parse_stream = _parse_openai_compatible_stream
        def make_request(msgs):
            base_url = get_local_base_url()
            url = f"{base_url}/v1/chat/completions"
            headers = {"Content-Type": "application/json"}
            payload = {"model": bare_model, "messages": msgs, "temperature": temp, "stream": True}
            return url, headers, payload
    elif provider_name in ("openrouter", "deepseek_direct", "groq", "openai_direct", "xai", "mistral_direct", "cohere", "together", "openai", "kimi"):
        parse_stream = _parse_openai_compatible_stream
        def make_request(msgs, suppress_reasoning=False):
            url     = provider_def["url"]
            k       = get_api_key(provider_name)
            headers = {"Authorization": f"Bearer {k}", "Content-Type": "application/json"}
            payload = {"model": bare_model, "messages": msgs, "temperature": temp, "stream": True}
            if reasoning_cfg and not suppress_reasoning:
                enabled = reasoning_cfg.get('enabled', False)
                effort  = reasoning_cfg.get('effort', 'high')
                if provider_name == 'deepseek_direct':
                    payload['thinking'] = {'type': 'enabled' if enabled else 'disabled'}
                    if enabled:
                        payload['reasoning_effort'] = effort
                elif provider_name == 'openrouter':
                    or_effort = effort
                    if 'deepseek-v4' in bare_model:
                        if effort == 'max':
                            or_effort = 'xhigh'
                        elif effort == 'low':
                            or_effort = None
                    if enabled:
                        payload['reasoning'] = {'effort': or_effort} if or_effort else {'effort': 'high'}
                    else:
                        payload['reasoning'] = {'exclude': True}
            elif suppress_reasoning:
                # Explicitly disable reasoning on tool loop iterations
                if provider_name == 'deepseek_direct':
                    payload['thinking'] = {'type': 'disabled'}
                elif provider_name == 'openrouter':
                    payload['reasoning'] = {'exclude': True}
            return url, headers, payload
    else:
        parse_stream = _parse_openai_compatible_stream
        def make_request(msgs):
            return _build_openrouter_request(resolved_model, msgs, temp, stream=True)

    os.makedirs(STREAMING_DIR, exist_ok=True)
    stream_file = os.path.join(STREAMING_DIR, f'{agent_id}.txt')
    cancel_file = os.path.join(STREAMING_DIR, f'cancel_{agent_id}.txt')
    max_retries = 3

    # Tool call result messages injected into the conversation
    tool_result_messages = []
    # Accumulated final content and reasoning
    final_content   = ''
    full_reasoning  = ''
    # Set when the user cancels mid-stream; process_task uses this to write a
    # failure marker instead of storing the partial response.
    was_cancelled   = False
    # Track tool calls made this turn for context
    tool_calls_made = []
    tool_call_records = []  # raw response_content from each tool call loop iteration
    max_tool_loops  = 50  # effectively uncapped — malformed output breaks the loop naturally

    for loop_i in range(max_tool_loops):
        # Build current message list: base context + any tool results from this turn
        current_messages = messages + tool_result_messages

        # Between tool loop iterations, write a holding marker so the UI stays live
        if loop_i > 0:
            with open(stream_file, 'w', encoding='utf-8') as sf:
                sf.write('<<<TOOL:>>>')

        # Execute with retry
        response_content = ''
        response_reasoning = ''
        cancelled = False

        for attempt in range(max_retries):
            try:
                url, headers, payload = make_request(current_messages, suppress_reasoning=(loop_i > 0))
                _log_note('QUEUE', f'API request: task={task_id} provider={provider_name} model={bare_model} loop={loop_i} suppress_reasoning={loop_i > 0} reasoning={reasoning_cfg} temperature={temp}')
                wait_for_dispatch_slot(provider_name)
                response = requests.post(url, headers=headers, json=payload, timeout=120, stream=True)
                if response.status_code != 200:
                    _log = os.path.join(os.path.dirname(__file__), 'logs', 'dev_log.txt')
                    with open(_log, 'a', encoding='utf-8') as _f:
                        _f.write(f'[HTTP] status={response.status_code} attempt={attempt} model={bare_model}\n')
                if response.status_code == 200:
                    placeholder_written = False
                    reasoning_written = False
                    content_started = False
                    showing_args = False  # True once we're past the tool name
                    tool_name_match = ''
                    tool_name_written = False
                    stream_after_marker = ''  # tokens written to the stream after the marker
                    with open(stream_file, 'w', encoding='utf-8') as sf:
                        for token_type, token in parse_stream(response):
                            if os.path.exists(cancel_file):
                                os.remove(cancel_file)
                                cancelled = True
                                break
                            if token_type == 'reasoning':
                                response_reasoning += token
                                if not reasoning_written:
                                    sf.write('<<<REASONING>>>')
                                    reasoning_written = True
                                sf.write(token)
                                sf.flush()
                            elif token_type == 'content_hidden':
                                # Tool call content — accumulate for detection, stream filtered view to UI
                                response_content += token
                                if not placeholder_written:
                                    # Extract tool name — first child tag after <lucid>.
                                    # Requires the closing '>' so we don't match a partial
                                    # name mid-stream (e.g. "create" before "_file>" arrives).
                                    m = re.search(r'<lucid>\s*<([a-zA-Z_][a-zA-Z0-9_]*)>', response_content)
                                    tool_name_match = m.group(1) if m else ''
                                    sf.seek(0)
                                    sf.truncate()
                                    sf.write(f'<<<TOOL:{tool_name_match}>>>')
                                    sf.flush()
                                    placeholder_written = True
                                    if tool_name_match:
                                        tool_name_written = True
                                elif not tool_name_written:
                                    # Re-check on each subsequent token, requiring the closing
                                    # '>' so we only accept a complete tag name. Rewrites the
                                    # marker once the name is available, preserving any
                                    # argument content already streamed to the file.
                                    m = re.search(r'<lucid>\s*<([a-zA-Z_][a-zA-Z0-9_]*)>', response_content)
                                    if m:
                                        tool_name_match = m.group(1)
                                        sf.seek(0)
                                        sf.truncate()
                                        sf.write(f'<<<TOOL:{tool_name_match}>>>')
                                        if stream_after_marker:
                                            sf.write(stream_after_marker)
                                        sf.flush()
                                        tool_name_written = True
                                # Stream argument content — everything after the tool name tag opens,
                                # excluding the outer structural tags
                                if not showing_args:
                                    if re.search(r'<[a-zA-Z_][a-zA-Z0-9_]*>', response_content.split('<lucid>', 1)[-1].split('>', 1)[-1] if '<lucid>' in response_content else ''):
                                        showing_args = True
                                if showing_args:
                                    # Skip lucid open/close tags and tool name tags from stream display
                                    if '<lucid>' not in token and '</lucid>' not in token:
                                        stream_after_marker += token
                                        sf.write(token)
                                        sf.flush()
                            elif token_type == 'content_flush':
                                # json block that wasn't a tool call — restore to stream and response
                                response_content += token
                                if not content_started:
                                    sf.write('<<<CONTENT>>>')
                                    content_started = True
                                if placeholder_written:
                                    # Clear the Working... placeholder before writing real content
                                    sf.seek(0)
                                    sf.truncate()
                                    placeholder_written = False
                                sf.write(token)
                                sf.flush()
                            else:
                                response_content += token
                                if not content_started:
                                    sf.write('<<<CONTENT>>>')
                                    content_started = True
                                sf.write(token)
                                sf.flush()
                    break  # successful response
                elif response.status_code in (429, 503):
                    if attempt < max_retries - 1:
                        time.sleep(2 ** attempt)
                        continue
                    if os.path.exists(stream_file):
                        os.remove(stream_file)
                    return {"error": f"Rate limited (429). Try again in a moment."}
                elif response.status_code == 500:
                    time.sleep(2 * (2 ** attempt))
                    continue
                else:
                    k = get_api_key(provider_name)
                    key_hint = ''
                    if response.status_code in (401, 402):
                        masked   = k[:4] + '...' + k[-4:] if len(k) > 8 else k[:4] + '...'
                        key_hint = f' (key: {masked})'
                    if os.path.exists(stream_file):
                        os.remove(stream_file)
                    return {"error": f"API error {response.status_code}: {response.text[:200]}{key_hint}"}
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                if os.path.exists(stream_file):
                    os.remove(stream_file)
                return {"error": str(e)}

        # Accumulate reasoning regardless of what happens next
        full_reasoning += response_reasoning

        # If the stream was interrupted by a user cancel, do not parse tool
        # calls, do not execute them, and do not store a partial response.
        # Return to process_task with the cancel flag set; it will write a
        # failure marker on the user message instead.
        if cancelled:
            was_cancelled = True
            if os.path.exists(stream_file):
                os.remove(stream_file)
            break

        # Only delete stream file if this is the final loop iteration (no tool calls)
        # During tool loops, overwrite it with the next tool's marker instead
        batch_check, parse_error = extract_tool_calls(response_content)
        _log_note('QUEUE', f'Loop {loop_i}: response={len(response_content)} chars, tool_calls_found={[name for name, _, _ in batch_check] if batch_check else "none"}')
        if batch_check:
            tool_call_records.append(response_content.strip())

        # Error handling: if any <lucid> block in the response is malformed or
        # unterminated, abort the whole turn and inject the error back. This
        # runs regardless of how many blocks parsed cleanly — partial execution
        # of a suspect response silently drops failed calls, which is worse than
        # no execution.
        # Only count as a tool-call attempt if <lucid> is immediately followed
        # by a tag-shaped element. Prose that mentions <lucid> inline (e.g.
        # "wrap this in a <lucid> block") is not an attempted invocation, and
        # treating it as one causes the agent to loop on clarifying itself.
        _lucid_attempt = re.search(r'<lucid>\s*<[a-zA-Z_][a-zA-Z0-9_]*>', response_content)
        if _lucid_attempt:
            has_open  = True
            has_close = '</lucid>' in response_content[_lucid_attempt.end():]
            unclosed  = not has_close
        else:
            has_open  = False
            has_close = False
            unclosed  = False
        if parse_error or unclosed:
            if parse_error:
                _log_note('QUEUE', f'Parse error - aborting turn. Valid blocks: {len(batch_check)}, parse_error={parse_error}')
                reason = f'One or more <lucid> blocks could not be parsed: {parse_error}'
            else:
                _log_note('QUEUE', f'Unclosed <lucid> block at end of response - aborting turn. Valid blocks: {len(batch_check)}')
                reason = 'Your response contains an unterminated <lucid> block. The opening <lucid> tag was found but no matching </lucid> tag followed.'
            _log_note('QUEUE', f'Content sample: {repr(response_content[:300])}')
            try:
                debug_path = os.path.join(os.path.dirname(__file__), 'logs', 'last_failed_response.txt')
                with open(debug_path, 'w', encoding='utf-8') as _dbf:
                    _dbf.write(response_content)
            except Exception as _dbe:
                _log_note('QUEUE', f'Debug dump failed: {_dbe}')
            # Record the failed parse attempt so it appears in the tool log and
            # the message badge. The raw content is truncated so a spiraling
            # agent cannot bloat tool_log.jsonl; the error is the reason string
            # that was (or will be) injected back to the agent.
            _raw = response_content if len(response_content) <= 2000 else response_content[:2000] + '\n[...truncated at 2000 chars]'
            tool_calls_made.append({
                'tool': 'parse_error',
                'args': {'raw_attempt': _raw},
                'result': {'tool': 'parse_error', 'status': 'parse_error', 'error': reason},
            })
            # Replace the previous error pair if the last message was also an
            # error injection, to prevent context accumulation.
            if len(tool_result_messages) >= 2 and tool_result_messages[-1].get('content', '').startswith('[Automated system message]'):
                tool_result_messages = tool_result_messages[:-2]
            tool_result_messages.append({"role": "assistant", "content": response_content})
            tool_result_messages.append({"role": "user", "content":
                f"[Automated system message] {reason} Nothing was executed. "
                f"Write a complete new tool call from scratch — do not repair the malformed block. "
                f"The error above names the specific problem; fix that in the fresh call."})
            if os.path.exists(stream_file):
                os.remove(stream_file)
            continue

        if not batch_check and response_content:
            _log_note('QUEUE', f'No tool calls found. has_lucid_open={has_open} has_closing_tag={has_close}')
            _log_note('QUEUE', f'Content sample: {repr(response_content[:300])}')
            try:
                debug_path = os.path.join(os.path.dirname(__file__), 'logs', 'last_failed_response.txt')
                with open(debug_path, 'w', encoding='utf-8') as _dbf:
                    _dbf.write(response_content)
            except Exception as _dbe:
                _log_note('QUEUE', f'Debug dump failed: {_dbe}')
        if not batch_check and os.path.exists(stream_file):
            os.remove(stream_file)

        # Check for tool calls in this response (batch or singular)
        batch = batch_check

        # Split batch into attachment calls (always allowed) and MCP calls
        # (permission-gated and dependent on MCP being enabled).
        _attachment_calls = [c for c in batch if c[0] in ATTACHMENT_TOOLS] if batch else []
        _mcp_calls        = [c for c in batch if c[0] not in ATTACHMENT_TOOLS] if batch else []
        _mcp_enabled      = is_filesystem_enabled() and get_agent_mcp_enabled(agent_id)

        if batch and not glimpse and (_attachment_calls or (_mcp_calls and _mcp_enabled)):
            result_parts = []
            image_blocks_for_result = []

            # Attachment tools are never permission-gated; they operate only
            # within the agent's own attachments directory.
            for tool_name, tool_args, repairs in _attachment_calls:
                result = attachment_execute(agent_id, tool_name, tool_args)
                if 'tool' not in result:
                    result['tool'] = tool_name
                entry = {'tool': tool_name, 'args': tool_args, 'result': result}
                if repairs:
                    entry['repairs'] = repairs
                tool_calls_made.append(entry)
                if result.get('status') == 'ok':
                    result_parts.append("Tool '" + tool_name + "' returned:\n" + result.get('content', ''))
                    # view_image returns image_pending rather than inline bytes.
                    # Read the file here and stage it as a multimodal block to be
                    # attached to the tool-result message.
                    if result.get('image_pending'):
                        try:
                            _img_path = os.path.join(AGENTS_DIR, agent_id, 'attachments', result['image_pending'])
                            with open(_img_path, 'rb') as _imgf:
                                _raw = _imgf.read()
                            import base64 as _b64
                            _ext = os.path.splitext(_img_path)[1].lstrip('.').lower()
                            _mime = 'image/jpeg' if _ext in ('jpg', 'jpeg') else 'image/' + _ext
                            image_blocks_for_result.append({
                                'type': 'image_url',
                                'image_url': {'url': 'data:' + _mime + ';base64,' + _b64.b64encode(_raw).decode('ascii')}
                            })
                        except Exception as _ie:
                            result_parts.append("[Failed to load image: " + str(_ie) + "]")
                else:
                    result_parts.append("Tool '" + tool_name + "' failed: " + result.get('error', 'Unknown error'))

            # If there are no MCP calls, finish the loop iteration now.
            if not _mcp_calls or not _mcp_enabled:
                if _mcp_calls and not _mcp_enabled:
                    for tool_name, tool_args, repairs in _mcp_calls:
                        result = {'tool': tool_name, 'status': 'error',
                                  'error': 'MCP filesystem tools are not enabled for this agent.'}
                        entry = {'tool': tool_name, 'args': tool_args, 'result': result}
                        if repairs:
                            entry['repairs'] = repairs
                        tool_calls_made.append(entry)
                        result_parts.append("Tool '" + tool_name + "' failed: MCP filesystem tools are not enabled for this agent.")
                combined = '\n\n'.join(result_parts)
                _result_text = combined + "\n\nNow respond to the user based on these results."
                tool_result_messages.append({"role": "assistant", "content": response_content})
                if image_blocks_for_result:
                    tool_result_messages.append({"role": "user",
                        "content": [{'type': 'text', 'text': _result_text}] + image_blocks_for_result})
                else:
                    tool_result_messages.append({"role": "user", "content": _result_text})
                continue

            # Check for mixed read/write batch — execute reads, discard writes, correct the agent
            batch_tool_names = [name for name, _, _ in _mcp_calls]
            has_reads  = any(n in READ_ONLY_TOOLS for n in batch_tool_names)
            has_writes = any(n in WRITE_TOOLS for n in batch_tool_names)

            if has_reads and has_writes:
                # Execute only the read-only calls
                read_parts  = []
                write_names = []
                block_names = []
                for tool_name, tool_args, repairs in _mcp_calls:
                    if tool_name in READ_ONLY_TOOLS:
                        perm = get_permission(tool_name)
                        if perm == 'block':
                            block_names.append(tool_name)
                            entry = {'tool': tool_name, 'args': tool_args,
                                     'result': {'tool': tool_name, 'status': 'blocked',
                                                'error': f"Tool '{tool_name}' is blocked by permission policy."}}
                            if repairs:
                                entry['repairs'] = repairs
                            tool_calls_made.append(entry)
                        else:
                            result = mcp_execute(tool_name, tool_args)
                            entry = {'tool': tool_name, 'args': tool_args, 'result': result}
                            if repairs:
                                entry['repairs'] = repairs
                            tool_calls_made.append(entry)
                            if result['status'] == 'ok':
                                read_parts.append(f"Tool '{tool_name}' returned:\n{result['content']}")
                            else:
                                read_parts.append(f"Tool '{tool_name}' failed: {result.get('error', 'Unknown error')}")
                    elif tool_name in WRITE_TOOLS:
                        write_names.append(tool_name)

                # Build corrective message
                correction_parts = []
                if read_parts:
                    correction_parts.append('\n\n'.join(read_parts))
                correction_parts.append(
                    f"[Automated system message] Your batch contained both read and write operations "
                    f"({', '.join(write_names)} was discarded). "
                    f"Reading and writing cannot be performed in the same batch. "
                    f"The read operations have been completed, and the results are above. "
                    f"Use the file contents returned above to construct your edits — set oldText to the exact existing text adjacent to where you want to make your change. "
                    f"Perform the write operations again now."
                )
                if block_names:
                    correction_parts.append(
                        f"[Automated system message] Additionally, the following tools are blocked by permission policy "
                        f"and cannot be called: {', '.join(block_names)}."
                    )

                tool_result_messages.append({"role": "assistant", "content": response_content})
                tool_result_messages.append({"role": "user", "content": '\n\n'.join(correction_parts)})
                continue

            # Partition into allow, ask, and block calls
            allow_calls = []
            ask_calls   = []
            for tool_name, tool_args, repairs in _mcp_calls:
                perm = get_permission(tool_name)
                _log_note('QUEUE', f'Tool "{tool_name}": permission={perm}')
                if perm == 'block':
                    # Record and skip — blocked tools short-circuit with an error result
                    entry = {'tool': tool_name, 'args': tool_args,
                             'result': {'tool': tool_name, 'status': 'blocked',
                                        'error': f"Tool '{tool_name}' is blocked by permission policy."}}
                    if repairs:
                        entry['repairs'] = repairs
                    tool_calls_made.append(entry)
                elif perm == 'ask':
                    ask_calls.append((tool_name, tool_args, repairs))
                else:
                    allow_calls.append((tool_name, tool_args, repairs))

            result_parts = []

            # Execute allow-permission tools immediately, sequentially
            for tool_name, tool_args, repairs in allow_calls:
                result = mcp_execute(tool_name, tool_args)
                entry = {'tool': tool_name, 'args': tool_args, 'result': result}
                if repairs:
                    entry['repairs'] = repairs
                tool_calls_made.append(entry)
                if result['status'] == 'ok':
                    part = f"Tool '{tool_name}' returned:\n{result['content']}"
                else:
                    part = f"Tool '{tool_name}' failed: {result.get('error', 'Unknown error')}"
                if repairs:
                    part += '\n\n[Lucid repaired your tool call while parsing: ' + '; '.join(repairs) + ']'
                result_parts.append(part)

            # Handle ask-permission tools as a single approval request
            if ask_calls:
                tid = task_id or f'task_{int(time.time()*1000)}'
                _log_note('QUEUE', f'Approval requested for: {[name for name, _, _ in ask_calls]}')
                write_approval_request(agent_id, tid, ask_calls[0][0], ask_calls[0][1],
                                       batch_calls=ask_calls)
                # Do not overwrite the stream file during approval - it contains
                # the tool call content the user is reviewing. The approval bar
                # at the bottom of the chat surfaces the pending request; the
                # streaming block keeps showing what is being approved.
                decision = poll_approval(tid)
                _log_note('QUEUE', f'Approval decision: {decision}')
                if os.path.exists(stream_file):
                    os.remove(stream_file)
                for tool_name, tool_args, repairs in ask_calls:
                    if decision == 'approved':
                        result = mcp_execute(tool_name, tool_args)
                    else:
                        result = {'tool': tool_name, 'status': 'error',
                                  'error': f"Tool call '{tool_name}' was denied by user."}
                    entry = {'tool': tool_name, 'args': tool_args, 'result': result}
                    if repairs:
                        entry['repairs'] = repairs
                    tool_calls_made.append(entry)
                    if result['status'] == 'ok':
                        part = f"Tool '{tool_name}' returned:\n{result['content']}"
                    else:
                        part = f"Tool '{tool_name}' failed: {result.get('error', 'Unknown error')}"
                    if repairs:
                        part += '\n\n[Lucid repaired your tool call while parsing: ' + '; '.join(repairs) + ']'
                    result_parts.append(part)

            # Inject assistant turn and combined results, then re-prompt
            combined = '\n\n'.join(result_parts)
            _result_text = combined + "\n\nNow respond to the user based on these results."
            tool_result_messages.append({"role": "assistant", "content": response_content})
            if image_blocks_for_result:
                tool_result_messages.append({"role": "user",
                    "content": [{'type': 'text', 'text': _result_text}] + image_blocks_for_result})
            else:
                tool_result_messages.append({"role": "user", "content": _result_text})
            continue

        # No tool call — this is the final response
        final_content = response_content
        break
    else:
        # Hit max tool loops
        final_content = response_content + '\n[Max tool call iterations reached]'

    return {
        "content":           strip_lucid_fence(final_content),
        "reasoning":         full_reasoning,
        "tool_calls":        tool_calls_made,
        "tool_call_records": tool_call_records,
        "cancelled":         was_cancelled,
    }


if __name__ == '__main__':
    import sys
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
    if len(sys.argv) >= 4 and sys.argv[1] == 'glimpse':
        agent_id  = sys.argv[2]
        message   = sys.argv[3]
        result    = send_message(agent_id, user_message=message, glimpse=True)
        if result.get('error'):
            print(f"ERROR: {result['error']}")
        else:
            reasoning = result.get('reasoning', '')
            content   = result.get('content', '')
            if reasoning:
                print(f"---REASONING---\n{reasoning}\n---CONTENT---\n{content}")
            else:
                print(content)
    sys.exit(0)
