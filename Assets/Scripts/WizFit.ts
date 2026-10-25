// WizFit.ts - rule-based fit check + auto-arrange of axis-aligned component boxes inside a cavity, and the screw/driver rules
//             (pure logic, no scene).
// Owns: overlap / containment tests, a deterministic greedy packer with simple placement rules (battery low and back, OLED on
//       the front face, switch on top, MCU near the OLED ...), a size recommendation ("Needs +1.2 cm height"), checkScrew().
// NOT AI, NOT a physical or thermal analysis. Sizes are standard sizes from PROJECT_PACK.visualize.catalog.
// Must not: touch the scene (WizVisualize draws the boxes) or hold app state.

import {V3, PROJECT_PACK, ScrewHole, FastenerDef, ToolDef} from "./ProjectPack"

export interface FitBox {
  min: V3
  max: V3
}

export interface FitItem {
  id: string
  size: V3 // current orientation (x width, y height, z depth)
  center: V3
  fixed: boolean // true = never rotate (OLED faces the front, switch sits in its top slot)
}

export interface FitResult {
  fits: boolean[]
  count: number
  total: number
}

export interface Recommendation {
  items: FitItem[]
  cavity: FitBox
  extra: V3 // extra interior needed on each axis (cm)
  fitsAll: boolean
  text: string
}

const EPS = 0.001
const STEP = 0.2

export function boxOf(it: FitItem): FitBox {
  return {
    min: [it.center[0] - it.size[0] / 2, it.center[1] - it.size[1] / 2, it.center[2] - it.size[2] / 2],
    max: [it.center[0] + it.size[0] / 2, it.center[1] + it.size[1] / 2, it.center[2] + it.size[2] / 2],
  }
}

export function overlaps(a: FitBox, b: FitBox): boolean {
  for (let k = 0; k < 3; k++) {
    if (a.max[k] <= b.min[k] + EPS || b.max[k] <= a.min[k] + EPS) return false
  }
  return true
}

export function inside(b: FitBox, cav: FitBox): boolean {
  for (let k = 0; k < 3; k++) {
    if (b.min[k] < cav.min[k] - EPS || b.max[k] > cav.max[k] + EPS) return false
  }
  return true
}

/** An item fits when it is inside the cavity and overlaps no other item. */
export function evaluate(items: FitItem[], cav: FitBox): FitResult {
  const fits: boolean[] = []
  let count = 0
  for (let i = 0; i < items.length; i++) {
    const bi = boxOf(items[i])
    let ok = inside(bi, cav)
    for (let j = 0; j < items.length && ok; j++) {
      if (j !== i && overlaps(bi, boxOf(items[j]))) ok = false
    }
    fits.push(ok)
    if (ok) count++
  }
  return {fits: fits, count: count, total: items.length}
}

/** Tight = fits, but sits closer than `tight` cm (yet not flush) to a side wall or the ceiling. */
export function isTight(it: FitItem, cav: FitBox, tight: number): boolean {
  const b = boxOf(it)
  const gaps = [b.min[0] - cav.min[0], cav.max[0] - b.max[0], b.min[2] - cav.min[2], cav.max[2] - b.max[2], cav.max[1] - b.max[1]]
  for (let i = 0; i < gaps.length; i++) if (gaps[i] > 0.001 && gaps[i] < tight) return true
  return false
}

export function catalogItems(): FitItem[] {
  const out: FitItem[] = []
  const cat = PROJECT_PACK.visualize.catalog
  for (let i = 0; i < cat.length; i++) {
    out.push({id: cat[i].id, size: [cat[i].size[0], cat[i].size[1], cat[i].size[2]], center: [0, 0, 0], fixed: cat[i].fixed === true})
  }
  return out
}

/** A deliberately naive starting layout (items dropped on top of each other); used by tests of the red/green check. */
export function naiveLayout(cav: FitBox): FitItem[] {
  const items = catalogItems()
  const cx = (cav.min[0] + cav.max[0]) / 2
  const cy = (cav.min[1] + cav.max[1]) / 2
  const cz = (cav.min[2] + cav.max[2]) / 2
  const dc = PROJECT_PACK.visualize.defaultCavity
  const dx = (dc.min[0] + dc.max[0]) / 2
  const dy = (dc.min[1] + dc.max[1]) / 2
  const dz = (dc.min[2] + dc.max[2]) / 2
  for (let i = 0; i < items.length; i++) {
    const n = PROJECT_PACK.visualize.naive[items[i].id]
    if (n) items[i].center = [cx + (n[0] - dx), cy + (n[1] - dy), cz + (n[2] - dz)]
  }
  return items
}

function orientations(size: V3, fixed: boolean): V3[] {
  if (fixed) return [[size[0], size[1], size[2]]]
  const out: V3[] = []
  const perms = [[0, 1, 2], [2, 1, 0], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1]]
  for (let i = 0; i < perms.length; i++) {
    const o: V3 = [size[perms[i][0]], size[perms[i][1]], size[perms[i][2]]]
    let dup = false
    for (let j = 0; j < out.length; j++) if (Math.abs(out[j][0] - o[0]) + Math.abs(out[j][1] - o[1]) + Math.abs(out[j][2] - o[2]) < 1e-6) dup = true
    if (!dup) out.push(o)
  }
  return out
}

function axisValues(lo: number, hi: number): number[] {
  const out: number[] = []
  if (hi < lo - EPS) return out
  for (let v = lo; v <= hi + EPS; v += STEP) out.push(Math.min(v, hi))
  if (out.length === 0 || out[out.length - 1] < hi - EPS) out.push(hi)
  return out
}

/** Greedy deterministic packer: biggest first, each item to the free spot closest to its preferred zone. */
export function arrange(items: FitItem[], cav: FitBox): {items: FitItem[]; allPlaced: boolean} {
  const order: number[] = []
  for (let i = 0; i < items.length; i++) order.push(i)
  order.sort((a, b) => items[b].size[0] * items[b].size[1] * items[b].size[2] - items[a].size[0] * items[a].size[1] * items[a].size[2])
  const placed: FitItem[] = []
  const result: FitItem[] = items.map((it) => ({id: it.id, size: [it.size[0], it.size[1], it.size[2]] as V3, center: [it.center[0], it.center[1], it.center[2]] as V3, fixed: it.fixed}))
  let allPlaced = true
  let strays = 0
  for (let n = 0; n < order.length; n++) {
    const idx = order[n]
    const it = items[idx]
    const pref = PROJECT_PACK.visualize.prefer[it.id] || ([0.5, 0.5, 0.5] as V3)
    const ors = orientations(it.size, it.fixed)
    let bestCost = 1e18
    let bestC: V3 | null = null
    let bestS: V3 | null = null
    for (let o = 0; o < ors.length; o++) {
      const s = ors[o]
      const xs = axisValues(cav.min[0] + s[0] / 2, cav.max[0] - s[0] / 2)
      const ys = axisValues(cav.min[1] + s[1] / 2, cav.max[1] - s[1] / 2)
      const zs = axisValues(cav.min[2] + s[2] / 2, cav.max[2] - s[2] / 2)
      if (xs.length === 0 || ys.length === 0 || zs.length === 0) continue
      const dxp = cav.min[0] + s[0] / 2 + pref[0] * (cav.max[0] - cav.min[0] - s[0])
      const dyp = cav.min[1] + s[1] / 2 + pref[1] * (cav.max[1] - cav.min[1] - s[1])
      const dzp = cav.min[2] + s[2] / 2 + pref[2] * (cav.max[2] - cav.min[2] - s[2])
      for (let a = 0; a < xs.length; a++) {
        for (let b = 0; b < ys.length; b++) {
          for (let c = 0; c < zs.length; c++) {
            const cost = Math.pow(xs[a] - dxp, 2) + Math.pow(ys[b] - dyp, 2) + Math.pow(zs[c] - dzp, 2)
            if (cost >= bestCost) continue
            const cand: FitItem = {id: it.id, size: s, center: [xs[a], ys[b], zs[c]], fixed: it.fixed}
            const bc = boxOf(cand)
            let free = true
            for (let p = 0; p < placed.length && free; p++) if (overlaps(bc, boxOf(placed[p]))) free = false
            if (free) {
              bestCost = cost
              bestC = [xs[a], ys[b], zs[c]]
              bestS = s
            }
          }
        }
      }
    }
    if (bestC !== null && bestS !== null) {
      const fin: FitItem = {id: it.id, size: bestS, center: bestC, fixed: it.fixed}
      placed.push(fin)
      result[idx] = fin
    } else {
      allPlaced = false
      const s = it.size
      result[idx] = {id: it.id, size: [s[0], s[1], s[2]], center: [cav.max[0] + s[0] / 2 + 0.8, cav.min[1] + s[1] / 2, cav.min[2] + s[2] / 2 + strays * 2.5], fixed: it.fixed}
      strays++
    }
  }
  return {items: result, allPlaced: allPlaced}
}

const AXIS = ["width", "height", "depth"]

/** Arrange inside the cavity; when that is impossible, find the smallest single-axis growth (height, depth, then width). */
export function recommend(items: FitItem[], cav: FitBox): Recommendation {
  const first = arrange(items, cav)
  if (first.allPlaced) return {items: first.items, cavity: cav, extra: [0, 0, 0], fitsAll: true, text: "All fit"}
  const axes = [1, 2, 0]
  for (let a = 0; a < axes.length; a++) {
    const k = axes[a]
    for (let e = STEP; e <= 6.0 + EPS; e += STEP) {
      const mx: V3 = [cav.max[0], cav.max[1], cav.max[2]]
      mx[k] += e
      const bigger: FitBox = {min: cav.min, max: mx}
      const r = arrange(items, bigger)
      if (r.allPlaced) {
        const extra: V3 = [0, 0, 0]
        extra[k] = Math.round(e * 10) / 10
        return {items: r.items, cavity: bigger, extra: extra, fitsAll: true, text: "Needs +" + extra[k].toFixed(1) + " cm " + AXIS[k]}
      }
    }
  }
  return {items: first.items, cavity: cav, extra: [0, 0, 0], fitsAll: false, text: "Use a bigger model"}
}

export function cavitySize(cav: FitBox): V3 {
  return [cav.max[0] - cav.min[0], cav.max[1] - cav.min[1], cav.max[2] - cav.min[2]]
}

// ---------------------------------------------------------------------------------------------------------------------
// Screws: does THIS fastener, turned by THIS tool, work in THIS hole? Order of checks: diameter, type, length, driver.
export interface ScrewResult {
  ok: boolean
  reason: "" | "diameter" | "type" | "long" | "short" | "driver"
}

export function checkScrew(hole: ScrewHole, f: FastenerDef, tool: ToolDef): ScrewResult {
  const wb = PROJECT_PACK.workbench
  if (Math.abs(f.diameterMm - hole.diameterMm) > wb.holeToleranceMm) return {ok: false, reason: "diameter"}
  const wantSelf = hole.type.indexOf("self-tapping") >= 0
  const wantMachine = hole.type.indexOf("machine") >= 0
  if ((wantSelf && f.kind !== "self-tapping") || (wantMachine && f.kind !== "machine") || f.kind === "standoff") return {ok: false, reason: "type"}
  if (f.lengthMm > hole.depthMm + 0.5) return {ok: false, reason: "long"}
  if (f.lengthMm < hole.depthMm - wb.lengthSlackMm) return {ok: false, reason: "short"}
  if (tool.head !== f.head || tool.id !== f.driver) return {ok: false, reason: "driver"}
  return {ok: true, reason: ""}
}
