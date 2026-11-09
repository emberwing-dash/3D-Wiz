// GuideImport.ts - turn a circuit someone else drew into a guided build: a KiCad schematic file (.kicad_sch text), the JSON a vision model
// reads from a circuit photo, or any list of parts + nets, becomes a GuidePack (parts on the breadboard / model, place steps, wire steps).
// Owns: the part-type table, the KiCad s-expression reader (parts, pins, wires, labels -> nets), the JSON reader, the pack builder.
// Must not: touch the scene, read a key or make a network call (the caller sends the photo; this file only validates the answer).
//
// HONEST SCOPE: only parts the Guide has a 3D model for are understood (LED, resistor, battery holder, switch, DC motor, ESP32 module,
// L293D, micro servo). Anything else in a drawing is listed in `skipped` and left out; nets are rebuilt from wires / junctions / labels /
// power symbols that run along the grid (KiCad draws them that way). Tested with a KiCad 7 style file written for this project, not with files
// exported from every KiCad version.

import {GuidePack, GuidePart, GuideSpot, GuideStep, RC_SAMPLE, V3, parseGuidePack} from "./GuideData"

export type PartType = "led" | "resistor" | "battery" | "switch" | "motor" | "esp32" | "l293d" | "servo"

export const PART_TYPES: PartType[] = ["led", "resistor", "battery", "switch", "motor", "esp32", "l293d", "servo"]

/** The template (model key, size, pins) of a part type: the same parts as the RC car guide. */
const TEMPLATE_ID: {[t: string]: string} = {led: "led", resistor: "resistor", battery: "battery", switch: "switch", motor: "motor", esp32: "esp32", l293d: "l293d", servo: "servo"}

export function templateOf(type: PartType): GuidePart {
  const p = RC_SAMPLE.parts.filter((x) => x.id === TEMPLATE_ID[type])[0]
  return {...p, pins: p.pins.map((q) => ({...q, at: [...q.at] as V3})), trayAt: [...p.trayAt] as V3}
}

/** Pin ids of a part type (what the JSON / photo reader is allowed to use). */
export function pinIds(type: PartType): string[] {
  return templateOf(type).pins.map((p) => p.id)
}

export interface Circuit {
  title: string
  parts: {ref: string; type: PartType}[]
  nets: string[][] // each net: the "ref.pin" ends that are connected
  skipped: string[] // parts / pins that were in the drawing but cannot be built
}

// ------------------------------------------------------------------------------------------------ s-expression reader
type Sx = string | Sx[]

function tokenize(text: string): string[] {
  const out: string[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === "(" || c === ")") {
      out.push(c)
      i++
    } else if (c === '"') {
      let j = i + 1
      let s = ""
      while (j < n && text[j] !== '"') {
        if (text[j] === "\\" && j + 1 < n) j++
        s += text[j]
        j++
      }
      out.push('"' + s)
      i = j + 1
    } else if (c === " " || c === "\n" || c === "\r" || c === "\t") {
      i++
    } else {
      let j = i
      while (j < n && " \n\r\t()".indexOf(text[j]) < 0) j++
      out.push(text.substring(i, j))
      i = j
    }
  }
  return out
}

export function parseSexp(text: string): Sx {
  const tk = tokenize(text)
  let pos = 0
  const read = (): Sx => {
    const t = tk[pos++]
    if (t === "(") {
      const list: Sx[] = []
      while (pos < tk.length && tk[pos] !== ")") list.push(read())
      pos++
      return list
    }
    return t.charAt(0) === '"' ? t.substring(1) : t
  }
  return read()
}

const isList = (x: Sx): x is Sx[] => typeof x !== "string"
const head = (x: Sx): string => (isList(x) && x.length > 0 && typeof x[0] === "string" ? (x[0] as string) : "")
const kids = (x: Sx, name: string): Sx[][] => (isList(x) ? (x.filter((c) => isList(c) && head(c) === name) as Sx[][]) : [])
const num = (x: Sx): number => parseFloat(typeof x === "string" ? x : "0")
const str = (x: Sx | undefined): string => (typeof x === "string" ? x : "")

function prop(sym: Sx[], key: string): string {
  for (const p of kids(sym, "property")) if (str(p[1]) === key) return str(p[2])
  return ""
}

// ------------------------------------------------------------------------------------------------ KiCad schematic -> Circuit
interface LibPin {
  name: string
  number: string
  x: number
  y: number
}

function typeOf(libId: string, ref: string, value: string): PartType | null {
  const a = (libId + " " + value).toLowerCase()
  const r = ref.toUpperCase()
  if (a.indexOf("esp32") >= 0) return "esp32"
  if (a.indexOf("l293") >= 0) return "l293d"
  if (a.indexOf("servo") >= 0 || a.indexOf("sg90") >= 0) return "servo"
  if (a.indexOf("motor") >= 0 || /^M\d/.test(r)) return "motor"
  if (a.indexOf("battery") >= 0 || /^BT\d/.test(r)) return "battery"
  if (a.indexOf("led") >= 0 || (/^D\d/.test(r) && a.indexOf("led") >= 0)) return "led"
  if (a.indexOf("sw_") >= 0 || a.indexOf("switch") >= 0 || /^SW\d/.test(r)) return "switch"
  if (a.indexOf("device:r") >= 0 || /^R\d/.test(r)) return "resistor"
  return null
}

/** The Guide's pin id for a KiCad pin (by name when it matches, else by number), or null when the part has no such pin. */
export function mapPin(type: PartType, name: string, number: string): string | null {
  const ids = pinIds(type)
  const n = name.trim()
  if (type === "led") {
    if (n === "A" || n === "K") return n
    return number === "1" ? "K" : number === "2" ? "A" : null // KiCad Device:LED: pin 1 = K, pin 2 = A
  }
  if (type === "battery") {
    if (n === "+" || n === "-") return n
    return number === "1" ? "+" : number === "2" ? "-" : null
  }
  if (type === "motor") {
    if (n === "+" || n === "M+") return "M+"
    if (n === "-" || n === "M-") return "M-"
    return number === "1" ? "M+" : number === "2" ? "M-" : null
  }
  if (type === "servo") {
    if (ids.indexOf(n) >= 0) return n
    return number === "1" ? "GND" : number === "2" ? "VCC" : number === "3" ? "SIG" : null
  }
  if (ids.indexOf(n) >= 0) return n
  if (ids.indexOf(number) >= 0) return number
  return null
}

const key = (x: number, y: number): string => Math.round(x * 100) + "_" + Math.round(y * 100)

export function circuitFromKicad(text: string, title: string = "KiCad circuit"): Circuit {
  const root = parseSexp(text)
  if (head(root) !== "kicad_sch") throw new Error("not a KiCad schematic (kicad_sch)")
  // library: pin geometry per lib symbol
  const lib: {[id: string]: LibPin[]} = {}
  for (const ls of kids(kids(root, "lib_symbols").length > 0 ? kids(root, "lib_symbols")[0] : [], "symbol")) {
    const pins: LibPin[] = []
    const walk = (s: Sx[]) => {
      for (const p of kids(s, "pin")) {
        const at = kids(p, "at")[0]
        const nm = kids(p, "name")[0]
        const nu = kids(p, "number")[0]
        if (at) pins.push({name: nm ? str(nm[1]) : "", number: nu ? str(nu[1]) : "", x: num(at[1]), y: num(at[2])})
      }
      for (const sub of kids(s, "symbol")) walk(sub)
    }
    walk(ls)
    lib[str(ls[1])] = pins
  }
  // union-find over grid points
  const parent: {[k: string]: string} = {}
  const find = (a: string): string => {
    if (parent[a] === undefined) parent[a] = a
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const union = (a: string, b: string) => {
    parent[find(a)] = find(b)
  }
  const segs: {a: [number, number]; b: [number, number]}[] = []
  for (const w of kids(root, "wire")) {
    const pts = kids(kids(w, "pts")[0], "xy")
    for (let i = 0; i + 1 < pts.length; i++) {
      const a: [number, number] = [num(pts[i][1]), num(pts[i][2])]
      const b: [number, number] = [num(pts[i + 1][1]), num(pts[i + 1][2])]
      segs.push({a: a, b: b})
      union(key(a[0], a[1]), key(b[0], b[1]))
    }
  }
  const onSeg = (x: number, y: number) => {
    for (const s of segs) {
      const minx = Math.min(s.a[0], s.b[0]) - 0.005
      const maxx = Math.max(s.a[0], s.b[0]) + 0.005
      const miny = Math.min(s.a[1], s.b[1]) - 0.005
      const maxy = Math.max(s.a[1], s.b[1]) + 0.005
      if (x < minx || x > maxx || y < miny || y > maxy) continue
      const dx = s.b[0] - s.a[0]
      const dy = s.b[1] - s.a[1]
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 0.001) continue
      const dist = Math.abs(dy * (x - s.a[0]) - dx * (y - s.a[1])) / len
      if (dist < 0.02) return key(s.a[0], s.a[1])
    }
    return null
  }
  const attach = (x: number, y: number): string => {
    const k = key(x, y)
    const w = onSeg(x, y)
    if (w !== null) union(k, w)
    else find(k)
    return k
  }
  for (const j of kids(root, "junction")) {
    const at = kids(j, "at")[0]
    attach(num(at[1]), num(at[2]))
  }
  const labelNets: {[name: string]: string} = {}
  const labelAt = (name: string, x: number, y: number) => {
    const k = attach(x, y)
    if (labelNets[name] === undefined) labelNets[name] = k
    else union(labelNets[name], k)
  }
  for (const nm of ["label", "global_label", "hierarchical_label"]) {
    for (const l of kids(root, nm)) {
      const at = kids(l, "at")[0]
      if (at) labelAt(str(l[1]), num(at[1]), num(at[2]))
    }
  }
  // parts: instances -> pins at grid positions
  const parts: {ref: string; type: PartType}[] = []
  const pinPoints: {ref: string; pin: string; k: string}[] = []
  const skipped: string[] = []
  for (const s of kids(root, "symbol")) {
    const libId = str(kids(s, "lib_id")[0] ? kids(s, "lib_id")[0][1] : "")
    if (libId === "") continue
    const ref = prop(s, "Reference")
    const value = prop(s, "Value")
    const at = kids(s, "at")[0]
    if (!at) continue
    const pins = lib[libId] ? lib[libId] : []
    const sx = num(at[1])
    const sy = num(at[2])
    const ang = ((at[3] !== undefined ? num(at[3]) : 0) * Math.PI) / 180
    const mir = kids(s, "mirror")[0]
    const mx = mir ? str(mir[1]) === "x" : false
    const my = mir ? str(mir[1]) === "y" : false
    const place = (p: LibPin): [number, number] => {
      let px = p.x
      let py = p.y
      if (mx) py = -py
      if (my) px = -px
      const rx = px * Math.cos(ang) - py * Math.sin(ang)
      const ry = px * Math.sin(ang) + py * Math.cos(ang)
      return [sx + rx, sy - ry]
    }
    if (ref.charAt(0) === "#") {
      // power symbol (GND, +5V ...): every pin of the same value is the same net
      for (const p of pins) {
        const g = place(p)
        labelAt("PWR:" + value, g[0], g[1])
      }
      continue
    }
    const type = typeOf(libId, ref, value)
    if (type === null) {
      skipped.push(ref + " " + value + " (no 3D model for it)")
      continue
    }
    parts.push({ref: ref, type: type})
    for (const p of pins) {
      const id = mapPin(type, p.name, p.number)
      const g = place(p)
      const k = attach(g[0], g[1])
      if (id === null) {
        skipped.push(ref + " pin " + (p.name !== "" ? p.name : p.number))
        continue
      }
      pinPoints.push({ref: ref, pin: id, k: k})
    }
  }
  const groups: {[root: string]: string[]} = {}
  for (const pp of pinPoints) {
    const r = find(pp.k)
    if (!groups[r]) groups[r] = []
    const ref = pp.ref + "." + pp.pin
    if (groups[r].indexOf(ref) < 0) groups[r].push(ref)
  }
  const nets = Object.keys(groups).map((k) => groups[k]).filter((g) => g.length >= 2)
  if (parts.length === 0) throw new Error("no buildable parts found in the schematic")
  return {title: title, parts: parts, nets: nets, skipped: skipped}
}

// ------------------------------------------------------------------------------------------------ JSON (photo / video reader) -> Circuit
/** The instruction sent with a circuit photo: strict JSON only, with the exact part types and pin ids the Guide can build. */
export function circuitPrompt(): string {
  const types = PART_TYPES.map((t) => t + " (pins: " + pinIds(t).join(",") + ")").join("; ")
  return (
    "Read this circuit drawing or photo. Answer with STRICT JSON only, no markdown: " +
    '{"title":"short name","parts":[{"ref":"R1","type":"resistor"}],"connections":[["R1.2","D1.A"]]}. ' +
    "Allowed part types and pin ids (use ONLY these, ignore any part that is not in the list): " + types + ". " +
    "Each connection joins two pins that are wired together, written ref.pin. A shared node with 3 pins = 2 connections."
  )
}

export function circuitFromJson(text: string): Circuit {
  const o = JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/```$/, ""))
  if (!o || !Array.isArray(o.parts) || !Array.isArray(o.connections)) throw new Error("answer has no parts / connections")
  const parts: {ref: string; type: PartType}[] = []
  const have: {[ref: string]: PartType} = {}
  const skipped: string[] = []
  for (const p of o.parts) {
    if (typeof p.ref !== "string" || PART_TYPES.indexOf(p.type) < 0) {
      skipped.push(String(p.ref) + " (" + String(p.type) + ")")
      continue
    }
    if (have[p.ref]) continue
    have[p.ref] = p.type
    parts.push({ref: p.ref, type: p.type})
  }
  if (parts.length === 0) throw new Error("no part the Guide can build was found")
  // pairs -> nets (union by shared pin)
  const net: {[pin: string]: string} = {}
  const find = (a: string): string => {
    if (net[a] === undefined) net[a] = a
    while (net[a] !== a) a = net[a]
    return a
  }
  for (const c of o.connections) {
    if (!Array.isArray(c) || c.length !== 2) continue
    const ok = (r: string): boolean => {
      const i = String(r).indexOf(".")
      if (i < 0) return false
      const ref = r.substring(0, i)
      const pin = r.substring(i + 1)
      return !!have[ref] && pinIds(have[ref]).indexOf(pin) >= 0
    }
    if (!ok(c[0]) || !ok(c[1])) {
      skipped.push("connection " + c.join(" - "))
      continue
    }
    net[find(c[0])] = find(c[1])
  }
  const groups: {[r: string]: string[]} = {}
  for (const k of Object.keys(net)) {
    const r = find(k)
    if (!groups[r]) groups[r] = []
    groups[r].push(k)
  }
  const nets = Object.keys(groups).map((k) => groups[k]).filter((g) => g.length >= 2)
  return {title: typeof o.title === "string" && o.title.length > 0 ? o.title : "Circuit from a drawing", parts: parts, nets: nets, skipped: skipped}
}

// ------------------------------------------------------------------------------------------------ Circuit -> GuidePack
const MODEL_TYPES: PartType[] = ["battery", "switch", "motor", "servo"] // these mount on the model; the rest go on the breadboard
const MODEL_SLOTS: {at: V3}[] = [{at: [0, 3.15, 2.9]}, {at: [-2.4, 3.15, 0.9]}, {at: [2.4, 3.15, 0.9]}, {at: [0, 3.15, -2.5]}, {at: [1.3, 0.2, 5.2]}]

const safeId = (ref: string): string => ref.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Parts -> glowing spots (model deck / breadboard shelves), place steps, then one wire step per connection. Always validated by parseGuidePack. */
export function packFromCircuit(c: Circuit, source: string): GuidePack {
  const parts: GuidePart[] = []
  const spots: GuideSpot[] = []
  const steps: GuideStep[] = []
  const idOf: {[ref: string]: string} = {}
  const typeOfRef: {[ref: string]: PartType} = {}
  const used: {[id: string]: boolean} = {}
  for (const p of c.parts) {
    let id = safeId(p.ref)
    if (id === "") id = p.type
    while (used[id]) id += "x"
    used[id] = true
    idOf[p.ref] = id
    typeOfRef[p.ref] = p.type
    const t = templateOf(p.type)
    parts.push({...t, id: id, label: t.label + " (" + p.ref + ")"})
  }
  // spots
  let slot = 0
  let cursorX = -3.9
  let row = 0
  const rowZ = [-1.7, 1.5]
  for (const p of c.parts) {
    const id = idOf[p.ref]
    const part = parts.filter((x) => x.id === id)[0]
    const w = Math.max(part.sizeCm[0], 1.0) + 0.5
    const d = Math.max(part.sizeCm[2], 0.8) + 0.4
    if (MODEL_TYPES.indexOf(p.type) >= 0 && slot < MODEL_SLOTS.length) {
      const at = MODEL_SLOTS[slot++].at
      spots.push({id: "model_" + id, on: "model", at: [at[0], at[1], at[2]], plate: [w, d]})
    } else {
      if (cursorX + w > 4.0 && row === 0) {
        row = 1
        cursorX = -3.9
      }
      spots.push({id: "bb_" + id, on: "board", at: [cursorX + w / 2, 0.97, rowZ[row]], plate: [w, d]})
      cursorX += w + 0.3
    }
  }
  const spotOf = (id: string): string => spots.filter((s) => s.id === "model_" + id || s.id === "bb_" + id)[0].id
  // steps: model parts first (they carry the circuit), then the breadboard parts, then the wires
  const order = c.parts.slice().sort((a, b) => (MODEL_TYPES.indexOf(a.type) >= 0 ? 0 : 1) - (MODEL_TYPES.indexOf(b.type) >= 0 ? 0 : 1))
  let n = 1
  for (const p of order) {
    const id = idOf[p.ref]
    const part = parts.filter((x) => x.id === id)[0]
    const spot = spotOf(id)
    const where = spot.indexOf("model_") === 0 ? "on the model" : "on the breadboard"
    steps.push({
      id: "s" + n++, kind: "place", title: "Place " + p.ref, text: "Drop the " + part.label + " on the glowing spot " + where + ".", part: id, spot: spot, clip: "",
      say: "Place " + part.label + " " + where + ".", after: p.ref + " is in place.", hint: p.ref + " goes " + where + ", on the glowing spot.",
    })
  }
  const label = (end: string): string => {
    const i = end.indexOf(".")
    const ref = end.substring(0, i)
    const pin = end.substring(i + 1)
    const part = parts.filter((x) => x.id === idOf[ref])[0]
    const pp = part.pins.filter((q) => q.id === pin)[0]
    return ref + " " + (pp ? pp.label : pin)
  }
  const seen: {[k: string]: boolean} = {}
  for (const net of c.nets) {
    for (let i = 0; i + 1 < net.length; i++) {
      const a = net[i]
      const b = net[i + 1]
      const k = a < b ? a + "|" + b : b + "|" + a
      if (seen[k]) continue
      seen[k] = true
      const pa = idOf[a.substring(0, a.indexOf("."))] + "." + a.substring(a.indexOf(".") + 1)
      const pb = idOf[b.substring(0, b.indexOf("."))] + "." + b.substring(b.indexOf(".") + 1)
      steps.push({
        id: "s" + n++, kind: "wire", title: "Wire " + a + " to " + b, text: "Wire " + label(a) + " to " + label(b) + ".", pins: [pa, pb], clip: "",
        say: "Connect " + label(a) + " to " + label(b) + ".", after: "Connected.", hint: "Wire " + label(a) + " to " + label(b) + ".",
      })
    }
  }
  if (steps.filter((s) => s.kind === "wire").length === 0) throw new Error("the drawing has no connections between the parts")
  const pack: GuidePack = {title: c.title, source: source, controller: "none", board: RC_SAMPLE.board, parts: parts, spots: spots, steps: steps}
  return parseGuidePack(JSON.stringify(pack))
}
