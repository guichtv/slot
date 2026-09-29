"""Banc du rig de Buck (hors jeu) : assemble le rig décrit dans src/render/mascot/buckRig.json
pour une ou plusieurs poses et produit des planches de contrôle (zoom, fond clair et sombre),
à côté de la référence buck.ref : docs/imagegen/checks/rig-<nom>.png
Usage : python3 tools/assets/compose_rig.py [pose=json] [--alts head=grin,handF=match] [--name rest]
Une pose JSON : {"partId": {"r": deg, "x": dx, "y": dy}} (valeurs ajoutées au repos).
"""
import json, math, sys
from PIL import Image

RIG = json.load(open('src/render/mascot/buckRig.json'))
MAN = json.load(open('public/assets/manifest.json'))['assets']
cache = {}

def tex(key):
    if key not in cache:
        cache[key] = Image.open('public/' + MAN[key]['url']).convert('RGBA')
    return cache[key]

def mat_mul(a, b):
    return [a[0]*b[0]+a[1]*b[3], a[0]*b[1]+a[1]*b[4], a[0]*b[2]+a[1]*b[5]+a[2],
            a[3]*b[0]+a[4]*b[3], a[3]*b[1]+a[4]*b[4], a[3]*b[2]+a[4]*b[5]+a[5]]

def rot(deg):
    r = math.radians(deg); c, s = math.cos(r), math.sin(r)
    return [c, -s, 0, s, c, 0]

def trans(x, y):
    return [1, 0, x, 0, 1, y]

def inv(m):
    a, b, c, d, e, f = m
    det = a*e - b*d
    return [e/det, -b/det, (b*f - c*e)/det, -d/det, a/det, (c*d - a*f)/det]

def compose(pose, alts, scale=0.42, W=800, H=1100):
    parts = {p['id']: p for p in RIG['parts']}
    # transformations monde (px planche) : parent * trans(attach) * rot(r) * trans(-pivot)
    world, order = {}, []
    def key_pivot(pid):
        p = parts[pid]
        alt = alts.get(pid)
        if alt:
            a = RIG['alternates'][pid][alt]
            return a['key'], a['pivot'], a.get('r', 0), a.get('flip', p.get('flip', False))
        return p['key'], p['pivot'], 0, p.get('flip', False)
    def solve(pid):
        if pid in world: return world[pid]
        p = parts[pid]
        pp = pose.get(pid, {})
        key, pivot, extra_r, flip = key_pivot(pid)
        local_r = p.get('rest', 0) + pp.get('r', 0) + extra_r
        ps = p.get('scale', 1)
        if 'parent' in p:
            par = solve(p['parent'])
            ax, ay = p['attach']
            # l'attache est dans l'espace de la texture du parent (repère du parent avant son pivot)
            m = mat_mul(par['m'], mat_mul(trans(ax + pp.get('x', 0), ay + pp.get('y', 0)), mat_mul(rot(local_r), mat_mul([ps * (-1 if flip else 1),0,0,0,ps,0], trans(-pivot[0], -pivot[1])))))
        else:
            m = mat_mul(trans(W/scale/2 + pp.get('x', 0), H/scale*0.52 + pp.get('y', 0)), mat_mul(rot(local_r), trans(-pivot[0], -pivot[1])))
        world[pid] = {'m': m, 'key': key}
        return world[pid]
    for pid in parts: solve(pid)
    # ordre de dessin : z relatif au parent (enfants négatifs derrière le parent)
    children = {}
    for p in RIG['parts']:
        children.setdefault(p.get('parent'), []).append(p)
    zover = pose.get('_z', {})
    def draw_order(pid):
        kids = sorted(children.get(pid, []), key=lambda c: zover.get(c['id'], c['z']))
        out = []
        # second dessin de la pièce (« under ») : sous tous ses enfants
        if parts[pid].get('under'): out.append(('under', pid))
        for k in kids:
            if zover.get(k['id'], k['z']) < 0: out += draw_order(k['id'])
        out.append(pid)
        for k in kids:
            if zover.get(k['id'], k['z']) >= 0: out += draw_order(k['id'])
        return out
    root = [p['id'] for p in RIG['parts'] if 'parent' not in p][0]
    seq = draw_order(root)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    S = [scale, 0, 0, 0, scale, 0]
    for item in seq:
        pid = item[1] if isinstance(item, tuple) else item
        w = world[pid]
        im = tex(parts[pid]['under'] if isinstance(item, tuple) else w['key'])
        m = mat_mul(S, w['m'])
        mi = inv(m)
        layer = im.transform((W, H), Image.AFFINE, data=tuple(mi), resample=Image.BICUBIC)
        canvas.alpha_composite(layer)
    return canvas

def main():
    pose = {}
    alts = {}
    name = 'rest'
    for a in sys.argv[1:]:
        if a.startswith('--alts='):
            for kv in a[7:].split(','):
                k, v = kv.split('='); alts[k] = v
        elif a.startswith('--name='):
            name = a[7:]
        else:
            pose = json.loads(a)
    img = compose(pose, alts)
    # la référence n'est pas publiée (noPublic) : lue depuis sa source ImageGen
    ref = tex('buck.ref') if 'buck.ref' in MAN else Image.open('assets/generated/mascot/buck-ref.png').convert('RGBA')
    k = img.height * 0.86 / ref.height
    ref = ref.resize((int(ref.width * k), int(ref.height * k)))
    W = img.width + ref.width + 40
    sheet = Image.new('RGBA', (W, img.height * 2 + 20), (0, 0, 0, 0))
    for row, col in ((0, (236, 234, 224, 255)), (1, (28, 22, 40, 255))):
        bg = Image.new('RGBA', (W, img.height), col)
        bg.alpha_composite(img, (0, 0))
        bg.alpha_composite(ref, (img.width + 40, int(img.height * 0.08)))
        sheet.paste(bg, (0, row * (img.height + 20)))
    sheet.save(f'docs/imagegen/checks/rig-{name}.png')
    print('ok', name)

main()
