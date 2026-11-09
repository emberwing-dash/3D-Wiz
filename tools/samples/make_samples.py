"""make_samples.py - draws the two sample inputs for the converters (no real photo / video is needed to try them):
   led_circuit_photo.png   a clean schematic picture of the LED starter circuit (what CONVERT PHOTO reads)
   led_tutorial.mp4        a short silent "tutorial" that builds the same circuit step by step with on-screen captions (what tools/video-to-pack.mjs reads)
Run:  python tools/samples/make_samples.py     (needs Pillow, opencv-python, numpy)"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 960, 540


def font(size):
    for name in ("arial.ttf", "DejaVuSans.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


F_BIG, F_MID, F_SM = font(34), font(26), font(20)
INK = (20, 20, 30)
WIRE = (0, 120, 0)

# ---- geometry of the circuit drawing (a rectangle loop: battery left, switch top, resistor top right, LED right, back along the bottom)
BAT = (150, 270)       # battery centre
SW = (360, 120)        # switch centre
RES = (610, 120)       # resistor centre
LED = (810, 270)       # LED centre
TOP, BOT, LEFT, RIGHT = 120, 420, 150, 810


def battery(d, c, label=True):
    x, y = c
    d.line([(x - 30, y - 12), (x + 30, y - 12)], fill=INK, width=5)   # long plate = +
    d.line([(x - 18, y + 12), (x + 18, y + 12)], fill=INK, width=5)   # short plate = -
    d.text((x + 40, y - 44), "+", fill=(190, 0, 0), font=F_MID)
    d.text((x + 40, y + 6), "-", fill=(0, 0, 160), font=F_MID)
    if label:
        d.text((x - 150, y - 12), "BT1  4xAA\nbattery", fill=INK, font=F_SM)


def switch(d, c, label=True):
    x, y = c
    d.ellipse([x - 50, y - 6, x - 38, y + 6], outline=INK, width=3)
    d.ellipse([x + 38, y - 6, x + 50, y + 6], outline=INK, width=3)
    d.line([(x - 40, y), (x + 36, y - 26)], fill=INK, width=4)
    if label:
        d.text((x - 55, y + 18), "SW1  switch", fill=INK, font=F_SM)


def resistor(d, c, label=True):
    x, y = c
    d.rectangle([x - 40, y - 15, x + 40, y + 15], outline=INK, width=4)
    if label:
        d.text((x - 55, y + 24), "R1  220 ohm", fill=INK, font=F_SM)


def led(d, c, label=True):
    x, y = c
    d.polygon([(x - 22, y - 24), (x - 22, y + 24), (x + 22, y)], outline=INK, width=4)   # triangle points down the page: anode on top
    d.line([(x - 22, y + 24), (x + 22, y + 24)], fill=INK, width=4)
    pts = [(x - 22, y - 24), (x + 22, y - 24)]
    d.line(pts, fill=INK, width=4)
    d.text((x + 34, y - 34), "A", fill=(190, 0, 0), font=F_SM)
    d.text((x + 34, y + 12), "K", fill=(0, 0, 160), font=F_SM)
    d.line([(x + 36, y - 40), (x + 62, y - 62)], fill=(200, 150, 0), width=3)
    d.line([(x + 52, y - 28), (x + 78, y - 50)], fill=(200, 150, 0), width=3)
    if label:
        d.text((x - 100, y + 40), "D1  LED", fill=INK, font=F_SM)


def wire(d, pts):
    d.line(pts, fill=WIRE, width=5, joint="curve")


def draw_circuit(stage=99, caption=None):
    img = Image.new("RGB", (W, H), (250, 248, 238))
    d = ImageDraw.Draw(img)
    if stage >= 1:
        battery(d, BAT)
    if stage >= 2:
        switch(d, SW)
    if stage >= 3:
        resistor(d, RES)
    if stage >= 4:
        led(d, LED)
    if stage >= 5:
        wire(d, [(BAT[0], BAT[1] - 12), (BAT[0], TOP), (SW[0] - 50, TOP)])           # battery + to switch
    if stage >= 6:
        wire(d, [(SW[0] + 50, TOP), (RES[0] - 40, TOP)])                              # switch to resistor
    if stage >= 7:
        wire(d, [(RES[0] + 40, TOP), (LED[0], TOP), (LED[0], LED[1] - 24)])           # resistor to LED anode
    if stage >= 8:
        wire(d, [(LED[0], LED[1] + 24), (LED[0], BOT), (BAT[0], BOT), (BAT[0], BAT[1] + 12)])   # LED cathode back to battery -
    if caption:
        d.rectangle([0, H - 70, W, H], fill=(20, 30, 50))
        d.text((24, H - 58), caption, fill=(255, 255, 255), font=F_MID)
    return img


def main():
    draw_circuit(8).save(os.path.join(HERE, "led_circuit_photo.png"))
    caps = [
        (1, "Step 1: put the 4xAA battery holder on the table"),
        (2, "Step 2: add a slide switch next to it"),
        (3, "Step 3: place a 220 ohm resistor"),
        (4, "Step 4: place the LED, long leg (anode) up"),
        (5, "Step 5: wire battery + to the switch"),
        (6, "Step 6: wire the switch to the resistor"),
        (7, "Step 7: wire the resistor to the LED long leg"),
        (8, "Step 8: wire the LED short leg back to battery -  - done, switch on"),
    ]
    out = os.path.join(HERE, "led_tutorial.mp4")
    vw = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*"mp4v"), 5, (W, H))
    for stage, cap in caps:
        frame = cv2.cvtColor(np.array(draw_circuit(stage, cap)), cv2.COLOR_RGB2BGR)
        for _ in range(15):   # 3 seconds per step at 5 fps
            vw.write(frame)
    vw.release()
    print("wrote led_circuit_photo.png and led_tutorial.mp4 (%d bytes)" % os.path.getsize(out))


if __name__ == "__main__":
    main()
