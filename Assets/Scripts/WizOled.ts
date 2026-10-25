// WizOled.ts - simulated SSD1306 128x64 OLED: decodes the real firmware face bitmaps into a procedural texture and plays
//              frame animations (LOOP / ONCE / BOOMERANG) like firmware/sesame-firmware-main.ino does.
// Owns: base64 -> 1-bit pixels -> RGBA texture, face name + animation state, per-face fps (faceFpsEntries in the firmware).
// Must not: know about the scene objects that show the texture (WizRobot wires the texture to a mesh).

import {FACE_FRAMES} from "./WizFaces"
import {hasEyeFace, eyeFrames} from "./EyeFaces"

export type FaceMode = "loop" | "once" | "boomerang"

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function b64decode(s: string): Uint8Array {
  const out = new Uint8Array(1024)
  let o = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < s.length && o < out.length; i++) {
    const c = s.charAt(i)
    if (c === "=") break
    const v = B64.indexOf(c)
    if (v < 0) continue
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 0xff
      acc &= (1 << bits) - 1
    }
  }
  return out
}

// fps per face from the firmware (faceFpsEntries); everything else 1.
const FACE_FPS: {[n: string]: number} = {point: 5, dead: 2, idle_blink: 7}

export class OledScreen {
  readonly texture: Texture
  private provider: ProceduralTextureProvider
  private cache: {[key: string]: Uint8Array} = {}
  private frames: (string | Uint8Array)[] = []
  private name: string = ""
  private mode: FaceMode = "loop"
  private idx: number = 0
  private dir: number = 1
  private timer: number = 0
  private finished: boolean = false
  private fg = [150, 255, 255]
  private rgba = new Uint8Array(128 * 64 * 4)

  constructor() {
    this.texture = ProceduralTextureProvider.createWithFormat(128, 64, TextureFormat.RGBA8Unorm)
    this.provider = this.texture.control as ProceduralTextureProvider
    this.setFace("idle", "boomerang")
  }

  faceName(): string {
    return this.name
  }

  frameIndex(): number {
    return this.idx
  }

  frameCount(): number {
    return this.frames.length
  }

  /** True when this face exists in the repo's face-bitmaps.h (stand/default are not present). */
  static hasBitmap(name: string): boolean {
    return FACE_FRAMES[name] !== undefined || hasEyeFace(name)
  }

  setFace(name: string, mode: FaceMode): void {
    if (name === this.name && mode === this.mode && !this.finished) return
    let frames: (string | Uint8Array)[] = hasEyeFace(name) ? eyeFrames(name) : FACE_FRAMES[name]
    if (!frames) frames = FACE_FRAMES["idle"] // firmware falls back to the default/idle face when a bitmap is missing
    this.frames = frames
    this.name = name
    this.mode = mode
    this.idx = 0
    this.dir = 1
    this.timer = 0
    this.finished = false
    this.draw()
  }

  private draw(): void {
    const key = this.name + ":" + this.idx
    let px = this.cache[key]
    if (!px) {
      const bytes = this.bytesNow()
      px = new Uint8Array(128 * 64 * 4)
      for (let y = 0; y < 64; y++) {
        const row = 63 - y // texture row 0 is the bottom
        for (let x = 0; x < 128; x++) {
          const bit = (bytes[(y * 128 + x) >> 3] >> (7 - (x & 7))) & 1
          const o = (row * 128 + x) * 4
          px[o] = bit ? this.fg[0] : 2
          px[o + 1] = bit ? this.fg[1] : 6
          px[o + 2] = bit ? this.fg[2] : 10
          px[o + 3] = 255
        }
      }
      this.cache[key] = px
    }
    this.provider.setPixels(0, 0, 128, 64, px)
  }

  tick(dt: number): void {
    if (this.frames.length <= 1 || (this.mode === "once" && this.finished)) return
    const fps = FACE_FPS[this.name] !== undefined ? FACE_FPS[this.name] : 1
    this.timer += dt
    if (this.timer < 1 / fps) return
    this.timer = 0
    const n = this.frames.length
    if (this.mode === "loop") this.idx = (this.idx + 1) % n
    else if (this.mode === "once") {
      if (this.idx + 1 >= n) this.finished = true
      else this.idx++
    } else {
      let next = this.idx + this.dir
      if (next >= n || next < 0) {
        this.dir = -this.dir
        next = this.idx + this.dir
      }
      this.idx = Math.max(0, Math.min(n - 1, next))
    }
    this.draw()
  }

  private bytesNow(): Uint8Array {
    const f = this.frames[Math.min(this.idx, this.frames.length - 1)]
    return typeof f === "string" ? b64decode(f) : f
  }

  /** Test helper: number of lit pixels in the current frame (proves a real bitmap is shown). */
  litPixels(): number {
    const bytes = this.bytesNow()
    let n = 0
    for (let i = 0; i < bytes.length; i++) {
      let b = bytes[i]
      while (b) {
        n += b & 1
        b >>= 1
      }
    }
    return n
  }

  /** Test helper: cheap signature of the current frame bytes. */
  signature(): number {
    const bytes = this.bytesNow()
    let h = 17
    for (let i = 0; i < bytes.length; i++) h = (h * 31 + bytes[i]) | 0
    return h
  }
}
