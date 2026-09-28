"""Vignettes de symboles complets pour l'interface (règles, achat) : corps + pièces + accessoires au repos,
assemblés depuis les vraies pièces ImageGen (src/render/grid/partsLayout.json), rognés, 320 px max.
Sortie : public/assets/symbols/sym.<SYM>.full.webp + entrées « sym.<SYM>.full » dans le manifeste.
Usage : python3 tools/assets/symbol_thumbs.py   (lancé par npm run assets, après process.mjs)
"""
import json
from PIL import Image

LAYOUT = json.load(open('src/render/grid/partsLayout.json'))
MAN_PATH = 'public/assets/manifest.json'
MAN = json.load(open(MAN_PATH))
A = MAN['assets']
MAX = 320


def crop(key):
    e = A[key]
    f = e['frame']
    im = Image.open('public/' + e['url']).convert('RGBA')
    if abs(e.get('scale', 1) - 1) > 1e-6:
        im = im.resize((f['w'], f['h']), Image.LANCZOS)
    return im, f


def place(canvas, im, f, pivot, at, rot):
    px, py = pivot[0] - f['x'], pivot[1] - f['y']
    if rot:
        big = Image.new('RGBA', (im.width * 3, im.height * 3), (0, 0, 0, 0))
        big.alpha_composite(im, (im.width, im.height))
        big = big.rotate(-rot, center=(im.width + px, im.height + py), resample=Image.BICUBIC)
        canvas.alpha_composite(big, (int(at[0] - im.width - px), int(at[1] - im.height - py)))
    else:
        canvas.alpha_composite(im, (int(at[0] - px), int(at[1] - py)))


def compose(sym):
    L = LAYOUT[sym]
    body, bf = crop(L['body'])
    pad = 480
    out = Image.new('RGBA', (bf['w'] + pad * 2, bf['h'] + pad * 2), (0, 0, 0, 0))
    ox, oy = pad - bf['x'], pad - bf['y']
    pieces = L.get('parts', []) + L.get('props', [])
    for p in [p for p in pieces if p.get('z', 1) < 0]:
        im, f = crop(p['key'])
        place(out, im, f, p['pivot'], (p['attach'][0] + ox, p['attach'][1] + oy), p.get('rest', 0))
    out.alpha_composite(body, (pad, pad))
    for p in [p for p in pieces if p.get('z', 1) >= 0]:
        im, f = crop(p['key'])
        place(out, im, f, p['pivot'], (p['attach'][0] + ox, p['attach'][1] + oy), p.get('rest', 0))
    bb = out.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    out = out.crop(bb)
    out.thumbnail((MAX, MAX), Image.LANCZOS)
    return out


for sym in LAYOUT:
    if not all(k in A for k in [LAYOUT[sym]['body']] + [p['key'] for p in LAYOUT[sym].get('parts', []) + LAYOUT[sym].get('props', [])]):
        print('pièces manquantes, ignoré :', sym)
        continue
    im = compose(sym)
    key = f'sym.{sym}.full'
    url = f'assets/symbols/{key}.webp'
    im.save('public/' + url, 'WEBP', quality=90, alpha_quality=100, method=5)
    A[key] = {'url': url, 'w': im.width, 'h': im.height, 'source': 'composite:' + LAYOUT[sym]['body'], 'frame': None, 'scale': 1,
              'pivot': None, 'nineSlice': None, 'family': 'symbols', 'ui': True}
    print('ok', key, im.size)

json.dump(MAN, open(MAN_PATH, 'w'), indent=1, ensure_ascii=False)
