from pathlib import Path
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
index = (ROOT / "index.html").read_text(encoding="utf-8")
errors = []

if "<style" in index.lower():
    errors.append("index.html still contains an inline style block")
if re.search(r"<script(?![^>]+src=)[^>]*>", index, flags=re.I):
    errors.append("index.html still contains an inline script block")
if re.search(r"\son[a-z]+\s*=", index, flags=re.I):
    errors.append("index.html still contains an inline event handler")
if re.search(r"<img[^>]+src=[\"']\s*[\"']", index, flags=re.I):
    errors.append("index.html contains an empty image source")

for path in re.findall(r"(?:src|href)=[\"']((?:assets|datas)/[^\"']+)[\"']", index):
    if not (ROOT / path).exists():
        errors.append(f"missing local project file: {path}")

with (ROOT / "assets/data/arena_data.json").open(encoding="utf-8") as handle:
    json.load(handle)

node = subprocess.run(["node", "--version"], capture_output=True, text=True)
if node.returncode == 0:
    for script in sorted((ROOT / "assets/js").rglob("*.js")):
        result = subprocess.run(["node", "--check", str(script)], capture_output=True, text=True)
        if result.returncode != 0:
            errors.append(f"JavaScript syntax error in {script.relative_to(ROOT)}: {result.stderr.strip()}")

if errors:
    print("Validation failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Validation passed")
print(f"Lazy local images: {len(re.findall(r'data-src=', index))}")
print(f"JavaScript files: {len(list((ROOT / 'assets/js').rglob('*.js')))}")
print(f"CSS files: {len(list((ROOT / 'assets/css').glob('*.css')))}")
