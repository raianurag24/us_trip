"""Generate images/manifest.json mapping each venue/hotel folder to its first image file."""
import json, os, glob

BASE = '/Users/anuragrai/Projects/us_trip'
EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

def scan_folder(root):
    result = {}
    if not os.path.isdir(root):
        return result
    for folder in sorted(os.listdir(root)):
        folder_path = os.path.join(root, folder)
        if not os.path.isdir(folder_path):
            continue
        # hero.jpg first, then any image alphabetically
        files = sorted(f for f in os.listdir(folder_path)
                       if os.path.splitext(f)[1].lower() in EXTS)
        if not files:
            continue
        preferred = next((f for f in files if os.path.splitext(f)[0].lower() == 'hero'), None)
        result[folder] = preferred or files[0]
    return result

manifest = {
    'venues': scan_folder(os.path.join(BASE, 'images/venues')),
    'hotels': scan_folder(os.path.join(BASE, 'images/hotels')),
    'days':   scan_folder(os.path.join(BASE, 'images/days')),
    'cities': scan_folder(os.path.join(BASE, 'images/cities')),
}

out = os.path.join(BASE, 'images/manifest.json')
with open(out, 'w') as f:
    json.dump(manifest, f, indent=2)

total = sum(len(v) for v in manifest.values())
print(f'Wrote {out}')
print(f'  venues: {len(manifest["venues"])}  hotels: {len(manifest["hotels"])}  days: {len(manifest["days"])}  cities: {len(manifest["cities"])}  total: {total}')
