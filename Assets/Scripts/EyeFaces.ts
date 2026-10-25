// EyeFaces.ts - procedural 128x64 1-bit "robot eyes" for the ESP32 Desktop Pet (OLED SSD1306). The pet's README names the moods
//               (default, happy, angry, sleepy, asleep, scared, curiosity, tilted left/right) but ships no bitmaps in the README text;
//               these frames are DRAWN HERE to match those descriptions (approximate, not copied from the RoboEyes library).
// Owns: frame generation (1024-byte row-major bitmaps, MSB first, like the Sesame bitmaps).
// Must not: touch the scene.

type Buf = Uint8Array

function newBuf(): Buf {
  return new Uint8Array(1024)
}

function setPx(b: Buf, x: number, y: number, on: boolean): void {
  if (x < 0 || x > 127 || y < 0 || y > 63) return
  const i = (y * 128 + x) >> 3
  const m = 0x80 >> (x & 7)
  if (on) b[i] |= m
  else b[i] &= ~m & 0xff
}

function roundRect(b: Buf, x0: number, y0: number, w: number, h: number, r: number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = x < x0 + r ? x0 + r - x : x > x0 + w - 1 - r ? x - (x0 + w - 1 - r) : 0
      const dy = y < y0 + r ? y0 + r - y : y > y0 + h - 1 - r ? y - (y0 + h - 1 - r) : 0
      if (dx * dx + dy * dy <= r * r) setPx(b, x, y, true)
    }
  }
}

function eraseCircle(b: Buf, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPx(b, x, y, false)
}

function fillCircle(b: Buf, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPx(b, x, y, true)
}

interface Eye {
  x: number
  y: number
  w: number
  h: number
  r: number
}

function eyes(dx: number, dy: number, w: number, h: number, gap: number): Eye[] {
  const total = w * 2 + gap
  const x0 = Math.round((128 - total) / 2) + dx
  const y0 = Math.round((64 - h) / 2) + dy
  return [
    {x: x0, y: y0, w: w, h: h, r: Math.min(8, Math.floor(h / 3))},
    {x: x0 + w + gap, y: y0, w: w, h: h, r: Math.min(8, Math.floor(h / 3))},
  ]
}

function drawEyes(list: Eye[], mod?: (b: Buf, e: Eye, left: boolean) => void): Buf {
  const b = newBuf()
  for (let i = 0; i < list.length; i++) roundRect(b, list[i].x, list[i].y, list[i].w, list[i].h, list[i].r)
  if (mod) for (let i = 0; i < list.length; i++) mod(b, list[i], i === 0)
  return b
}

const MOODS: {[name: string]: () => Buf[]} = {
  default: () => [drawEyes(eyes(0, 0, 36, 36, 10)), drawEyes(eyes(0, 0, 36, 36, 10)), drawEyes(eyes(0, 14, 36, 6, 10))],
  happy: () => {
    const f = (dy: number) => drawEyes(eyes(0, dy, 36, 36, 10), (b, e) => eraseCircle(b, e.x + Math.floor(e.w / 2), e.y + e.h + 6, 22))
    return [f(0), f(-2)]
  },
  angry: () => {
    const f = (dx: number) =>
      drawEyes(eyes(dx, 0, 36, 36, 10), (b, e, left) => {
        for (let y = e.y; y < e.y + e.h; y++) {
          for (let x = e.x; x < e.x + e.w; x++) {
            const k = left ? x - e.x - e.w * 0.2 : e.x + e.w - 1 - x - e.w * 0.2
            if (y - e.y < k * 0.75) setPx(b, x, y, false)
          }
        }
      })
    return [f(0), f(1), f(-1)]
  },
  sleepy: () => {
    const f = (cut: number) => drawEyes(eyes(0, 4, 36, 36, 10), (b, e) => {
      for (let y = e.y; y < e.y + cut; y++) for (let x = e.x; x < e.x + e.w; x++) setPx(b, x, y, false)
    })
    return [f(18), f(23)]
  },
  asleep: () => {
    const f = (dy: number) => drawEyes(eyes(0, dy, 36, 4, 10))
    const b1 = f(14)
    const b2 = f(16)
    // a small "z" next to the right eye
    for (let i = 0; i < 6; i++) {
      setPx(b2, 112 + i, 8, true)
      setPx(b2, 117 - i, 8 + i, true)
      setPx(b2, 112 + i, 13, true)
    }
    return [b1, b2]
  },
  scared: () => {
    const f = (dx: number) => {
      const b = drawEyes(eyes(dx, 2, 28, 28, 16))
      fillCircle(b, 112, 12, 3) // sweat drop
      for (let y = 4; y < 9; y++) for (let x = 112 - (y - 4) / 2; x <= 112 + (y - 4) / 2; x++) setPx(b, Math.round(x), y, true)
      return b
    }
    return [f(-3), f(3), f(-2), f(2)]
  },
  curious: () => {
    const big = (dx: number) => {
      const b = newBuf()
      roundRect(b, 20 + dx, 10, 42, 44, 10)
      roundRect(b, 74 + dx, 18, 30, 28, 8)
      return b
    }
    return [big(0), big(4)]
  },
  left: () => {
    const a = drawEyes(eyes(-18, 0, 30, 36, 8))
    return [a]
  },
  right: () => {
    const a = drawEyes(eyes(18, 0, 30, 36, 8))
    return [a]
  },
}

export const EYE_PREFIX = "eye_"

export function hasEyeFace(name: string): boolean {
  return name.indexOf(EYE_PREFIX) === 0 && MOODS[name.substr(EYE_PREFIX.length)] !== undefined
}

const cache: {[name: string]: Buf[]} = {}

export function eyeFrames(name: string): Buf[] {
  const key = name.substr(EYE_PREFIX.length)
  if (!cache[key]) cache[key] = MOODS[key]()
  return cache[key]
}
