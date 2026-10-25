// FetchPart.mjs - download a free 3D component model, convert it to a Lens-ready GLB and record where it came from.
//
//   node tools/cad/FetchPart.mjs <id> kicad <Library.3dshapes> <File.step>     e.g.  led_5mm kicad LED_THT.3dshapes LED_D5.0mm.step
//   node tools/cad/FetchPart.mjs <id> adafruit "<folder>/<file>.step"           e.g.  breadboard adafruit "64 Halfsize Breadboard/64 Halfsize Breadboard.step"
//
// Sources (no API key, plain file URLs):
//   KiCad official 3D library   https://gitlab.com/kicad/libraries/kicad-packages3D   (CC-BY-SA 4.0 with the KiCad library exception)
//        browse:  https://gitlab.com/api/v4/projects/kicad%2Flibraries%2Fkicad-packages3D/repository/tree?path=<Library.3dshapes>&per_page=100
//   Adafruit CAD parts          https://github.com/adafruit/Adafruit_CAD_Parts          (MIT)
//        browse:  https://api.github.com/repos/adafruit/Adafruit_CAD_Parts/git/trees/main?recursive=1
// Output: Assets/Models/Parts/<id>.glb (metres, Y-up, centred on x / z, standing on y = 0 => imports at real size in cm)
//         and an entry in Assets/Models/Parts/parts.json (source, licence, real size in cm).

import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const [id, source, a, b] = process.argv.slice(2)
if (!id || !source || !a) {
  console.error('usage: FetchPart.mjs <id> kicad <Library.3dshapes> <File.step> | FetchPart.mjs <id> adafruit "<folder>/<file>.step"')
  process.exit(2)
}
let url, license, origin
if (source === 'kicad') {
  url = 'https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/master/' + a + '/' + encodeURIComponent(b)
  license = 'CC-BY-SA-4.0 (KiCad library exception)'
  origin = 'KiCad kicad-packages3D / ' + a + ' / ' + b
} else if (source === 'adafruit') {
  url = 'https://raw.githubusercontent.com/adafruit/Adafruit_CAD_Parts/main/' + a.split('/').map(encodeURIComponent).join('/')
  license = 'MIT'
  origin = 'Adafruit_CAD_Parts / ' + a
} else {
  console.error('source must be kicad or adafruit')
  process.exit(2)
}
const cache = path.join(here, 'cache')
fs.mkdirSync(cache, {recursive: true})
const stepFile = path.join(cache, id + '.step')
const res = await fetch(url)
if (!res.ok) {
  console.error(JSON.stringify({ok: false, error: 'download failed ' + res.status + ' ' + url}))
  process.exit(1)
}
const text = Buffer.from(await res.arrayBuffer())
if (!text.slice(0, 20).toString().startsWith('ISO-10303-21')) {
  console.error(JSON.stringify({ok: false, error: 'not a STEP file: ' + url}))
  process.exit(1)
}
fs.writeFileSync(stepFile, text)
const outDir = path.join(root, 'Assets', 'Models', 'Parts')
fs.mkdirSync(outDir, {recursive: true})
const glb = path.join(outDir, id + '.glb')
const r = spawnSync(process.execPath, [path.join(here, 'ConvertCad.mjs'), stepFile, glb, '--zup', '--ground', '--max-tris', '30000'], {encoding: 'utf8'})
if (r.status !== 0) {
  console.error(r.stderr || r.stdout)
  process.exit(1)
}
const info = JSON.parse(r.stdout)
const manifestFile = path.join(outDir, 'parts.json')
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {}
manifest[id] = {glb: id + '.glb', source: origin, url, license, sizeCm: info.size.map((v) => +(v * 100).toFixed(3)), triangles: info.triangles, parts: info.parts}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1))
console.log(JSON.stringify({ok: true, id, glb, sizeCm: manifest[id].sizeCm, triangles: info.triangles}))
