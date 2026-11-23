"""Read-only diagnostic; reads private config and prints no credentials."""
import json
import re
import urllib.request
import urllib.error
from pathlib import Path

root = Path(__file__).resolve().parents[1]
env = dict(line.split('=', 1) for line in (root / 'server/.env.local').read_text().splitlines() if '=' in line)
body = {'model': env['AI_MODEL'], 'messages': [{'role': 'user', 'content': '只回复你好。'}], 'stream': True, 'max_completion_tokens': 32}
request = urllib.request.Request(env['AI_BASE_URL'] + '/chat/completions', data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + env['AI_API_KEY'], 'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(request, timeout=45) as response:
        print(json.dumps({'status': response.status, 'content_type': response.headers.get('Content-Type')}))
except urllib.error.HTTPError as error:
    detail = error.read().decode(errors='replace').replace(env['AI_API_KEY'], '[redacted]')
    detail = re.sub(r'sk-[A-Za-z0-9_-]+', '[redacted]', detail)
    print(json.dumps({'status': error.code, 'detail': detail[:700]}, ensure_ascii=False))
except urllib.error.URLError as error:
    print(json.dumps({'error': str(error.reason)}, ensure_ascii=False))
