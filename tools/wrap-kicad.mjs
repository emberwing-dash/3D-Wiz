// wrap-kicad.mjs - turn a KiCad schematic into a JSON asset Lens Studio can import (Lens Studio imports .json, not .kicad_sch).
// Usage:  node tools/wrap-kicad.mjs path/to/circuit.kicad_sch [Assets/GuidePacks/circuit.json]
// Then drop the JSON into the CircuitGuide > circuitFiles list. In the Lens it appears in the search list and on MY MODEL.
import fs from 'node:fs'
import path from 'node:path'
const src = process.argv[2]
if (!src) { console.error('usage: node tools/wrap-kicad.mjs file.kicad_sch [out.json]'); process.exit(1) }
const text = fs.readFileSync(src, 'utf8')
if (!/^\s*\(kicad_sch/.test(text)) { console.error('this does not look like a KiCad schematic (.kicad_sch)'); process.exit(1) }
const name = path.basename(src).replace(/\.kicad_sch$/i, '')
const out = process.argv[3] || path.join('Assets', 'GuidePacks', name + '.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ title: name.replace(/[_-]+/g, ' '), kicad_sch: text }, null, 1))
console.log('wrote ' + out + ' (' + text.length + ' chars of KiCad text)')
