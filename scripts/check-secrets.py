"""Check publishable files without printing credential values."""
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
config = root / 'server/.env.local'
private = dict(line.split('=', 1) for line in config.read_text().splitlines() if '=' in line) if config.exists() else {}
secrets = [private.get(key, '') for key in ['AI_API_KEY', 'ADMIN_PASSWORD']]
secrets = [value for value in secrets if len(value) >= 12]
files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
matches = []
for filename in files:
    path = root / filename
    if not filename or not path.is_file():
        continue
    value = path.read_bytes()
    if any(secret.encode() in value for secret in secrets) or re.search(rb'sk-[A-Za-z0-9_-]{24,}', value):
        matches.append(filename)
print({'credential_matches': matches, 'checked_files': len(files) - 1})
sys.exit(bool(matches))
