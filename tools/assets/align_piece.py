"""Recale une pièce redessinée (ImageGen) sur l'ancienne pièce du rig, pour garder pivots, attaches et IK.
Usage : python3 tools/assets/align_piece.py <nouvelle.webp|png> <ancienne.webp> <sortie.webp> [--exclude=<masque>] [--margin=40]
        python3 tools/assets/align_piece.py --config=tools/assets/align.json   (étape de `npm run assets`, après process.mjs)
Avec --config : pour chaque entrée {key, ref, exclude, margin}, la pièce `key` du manifeste (découpée par process.mjs)
est recalée sur `ref` et réécrite en place ; son entrée de manifeste reçoit w/h et `aligned` (jamais recalée deux fois).
- cherche la similitude (échelle, rotation, translation) qui superpose au mieux les silhouettes (IoU des canaux alpha),
  en ignorant dans l'ancienne pièce la zone --exclude (ex. le disque du poignet de manche, absent du nouveau dessin) ;
- rééchantillonne le nouveau dessin dans le cadre de l'ancien, agrandi de --margin px de chaque côté ;
- écrit la sortie (webp) et imprime en JSON : décalage des coordonnées (margin), score IoU, transformation.
Aucun pixel n'est dessiné : la pièce ImageGen est seulement déplacée, tournée et mise à l'échelle.
"""
import json, math, sys
import numpy as np
from PIL import Image

def align(new_p, old_p, out_p, exclude=None, margin=40):
    new = Image.open(new_p).convert('RGBA')
    old = Image.open(old_p).convert('RGBA')
    W, H = old.size
    old_a = np.array(old)[:, :, 3] > 128
    if exclude:
        ex = np.array(Image.open(exclude).convert('RGBA'))[:, :, 3] > 60
        # zone exclue un peu élargie : le nouveau bord de manche peut déborder de l'ancien disque
        from PIL import ImageFilter
        ex = np.array(Image.fromarray((ex * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15))) > 0
    else:
        ex = np.zeros_like(old_a)

    # cadre de sortie = ancien cadre + marge
    OW, OH = W + 2 * margin, H + 2 * margin
    old_big = np.zeros((OH, OW), bool)
    old_big[margin:margin + H, margin:margin + W] = old_a
    ex_big = np.zeros((OH, OW), bool)
    ex_big[margin:margin + H, margin:margin + W] = ex
    keep = ~ex_big

    def moments(m):
        ys, xs = np.nonzero(m)
        cx, cy = xs.mean(), ys.mean()
        cov = np.cov(np.vstack([xs - cx, ys - cy]))
        w, v = np.linalg.eigh(cov)
        ang = math.atan2(v[1, 1], v[0, 1])
        return cx, cy, m.sum(), ang

    new_a_full = np.array(new)[:, :, 3] > 128

    def warp(img, s, th, tx, ty, size, resample):
        # sortie(x) = entrée(A·x + b) : x_out -> x_in = R(-th)/s · (x_out - t)
        c, sn = math.cos(th), math.sin(th)
        a = c / s; b = sn / s; d = -sn / s; e = c / s
        # x_in = a*(x-tx) + b*(y-ty) ; y_in = d*(x-tx) + e*(y-ty)
        data = (a, b, -a * tx - b * ty, d, e, -d * tx - e * ty)
        return img.transform(size, Image.AFFINE, data=data, resample=resample)

    new_mask_img = Image.fromarray((new_a_full * 255).astype(np.uint8))

    def score(s, th, tx, ty, k=1):
        size = (OW // k, OH // k)
        # évaluation à 1/k : l'entrée reste en pleine résolution, donc l'échelle effective est s/k
        m = np.array(warp(new_mask_img, s / k, th, tx / k, ty / k, size, Image.NEAREST)) > 128
        ob = old_big[::k, ::k][: size[1], : size[0]]
        kp = keep[::k, ::k][: size[1], : size[0]]
        inter = (m & ob & kp).sum()
        union = ((m | ob) & kp).sum()
        return inter / max(union, 1)

    # estimation initiale par moments (sur la zone commune)
    ocx, ocy, oarea, oang = moments(old_big & keep)
    ncx, ncy, narea, nang = moments(new_a_full)
    s0 = math.sqrt(oarea / narea)
    best = None
    for flipang in (0, math.pi):
        th0 = oang - nang + flipang
        # t tel que le centroïde du nouveau tombe sur l'ancien : x_out = s·R(th)·x_in + t
        c, sn = math.cos(th0), math.sin(th0)
        tx0 = ocx - s0 * (c * ncx - sn * ncy)
        ty0 = ocy - s0 * (sn * ncx + c * ncy)
        sc = score(s0, th0, tx0, ty0, 2)
        if best is None or sc > best[0]:
            best = (sc, s0, th0, tx0, ty0)

    # affinage par recherche locale décroissante
    sc, s, th, tx, ty = best
    for step_s, step_t, step_p, k in ((0.06, math.radians(6), 24, 4), (0.03, math.radians(3), 12, 2), (0.012, math.radians(1.2), 5, 2), (0.005, math.radians(0.5), 2, 1)):
        improved = True
        while improved:
            improved = False
            for ds in (-step_s, 0, step_s):
                for dth in (-step_t, 0, step_t):
                    for dx in (-step_p, 0, step_p):
                        for dy in (-step_p, 0, step_p):
                            if ds == dth == dx == dy == 0:
                                continue
                            c2 = score(s * (1 + ds), th + dth, tx + dx, ty + dy, k)
                            if c2 > sc + 1e-4:
                                sc, s, th, tx, ty = c2, s * (1 + ds), th + dth, tx + dx, ty + dy
                                improved = True
    final = score(s, th, tx, ty, 1)
    out = warp(new, s, th, tx, ty, (OW, OH), Image.BICUBIC)
    out.save(out_p, 'WEBP', quality=92, alpha_quality=100)
    return ({'margin': margin, 'iou': round(final, 4), 'scale': round(s, 4), 'rotDeg': round(math.degrees(th), 2), 't': [round(tx, 1), round(ty, 1)], 'size': [OW, OH]})


args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
if 'config' in opts:
    ROOT = __import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))))
    import os
    mpath = os.path.join(ROOT, 'public/assets/manifest.json')
    man = json.load(open(mpath))
    for e in json.load(open(opts['config'])):
        ent = man['assets'][e['key']]
        if ent.get('aligned'):
            print(e['key'], 'déjà recalée'); continue
        f = os.path.join(ROOT, 'public', ent['url'])
        r = align(f, os.path.join(ROOT, 'public', man['assets'][e['ref']]['url']), f, os.path.join(ROOT, e['exclude']) if e.get('exclude') else None, int(e.get('margin', 40)))
        ent['w'], ent['h'] = r['size']
        ent['aligned'] = {'ref': e['ref'], **r}
        print(e['key'], json.dumps(r))
    json.dump(man, open(mpath, 'w'), indent=1)
else:
    new_p, old_p, out_p = args
    print(json.dumps(align(new_p, old_p, out_p, opts.get('exclude'), int(opts.get('margin', 40)))))
