"""Configure private provider settings. Credentials are entered without echo."""
import getpass
import argparse
import json
import os
from pathlib import Path
import secrets
import urllib.request
import urllib.error
from urllib.parse import urlparse

root = Path(__file__).resolve().parents[1]
target = root / 'server' / '.env.local'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='https://api.deepseek.com/v1')
parser.add_argument('--model', default='deepseek-flash')
args = parser.parse_args()
base = args.base_url.rstrip('/')
model = args.model
endpoint = urlparse(base)
if endpoint.scheme != 'https' or not endpoint.hostname or endpoint.username or endpoint.password:
    raise SystemExit('Provider base URL must use HTTPS without embedded credentials')
key = getpass.getpass('AI API Key: ').strip()
if not key or '\n' in key or '\r' in key:
    raise SystemExit('Invalid key')
request = urllib.request.Request(base + '/models', headers={'Authorization': 'Bearer ' + key})
try:
    with urllib.request.urlopen(request, timeout=25) as response:
        models = [str(item.get('id', '')) for item in json.load(response).get('data', [])]
    print('Available models:', json.dumps(models))
    if model not in models:
        raise SystemExit('Requested model is not listed; configuration has not been changed')
    print('Model discovery:', 'available' if model in models else 'requested model not listed')
    print('Selected model:', model)
except (urllib.error.URLError, ValueError):
    print('Model discovery unavailable; storing the explicitly selected provider and model')
existing = {}
if target.exists():
    for line in target.read_text(encoding='utf-8').splitlines():
        if '=' in line:
            name, value = line.split('=', 1)
            existing[name] = value
values = {
    **existing,
    'APP_ORIGIN': existing.get('APP_ORIGIN', 'http://127.0.0.1:5173'),
    'PORT': existing.get('PORT', '3100'),
    'ADMIN_USERNAME': existing.get('ADMIN_USERNAME', 'admin'),
    'ADMIN_PASSWORD': existing.get('ADMIN_PASSWORD', secrets.token_urlsafe(24)),
    'AI_BASE_URL': base,
    'AI_MODEL': model,
    'AI_API_KEY': key,
    'AI_DAILY_TOKENS': existing.get('AI_DAILY_TOKENS', '300000'),
}
target.write_text('\n'.join(name + '=' + value for name, value in values.items()) + '\n', encoding='utf-8')
if os.name != 'nt':
    target.chmod(0o600)
print('Private configuration saved to server/.env.local; no credentials printed.')
