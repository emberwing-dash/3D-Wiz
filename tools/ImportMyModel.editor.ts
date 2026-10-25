// ImportMyModel.editor.ts - "Import my model" for 3D Wiz (Lens Studio EDITOR script, run with ExecuteEditorCode; body of an async function).
//
//   args: { path?: string,          absolute path of the FBX / OBJ / GLB. Omit it to open the native file chooser (needs a human at the machine).
//           targetCm?: number,      longest side of the normalized model on the desk, default 14
//           zUp?: boolean,          true for Z-up files: the model is stood on its end (rotated -90 deg about X)
//           assign?: boolean,       default true: set the userModel input of the Visualize + Robot components
//           name?: string }         output name (default: the file name)
//
// What it does (a Lens cannot open a file dialog, so this happens in the editor, once):
//   1. imports the file into Assets/UserModels/ (Packed import, so the source file stays the single source of truth)
//   2. measures it: triangles, vertices, materials, textures, animations, world bounds from the mesh AABBs + node transforms,
//      and reports a unit guess (a 1.8-long "cm" model is probably metres)
//   3. creates Assets/UserModels/<name>_cm.prefab: the model wrapped in a root that is scaled to `targetCm`, stood on y = 0, centred on x / z
//   4. assigns it as `userModel` on the scene's Visualize and Robot components (My Model project)
// Returns a JSON report. Nothing is deleted; re-running with the same name reuses the imported file.

const out: {[k: string]: any} = {steps: []}
const log = (s: string) => (out.steps as string[]).push(s)
const model = pluginSystem.findInterface(Editor.Model.IModel) as Editor.Model.IModel
const am = model.project.assetManager
const scene = model.project.scene

// ---- 1. which file -------------------------------------------------------------------------------------------------
let filePath = args.path !== undefined ? String(args.path) : ''
if (filePath === '') {
  try {
    const Ui = await import('LensStudio:Ui')
    const gui = pluginSystem.findInterface((Ui as any).IGui) as any
    const params = {caption: 'Choose your 3D model (FBX / OBJ / GLB)', filter: '*.fbx *.obj *.glb *.gltf', options: (Ui as any).Dialogs.Options.Usual} as any
    const picked = gui.dialogs.selectFileToOpen(params, new Editor.Path(''))
    filePath = picked.toString()
    log('chosen in the native file dialog: ' + filePath)
  } catch (e) {
    throw new Error('No path given and the native file dialog is not available here (' + e + '). Pass args.path.')
  }
}
if (filePath === '') throw new Error('No file chosen.')
const base = filePath.replace(/\\/g, '/').split('/').pop() as string
const stem = base.replace(/\.[^.]+$/, '')
const outName = args.name !== undefined ? String(args.name) : stem
const targetCm = args.targetCm !== undefined ? Number(args.targetCm) : 14
out.source = filePath

// ---- 2. import -----------------------------------------------------------------------------------------------------
const dest = new Editor.Model.SourcePath(new Editor.Path('UserModels'), Editor.Model.SourceRootDirectory.Assets)
let metas: Editor.Model.AssetImportMetadata[] = []
let primary: Editor.Assets.Asset
let importedAt = ''
const already = am.findImportedCopy(new Editor.Path(filePath))
if (!Editor.isNull(already)) {
  metas = [already]
  primary = already.primaryAsset
  importedAt = already.assetTreePath.toString()
  log('already imported, reused: ' + importedAt)
} else {
  const res = await am.importExternalFileAsync(new Editor.Path(filePath), dest, Editor.Model.ResultType.Packed)
  if (Editor.isNull(res.primary)) throw new Error('Import produced no primary asset.')
  metas = res.files
  primary = res.primary
  importedAt = res.path.toString()
  log('imported as ' + importedAt + ' (' + primary.getTypeName() + ')')
}
const fbxPrefab = primary as Editor.Assets.ObjectPrefab
out.imported = importedAt

let tris = 0
let verts = 0
let materials = 0
let textures = 0
let animations = 0
const meshNames: string[] = []
for (const f of metas) {
  for (const a of f.assets) {
    if (a.isOfType('FileMesh')) {
      const mi = (a as any).info
      tris += mi.triangles
      verts += mi.vertices
      meshNames.push(a.name)
    } else if (a.isOfType('Material')) materials++
    else if (a.isOfType('Texture')) textures++
    else if (a.isOfType('AnimationAsset')) animations++
  }
}
out.triangles = tris
out.vertices = verts
out.materials = materials
out.textures = textures
out.animations = animations
out.meshes = meshNames

// ---- 3. world bounds of the model (mesh AABB corners through the node transforms) ----------------------------------
const D2R = Math.PI / 180
function rotate(v: number[], r: vec3): number[] {
  const cx = Math.cos(r.x * D2R), sx = Math.sin(r.x * D2R)
  const cy = Math.cos(r.y * D2R), sy = Math.sin(r.y * D2R)
  const cz = Math.cos(r.z * D2R), sz = Math.sin(r.z * D2R)
  const x1 = v[0], y1 = v[1] * cx - v[2] * sx, z1 = v[1] * sx + v[2] * cx // Rx
  const x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy // Ry
  return [x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2] // Rz
}
const mn = [1e12, 1e12, 1e12]
const mx = [-1e12, -1e12, -1e12]
let meshObjects = 0
function walk(o: Editor.Model.SceneObject) {
  const comps = o.components as any[]
  for (const c of comps) {
    if (!c.isOfType('RenderMeshVisual') && !c.isOfType('Component.RenderMeshVisual')) continue
    const mesh = c.mesh as any
    if (Editor.isNull(mesh) || Editor.isNull(mesh.info)) continue
    const wt = o.worldTransform
    const a = mesh.info.aabbMin, b = mesh.info.aabbMax
    for (let i = 0; i < 8; i++) {
      const p = [i & 1 ? b.x : a.x, i & 2 ? b.y : a.y, i & 4 ? b.z : a.z]
      const q = rotate([p[0] * wt.scale.x, p[1] * wt.scale.y, p[2] * wt.scale.z], wt.rotation)
      const w = [q[0] + wt.position.x, q[1] + wt.position.y, q[2] + wt.position.z]
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], w[k])
        mx[k] = Math.max(mx[k], w[k])
      }
    }
    meshObjects++
  }
  for (const ch of o.children) walk(ch)
}
for (const r of fbxPrefab.rootSceneObjects) walk(r)
if (meshObjects === 0) {
  // fall back: the mesh assets' own bounds
  for (const f of metas) for (const a of f.assets) if (a.isOfType('FileMesh')) {
    const mi = (a as any).info
    const lo = [mi.aabbMin.x, mi.aabbMin.y, mi.aabbMin.z], hi = [mi.aabbMax.x, mi.aabbMax.y, mi.aabbMax.z]
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], lo[k]); mx[k] = Math.max(mx[k], hi[k]) }
  }
  log('no node transforms found; bounds are the raw mesh bounds')
}
const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
out.boundsRaw = {min: mn.map((v) => +v.toFixed(3)), max: mx.map((v) => +v.toFixed(3)), size: size.map((v) => +v.toFixed(3))}
const longestRaw = Math.max(size[0], size[1], size[2])
const zUp = args.zUp === true
const up = zUp ? 2 : 1
out.orientation = {
  upAxis: zUp ? 'Z (rotated to Y)' : 'Y',
  heightToWidthRatio: +(size[up] / Math.max(size[0], size[up === 1 ? 2 : 1])).toFixed(3),
  hint: !zUp && size[1] < 0.35 * Math.max(size[0], size[2]) ? 'the model is very flat: if it lies on its back pass zUp:true' : 'looks upright',
}
out.unitsGuess = longestRaw > 60 ? 'longest side ' + longestRaw.toFixed(1) + ' units: probably centimetres of a life-size object, or metres x100; it is scaled to ' + targetCm + ' cm anyway' : longestRaw < 1 ? 'tiny: probably metres' : 'looks like centimetres'

// ---- 4. normalized wrapper prefab ---------------------------------------------------------------------------------
const s = targetCm / longestRaw
const root = scene.createSceneObject(outName) // temporary scene object: becomes the wrapper prefab, then is removed again
const inst = scene.instantiatePrefab(fbxPrefab, root)
inst.name = 'Model'
// rotate (Z-up -> Y-up) then scale, then stand on y = 0 and centre x / z. For Z-up the box is rotated -90 deg about X: (x, y, z) -> (x, z, -y)
const lo = zUp ? [mn[0], mn[2], -mx[1]] : [mn[0], mn[1], mn[2]]
const hi = zUp ? [mx[0], mx[2], -mn[1]] : [mx[0], mx[1], mx[2]]
const cx = (lo[0] + hi[0]) / 2
const cz = (lo[2] + hi[2]) / 2
inst.localTransform.scale = new vec3(s, s, s)
if (zUp) inst.localTransform.rotation = new vec3(-90, 0, 0)
inst.localTransform.position = new vec3(-cx * s, -lo[1] * s, -cz * s)
out.normalized = {scale: +s.toFixed(6), targetCm: targetCm, sizeCm: [(hi[0] - lo[0]) * s, (hi[1] - lo[1]) * s, (hi[2] - lo[2]) * s].map((v) => +v.toFixed(2)), standsOnY0: true, centredXZ: true}
const wrapper = am.saveAsPrefab(root, dest, outName + '_cm') as Editor.Assets.ObjectPrefab
root.destroy()
out.wrapper = 'UserModels/' + outName + '_cm.prefab'
log('normalized wrapper: ' + out.wrapper)

// ---- 5. assign to the My Model project ----------------------------------------------------------------------------
if (args.assign !== false) {
  const assigned: string[] = []
  const visit = (o: Editor.Model.SceneObject) => {
    for (const c of o.components as any[]) {
      if (!c.isOfType('ScriptComponent')) continue
      const names: string[] = c.inputNames
      if (names.indexOf('userModel') >= 0) {
        try { c['userModel'] = wrapper; assigned.push(o.name) } catch (e) { log('could not set userModel on ' + o.name + ': ' + e) }
      }
    }
    for (const ch of o.children) visit(ch)
  }
  for (const r of scene.rootSceneObjects) visit(r)
  out.assignedTo = assigned
  log('userModel assigned on: ' + assigned.join(', '))
}
return JSON.stringify(out, null, 1)
