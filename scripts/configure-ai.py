"""Configure private provider settings. Credentials are entered without echo."""
import getpass
import json
import os
from pathlib import Path
import secrets
import urllib.request
import urllib.error

root = Path(__file__).resolve().parents[1]
target = root / 'server' / '.env.local'
key = getpass.getpass('AI API Key: ').strip()
if not key or '\n' in key:
    raise SystemExit('Invalid key')
base = 'https://us.xigong.cloud/v1'
model = 'gpt-6.1-sol'
request = urllib.request.Request(base + '/models', headers={'Authorization': 'Bearer ' + key})
try:
    with urllib.request.urlopen(request, timeout=25) as response:
        models = [str(item.get('id', '')) for item in json.load(response).get('data', [])]
    matches = [name for name in models if '6.1' in name or '6-1' in name]
    if model not in models and len(matches) == 1:
        model = matches[0]
    print('Model discovery:', 'available' if model in models else 'requested model not listed')
    print('Selected model:', model)
except (urllib.error.URLError, ValueError):
    print('Model discovery unavailable; retaining requested model gpt6.1')
existing = {}
if target.exists():
    for line in target.read_text(encoding='utf-8').splitlines():
        if '=' in line:
            name, value = line.split('=', 1)
            existing[name] = value
values = {
    'APP_ORIGIN': 'http://127.0.0.1:5173',
    'PORT': '3100',
    'ADMIN_USERNAME': existing.get('ADMIN_USERNAME', 'admin'),
    'ADMIN_PASSWORD': existing.get('ADMIN_PASSWORD', secrets.token_urlsafe(24)),
    'AI_BASE_URL': base,
    'AI_MODEL': model,
    'AI_API_KEY': key,
    'AI_DAILY_TOKENS': '300000',
}
target.write_text('\n'.join(name + '=' + value for name, value in values.items()) + '\n', encoding='utf-8')
if os.name != 'nt':
    target.chmod(0o600)
print('Private configuration saved to server/.env.local; no credentials printed.')
