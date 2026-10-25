// CircuitSim.ts - a small, PURE (no Lens API) DC circuit simulator for the 3D Wiz Circuit Lab.
// Owns: nets from wires, a nodal-analysis solver with piecewise-linear parts, part behaviour models (battery, boost converter, ESP32-class
//       MCU, L293D H-bridge, 74HC595, DC motor, servo, LED, resistor, diode, NPN, button, buzzer), hazards, and "can this circuit do X?"
//       function analysis (every GPIO level combination is tried, like a bring-up test).
// Must not: touch the scene, know about packs / UI, or claim physical correctness. It is a SIMPLIFIED DC model (no transients, no
//           PWM waveforms, no thermal limits): a virtual pass does NOT prove a real build works. Datasheet-level numbers are noted inline.
// Pin names per kind (the pack's PinDef.name must use these):
//   battery  "+" "-"                         boost   "IN+" "IN-" "OUT+" "OUT-"
//   mcu      "5V" "GND" "3V3" + the GPIO names listed in spec.gpios (e.g. "IO12")
//   l293d    "1".."16" (DIP-16: 1 EN1,2  2 1A  3 1Y  4/5/12/13 GND  6 2Y  7 2A  8 VCC2  9 EN3,4  10 3A  11 3Y  14 4Y  15 4A  16 VCC1)
//   hc595    "1".."16" (DIP-16: 15 QA  1 QB  2 QC  3 QD  4 QE  5 QF  6 QG  7 QH  8 GND  9 QH'  10 SRCLR  11 SRCLK  12 RCLK  13 OE  14 SER  16 VCC)
//   motor    "M+" "M-"        servo "VCC" "GND" "SIG"        led "A" "K"      diode "A" "K"
//   resistor "1" "2"          npn "E" "B" "C"                button "1" "2"   buzzer "+" "-"

export type ElecKind = "battery" | "boost" | "mcu" | "l293d" | "hc595" | "motor" | "servo" | "led" | "resistor" | "diode" | "npn" | "button" | "buzzer"

export interface ElecSpec {
  kind: ElecKind
  p?: {[k: string]: number} // battery volts | boost vout, vinMin | motor ohms | led vf | resistor ohms | diode vf
  gpios?: string[] // mcu: GPIO pin names
}

export interface SimPart {
  id: string
  spec: ElecSpec
}

export type Wire = [string, string] // "part/pin" - "part/pin"

export interface Drive {
  gpio: {[key: string]: number} // "esp/IO12" -> 0 | 1   (missing = input / Hi-Z)
  sr: {[partId: string]: number} // 74HC595 latched byte (bit0 = QA)
  pressed: {[partId: string]: boolean}
}

export interface PartState {
  v: number // voltage across the part's two main terminals (+ to -)
  i: number // current through it (A), positive = from its first pin to its second
  powered: boolean
  lit: number // led 0..1
  spin: number // motor -1..1 (sign = direction)
  moves: boolean // servo: powered and its signal line is driven by a powered MCU
  sound: number // buzzer 0..1
  flags: string[] // short warnings: "no resistor", "overcurrent" ...
}

export interface SimResult {
  net: {[pin: string]: number}
  parts: {[id: string]: PartState}
  hazards: string[]
  iterations: number
}

const GMIN = 1e-9

function key(id: string, pin: string): string {
  return id + "/" + pin
}

function emptyState(): PartState {
  return {v: 0, i: 0, powered: false, lit: 0, spin: 0, moves: false, sound: 0, flags: []}
}

/** Union-find over pin keys. */
class Nets {
  private parent: {[k: string]: string} = {}
  find(k: string): string {
    if (this.parent[k] === undefined) this.parent[k] = k
    let r = k
    while (this.parent[r] !== r) r = this.parent[r]
    let c = k
    while (this.parent[c] !== r) {
      const n = this.parent[c]
      this.parent[c] = r
      c = n
    }
    return r
  }
  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[ra] = rb
  }
}

/** L293D DIP-16 channel map: [enable, input, output] pin names. */
const L293_CH: string[][] = [
  ["1", "2", "3"],
  ["1", "7", "6"],
  ["9", "10", "11"],
  ["9", "15", "14"],
]
const L293_GND = ["4", "5", "12", "13"]
const HC595_Q = ["15", "1", "2", "3", "4", "5", "6", "7"] // QA..QH

interface Elem {
  a: string // net ids
  b: string
  g: number // conductance between a and b
  // Norton equivalent: current source `is` flowing INTO a and out of b (so a source from b(-) to a(+) of voltage V with series r: g=1/r, is=V/r)
  is: number
  part?: string
  tag?: string
}

interface State {
  diodeOn: {[id: string]: boolean}
  npnSat: {[id: string]: number} // 0 off, 1 saturated, 2 active (current limited)
  mcuOn: {[id: string]: boolean}
  boostOn: {[id: string]: boolean}
  l293: {[id: string]: boolean[]} // channel drives
  l293Hi: {[id: string]: boolean[]}
  hcOn: {[id: string]: boolean}
  hcCtl: {[id: string]: boolean}
  npnIc: {[id: string]: number}
}

export class Circuit {
  private parts: SimPart[]
  private byId: {[id: string]: SimPart} = {}

  constructor(parts: SimPart[]) {
    this.parts = parts
    for (const p of parts) this.byId[p.id] = p
  }

  partIds(): string[] {
    return this.parts.map((p) => p.id)
  }

  spec(id: string): ElecSpec {
    return this.byId[id].spec
  }

  private buildNets(wires: Wire[]): Nets {
    const nets = new Nets()
    for (const w of wires) nets.union(w[0], w[1])
    for (const p of this.parts) {
      if (p.spec.kind === "l293d") for (let i = 1; i < L293_GND.length; i++) nets.union(key(p.id, L293_GND[0]), key(p.id, L293_GND[i]))
      if (p.spec.kind === "boost") nets.union(key(p.id, "IN-"), key(p.id, "OUT-")) // MT3608: the negative rails are common
    }
    return nets
  }

  /** Pins (other than itself) sharing a net with `pin`. */
  private mates(nets: Nets, pin: string): string[] {
    const r = nets.find(pin)
    const out: string[] = []
    for (const p of this.parts) {
      for (const pn of this.pinNames(p)) {
        const k = key(p.id, pn)
        if (k !== pin && nets.find(k) === r) out.push(k)
      }
    }
    return out
  }

  pinNames(p: SimPart): string[] {
    switch (p.spec.kind) {
      case "battery":
        return ["+", "-"]
      case "boost":
        return ["IN+", "IN-", "OUT+", "OUT-"]
      case "mcu":
        return ["5V", "GND", "3V3"].concat(p.spec.gpios ? p.spec.gpios : [])
      case "l293d":
      case "hc595": {
        const o: string[] = []
        for (let i = 1; i <= 16; i++) o.push(String(i))
        return o
      }
      case "motor":
        return ["M+", "M-"]
      case "servo":
        return ["VCC", "GND", "SIG"]
      case "led":
      case "diode":
        return ["A", "K"]
      case "npn":
        return ["E", "B", "C"]
      case "buzzer":
        return ["+", "-"]
      default:
        return ["1", "2"]
    }
  }

  /** GPIO pins of every MCU that are wired to something (the ones a test can usefully drive). */
  usedGpios(wires: Wire[]): string[] {
    const nets = this.buildNets(wires)
    const out: string[] = []
    for (const p of this.parts) {
      if (p.spec.kind !== "mcu" || !p.spec.gpios) continue
      for (const g of p.spec.gpios) {
        const k = key(p.id, g)
        if (this.mates(nets, k).length > 0) out.push(k)
      }
    }
    return out
  }

  private initialState(): State {
    return {diodeOn: {}, npnSat: {}, mcuOn: {}, boostOn: {}, l293: {}, l293Hi: {}, hcOn: {}, hcCtl: {}, npnIc: {}}
  }

  // ------------------------------------------------------------------------------------------------------------------
  /** Solve the DC operating point for the given wires and drive (GPIO levels, 595 bytes, pressed buttons). */
  solve(wires: Wire[], drive: Drive): SimResult {
    const nets = this.buildNets(wires)
    // ground = the battery's "-" net; without a battery there is no reference (everything reads 0 V)
    let gndNet = ""
    for (const p of this.parts) if (p.spec.kind === "battery") gndNet = nets.find(key(p.id, "-"))
    const st = this.initialState()
    let volts: {[net: string]: number} = {}
    const V = (pin: string): number => {
      const n = nets.find(pin)
      return n === gndNet ? 0 : volts[n] !== undefined ? volts[n] : 0
    }
    // structural facts for the logic parts
    const hcControl: {[id: string]: boolean} = {}
    for (const p of this.parts) {
      if (p.spec.kind !== "hc595") continue
      let ok = true
      const seen: {[n: string]: boolean} = {}
      for (const pn of ["14", "11", "12"]) {
        const m = this.mates(nets, key(p.id, pn)).filter((k) => this.isGpio(k))
        if (m.length === 0 || seen[nets.find(key(p.id, pn))]) ok = false
        seen[nets.find(key(p.id, pn))] = true
      }
      hcControl[p.id] = ok
    }
    const servoSig: {[id: string]: boolean} = {}
    for (const p of this.parts) {
      if (p.spec.kind !== "servo") continue
      servoSig[p.id] = this.mates(nets, key(p.id, "SIG")).some((k) => this.isGpio(k))
    }

    let iterations = 0
    let elems: Elem[] = []
    let prevSig = ""
    for (let it = 0; it < 40; it++) {
      iterations = it + 1
      elems = this.stamp(nets, gndNet, drive, st, V, hcControl)
      volts = this.solveNodal(elems, nets, gndNet)
      this.lastVolts = volts
      this.lastGnd = gndNet
      const changed = this.updateState(nets, gndNet, drive, st, V, elems, hcControl)
      const sig = JSON.stringify(st)
      if (!changed || sig === prevSig) break
      prevSig = sig
    }
    return this.collect(nets, gndNet, drive, st, V, elems, volts, hcControl, servoSig, iterations)
  }

  /** Are the two pins on the same net? */
  connected(wires: Wire[], a: string, b: string): boolean {
    const nets = this.buildNets(wires)
    return nets.find(a) === nets.find(b)
  }

  /** Every pin on the net of the given pin (including itself). */
  netMembers(wires: Wire[], pin: string): string[] {
    const nets = this.buildNets(wires)
    const r = nets.find(pin)
    const out: string[] = []
    for (const p of this.parts) for (const pn of this.pinNames(p)) if (nets.find(key(p.id, pn)) === r) out.push(key(p.id, pn))
    return out
  }

  private isGpio(pin: string): boolean {
    const [id, pn] = pin.split("/")
    const p = this.byId[id]
    return !!p && p.spec.kind === "mcu" && !!p.spec.gpios && p.spec.gpios.indexOf(pn) >= 0
  }

  // ------------------------------------------------------------------------------------------------------------------
  private stamp(nets: Nets, gnd: string, drive: Drive, st: State, V: (p: string) => number, hcControl: {[id: string]: boolean}): Elem[] {
    const out: Elem[] = []
    const n = (id: string, pin: string) => nets.find(key(id, pin))
    const res = (a: string, b: string, ohms: number, part?: string, tag?: string) => out.push({a: a, b: b, g: 1 / Math.max(ohms, 1e-3), is: 0, part: part, tag: tag})
    const src = (plus: string, minus: string, volts: number, rs: number, part?: string, tag?: string) =>
      out.push({a: plus, b: minus, g: 1 / Math.max(rs, 1e-3), is: volts / Math.max(rs, 1e-3), part: part, tag: tag})
    for (const p of this.parts) {
      const id = p.id
      const sp = p.spec
      const pr = sp.p ? sp.p : {}
      switch (sp.kind) {
        case "battery":
          src(n(id, "+"), n(id, "-"), pr.volts !== undefined ? pr.volts : 6, 0.15, id, "src")
          break
        case "boost":
          if (st.boostOn[id]) src(n(id, "OUT+"), n(id, "OUT-"), pr.vout !== undefined ? pr.vout : 5, 0.2, id, "src")
          break
        case "mcu": {
          if (!st.mcuOn[id]) break
          src(n(id, "3V3"), n(id, "GND"), 3.3, 1.5, id, "v33")
          for (const g of sp.gpios ? sp.gpios : []) {
            const lv = drive.gpio[key(id, g)]
            if (lv === undefined) continue
            src(n(id, g), n(id, "GND"), lv > 0 ? 3.3 : 0, 25, id, "gpio:" + g) // ~25 ohm output stage
          }
          break
        }
        case "l293d": {
          const ch = st.l293[id]
          const hi = st.l293Hi[id]
          if (!ch) break
          for (let c = 0; c < 4; c++) {
            if (!ch[c]) continue
            const vcc2 = V(key(id, "8"))
            // Darlington outputs: high = VCC2 - 1.4 V, low ~ 0.2 V (datasheet typ.), ~2 ohm output resistance
            src(n(id, L293_CH[c][2]), n(id, "4"), hi && hi[c] ? Math.max(0, vcc2 - 1.4) : 0.2, 2, id, "out" + c)
          }
          break
        }
        case "hc595": {
          if (!st.hcOn[id] || !st.hcCtl[id] || drive.sr[id] === undefined) break
          const vcc = V(key(id, "16"))
          for (let b = 0; b < 8; b++) src(n(id, HC595_Q[b]), n(id, "8"), (drive.sr[id] >> b) & 1 ? vcc : 0, 50, id, "q" + b)
          break
        }
        case "motor":
          res(n(id, "M+"), n(id, "M-"), pr.ohms !== undefined ? pr.ohms : 6, id)
          break
        case "servo":
          if (V(key(id, "VCC")) > 0.5) res(n(id, "VCC"), n(id, "GND"), 25, id) // ~200 mA at 5 V while moving (very simplified)
          else res(n(id, "VCC"), n(id, "GND"), 1e6, id)
          break
        case "resistor":
          res(n(id, "1"), n(id, "2"), pr.ohms !== undefined ? pr.ohms : 220, id)
          break
        case "buzzer":
          res(n(id, "+"), n(id, "-"), 60, id)
          break
        case "button":
          if (drive.pressed[id]) res(n(id, "1"), n(id, "2"), 0.05, id)
          break
        case "led":
        case "diode": {
          if (!st.diodeOn[id]) break
          const vf = pr.vf !== undefined ? pr.vf : sp.kind === "led" ? 2.0 : 0.7
          const r = sp.kind === "led" ? 5 : 0.5
          const g = 1 / r
          // element current a->b is g*(va - vb) - is, so is = g*vf gives i(A->K) = g * (va - vk - vf)
          out.push({a: n(id, "A"), b: n(id, "K"), g: g, is: g * vf, part: id, tag: "d"})
          break
        }
        case "npn": {
          if (!st.diodeOn[id + "/be"]) break
          const g = 1 / 10
          out.push({a: n(id, "B"), b: n(id, "E"), g: g, is: g * 0.7, part: id, tag: "be"}) // base-emitter diode, 0.7 V
          if (st.npnSat[id] === 2) out.push({a: n(id, "C"), b: n(id, "E"), g: 0, is: -(st.npnIc[id] ? st.npnIc[id] : 0), part: id, tag: "ic"}) // active: Ic = beta * Ib
          else out.push({a: n(id, "C"), b: n(id, "E"), g: 1, is: 0.15, part: id, tag: "ce"}) // saturated: Vce ~ 0.15 V through 1 ohm
          break
        }
      }
    }
    return out
  }

  /** Nodal analysis (gaussian elimination); every net gets a tiny leak to ground so floating nets stay solvable. */
  private solveNodal(elems: Elem[], nets: Nets, gnd: string): {[net: string]: number} {
    const idx: {[net: string]: number} = {}
    const names: string[] = []
    for (const e of elems) {
      for (const nn of [e.a, e.b]) if (nn !== gnd && idx[nn] === undefined) {
        idx[nn] = names.length
        names.push(nn)
      }
    }
    const n = names.length
    if (n === 0) return {}
    const A: number[][] = []
    const z: number[] = []
    for (let i = 0; i < n; i++) {
      A.push(new Array(n).fill(0))
      A[i][i] = GMIN
      z.push(0)
    }
    for (const e of elems) {
      const ia = e.a === gnd ? -1 : idx[e.a]
      const ib = e.b === gnd ? -1 : idx[e.b]
      if (ia >= 0) {
        A[ia][ia] += e.g
        z[ia] += e.is
      }
      if (ib >= 0) {
        A[ib][ib] += e.g
        z[ib] -= e.is
      }
      if (ia >= 0 && ib >= 0) {
        A[ia][ib] -= e.g
        A[ib][ia] -= e.g
      }
    }
    // gaussian elimination with partial pivoting
    for (let c = 0; c < n; c++) {
      let piv = c
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
      if (piv !== c) {
        const t = A[c]
        A[c] = A[piv]
        A[piv] = t
        const tz = z[c]
        z[c] = z[piv]
        z[piv] = tz
      }
      const d = A[c][c]
      if (Math.abs(d) < 1e-18) continue
      for (let r = c + 1; r < n; r++) {
        const f = A[r][c] / d
        if (f === 0) continue
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]
        z[r] -= f * z[c]
      }
    }
    const x = new Array(n).fill(0)
    for (let r = n - 1; r >= 0; r--) {
      let s = z[r]
      for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]
      x[r] = Math.abs(A[r][r]) < 1e-18 ? 0 : s / A[r][r]
    }
    const out: {[net: string]: number} = {}
    for (let i = 0; i < n; i++) out[names[i]] = x[i]
    return out
  }

  /** Re-derive the part states that depend on node voltages. Returns true when something changed. */
  private updateState(
    nets: Nets, gnd: string, drive: Drive, st: State, V: (p: string) => number, elems: Elem[], hcControl: {[id: string]: boolean},
  ): boolean {
    let changed = false
    const setb = (o: {[k: string]: boolean}, k: string, v: boolean) => {
      if (o[k] !== v) {
        o[k] = v
        changed = true
      }
    }
    for (const p of this.parts) {
      const id = p.id
      const sp = p.spec
      const pr = sp.p ? sp.p : {}
      if (sp.kind === "boost") {
        const vin = V(key(id, "IN+")) - V(key(id, "IN-"))
        const was = st.boostOn[id] === true
        setb(st.boostOn, id, was ? vin > 1.8 : vin >= (pr.vinMin !== undefined ? pr.vinMin : 2.5)) // hysteresis
      } else if (sp.kind === "mcu") {
        const v5 = V(key(id, "5V")) - V(key(id, "GND"))
        const was = st.mcuOn[id] === true
        setb(st.mcuOn, id, was ? v5 > 4.0 : v5 >= 4.5 && v5 <= 6.0)
      } else if (sp.kind === "l293d") {
        const vcc1 = V(key(id, "16"))
        const vcc2 = V(key(id, "8"))
        const gv = V(key(id, "4"))
        const ch: boolean[] = []
        const hi: boolean[] = []
        const powered = vcc1 - gv >= 4.5 && vcc2 - gv >= 4.5
        for (let c = 0; c < 4; c++) {
          const en = V(key(id, L293_CH[c][0])) - gv >= 2.3
          const inp = V(key(id, L293_CH[c][1])) - gv >= 2.3
          ch.push(powered && en)
          hi.push(inp)
        }
        const old = st.l293[id]
        const oldHi = st.l293Hi[id]
        if (!old || old.join() !== ch.join() || !oldHi || oldHi.join() !== hi.join()) changed = true
        st.l293[id] = ch
        st.l293Hi[id] = hi
      } else if (sp.kind === "hc595") {
        const vcc = V(key(id, "16")) - V(key(id, "8"))
        const gv = V(key(id, "8"))
        const oe = V(key(id, "13")) - gv < 0.3 * vcc // OE is active low
        const clr = V(key(id, "10")) - gv > 0.7 * vcc // SRCLR must be high
        setb(st.hcOn, id, vcc >= 2.0 && vcc <= 6.0 && oe && clr)
        // 74HC inputs need VIH = 0.7 x Vcc: the ESP32 high level (3.3 V) only works up to ~4.7 V supply
        setb(st.hcCtl, id, hcControl[id] === true && vcc * 0.7 <= 3.35)
      } else if (sp.kind === "led" || sp.kind === "diode") {
        const vf = pr.vf !== undefined ? pr.vf : sp.kind === "led" ? 2.0 : 0.7
        const vd = V(key(id, "A")) - V(key(id, "K"))
        const was = st.diodeOn[id] === true
        setb(st.diodeOn, id, was ? vd > vf - 0.02 : vd > vf + 0.005)
      } else if (sp.kind === "npn") {
        const vbe = V(key(id, "B")) - V(key(id, "E"))
        const was = st.diodeOn[id + "/be"] === true
        setb(st.diodeOn, id + "/be", was ? vbe > 0.68 : vbe > 0.7)
        if (st.diodeOn[id + "/be"]) {
          const beta = pr.beta !== undefined ? pr.beta : 100
          const ib = this.elemCurrent(elems, id, "be")
          const mode = st.npnSat[id] === undefined || st.npnSat[id] === 0 ? 1 : st.npnSat[id]
          let next = mode
          if (mode === 1) {
            const ic = this.elemCurrent(elems, id, "ce")
            if (ib > 1e-6 && ic > beta * ib * 1.02) next = 2
          } else if (V(key(id, "C")) - V(key(id, "E")) < 0.2) next = 1
          if (next === 2) {
            const v = beta * Math.max(ib, 0)
            if (Math.abs((st.npnIc[id] ? st.npnIc[id] : 0) - v) > 1e-6) changed = true
            st.npnIc[id] = v
          }
          if (next !== st.npnSat[id]) {
            st.npnSat[id] = next
            changed = true
          }
        } else if (st.npnSat[id] !== 0) {
          st.npnSat[id] = 0
          changed = true
        }
      }
    }
    return changed
  }

  private lastVolts: {[net: string]: number} = {}
  private lastGnd = ""
  private vn(net: string): number {
    return net === this.lastGnd ? 0 : this.lastVolts[net] !== undefined ? this.lastVolts[net] : 0
  }

  /** Current a -> b through the first stamped element of a part with that tag (node voltages of the last solve). */
  private elemCurrent(elems: Elem[], part: string, tag: string): number {
    for (const e of elems) if (e.part === part && e.tag === tag) return e.g * (this.vn(e.a) - this.vn(e.b)) - e.is
    return 0
  }

  // ------------------------------------------------------------------------------------------------------------------
  private collect(
    nets: Nets, gnd: string, drive: Drive, st: State, V: (p: string) => number, elems: Elem[], volts: {[net: string]: number},
    hcControl: {[id: string]: boolean}, servoSig: {[id: string]: boolean}, iterations: number,
  ): SimResult {
    const netOut: {[pin: string]: number} = {}
    const parts: {[id: string]: PartState} = {}
    const hazards: string[] = []
    const vv = (net: string) => (net === gnd ? 0 : volts[net] !== undefined ? volts[net] : 0)
    for (const p of this.parts) for (const pn of this.pinNames(p)) netOut[key(p.id, pn)] = vv(nets.find(key(p.id, pn)))
    const cur = (e: Elem) => e.g * (vv(e.a) - vv(e.b)) - e.is // current a -> b through the element
    for (const p of this.parts) {
      const id = p.id
      const sp = p.spec
      const s = emptyState()
      parts[id] = s
      const pn = (n: string) => netOut[key(id, n)]
      if (sp.kind === "led") {
        s.v = pn("A") - pn("K")
        let i = 0
        for (const e of elems) if (e.part === id && e.tag === "d") i = cur(e)
        s.i = Math.max(0, i)
        s.lit = Math.max(0, Math.min(1, s.i / 0.015))
        s.powered = s.i > 0.0005
        if (s.i > 0.03) {
          s.flags.push("too much current")
          hazards.push(id + ": LED overcurrent (" + Math.round(s.i * 1000) + " mA) - needs a series resistor")
        }
      } else if (sp.kind === "motor") {
        s.v = pn("M+") - pn("M-")
        s.i = s.v / (sp.p && sp.p.ohms !== undefined ? sp.p.ohms : 6)
        s.spin = Math.abs(s.v) >= 1.2 ? Math.sign(s.v) * Math.min(1, Math.abs(s.v) / 5) : 0
        s.powered = Math.abs(s.v) > 0.3
      } else if (sp.kind === "servo") {
        s.v = pn("VCC") - pn("GND")
        s.powered = s.v >= 4.0 && s.v <= 7.0
        s.moves = s.powered && servoSig[id] === true && this.sigDriven(nets, id, st)
        if (s.v > 7.0) s.flags.push("over voltage")
      } else if (sp.kind === "buzzer") {
        s.v = pn("+") - pn("-")
        s.sound = Math.max(0, Math.min(1, (Math.abs(s.v) - 1.5) / 2))
        s.powered = s.sound > 0
      } else if (sp.kind === "resistor") {
        s.v = pn("1") - pn("2")
        s.i = s.v / (sp.p && sp.p.ohms !== undefined ? sp.p.ohms : 220)
      } else if (sp.kind === "diode") {
        s.v = pn("A") - pn("K")
        for (const e of elems) if (e.part === id && e.tag === "d") s.i = Math.max(0, cur(e))
        s.powered = s.i > 0.0005
      } else if (sp.kind === "npn") {
        s.v = pn("C") - pn("E")
        s.powered = st.diodeOn[id + "/be"] === true
      } else if (sp.kind === "battery") {
        s.v = pn("+") - pn("-")
        for (const e of elems) if (e.part === id && e.tag === "src") s.i = cur(e)
        s.powered = true
        if (Math.abs(s.i) > 3) {
          hazards.push(id + ": short circuit (" + s.i.toFixed(1) + " A)")
          s.flags.push("short")
        }
      } else if (sp.kind === "boost") {
        s.v = pn("OUT+") - pn("OUT-")
        s.powered = st.boostOn[id] === true
        for (const e of elems) if (e.part === id && e.tag === "src") s.i = cur(e)
        if (s.powered && Math.abs(s.i) > 1.5) hazards.push(id + ": boost converter overloaded (" + s.i.toFixed(1) + " A)")
      } else if (sp.kind === "mcu") {
        s.powered = st.mcuOn[id] === true
        s.v = pn("5V") - pn("GND")
        for (const e of elems) {
          if (e.part !== id || !e.tag) continue
          if (e.tag.indexOf("gpio:") === 0 && Math.abs(cur(e)) > 0.04) hazards.push(id + "/" + e.tag.slice(5) + ": GPIO overloaded (" + Math.round(Math.abs(cur(e)) * 1000) + " mA)")
          if (e.tag === "v33" && Math.abs(cur(e)) > 0.4) hazards.push(id + ": 3V3 pin overloaded")
        }
      } else if (sp.kind === "l293d") {
        s.powered = (st.l293[id] ? st.l293[id].some((x) => x) : false) || pn("16") - pn("4") >= 4.5
        for (const e of elems) if (e.part === id && e.tag && e.tag.indexOf("out") === 0 && Math.abs(cur(e)) > 0.6) hazards.push(id + ": driver output overloaded (" + Math.abs(cur(e)).toFixed(1) + " A)")
      } else if (sp.kind === "hc595") {
        s.powered = st.hcOn[id] === true
        if (st.hcOn[id] && !hcControl[id]) s.flags.push("clock / data pins not on GPIOs")
        else if (st.hcOn[id] && !st.hcCtl[id]) s.flags.push("needs a 3.3 V supply for ESP32 logic")
      }
    }
    return {net: netOut, parts: parts, hazards: hazards, iterations: iterations}
  }

  private sigDriven(nets: Nets, servoId: string, st: State): boolean {
    for (const k of this.mates(nets, key(servoId, "SIG"))) {
      if (!this.isGpio(k)) continue
      const mid = k.split("/")[0]
      if (st.mcuOn[mid]) return true
    }
    return false
  }

  // ------------------------------------------------------------------------------------------------------------------
  /** What can this circuit do? Tries every combination of the wired GPIO levels (and 595 outputs) and records the effects. */
  explore(wires: Wire[]): Exploration {
    const gp = this.usedGpios(wires)
    const nets = this.buildNets(wires)
    const hcs = this.parts.filter((p) => p.spec.kind === "hc595").map((p) => p.id)
    const buttons = this.parts.filter((p) => p.spec.kind === "button").map((p) => p.id)
    const ex: Exploration = {effects: {}, hazards: [], solves: 0, gpios: gp.slice()}
    const note = (part: string, effect: string, d: Drive) => {
      const k = part + ":" + effect
      if (!ex.effects[k]) ex.effects[k] = d
    }
    const record = (d: Drive) => {
      const r = this.solve(wires, d)
      ex.solves++
      for (const h of r.hazards) if (ex.hazards.indexOf(h) < 0) ex.hazards.push(h)
      for (const id in r.parts) {
        const s = r.parts[id]
        if (s.spin > 0) note(id, "spin+", d)
        if (s.spin < 0) note(id, "spin-", d)
        if (s.lit > 0.15) note(id, "lit", d)
        if (s.moves) note(id, "moves", d)
        if (s.sound > 0.2) note(id, "sound", d)
        if (s.powered) note(id, "powered", d)
      }
      return r
    }
    const maxCombos = Math.min(1 << gp.length, 256)
    for (let c = 0; c < maxCombos; c++) {
      const gpio: {[k: string]: number} = {}
      for (let b = 0; b < gp.length; b++) gpio[gp[b]] = (c >> b) & 1
      const sr: {[k: string]: number} = {}
      for (const h of hcs) sr[h] = 0
      const base: Drive = {gpio: gpio, sr: sr, pressed: {}}
      record(base)
      if (c === 0) for (const b of buttons) record({gpio: gpio, sr: sr, pressed: {[b]: true}})
    }
    // shift registers: with the clock / data pins on GPIOs, every output bit can be set (the firmware would shift it in)
    const allHigh: {[k: string]: number} = {}
    for (const g of gp) allHigh[g] = 0
    for (const h of hcs) {
      for (let bit = 0; bit < 8; bit++) {
        const sr: {[k: string]: number} = {}
        for (const o of hcs) sr[o] = o === h ? 1 << bit : 0
        record({gpio: allHigh, sr: sr, pressed: {}})
      }
      const all: {[k: string]: number} = {}
      for (const o of hcs) all[o] = o === h ? 255 : 0
      record({gpio: allHigh, sr: all, pressed: {}})
    }
    void nets
    return ex
  }
}

export interface Exploration {
  effects: {[partEffect: string]: Drive} // "part:effect" -> the first drive that produced it
  hazards: string[]
  solves: number
  gpios: string[]
}

// ---------------------------------------------------------------------------------------------------------------------
// Functions ("can the car drive?") - goals over exploration effects
export interface Goal {
  part: string
  effect: "spin+" | "spin-" | "lit" | "moves" | "sound" | "powered"
  label?: string
}

export interface FnDef {
  id: string
  label: string // at most two words
  icon: string
  goals: Goal[]
}

export interface FnReport {
  id: string
  pass: boolean
  done: number // goals reached
  total: number
  missing: string[] // short reasons for goals that were not reached
  drives: Drive[] // one drive per reached goal (replay for the animation)
}

export function evaluateFunctions(c: Circuit, wires: Wire[], fns: FnDef[], ex?: Exploration): {reports: FnReport[]; exploration: Exploration} {
  const e = ex ? ex : c.explore(wires)
  const reports: FnReport[] = []
  for (const f of fns) {
    const r: FnReport = {id: f.id, pass: true, done: 0, total: f.goals.length, missing: [], drives: []}
    for (const g of f.goals) {
      const d = e.effects[g.part + ":" + g.effect]
      if (d) {
        r.done++
        r.drives.push(d)
      } else {
        r.pass = false
        const why = diagnose(c, wires, g, e)
        for (const w of why) if (r.missing.indexOf(w) < 0) r.missing.push(w)
      }
    }
    reports.push(r)
  }
  return {reports: reports, exploration: e}
}

/** Short, human reasons why a goal was not reached (at most three). */
export function diagnose(c: Circuit, wires: Wire[], g: Goal, ex: Exploration): string[] {
  const out: string[] = []
  const spec = c.spec(g.part)
  const nets = new Set<string>()
  void nets
  const all = c.solve(wires, {gpio: allOnes(ex.gpios), sr: {}, pressed: {}})
  const pin = (id: string, n: string) => all.net[id + "/" + n]
  const used = (id: string, n: string): boolean => wires.some((w) => w[0] === id + "/" + n || w[1] === id + "/" + n)
  const parts = c.partIds()
  const first = (k: ElecKind): string | null => {
    for (const id of parts) if (c.spec(id).kind === k) return id
    return null
  }
  const bat = first("battery")
  if (bat && !used(bat, "+")) out.push("battery + not wired")
  else if (bat && !used(bat, "-")) out.push("battery - not wired")
  for (const id of parts) {
    const k = c.spec(id).kind
    if (k === "boost" && !all.parts[id].powered) out.push("boost has no power")
    if (k === "mcu" && !all.parts[id].powered && (g.part !== id)) out.push("ESP32 has no 5 V")
    if (k === "l293d" && (g.effect === "spin+" || g.effect === "spin-")) {
      if (pin(id, "16") < 4.5) out.push("driver logic needs 5 V")
      else if (pin(id, "8") < 4.5) out.push("driver motor supply low")
      else if (pin(id, "4") !== 0 && !used(id, "4")) out.push("driver GND missing")
    }
  }
  for (const id of parts) {
    if (c.spec(id).kind === "hc595") for (const f of all.parts[id].flags) if (out.indexOf("74HC595: " + f) < 0) out.push("74HC595: " + f)
  }
  if (spec.kind === "motor") {
    if (!used(g.part, "M+") || !used(g.part, "M-")) out.push("motor not wired to the driver")
    else if (out.length === 0) out.push(g.effect === "spin+" ? "no GPIO makes it go forward" : "no GPIO makes it reverse")
  } else if (spec.kind === "servo") {
    if (!used(g.part, "VCC") || !used(g.part, "GND")) out.push("servo has no power")
    else if (!used(g.part, "SIG")) out.push("servo signal not wired")
    else if (out.length === 0) out.push("servo signal not on an ESP32 pin")
  } else if (spec.kind === "led") {
    if (!used(g.part, "A") || !used(g.part, "K")) out.push("LED not wired")
    else if (out.length === 0) out.push("no current reaches the LED")
  } else if (spec.kind === "buzzer") {
    if (out.length === 0) out.push("buzzer gets no voltage")
  }
  return out.slice(0, 3)
}

function allOnes(g: string[]): {[k: string]: number} {
  const o: {[k: string]: number} = {}
  for (const k of g) o[k] = 1
  return o
}

// ---------------------------------------------------------------------------------------------------------------------
export type PinRole = "power" | "ground" | "signal" | "out" | "io"

/** What a pin is for (drives the colour of the pin picker and the wire colour of a quick wire). */
export function pinRole(kind: ElecKind, pin: string): PinRole {
  switch (kind) {
    case "battery":
      return pin === "+" ? "power" : "ground"
    case "boost":
      return pin === "IN+" || pin === "OUT+" ? "power" : "ground"
    case "mcu":
      return pin === "5V" || pin === "3V3" ? "power" : pin === "GND" ? "ground" : "io"
    case "l293d":
      return pin === "16" || pin === "8" ? "power" : L293_GND.indexOf(pin) >= 0 ? "ground" : pin === "3" || pin === "6" || pin === "11" || pin === "14" ? "out" : "signal"
    case "hc595":
      return pin === "16" ? "power" : pin === "8" ? "ground" : HC595_Q.indexOf(pin) >= 0 ? "out" : "signal"
    case "servo":
      return pin === "VCC" ? "power" : pin === "GND" ? "ground" : "signal"
    case "motor":
      return "out"
    case "led":
    case "diode":
      return pin === "K" ? "ground" : "signal"
    case "npn":
      return pin === "E" ? "ground" : pin === "C" ? "out" : "signal"
    case "buzzer":
      return pin === "+" ? "signal" : "ground"
    default:
      return "signal"
  }
}

/** Pins that are tied to another pin of the same part (the picker shows only one of them). */
export function tiedDuplicate(kind: ElecKind, pin: string): boolean {
  return kind === "l293d" && (pin === "5" || pin === "12" || pin === "13")
}

export interface WireLike {
  a: string
  b: string
}

/** Are two pins on the same net given these wires (plus the parts' internal ties)? */
export function sameNet(c: Circuit, wires: Wire[], a: string, b: string): boolean {
  return c.connected(wires, a, b)
}

/** Pin role for parts without an electrical model (verified-pin packs): by the pin's name. */
export function genericRole(pin: string): PinRole {
  const n = pin.toUpperCase()
  if (n === "GND" || n === "VSS" || n === "-") return "ground"
  if (n === "VCC" || n === "VIN" || n === "3V3" || n === "5V" || n === "3.3V" || n === "VDD" || n === "+") return "power"
  return "signal"
}
