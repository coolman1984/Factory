# Proof of the take-off: draws private/replica.json back on each plan, side by side with nothing hidden.
import json
from pathlib import Path
import cv2
R = Path(__file__).resolve().parent.parent / "private"
L = json.loads((R / "replica.json").read_text())
for pic in ["pic28", "pic10", "pic117", "pic130"]:
    im = cv2.imread(str(R / "plans" / f"big_{pic}.png"))
    box = lambda r, c, t=2: cv2.rectangle(im, (int(r[0]), int(r[1])), (int(r[0] + r[2]), int(r[1] + r[3])), c, t)
    for w in L["walls"]:
        if w["pic"] == pic: r = w["raw"]; cv2.line(im, (int(r[0]), int(r[1])), (int(r[2]), int(r[3])), (0, 170, 0), 3)
    for r in L["racks"]:
        if r["pic"] == pic: box(r["raw"], (255, 60, 0))
    for m in L["machines"]:
        if m["pic"] == pic: box(m["raw"], (0, 0, 230))
    for t in L["trucks"]:
        if t["pic"] == pic: box(t["raw"], (0, 140, 255))
    for c in L["columns"]:
        if c["pic"] == pic: cv2.circle(im, (int(c["raw"][0]), int(c["raw"][1])), 6, (230, 0, 230), 2)
    for c in L["conveyors"]:
        if c["pic"] == pic:
            p = c["raw"]
            for a, b in zip(p, p[1:]): cv2.line(im, (int(a[0]), int(a[1])), (int(b[0]), int(b[1])), (0, 200, 200), 3)
    cv2.imwrite(str(R / f"takeoff_{pic}.png"), im)
print("overlays written")
