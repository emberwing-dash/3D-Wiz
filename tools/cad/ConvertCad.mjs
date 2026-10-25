// ConvertCad.mjs - CAD / mesh file -> GLB, so 3D Wiz "My Model" can import it (Lens Studio reads FBX / OBJ / GLB only).
//
//   node tools/cad/ConvertCad.mjs <input> [output.glb] [--unit mm|cm|m|inch] [--max-tris N] [--center] [--ground] [--zup] [--keep-scale]
//
//   .stl                    binary or ASCII (3D-printing exports from Blender, Fusion, SolidWorks, Tinkercad ...)
//   .step .stp              STEP (AP203 / AP214 / AP242) - tessellated with OpenCascade (occt-import-js, WebAssembly)
//   .iges .igs              IGES
//   .brep                   OpenCascade BREP
//   .fbx .obj .glb .gltf    already readable by Lens Studio: nothing to convert (the path is printed back)
//
// Units: the file is read in --unit (default mm, the 3D-printing norm) and WRITTEN IN METRES (true glTF), so Lens Studio shows it at
// its real size in centimetres (a 100 mm part imports as 10 cm). --keep-scale writes the raw numbers instead.
// Budget: --max-tris N (default 80000) merges vertices on a grid until the model fits, so a 400k-triangle assembly becomes a
// Lens-sized preview mesh (small parts such as screws disappear first). --max-tris 0 keeps every triangle. --center moves the
// bounding-box centre to the origin; --ground centres x / z and puts the lowest point on y = 0 (component libraries). (Standing on y = 0 is done later by the importer). --zup rotates a Z-up CAD frame (most CAD:
// FreeCAD, SolidWorks, KiCad) to Lens Studio's Y-up: (x, y, z) -> (x, z, -y).
// Notes: STEP / IGES carry units. Colours in a STEP file are kept
// (one glTF material per colour). The first run needs `npm install` inside tools/cad (OpenCascade, LGPL-2.1, used only by this
// offline tool: it is NOT part of the Lens).

import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const args = process.argv.slice(2)
const flag = (n) => {
  const i = args.indexOf(n)
  if (i < 0) return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const unit = flag('--unit') || 'mm'
const maxTrisArg = flag('--max-tris')
const MAX_TRIS = maxTrisArg === undefined ? 80000 : Number(maxTrisArg)
const center = args.includes('--center')
if (center) args.splice(args.indexOf('--center'), 1)
const zup = args.includes('--zup')
if (zup) args.splice(args.indexOf('--zup'), 1)
const ground = args.includes('--ground')
if (ground) args.splice(args.indexOf('--ground'), 1)
const keepScale = args.includes('--keep-scale')
if (keepScale) args.splice(args.indexOf('--keep-scale'), 1)
const TO_METRES = {mm: 0.001, cm: 0.01, m: 1, inch: 0.0254}[unit] || 0.001
const input = args[0]
if (!input) {
  console.error('usage: node tools/cad/ConvertCad.mjs <input.stl|step|stp|iges|igs|brep> [output.glb] [--unit mm|cm|m|inch]')
  process.exit(2)
}
const ext = path.extname(input).toLowerCase()
if (['.fbx', '.obj', '.glb', '.gltf'].includes(ext)) {
  console.log(JSON.stringify({ok: true, converted: false, glb: path.resolve(input), note: 'Lens Studio reads this format directly'}))
  process.exit(0)
}
const out = args[1] || input.replace(/\.[^.]+$/, '') + '.glb'

/** meshes: [{name, color:[r,g,b], positions:Float32Array, normals?:Float32Array, indices?:Uint32Array}] */
function readStl(buf) {
  const triBin = buf.length >= 84 ? buf.readUInt32LE(80) : -1
  const isBinary = triBin >= 0 && 84 + triBin * 50 === buf.length
  const pos = []
  const nor = []
  if (isBinary) {
    for (let i = 0; i < triBin; i++) {
      const o = 84 + i * 50
      const n = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)]
      for (let v = 0; v < 3; v++) {
        const p = o + 12 + v * 12
        pos.push(buf.readFloatLE(p), buf.readFloatLE(p + 4), buf.readFloatLE(p + 8))
        nor.push(n[0], n[1], n[2])
      }
    }
  } else {
    const txt = buf.toString('utf8')
    let n = [0, 0, 1]
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim().split(/\s+/)
      if (t[0] === 'facet' && t[1] === 'normal') n = [+t[2], +t[3], +t[4]]
      else if (t[0] === 'vertex') {
        pos.push(+t[1], +t[2], +t[3])
        nor.push(n[0], n[1], n[2])
      }
    }
    if (pos.length === 0) throw new Error('No triangles found in the STL file.')
  }
  const positions = new Float32Array(pos)
  const normals = new Float32Array(nor)
  // STL normals are often (0,0,0): recompute from the winding when missing
  for (let i = 0; i < normals.length; i += 9) {
    if (normals[i] === 0 && normals[i + 1] === 0 && normals[i + 2] === 0) {
      const ax = positions[i + 3] - positions[i], ay = positions[i + 4] - positions[i + 1], az = positions[i + 5] - positions[i + 2]
      const bx = positions[i + 6] - positions[i], by = positions[i + 7] - positions[i + 1], bz = positions[i + 8] - positions[i + 2]
      let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx
      const l = Math.hypot(x, y, z) || 1
      x /= l; y /= l; z /= l
      for (let v = 0; v < 3; v++) { normals[i + v * 3] = x; normals[i + v * 3 + 1] = y; normals[i + v * 3 + 2] = z }
    }
  }
  return [{name: path.basename(input, ext), color: [0.72, 0.74, 0.78], positions, normals, indices: null}]
}

async function readOcct(buf) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  let occtInit
  try {
    occtInit = (await import(path.join(here, 'node_modules', 'occt-import-js', 'dist', 'occt-import-js.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'))).default
  } catch (e) {
    throw new Error('STEP / IGES needs OpenCascade: run `npm install` once inside tools/cad (' + e.message + ')')
  }
  const occt = await occtInit({locateFile: (f) => path.join(here, 'node_modules', 'occt-import-js', 'dist', f)})
  const params = {linearUnit: {mm: 'millimeter', cm: 'centimeter', m: 'meter', inch: 'inch'}[unit] || 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.3}
  const u8 = new Uint8Array(buf)
  const r = ext === '.iges' || ext === '.igs' ? occt.ReadIgesFile(u8, params) : ext === '.brep' ? occt.ReadBrepFile(u8, params) : occt.ReadStepFile(u8, params)
  if (!r.success || !r.meshes || r.meshes.length === 0) throw new Error('OpenCascade could not read any solid from this file (success=' + r.success + ').')
  // KiCad / most CAD STEP files colour individual FACES (brep_faces[].color): split each mesh into one mesh per colour
  const out = []
  r.meshes.forEach((m, i) => {
    const positions = Float32Array.from(m.attributes.position.array)
    const normals = m.attributes.normal ? Float32Array.from(m.attributes.normal.array) : null
    const index = m.index ? m.index.array : null
    const base = m.color ? [m.color[0], m.color[1], m.color[2]] : [0.72, 0.74, 0.78]
    const faces = m.brep_faces || []
    const coloured = faces.some((f) => f.color)
    if (!coloured || !index) {
      out.push({name: m.name || 'part' + i, color: base, positions, normals, indices: index ? Uint32Array.from(index) : null})
      return
    }
    const groups = {}
    for (const f of faces) {
      const col = f.color ? [f.color[0], f.color[1], f.color[2]] : base
      const k = col.map((c) => c.toFixed(3)).join(',')
      if (!groups[k]) groups[k] = {col, tris: []}
      for (let t = f.first; t <= f.last; t++) groups[k].tris.push(index[t * 3], index[t * 3 + 1], index[t * 3 + 2])
    }
    let n = 0
    for (const k in groups) out.push({name: (m.name || 'part' + i) + (Object.keys(groups).length > 1 ? '_c' + n++ : ''), color: groups[k].col, positions: positions.slice(), normals: normals ? normals.slice() : null, indices: Uint32Array.from(groups[k].tris)})
  })
  return out
}

function computeNormals(m) {
  const p = m.positions
  const idx = m.indices || Uint32Array.from({length: p.length / 3}, (_, i) => i)
  const n = new Float32Array(p.length)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx
    for (const k of [a, b, c]) { n[k] += x; n[k + 1] += y; n[k + 2] += z }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l
  }
  return n
}

/** Vertex clustering on a uniform grid; the cell size is bisected until the whole model fits maxTris. */
function decimate(meshes, maxTris) {
  const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30]
  for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.positions[i + k]); mx[k] = Math.max(mx[k], m.positions[i + k]) }
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2])
  const keyOf = (p, i, cell) => Math.floor((p[i] - mn[0]) / cell) + ',' + Math.floor((p[i + 1] - mn[1]) / cell) + ',' + Math.floor((p[i + 2] - mn[2]) / cell)
  const count = (cell) => {
    let n = 0
    for (const m of meshes) {
      const p = m.positions
      const nv = p.length / 3
      const k = new Array(nv)
      for (let v = 0; v < nv; v++) k[v] = keyOf(p, v * 3, cell)
      const idx = m.indices
      const nt = idx ? idx.length / 3 : nv / 3
      for (let t = 0; t < nt; t++) {
        const a = k[idx ? idx[t * 3] : t * 3], b = k[idx ? idx[t * 3 + 1] : t * 3 + 1], c = k[idx ? idx[t * 3 + 2] : t * 3 + 2]
        if (a !== b && b !== c && a !== c) n++
      }
    }
    return n
  }
  let lo = diag / 4000, hi = diag / 3
  for (let it = 0; it < 14; it++) {
    const mid = Math.sqrt(lo * hi)
    if (count(mid) > maxTris) lo = mid
    else hi = mid
  }
  const cell = hi
  const out = []
  for (const m of meshes) {
    const p = m.positions
    const nv = p.length / 3
    const idx = m.indices
    const nt = idx ? idx.length / 3 : nv / 3
    const map = new Map()
    const acc = []
    const vid = new Array(nv)
    for (let v = 0; v < nv; v++) {
      const key = keyOf(p, v * 3, cell)
      let id = map.get(key)
      if (id === undefined) { id = acc.length; map.set(key, id); acc.push([0, 0, 0, 0]) }
      const a = acc[id]
      a[0] += p[v * 3]; a[1] += p[v * 3 + 1]; a[2] += p[v * 3 + 2]; a[3]++
      vid[v] = id
    }
    const tri = []
    for (let t = 0; t < nt; t++) {
      const a = vid[idx ? idx[t * 3] : t * 3], b = vid[idx ? idx[t * 3 + 1] : t * 3 + 1], c = vid[idx ? idx[t * 3 + 2] : t * 3 + 2]
      if (a !== b && b !== c && a !== c) tri.push(a, b, c)
    }
    if (tri.length === 0) continue
    const pos = new Float32Array(acc.length * 3)
    acc.forEach((a, i) => { pos[i * 3] = a[0] / a[3]; pos[i * 3 + 1] = a[1] / a[3]; pos[i * 3 + 2] = a[2] / a[3] })
    out.push({name: m.name, color: m.color, positions: pos, normals: null, indices: Uint32Array.from(tri)})
  }
  return {meshes: out, cell}
}

/** Scale to metres (unless --keep-scale) and optionally centre the bounding box on the origin. */
function finishFrame(meshes) {
  if (zup) {
    for (const m of meshes) {
      const p = m.positions
      for (let i = 0; i < p.length; i += 3) { const y = p[i + 1], z = p[i + 2]; p[i + 1] = z; p[i + 2] = -y }
      if (m.normals) { const n = m.normals; for (let i = 0; i < n.length; i += 3) { const y = n[i + 1], z = n[i + 2]; n[i + 1] = z; n[i + 2] = -y } }
    }
  }
  const f = keepScale ? 1 : TO_METRES
  const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30]
  for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.positions[i + k]); mx[k] = Math.max(mx[k], m.positions[i + k]) }
  // (bounds above are taken after the optional Z-up rotation)
  const c = ground ? [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2] : center ? [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] : [0, 0, 0]
  for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) m.positions[i + k] = (m.positions[i + k] - c[k]) * f
  // normals are direction-only: unchanged by uniform scale / translation
}

function writeGlb(meshes, file) {
  const chunks = []
  const views = []
  const accessors = []
  let offset = 0
  const pad4 = (b) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]))
  const addView = (arr, target) => {
    const b = pad4(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength))
    views.push({buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target})
    chunks.push(b)
    offset += b.length
    return views.length - 1
  }
  const materials = []
  const matOf = {}
  const gltfMeshes = []
  const nodes = []
  let tris = 0
  const mn = [1e30, 1e30, 1e30]
  const mx = [-1e30, -1e30, -1e30]
  for (const m of meshes) {
    const normals = m.normals && m.normals.length === m.positions.length ? m.normals : computeNormals(m)
    const pv = addView(m.positions, 34962)
    const nv = addView(normals, 34962)
    const lo = [1e30, 1e30, 1e30], hi = [-1e30, -1e30, -1e30]
    for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], m.positions[i + k]); hi[k] = Math.max(hi[k], m.positions[i + k])
      mn[k] = Math.min(mn[k], m.positions[i + k]); mx[k] = Math.max(mx[k], m.positions[i + k])
    }
    accessors.push({bufferView: pv, componentType: 5126, count: m.positions.length / 3, type: 'VEC3', min: lo, max: hi})
    const pa = accessors.length - 1
    accessors.push({bufferView: nv, componentType: 5126, count: normals.length / 3, type: 'VEC3'})
    const na = accessors.length - 1
    const prim = {attributes: {POSITION: pa, NORMAL: na}, mode: 4}
    if (m.indices) {
      const iv = addView(m.indices, 34963)
      accessors.push({bufferView: iv, componentType: 5125, count: m.indices.length, type: 'SCALAR'})
      prim.indices = accessors.length - 1
      tris += m.indices.length / 3
    } else tris += m.positions.length / 9
    const key = m.color.map((c) => c.toFixed(3)).join(',')
    if (matOf[key] === undefined) {
      materials.push({name: 'cad_' + materials.length, pbrMetallicRoughness: {baseColorFactor: [m.color[0], m.color[1], m.color[2], 1], metallicFactor: 0.1, roughnessFactor: 0.7}, doubleSided: true})
      matOf[key] = materials.length - 1
    }
    prim.material = matOf[key]
    gltfMeshes.push({name: m.name, primitives: [prim]})
    nodes.push({name: m.name, mesh: gltfMeshes.length - 1})
  }
  const json = {
    asset: {version: '2.0', generator: '3D Wiz ConvertCad'},
    scene: 0,
    scenes: [{nodes: nodes.map((_, i) => i)}],
    nodes, meshes: gltfMeshes, materials, accessors, bufferViews: views,
    buffers: [{byteLength: offset}],
  }
  let js = Buffer.from(JSON.stringify(json))
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)])
  const bin = Buffer.concat(chunks)
  const head = Buffer.alloc(12)
  head.write('glTF', 0)
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8)
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4)
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4, 'binary')
  fs.writeFileSync(file, Buffer.concat([head, jh, js, bh, bin]))
  return {triangles: tris, parts: meshes.length, materials: materials.length, size: mx.map((v, k) => +(v - mn[k]).toFixed(4))}
}

const SUPPORTED = ['.stl', '.step', '.stp', '.iges', '.igs', '.brep']
if (!SUPPORTED.includes(ext)) {
  console.error(JSON.stringify({ok: false, error: 'Unsupported file type ' + ext + '. Supported: stl, step, stp, iges, igs, brep (fbx / obj / glb need no conversion). Proprietary CAD (SLDPRT, F3D, IPT, CATPART, DWG ...) must be exported from your CAD app as STEP or STL first.'}))
  process.exit(1)
}
if (!fs.existsSync(input)) {
  console.error(JSON.stringify({ok: false, error: 'File not found: ' + input}))
  process.exit(1)
}
const buf = fs.readFileSync(input)
let meshes = ext === '.stl' ? readStl(buf) : ['.step', '.stp', '.iges', '.igs', '.brep'].includes(ext) ? await readOcct(buf) : (() => { throw new Error('Unsupported file type ' + ext + '. Supported: stl, step, stp, iges, igs, brep (and fbx / obj / glb need no conversion).') })()
const trisOf = (ms) => ms.reduce((n, m) => n + (m.indices ? m.indices.length : m.positions.length / 3) / 3, 0)
const trisIn = trisOf(meshes)
let decimated = null
if (MAX_TRIS > 0 && trisIn > MAX_TRIS) {
  const r = decimate(meshes, MAX_TRIS)
  meshes = r.meshes
  decimated = {from: trisIn, to: trisOf(meshes), cell: +r.cell.toFixed(4)}
}
if (center || ground || zup || !keepScale) finishFrame(meshes)
const info = writeGlb(meshes, out)
console.log(JSON.stringify({ok: true, converted: true, source: path.resolve(input), glb: path.resolve(out), unit, written: keepScale ? unit : 'metres', decimated, ...info}))
