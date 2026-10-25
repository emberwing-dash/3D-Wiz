// PinProbe.mjs - list the lowest points (lead / pin feet) of a converted part GLB, in cm, part frame (x, z; y = 0 is the underside).
//   node tools/cad/PinProbe.mjs Assets/Models/Parts/dip16.glb
import fs from 'node:fs'
const b = fs.readFileSync(process.argv[2])
const jl = b.readUInt32LE(12)
const json = JSON.parse(b.slice(20, 20 + jl).toString())
const binStart = 20 + jl + 8
const pts = []
for (const m of json.meshes) for (const p of m.primitives) {
  const acc = json.accessors[p.attributes.POSITION]
  const v = json.bufferViews[acc.bufferView]
  const off = binStart + (v.byteOffset || 0) + (acc.byteOffset || 0)
  for (let i = 0; i < acc.count; i++) pts.push([b.readFloatLE(off + i * 12) * 100, b.readFloatLE(off + i * 12 + 4) * 100, b.readFloatLE(off + i * 12 + 8) * 100])
}
const lo = pts.filter((p) => p[1] < 0.03)
const cl = []
for (const p of lo) {
  let c = cl.find((q) => Math.hypot(q.x - p[0], q.z - p[2]) < 0.08)
  if (!c) { c = {x: 0, z: 0, n: 0, sx: 0, sz: 0}; cl.push(c) }
  c.sx += p[0]; c.sz += p[2]; c.n++; c.x = c.sx / c.n; c.z = c.sz / c.n
}
cl.sort((a, b) => a.z - b.z || a.x - b.x)
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]) }
console.log(process.argv[2].split('/').pop(), 'bbox cm', mn.map((v) => v.toFixed(3)).join(','), '->', mx.map((v) => v.toFixed(3)).join(','))
console.log(cl.map((c) => '(' + c.x.toFixed(3) + ', ' + c.z.toFixed(3) + ')').join(' '))
