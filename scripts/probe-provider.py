import json
from pathlib import Path
import urllib.request
import urllib.error
values = dict(line.split('=', 1) for line in (Path(__file__).resolve().parents[1] / 'server' / '.env.local').read_text().splitlines() if '=' in line)
for endpoint, payload in [('/chat/completions', {'model': values['AI_MODEL'], 'messages': [{'role':'user','content':'只回复你好'}], 'max_completion_tokens':64, 'stream':False}), ('/responses', {'model': values['AI_MODEL'], 'input':'只回复你好', 'max_output_tokens':64, 'stream':False})]:
    req = urllib.request.Request(values['AI_BASE_URL'] + endpoint, data=json.dumps(payload).encode(), headers={'Authorization':'Bearer '+values['AI_API_KEY'],'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=45) as r:
            data=json.load(r)
        print(json.dumps({'endpoint':endpoint,'status':200,'fields':list(data.keys()),'usage':data.get('usage')},ensure_ascii=False))
    except urllib.error.HTTPError as e:
        text=e.read().decode().replace(values['AI_API_KEY'],'[redacted]')
        print(json.dumps({'endpoint':endpoint,'status':e.code,'error':text[:700]},ensure_ascii=False))
    except urllib.error.URLError:
        print(json.dumps({'endpoint':endpoint,'error':'connection unavailable'}))
