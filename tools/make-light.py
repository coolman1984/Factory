# Turns the Cycles bakes into the floor light maps: power-of-two size, shadows deepened (they are multiplied after tone mapping).
import cv2, numpy as np
for n, s in [("E1", (2048, 1024)), ("E2-1F", (1024, 512)), ("E2-2F", (1024, 1024))]:
    v = cv2.resize(cv2.imread(f"private/bake/light_{n}.png", 0), s, interpolation=cv2.INTER_AREA) / 255.0
    cv2.imwrite(f"private/bake/{n}.jpg", (255 * np.clip(v, .12, 1) ** 3).astype("uint8"), [cv2.IMWRITE_JPEG_QUALITY, 88])
