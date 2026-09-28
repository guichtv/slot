"""Banc d'assemblage des pièces de symboles (coordonnées de planche) -> planches de contrôle.
Lit src/render/grid/partsLayout.json et assets/generated/symbols/*.png, compose corps + pièces
au repos et en pose de réaction, sur fond clair et sombre : docs/imagegen/checks/parts-<SYM>.png
Usage : python3 tools/assets/compose_parts.py [SYM ...]
"""
import json, sys, math
from PIL import Image

LAYOUT = json.load(open('src/render/grid/partsLayout.json'))
MAN = json.load(open('public/assets/manifest.json'))['assets']

def crop(key):
    e = MAN[key]
    f = e['frame']
    src = Image.open(e['source']).convert('RGBA')
    # isole la pièce : on relit le webp exporté (déjà isolé) et on le remet à l'échelle de la planche
    im = Image.open('public/' + e['url']).convert('RGBA')
    if abs(e.get('scale', 1) - 1) > 1e-6:
        im = im.resize((f['w'], f['h']), Image.LANCZOS)
    return im, f

def place(canvas, im, f, pivot, at, rot):
    # pivot (coord planche de la pièce) posé sur at (coord canvas), rotation rot degrés autour du pivot
    px, py = pivot[0] - f['x'], pivot[1] - f['y']
    if rot:
        big = Image.new('RGBA', (im.width * 3, im.height * 3), (0, 0, 0, 0))
        big.alpha_composite(im, (im.width, im.height))
        big = big.rotate(-rot, center=(im.width + px, im.height + py), resample=Image.BICUBIC)
        canvas.alpha_composite(big, (int(at[0] - im.width - px), int(at[1] - im.height - py)))
    else:
        canvas.alpha_composite(im, (int(at[0] - px), int(at[1] - py)))

def compose(sym, pose):
    L = LAYOUT[sym]
    body, bf = crop(L['body'])
    pad = 420
    W, H = bf['w'] + pad * 2, bf['h'] + pad * 2
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ox, oy = pad - bf['x'], pad - bf['y']
    back = [p for p in L.get('parts', []) + L.get('props', []) if p.get('z', 1) < 0]
    front = [p for p in L.get('parts', []) + L.get('props', []) if p.get('z', 1) >= 0]
    def draw(p):
        if pose == 'rest' and p in L.get('props', []):
            return
        im, f = crop(p['key'])
        rot = p.get('rest', 0) + (p.get('react', 0) if pose == 'react' else 0)
        dy = p.get('reactDy', 0) if pose == 'react' else 0
        place(out, im, f, p['pivot'], (p['attach'][0] + ox, p['attach'][1] + oy + dy), rot)
    for p in back: draw(p)
    out.alpha_composite(body, (pad, pad))
    for p in front: draw(p)
    return out

syms = sys.argv[1:] or list(LAYOUT.keys())
for s in syms:
    tiles = [compose(s, 'rest'), compose(s, 'react')]
    w = sum(t.width for t in tiles) + 40
    h = max(t.height for t in tiles) * 2 + 20
    sheet = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x = 0
    for t in tiles:
        for row, col in ((0, (236, 234, 224, 255)), (1, (28, 22, 40, 255))):
            bg = Image.new('RGBA', t.size, col)
            bg.alpha_composite(t)
            sheet.paste(bg, (x, row * (t.height + 20)))
        x += t.width + 40
    sheet.thumbnail((1400, 1400))
    sheet.save(f'docs/imagegen/checks/parts-{s}.png')
    print('ok', s)
