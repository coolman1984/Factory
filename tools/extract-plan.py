# Reconstructs geometry from the deck's flat plan images with classic computer vision (OpenCV).
# Output: private/layout.json in SLIDE points, plus private/debug_<pic>.png with every detection drawn on the plan.
# Scale: 1 slide point = 0.30 m, cross-checked on three objects (truck ~12 m, column grid ~8 x 12 m, large injection machine ~13.5 m).
import json, sys
from pathlib import Path
import cv2, numpy as np

ROOT = Path(__file__).resolve().parent.parent / "private"
UP = 3
PICS = {"pic28": (21, 157, 410, 337), "pic10": (431, 174, 119, 255), "pic117": (555, 305, 355, 137), "pic130": (724.5, 143.5, 222, 159)}
PLATE = {"pic28": "E1", "pic10": "E1", "pic117": "E2-1F", "pic130": "E2-2F"}

def rects(mask, min_area=0, keep=None):
    n, _, st, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a >= min_area and (keep is None or keep(x, y, w, h, a)):
            out.append((int(x), int(y), int(w), int(h), int(a)))
    return out

def analyse(name):
    x0, y0, W, H = PICS[name]
    img = cv2.imread(str(ROOT / "plans" / f"{name}.png"))
    big = cv2.resize(img, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    g = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY)
    bh, bw = g.shape
    dark = (g < 175).astype(np.uint8) * 255
    k = lambda a, b: cv2.getStructuringElement(cv2.MORPH_RECT, (a, b))

    # walls: long straight dark runs
    hor = cv2.morphologyEx(dark, cv2.MORPH_OPEN, k(70, 1))
    ver = cv2.morphologyEx(dark, cv2.MORPH_OPEN, k(1, 70))
    walls = rects(cv2.dilate(hor, k(1, 3)), 0, lambda x, y, w, h, a: w >= 70 and h <= 16) + rects(cv2.dilate(ver, k(3, 1)), 0, lambda x, y, w, h, a: h >= 70 and w <= 16)
    no_walls = cv2.subtract(dark, cv2.dilate(cv2.bitwise_or(hor, ver), k(5, 5)))

    # racks: comb-like fields of short bars. Texture density, split on the white aisles between them.
    dens = cv2.blur((no_walls > 0).astype(np.float32), (9, 9))
    field = ((dens > .30) * 255).astype(np.uint8)
    field = cv2.morphologyEx(field, cv2.MORPH_CLOSE, k(5, 11))
    field = cv2.morphologyEx(field, cv2.MORPH_OPEN, k(11, 11))
    blobs = rects(field, 500)
    racks, solids = [], []
    for (x, y, w, h, a) in blobs:
        fill = a / (w * h)
        roi = g[y:y + h, x:x + w]
        black = float((roi < 70).mean())
        long_, short = max(w, h), min(w, h)
        if black > .24 and long_ < 240:
            solids.append((x, y, w, h, a))        # very dark: machine bodies
        elif long_ / max(1, short) >= 1.6 and long_ >= 60 and fill > .5:
            racks.append((x, y, w, h, a))
        else:
            solids.append((x, y, w, h, a))

    # columns: small compact blobs left when walls and fields are gone
    rest = cv2.subtract(no_walls, cv2.dilate(field, k(9, 9)))
    cols = rects(rest, 10, lambda x, y, w, h, a: 5 <= w <= 34 and 4 <= h <= 30 and max(w, h) / max(1, min(w, h)) < 2.6)

    sx, sy = W / bw, H / bh
    to = lambda r: {"x": round(x0 + r[0] * sx, 1), "y": round(y0 + r[1] * sy, 1), "w": round(r[2] * sx, 1), "h": round(r[3] * sy, 1)}
    dbg = big.copy()
    for r, c in [(w, (0, 170, 0)) for w in walls] + [(r, (255, 60, 0)) for r in racks] + [(s, (0, 0, 230)) for s in solids] + [(c, (230, 0, 230)) for c in cols]:
        cv2.rectangle(dbg, (r[0], r[1]), (r[0] + r[2], r[1] + r[3]), c, 2)
    cv2.imwrite(str(ROOT / f"debug_{name}.png"), dbg)
    print(f"{name}: walls {len(walls)}, racks {len(racks)}, solids {len(solids)}, columns {len(cols)}")
    return {"plate": PLATE[name], "walls": [to(w) for w in walls], "racks": [to(r) for r in racks], "solids": [to(s) for s in solids], "columns": [to(c) for c in cols]}

out = {n: analyse(n) for n in PICS}
(ROOT / "layout.json").write_text(json.dumps(out))
