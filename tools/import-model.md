# Import my model (FBX / OBJ / GLB, plus CAD: STL / STEP / IGES) - five lines

A Lens running in the preview or on glasses **cannot open a file explorer or read arbitrary files**, so there is no in-Lens "upload". The import happens once, in Lens Studio.

1. In Lens Studio run `tools/ImportMyModel.editor.ts` with `ExecuteEditorCode` (path argument) - with `args.path` omitted it opens the native file chooser instead (a human must pick the file): `{"path": "C:/models/robot.fbx", "targetCm": 14, "zUp": false}`.
2. It imports the file into `Assets/UserModels/`, reports triangles / vertices / materials / textures / animations, raw bounds, unit guess and orientation hint, and writes `UserModels/<name>_cm.prefab`: the model scaled so its longest side is `targetCm`, standing on y = 0, centred on x / z (`zUp: true` stands Z-up files on their end).
3. It assigns that prefab to the `userModel` input of the `Visualize` and `Robot` components (My Model project). Nothing else in the scene changes. (Manual alternative: drag the prefab onto those two inputs in the Inspector.)
4. In the Lens open the menu, pick **Projects**, then the **My Model** card. Your model stands on the desk; **Visualize** measures its interior from the real meshes (bounds minus a 0.25 cm wall, flagged *estimated*) and lets you test-fit the parts of a circuit template; the **circuit icon** cycles the template through the five projects, **Wires** opens that circuit on the bench, **Play** runs the simulated circuit test.
5. Honest limits: the interior is a box estimate (not a cavity scan); orientation is not auto-corrected beyond `zUp`; a runtime safety net auto-scales a model whose longest side is outside 2.5-40 cm; the sample run on `KyleRobot.fbx` is recorded in the README.

## CAD files (STL, STEP / STP, IGES / IGS, BREP)
Lens Studio reads only FBX / OBJ / GLB, so CAD files are converted to GLB first, offline, then imported exactly as above:

```
cd tools/cad && npm install        (once; OpenCascade via occt-import-js, LGPL-2.1, used only by this tool, not in the Lens)
node tools/cad/ConvertCad.mjs C:/cad/part.step C:/cad/part.glb
```

- STL (binary or ASCII) needs no install. STEP / IGES / BREP keep their parts and colours (one mesh per solid).
- The GLB is then imported with `ImportMyModel.editor.ts` (`path` = the .glb). Size is normalized to `targetCm`, so the CAD unit does not matter for display.
- Proprietary CAD (SLDPRT, F3D, IPT, CATPART, DWG) cannot be read: export STEP or STL from the CAD app.
- Verified: a real STEP part (7 solids, 2,636 triangles, from the occt-import-js test set) converted, imported and passed the My Model LEAF scenario; binary and ASCII STL convert (STL only checked up to the GLB file, not imported into Lens Studio).

## Converter options (tools/cad/ConvertCad.mjs)
`node tools/cad/ConvertCad.mjs <in.step|stp|stl|iges|igs|brep> [out.glb] [--unit mm|cm|m|inch] [--max-tris N] [--zup] [--center] [--ground] [--keep-scale]`
- The GLB is written in **metres** (true glTF), so a 100 mm part imports as 10 cm. `--keep-scale` writes the raw numbers.
- `--max-tris N` (default 80000; 0 = off) merges vertices on a grid until the model fits: the LHS Micro-D assembly (425,301 triangles,
  215 parts) becomes 79,831 triangles in about 90 seconds. Small parts such as screws vanish first.
- `--zup` rotates a Z-up CAD frame (FreeCAD, SolidWorks, KiCad) to Y-up; `--center` / `--ground` centre the model / stand it on y = 0.
- STEP colours are kept per face (one glTF material per colour). Proprietary CAD (SLDPRT, F3D, IPT, CATPART, DWG) must be exported as STEP or STL first.
- `tools/cad/FetchPart.mjs` adds a free component model to Assets/Models/Parts (see the README, "Free 3D component models").
