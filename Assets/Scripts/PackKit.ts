// PackKit.ts - helpers for writing project packs (3dwiz-pack/1): primitive-part builders, component defaults, automatic bounds,
//              the guide-pack filler, and a few shared colours. Pure data helpers: no scene access.
// Owns: PrimDef shortcuts, primAabb (local bounds of a primitive model), mk() component factory, finishPack() consistency pass.
// Must not: hold project data (each Pack*.ts does) or touch the scene.

import {
  V3, RGBA, PrimDef, GroupDef, ComponentDef, PinDef, PackShape, PartGuide, StepDef, ConnectionDef, CommandDef, SESAME_PACK, Basis,
} from "./ProjectPack"
import {ElecSpec} from "./CircuitSim"

export const C = {
  pcbGreen: [0.1, 0.45, 0.25, 1] as RGBA,
  pcbBlue: [0.1, 0.3, 0.7, 1] as RGBA,
  pcbTeal: [0.05, 0.4, 0.45, 1] as RGBA,
  pcbRed: [0.7, 0.12, 0.12, 1] as RGBA,
  black: [0.07, 0.07, 0.08, 1] as RGBA,
  dark: [0.16, 0.17, 0.2, 1] as RGBA,
  silver: [0.78, 0.8, 0.84, 1] as RGBA,
  gold: [0.95, 0.8, 0.3, 1] as RGBA,
  white: [0.93, 0.94, 0.96, 1] as RGBA,
  grey: [0.55, 0.57, 0.62, 1] as RGBA,
  yellow: [0.95, 0.75, 0.15, 1] as RGBA,
  orange: [0.97, 0.5, 0.14, 1] as RGBA,
  red: [0.9, 0.15, 0.12, 1] as RGBA,
  blue: [0.2, 0.45, 0.9, 1] as RGBA,
  wire: [0.2, 0.9, 0.35, 1] as RGBA,
}

export const WIRE = {
  red: [1.0, 0.18, 0.15, 1] as RGBA,
  black: [0.12, 0.12, 0.14, 1] as RGBA,
  yellow: [1.0, 0.78, 0.2, 1] as RGBA,
  blue: [0.2, 0.62, 1.0, 1] as RGBA,
  green: [0.35, 0.9, 0.3, 1] as RGBA,
  orange: [1.0, 0.55, 0.15, 1] as RGBA,
  white: [0.95, 0.95, 0.95, 1] as RGBA,
  purple: [0.7, 0.4, 0.95, 1] as RGBA,
  brown: [0.7, 0.45, 0.25, 1] as RGBA,
}

export const box = (p: V3, z: V3, c?: RGBA, g?: string, r?: V3, n?: string): PrimDef => ({s: "box", p: p, z: z, c: c, g: g, r: r, n: n})
export const cyl = (p: V3, z: V3, c?: RGBA, g?: string, r?: V3, n?: string): PrimDef => ({s: "cyl", p: p, z: z, c: c, g: g, r: r, n: n})
export const sph = (p: V3, d: number, c?: RGBA, g?: string, n?: string): PrimDef => ({s: "sph", p: p, z: [d, d, d], c: c, g: g, n: n})
export const grp = (id: string, at: V3, parent?: string): GroupDef => ({id: id, at: at, parent: parent})

// ---- local bounds of a primitive model -------------------------------------------------------------------------------
const D2R = Math.PI / 180

function rotHalf(h: V3, r?: V3): V3 {
  if (!r) return h
  const cx = Math.cos(r[0] * D2R)
  const sx = Math.sin(r[0] * D2R)
  const cy = Math.cos(r[1] * D2R)
  const sy = Math.sin(r[1] * D2R)
  const cz = Math.cos(r[2] * D2R)
  const sz = Math.sin(r[2] * D2R)
  // R = Rz * Ry * Rx (Lens Studio euler convention); abs(R) * half extents = rotated AABB half extents
  const m = [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ]
  return [
    Math.abs(m[0][0]) * h[0] + Math.abs(m[0][1]) * h[1] + Math.abs(m[0][2]) * h[2],
    Math.abs(m[1][0]) * h[0] + Math.abs(m[1][1]) * h[1] + Math.abs(m[1][2]) * h[2],
    Math.abs(m[2][0]) * h[0] + Math.abs(m[2][1]) * h[1] + Math.abs(m[2][2]) * h[2],
  ]
}

/** AABB of a primitive model in the part frame (group offsets added, group rotations ignored: groups are pivots at rest). */
export function primAabb(prims: PrimDef[], groups?: GroupDef[]): {min: V3; max: V3} {
  const off: {[g: string]: V3} = {}
  if (groups) {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      const par = g.parent && off[g.parent] ? off[g.parent] : ([0, 0, 0] as V3)
      off[g.id] = [par[0] + g.at[0], par[1] + g.at[1], par[2] + g.at[2]]
    }
  }
  const mn: V3 = [1e9, 1e9, 1e9]
  const mx: V3 = [-1e9, -1e9, -1e9]
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i]
    const o = p.g && off[p.g] ? off[p.g] : ([0, 0, 0] as V3)
    const h = rotHalf([p.z[0] / 2, p.z[1] / 2, p.z[2] / 2], p.r)
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], o[k] + p.p[k] - h[k])
      mx[k] = Math.max(mx[k], o[k] + p.p[k] + h[k])
    }
  }
  if (prims.length === 0) return {min: [0, 0, 0], max: [0.1, 0.1, 0.1]}
  return {min: mn, max: mx}
}

export function pin(name: string, at: V3, label?: string): PinDef {
  return {name: name, at: at, label: label}
}

export interface CompSpec {
  id: string
  name: string
  purpose: string
  color: RGBA
  assembled: V3
  prims?: PrimDef[]
  groups?: GroupDef[]
  kind?: "printed" | "electronic"
  group?: string
  sizeCm?: V3
  sizeBasis?: Basis
  assembledRot?: V3
  exploded?: V3
  benchPos?: V3
  benchYaw?: number
  pins?: PinDef[]
  notes?: string[]
  model?: string
  outward?: boolean
  servo?: any
  elec?: ElecSpec
  deskHidden?: boolean
}

/** Component factory: fills defaults, derives bounds + size from the primitives. */
export function mk(s: CompSpec): ComponentDef {
  const prims = s.prims ? s.prims : []
  const bb = primAabb(prims, s.groups)
  const size: V3 = s.sizeCm ? s.sizeCm : [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]]
  const a = s.assembled
  const def: ComponentDef = {
    id: s.id,
    name: s.name,
    kind: s.kind ? s.kind : "electronic",
    group: s.group ? s.group : "electronics",
    purpose: s.purpose,
    sizeCm: size,
    sizeBasis: s.sizeBasis ? s.sizeBasis : "standard",
    assembled: a,
    assembledRot: s.assembledRot,
    exploded: s.exploded ? s.exploded : [0, 3, 0],
    boundsMin: [a[0] + bb.min[0], a[1] + bb.min[1], a[2] + bb.min[2]],
    boundsMax: [a[0] + bb.max[0], a[1] + bb.max[1], a[2] + bb.max[2]],
    color: s.color,
    benchPos: s.benchPos,
    benchYaw: s.benchYaw,
    pins: s.pins ? s.pins : [],
    notes: s.notes ? s.notes : [],
    prims: prims,
    groups: s.groups,
    model: s.model,
    outward: s.outward,
  }
  if (s.servo !== undefined) def.servo = s.servo
  if (s.elec !== undefined) def.elec = s.elec
  if (s.deskHidden !== undefined) def.deskHidden = s.deskHidden
  return def
}

/** Wire factory. */
export function wire(id: string, group: "power" | "i2c" | "servo" | "plug", a: string, b: string, label: string, explanation: string, color: RGBA, lift: number): ConnectionDef {
  const pa = a.split(".")
  const pb = b.split(".")
  return {id: id, group: group, from: {component: pa[0], pin: pa[1]}, to: {component: pb[0], pin: pb[1]}, label: label, explanation: explanation, color: color, lift: lift}
}

export function step(id: string, title: string, instruction: string, components: string[], wires: string[], basis: "repo" | "illustrative", source: string): StepDef {
  return {id: id, title: title, instruction: instruction, components: components, wires: wires, basis: basis, source: source}
}

export function cmd(id: string, label: string, face: string, mode: "loop" | "once" | "boomerang", steps: CommandDef["steps"], basis: string): CommandDef {
  return {id: id, label: label, face: face, mode: mode, steps: steps, basis: basis}
}

/** Fill pack.guide.parts from the components + plan (attach point = assembled pose, orientation cue per part). */
export function fillGuide(
  pack: PackShape,
  orient: {[id: string]: {text: string; face: string; dir: V3}},
  host: {[id: string]: string},
  doc: {doc: string; url: string},
  screws?: {[id: string]: string[]},
  tools?: {[id: string]: string[]},
): void {
  const stepOf = (id: string): string => {
    for (const k in pack.plan) if (pack.plan[k].place.indexOf(id) >= 0) return k
    return ""
  }
  for (let i = 0; i < pack.components.length; i++) {
    const c = pack.components[i]
    if (c.group === "prop") continue
    const o = orient[c.id] ? orient[c.id] : {text: "as drawn", face: "+Y", dir: [0, 1, 0] as V3}
    const st = stepOf(c.id)
    const step = pack.steps.find((x) => x.id === st)
    const g: PartGuide = {
      partId: c.id,
      stepId: st,
      attach: {
        hostId: host[c.id] ? host[c.id] : "body",
        at: [c.assembled[0], c.assembled[1], c.assembled[2]],
        rot: c.assembledRot ? [c.assembledRot[0], c.assembledRot[1], c.assembledRot[2]] : [0, 0, 0],
        face: o.face,
        faceDir: o.dir,
        screws: screws && screws[c.id] ? screws[c.id] : [],
      },
      orientation: o.text,
      source: {doc: doc.doc, section: step ? step.source : doc.doc, url: doc.url},
      tools: tools && tools[c.id] ? tools[c.id] : [],
      basis: "illustrative",
    }
    pack.guide.parts.push(g)
  }
}

/** Consistency pass every pack goes through: validation.expected, shared gesture settings. */
export function finishPack(p: PackShape): PackShape {
  p.validation.expected = p.connections.filter((c) => c.group !== "plug").map((c) => c.id)
  p.gesture = SESAME_PACK.gesture
  return p
}

export const DEFAULT_GAME = {snapCm: 2.2, confetti: 16}
export const DEFAULT_WORKBENCH = {holeToleranceMm: 0.15, lengthSlackMm: 1.5, tightCm: 0.15, screwVisualScale: 3}
export const DEFAULT_VALIDATION_NOTE = "Virtual check only against the project pack - NOT a physical test. A virtual pass does not prove a real build works."
