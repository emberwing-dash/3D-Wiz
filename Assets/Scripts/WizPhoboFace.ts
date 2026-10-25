// WizPhoboFace.ts - Phobo's screen: an analog-TV face. A small RGBA bitmap redrawn at ~20 fps: phosphor-green eyes and mouth on a dark glass,
// scanlines, vignette, a little noise and a static burst when the expression changes.
// Owns: the procedural texture and the expression drawing. Must not: know about the scene or the app.

const W = 96
const H = 72
const FG: [number, number, number] = [120, 255, 205]
const BG: [number, number, number] = [6, 18, 16]

export type FaceMood = "idle" | "happy" | "think" | "worried" | "wow" | "sleep" | "go"

export class WizPhoboFace {
  readonly texture: Texture
  private provider: ProceduralTextureProvider
  private px = new Uint8Array(W * H * 4)
  private mood: FaceMood = "idle"
  private clock = 0
  private acc = 0
  private staticT = 0.5 // starts with a power-on burst
  private nextBlink = 2.5
  private blinkT = 0
  private seed = 7

  constructor() {
    this.texture = ProceduralTextureProvider.createWithFormat(W, H, TextureFormat.RGBA8Unorm)
    this.provider = this.texture.control as ProceduralTextureProvider
    this.draw()
  }

  setMood(m: FaceMood) {
    if (m === this.mood) return
    this.mood = m
    this.staticT = 0.28
  }

  getMood(): FaceMood {
    return this.mood
  }

  tick(dt: number) {
    this.clock += dt
    if (this.staticT > 0) this.staticT -= dt
    this.nextBlink -= dt
    if (this.nextBlink <= 0) {
      this.blinkT = 0.14
      this.nextBlink = 2.2 + this.rnd() * 3
    }
    if (this.blinkT > 0) this.blinkT -= dt
    this.acc += dt
    if (this.acc < 0.05) return
    this.acc = 0
    this.draw()
  }

  // ------------------------------------------------------------------------------------------------ drawing
  private rnd(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
  }

  private set(x: number, y: number, k: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const i = (y * W + x) * 4
    const a = Math.max(0, Math.min(1, k))
    this.px[i] = Math.min(255, this.px[i] + (FG[0] - this.px[i]) * a)
    this.px[i + 1] = Math.min(255, this.px[i + 1] + (FG[1] - this.px[i + 1]) * a)
    this.px[i + 2] = Math.min(255, this.px[i + 2] + (FG[2] - this.px[i + 2]) * a)
  }

  private rect(cx: number, cy: number, w: number, h: number) {
    for (let y = Math.floor(cy - h / 2); y <= Math.ceil(cy + h / 2); y++) for (let x = Math.floor(cx - w / 2); x <= Math.ceil(cx + w / 2); x++) this.set(x, y, 1)
  }

  private disc(cx: number, cy: number, r: number, ring: boolean) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy))
        if (ring ? Math.abs(d - r) < 1.3 : d <= r) this.set(x, y, 1)
      }
  }

  private line(x0: number, y0: number, x1: number, y1: number) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t
      this.set(x, y, 1)
      this.set(x + 1, y, 1)
      this.set(x, y + 1, 1)
    }
  }

  private face() {
    const ex = 24
    const cx = W / 2
    const ey = 30
    const blink = this.blinkT > 0
    switch (this.mood) {
      case "idle":
        if (blink) {
          this.rect(cx - ex, ey, 14, 2)
          this.rect(cx + ex, ey, 14, 2)
        } else {
          this.rect(cx - ex, ey, 12, 16)
          this.rect(cx + ex, ey, 12, 16)
        }
        this.line(cx - 7, 54, cx + 7, 54)
        break
      case "happy":
        for (const sx of [-ex, ex]) {
          this.line(cx + sx - 8, ey + 6, cx + sx, ey - 6)
          this.line(cx + sx, ey - 6, cx + sx + 8, ey + 6)
        }
        for (let a = 0; a <= 12; a++) {
          const t = (a / 12) * Math.PI
          this.set(cx + Math.cos(t) * 12, 50 + Math.sin(t) * 8, 1)
          this.set(cx + Math.cos(t) * 12, 51 + Math.sin(t) * 8, 1)
        }
        break
      case "think": {
        const dx = Math.sin(this.clock * 1.5) * 3
        this.disc(cx - ex + dx, ey - 3, 6, false)
        this.disc(cx + ex + dx, ey - 3, 6, false)
        const n = Math.floor(this.clock * 3) % 4
        for (let i = 0; i < n; i++) this.disc(cx - 10 + i * 10, 54, 2, false)
        break
      }
      case "worried":
        this.rect(cx - ex, ey + 2, 10, 12)
        this.rect(cx + ex, ey + 2, 10, 12)
        this.line(cx - ex - 8, ey - 10, cx - ex + 8, ey - 15)
        this.line(cx + ex - 8, ey - 15, cx + ex + 8, ey - 10)
        for (let i = 0; i <= 20; i++) this.set(cx - 10 + i, 54 + Math.sin(i * 0.9 + this.clock * 4) * 2, 1)
        break
      case "wow":
        this.disc(cx - ex, ey, 8, true)
        this.disc(cx + ex, ey, 8, true)
        this.disc(cx - ex, ey, 3, false)
        this.disc(cx + ex, ey, 3, false)
        this.disc(cx, 54, 6, true)
        break
      case "sleep":
        this.rect(cx - ex, ey + 4, 14, 2)
        this.rect(cx + ex, ey + 4, 14, 2)
        {
          const z = (this.clock * 0.8) % 1
          this.line(cx + 22, 20 - z * 8, cx + 30, 20 - z * 8)
          this.line(cx + 30, 20 - z * 8, cx + 22, 28 - z * 8)
          this.line(cx + 22, 28 - z * 8, cx + 30, 28 - z * 8)
        }
        break
      case "go":
        this.rect(cx - ex, ey, 14, 5)
        this.rect(cx + ex, ey, 14, 5)
        this.line(cx - 10, 52, cx + 10, 52)
        break
    }
  }

  private draw() {
    const px = this.px
    for (let i = 0; i < W * H; i++) {
      px[i * 4] = BG[0]
      px[i * 4 + 1] = BG[1]
      px[i * 4 + 2] = BG[2]
      px[i * 4 + 3] = 255
    }
    this.face()
    // analog TV: horizontal tear, scanlines, noise, vignette
    const tear = this.staticT > 0 || this.rnd() < 0.02
    const tearY = Math.floor(this.rnd() * H)
    const out = new Uint8Array(px.length)
    for (let y = 0; y < H; y++) {
      const shift = tear && Math.abs(y - tearY) < 4 ? Math.floor((this.rnd() - 0.5) * 8) : 0
      const scan = y % 2 === 0 ? 1 : 0.62
      for (let x = 0; x < W; x++) {
        const sx = (x + shift + W) % W
        const s = ((H - 1 - y) * W + sx) * 4 // rows are read bottom-up: the screen shows the face upright
        const d = (y * W + x) * 4
        const vx = (x / W - 0.5) * 2
        const vy = (y / H - 0.5) * 2
        const vig = 1 - 0.35 * (vx * vx + vy * vy)
        const noise = 1 + (this.rnd() - 0.5) * 0.18
        let k = scan * vig * noise
        let r = px[s] * k
        let g = px[s + 1] * k
        let b = px[s + 2] * k
        if (this.staticT > 0) {
          const m = Math.min(1, this.staticT / 0.28) * 0.85
          const n = this.rnd() * 220
          r = r * (1 - m) + n * m
          g = g * (1 - m) + n * m
          b = b * (1 - m) + n * m
        }
        out[d] = Math.min(255, r)
        out[d + 1] = Math.min(255, g)
        out[d + 2] = Math.min(255, b)
        out[d + 3] = 255
      }
    }
    this.provider.setPixels(0, 0, W, H, out)
  }
}
