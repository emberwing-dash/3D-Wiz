// media-to-circuit.mjs - read a circuit PICTURE or a build TUTORIAL VIDEO with Gemini and write the circuit as a JSON asset the Lens turns into a guided build.
//   node tools/media-to-circuit.mjs <picture.png|jpg | video.mp4|mov|webm> [out.json]
// The JSON goes to Assets/GuidePacks/<name>.json; add it to CircuitGuide > circuitFiles in the Inspector. It then appears in the search list and on MY MODEL.
// Key: GEMINI_API_KEY from .env (git-ignored) or the environment. The key is sent only in the x-goog-api-key header and is never printed or written anywhere.
// What comes back is checked against the parts and pin ids the Guide has 3D models for; anything else is dropped and listed.
import fs from 'node:fs'
import path from 'node:path'

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest'
const BASE = 'https://generativelanguage.googleapis.com'

// part types the Guide can build and their pin ids (same table as GuideImport.ts / the RC car pack)
const PINS = {
  led: ['A', 'K'], resistor: ['1', '2'], battery: ['+', '-'], switch: ['1', '2'], motor: ['M+', 'M-'],
  esp32: ['5V', 'GND', 'IO12', 'IO13', 'IO14', 'IO15', 'IO2', 'IO4'],
  l293d: Array.from({ length: 16 }, (_, i) => String(i + 1)), servo: ['SIG', 'VCC', 'GND'],
}

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim()
  for (const f of ['.env', path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '.env')]) {
    if (fs.existsSync(f)) {
      const m = fs.readFileSync(f, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/m)
      if (m && m[1]) return m[1].replace(/^["']|["']$/g, '')
    }
  }
  return ''
}

const prompt = (isVideo) =>
  (isVideo ? 'Watch this tutorial video that builds a small electronic circuit. ' : 'Read this circuit drawing or photo. ') +
  'Answer with STRICT JSON only, no markdown: {"title":"short name","parts":[{"ref":"R1","type":"resistor"}],"connections":[["R1.2","D1.A"]]}. ' +
  'Allowed part types and pin ids (use ONLY these, ignore any part that is not in the list): ' +
  Object.entries(PINS).map(([t, p]) => `${t} (pins: ${p.join(',')})`).join('; ') + '. ' +
  'Each connection joins two pins that are wired together, written ref.pin. A shared node with 3 pins = 2 connections.' +
  (isVideo ? ' List the parts in the order the video places them.' : '')

const mimeOf = (f) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }[path.extname(f).toLowerCase()])

async function uploadFile(key, file, mime) {
  const bytes = fs.readFileSync(file)
  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(bytes.length), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: { display_name: path.basename(file) } }),
  })
  if (!start.ok) throw new Error('upload start failed: HTTP ' + start.status)
  const url = start.headers.get('x-goog-upload-url')
  if (!url) throw new Error('upload start gave no upload url')
  const up = await fetch(url, { method: 'POST', headers: { 'Content-Length': String(bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: bytes })
  if (!up.ok) throw new Error('upload failed: HTTP ' + up.status)
  let info = (await up.json()).file
  for (let i = 0; i < 60 && info.state !== 'ACTIVE'; i++) {
    if (info.state === 'FAILED') throw new Error('the video could not be processed')
    await new Promise((r) => setTimeout(r, 2000))
    const g = await fetch(`${BASE}/v1beta/${info.name}`, { headers: { 'x-goog-api-key': key } })
    info = await g.json()
  }
  if (info.state !== 'ACTIVE') throw new Error('video processing timed out')
  return info
}

/** Validate what the model said against the parts / pins the Guide can build. */
export function clean(o) {
  const skipped = []
  if (!o || !Array.isArray(o.parts) || !Array.isArray(o.connections)) throw new Error('the answer has no parts / connections')
  const have = {}
  const parts = []
  for (const p of o.parts) {
    if (typeof p.ref !== 'string' || !PINS[p.type]) { skipped.push(`${p.ref} (${p.type})`); continue }
    if (have[p.ref]) continue
    have[p.ref] = p.type
    parts.push({ ref: p.ref, type: p.type })
  }
  const connections = []
  for (const c of o.connections) {
    const ok = (e) => { const i = String(e).indexOf('.'); return i > 0 && have[e.slice(0, i)] && PINS[have[e.slice(0, i)]].includes(e.slice(i + 1)) }
    if (Array.isArray(c) && c.length === 2 && ok(c[0]) && ok(c[1])) connections.push([c[0], c[1]])
    else skipped.push('connection ' + JSON.stringify(c))
  }
  if (parts.length === 0) throw new Error('no part the Guide can build was found')
  if (connections.length === 0) throw new Error('no usable connection was found')
  return { title: typeof o.title === 'string' && o.title ? o.title : 'Circuit from media', parts, connections, skipped }
}

async function main() {
  const file = process.argv[2]
  if (!file || !fs.existsSync(file)) { console.error('usage: node tools/media-to-circuit.mjs <picture or video> [out.json]'); process.exit(1) }
  const key = loadKey()
  if (!key) { console.error('no GEMINI_API_KEY (put it in .env, which is git-ignored)'); process.exit(1) }
  const mime = mimeOf(file)
  if (!mime) { console.error('unsupported file type: ' + path.extname(file)); process.exit(1) }
  const isVideo = mime.startsWith('video/')
  let part
  if (isVideo) {
    console.log('uploading the video ...')
    const info = await uploadFile(key, file, mime)
    part = { file_data: { mime_type: mime, file_uri: info.uri } }
  } else {
    part = { inline_data: { mime_type: mime, data: fs.readFileSync(file).toString('base64') } }
  }
  console.log('asking ' + MODEL + ' ...')
  const t0 = Date.now()
  const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [part, { text: prompt(isVideo) }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) { console.error('Gemini said HTTP ' + res.status + (body.error && body.error.message ? ': ' + String(body.error.message).slice(0, 120) : '')); process.exit(2) }
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text || ''
  let circuit
  try { circuit = clean(JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/, ''))) } catch (e) { console.error('could not use the answer: ' + e.message); process.exit(3) }
  const name = path.basename(file).replace(/\.[^.]+$/, '')
  const out = process.argv[3] || path.join('Assets', 'GuidePacks', name + '.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ ...circuit, source: isVideo ? "video" : "photo", skipped: undefined }, null, 1))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${circuit.parts.length} parts, ${circuit.connections.length} connections` + (circuit.skipped.length ? `, ${circuit.skipped.length} left out (${circuit.skipped.slice(0, 3).join('; ')})` : '') + ` -> ${out}`)
}

if (import.meta.url === 'file:///' + process.argv[1].replace(/\\/g, '/').replace(/^\//, '') || process.argv[1].endsWith('media-to-circuit.mjs')) main().catch((e) => { console.error('failed: ' + e.message); process.exit(4) })
