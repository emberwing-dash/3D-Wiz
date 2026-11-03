# 3D Wiz - Visualize it. Build it. Test it.

An AR robotics and electronics workbench for Snap SPECS, built for Devpost *Learn AR with SPECS*. One engine, **six sourced example
projects**, a **Circuit Lab** (wire real component models yourself and test what the circuit can do) and a **My Model** slot for your own
FBX / OBJ / GLB or **CAD (STEP, STL, IGES)**. Every project is one data pack ("3dwiz-pack/1") read from a real open guide; the
engine (Build game, Wires, Visualize workbench, simulated Play) is shared. See [`NOTICE`](NOTICE) for credits and licences, and
[`devpost/design-brief.md`](devpost/design-brief.md) for the design (Revisions 2-4 supersede the first ESP32 pet pack).

## Run it
1. Open `3D_Wiz_5.23.1.esproj` in **Lens Studio 5.23.2** (SPECS target; the SPECS team's recommended version). Installed here: SpectaclesInteractionKit 2.0.0 (source version string 0.18.0), SpectaclesUIKit 2.0.0 and Leaf 2.0.2 (Asset Library versions for 5.22-5.23). If a GLB part imports with a broken material (a part throws `baseColorFactor of null` at launch), close and reopen the project so it re-imports from disk. If you open a project that was last saved by another Lens Studio version and the preview shows "This file cannot be used in a ScriptComponent", the TypeScript compile cache is stale: run `InstallLensStudioPackage` for SpectaclesInteractionKit v2.0.0 once (it forces a full recompile), then delete the duplicate `SpectaclesInteractionKit 2.lspkg` it adds.
   **Snapchat (phone) and Spectacles from one project:** the project targets Snapchat (Project Settings > Target Platform; switch it to Spectacles to publish for glasses). On a phone `WizPlatformGate` removes SpectaclesInteractionKit before it wakes, shows a pulsing ring + tap icon on the detected surface (Surface device tracking) and keeps the workbench hidden until you **tap** (it then stands on that surface, dark desk grid hidden), and `WizInteract` turns touch into the same events as a pinch: **tap = pinch-click, finger drag = pinch-drag**, so every mode works by touch; the icon menu opens by itself after ~3 s and tapping the hint icon toggles it. In the Lens Studio preview pick a mobile device for the phone path or **SPECS 27** (Interactive) for the glasses path. The phone path is verified only in the preview (a simulated tap switched modes); it has not been run in the Snapchat app.
2. The title screen shows the logo, the current project and a swipe-hint icon. **In the Preview panel, click (pinch) the hint icon, or drag it
   downward** - the icon menu also opens by itself about 3 seconds after launch.
3. On glasses, show the menu with the hand gesture below. Pick the **folder icon (Projects)** to choose a project.

There are **no buttons**: direct manipulation of 3D things, plus one icon menu.

## The example projects (+ My Model)
**RC Car (FORRC)** is the newest: the 8 printed parts are the repo's STL files (real shapes), the electronics are the repo's BOM with real
component CAD (see "Circuit Lab" below). Its source has **no wiring**, so the reference wiring is an *illustrative* design from the BOM and
the datasheet pin functions, and it is labelled that way.
Each card in the **Projects** carousel is a rotating 3D thumbnail, an icon and a name of at most two words. Pinch a card to load it.
Everything below was read **offline** from the cited source; the pack records the URL and licence and lists what the source does *not*
specify (`notSpecified`). Only wiring / pins the source states are encoded as wires. Every placement and every printed-part shape is
flagged *illustrative* / *approximate*; module sizes are standard sizes.

| Card | Source (licence) | Wires / pins taken from the source | Not in the source (so approximate or absent) |
|---|---|---|---|
| **Sesame Robot** | [soham0777/sesame-robot](https://github.com/soham0777/sesame-robot) (Apache-2.0) | 8 servo GPIOs, OLED I2C, power chain, 12 build steps, 19 firmware commands + face bitmaps; real printed parts (STL) | assembly placement of the STLs, electronics sizes |
| **Desk Pet** | [SukunDev/ESP32-Pet-Robot](https://github.com/SukunDev/ESP32-Pet-Robot) (MIT) | ESP32-C3: OLED SDA 8 / SCL 9, MPU6050 on the same I2C, TTP223 on 7, microphone on 4, 3V3 and GND to the modules; moods, touch, shake, lift, tilt, 5 s / 10 s sleep | the enclosure (the repo has none), module sizes, microphone type / VCC, eye bitmaps (drawn here to match the README) |
| **Obstacle Car** | [sanjana-n07/Obstacle-Avoiding-Robot](https://github.com/sanjana-n07/Obstacle-Avoiding-Robot) (MIT) | Uno + L298N: IN1 D8, IN2 D7, IN3 D4, IN4 D3, ENA D5, ENB D6, servo D9, Trig D10, Echo D11; SAFE_DISTANCE 35 cm; scan front 90 / left 0 / right 180; stop / turn / reverse logic | battery type and ALL power / motor wiring, chassis and wheel shapes |
| **Servo Hand** | [SATHv1kk/bionic-arm-flex-sensor-control](https://github.com/SATHv1kk/bionic-arm-flex-sensor-control) (MIT) | Mega: flex A0-A4, servos D3 D5 D6 D9 D10, dedicated 5 V >= 3 A, common ground, dividers on the Arduino 5 V; 5 SG90, three-segment fingers, angle 0 straight / 180 curled | printed part shapes (the repo has CAD screenshots only), horn orientation, tendon routing |
| **Button LED** | Arduino docs [Button](https://github.com/arduino/docs-content/blob/main/content/built-in-examples/02.digital/Button/Button.md) + [Blink](https://github.com/arduino/docs-content/blob/main/content/built-in-examples/01.basics/Blink/Blink.md) (CC BY-SA 4.0) | button on D2 with a 10K pull-down, other leg to 5 V; D13 -> 220 ohm -> LED anode, cathode -> GND; red / black rail wires | part sizes, where parts sit on the board |
| **My Model** | your file | the circuit of the template you pick | everything about your model (measured, not assumed) |

Each project has 9-12 guided build steps (4 quests, XP, stars, badges), its wires (with colours and pins) as a mini-game, a Visualize
workbench with its own fit-check parts, and a **simulated** Play.

## The gesture (SAO-style menu)
Hold up **index + middle finger** (ring and pinky curled, thumb ignored), then **sweep the hand down** to open the icon menu or **up** to
close it. Either hand. The icons appear beside the hand. The detector reads SIK hand joints (finger extension ratios plus a palm sweep) and
is debounced so a twitch does not toggle it.

Spectacles sizing: the icon column shows at most **7 icons** (the last is a **more** icon that pages through the rest), every icon hit box is 2.4 cm with 1.0 cm between boxes, and the stack is centred so it stays inside the ~23 x 38 cm view at 55 cm. The Play menu shows at most 5 commands per page + more + home.

Icons (no sentences): Visualize, Build, Play (locked until the build is done), Wires, **Projects**, Pause/Resume, Save, Home, Continue (only
when a save exists), in Visualize Arrange and Show-me, and in My Model the circuit-template icon.

## Circuit Lab (new): wire it yourself, test what it can do
Open **Circuit lab** (bolt icon) in a project that has electronics with an electrical model (RC Car, and My Model with the RC Car circuit).
- **Parts:** the BOM parts on a bench as real CAD models (ESP32-CAM, L293D, 74HC595, N20 motor, servo, 4xAA, MT3608 boost, LEDs, 220 ohm,
  1N4004, 2N2222, push button).
- **Wire:** pinch a part -> a panel of big round **pin buttons** opens (red = power, blue = ground, yellow = signal, green = output) -> pick a
  pin -> pinch another part -> pick its pin = a wire. Pinch a wire to remove it. A short circuit or an LED straight on 5 V flashes red at once.
- **Gamified help:** the **bulb** lights the two pins of the next wire the reference design needs, **Wire next** adds it, **Wire all** wires the
  rest (a quick demo), **Clear** starts over.
- **Test (play icon):** a small DC circuit simulator (`CircuitSim.ts`: nodal analysis, LED / diode / NPN piecewise models, boost converter,
  ESP32 GPIOs, L293D H-bridge, 74HC595, motor, servo) tries every combination of the wired GPIO levels and plays what it finds on the bench:
  four pips (**Power, Drive, Steer, Lights**), the motor spins forward / reverse, the servo sweeps, LEDs glow. A failing function names the
  reason in a few words (for example "driver motor supply low", "74HC595: needs a 3.3 V supply for ESP32 logic").
- **Honest limits:** it is a simplified DC model (no PWM waveforms, transients, heat or tolerances). A virtual pass does NOT prove a physical
  build works. The reference wiring is illustrative, not from the repo. Unit-tested in Node (`node tools/tests/circuit-sim.test.mjs`, 14 checks).

## Modes (shared by every project)
- **Build (guided map):** the offered part glows and starts turned the wrong way; a plain pinch turns it 90 degrees; a pulsing target region,
  insertion arrow and path line show where it goes; amber = wrong orientation, cyan = close, green = snaps; a wrong drop springs back.
- **Wires:** pinch the glowing wire to connect it (colours and pin labels per the source).
- **Visualize (virtual workbench):** a tray of the project's parts, alternative servos, screws and screwdrivers where the source or the optional
  standard set has them. Green = fits, amber = tight, red = clash; **Arrange**, a virtual screw action with hole rules, the simulated circuit
  test (**Play** here) and a wordless ghost-hand **Show-me**.
- **Play:** every project's own simulated commands (Sesame: 19 firmware commands + faces; Pet: moods, touch, shake, lift, tilt, sleep; Car:
  drive, scan, avoid, reverse, turns; Hand: open, fist, point, peace, thumbs-up, pinch, count; Button LED: press, hold, tap, blink).
- **Pause** freezes and dims. **Save** writes progress with `PersistentStorageSystem` (project id included); **Continue** (title screen)
  restores it, switching project first if needed.

## Add your own project
1. Copy a `Pack*.ts` (the smallest is `PackCircuit.ts`). Fill `components` (use the recipes in `PackParts.ts` or `prims`), `connections`,
   `steps` (8-14), `plan`, `quests` (4), `lab.commands` + `rig.acts`, `visualize`, `guide`, and record `identity.url` / `license` and `notSpecified`.
2. Add one line to `PACKS` in `PackRegistry.ts`. 3. Run the LEAF scenario `c8-pack-integrity`: it checks every reference. See
   [`tools/pack-from-guide.md`](tools/pack-from-guide.md) for the schema and the guide-to-pack recipe (offline).

## Upload demo (what to show)
1. **Upload (editor side):** `node tools/cad/ConvertCad.mjs chassis.step chassis.glb --zup --center` (a 425,000-triangle STEP becomes an
   80,000-triangle, true-size GLB), then run `tools/ImportMyModel.editor.ts` with that path.
2. **Projects > My Model:** your CAD part stands on the desk at its real size with a measured dimension box.
3. **Visualize:** test-fit the RC Car electronics inside the measured interior (green / amber / red); **Arrange**; screws and screwdrivers.
4. **Circuit lab:** wire the circuit, press Test, watch the motor, servo and LEDs.
Sample CAD used for the demo: the LHS Micro-D 24R chassis (circuit_ref/LHS-RC-MICRO-D-24R-Chassis, CC BY-NC-SA 4.0).

## Free 3D component models (no API key)
`node tools/cad/FetchPart.mjs <id> kicad <Library.3dshapes> <File.step>` or `... <id> adafruit "<folder>/<file>.step"` downloads a model,
converts it (real size, Y-up, per-colour materials) into `Assets/Models/Parts/` and records its source + licence in `parts.json`.
Sources: **KiCad official 3D library** (gitlab.com/kicad/libraries/kicad-packages3D: thousands of resistors, LEDs, ICs, headers, buttons,
buzzers, ESP32 / RP2040 modules; CC-BY-SA 4.0 with the KiCad library exception) and **Adafruit_CAD_Parts** (github.com/adafruit/Adafruit_CAD_Parts:
boards, servos, motors, battery holders; MIT). Both can be browsed through their public file-tree APIs (see the script header).

## Import my model (FBX / OBJ / GLB; CAD via tools/cad: STL, STEP, IGES)
**A Lens cannot open a file explorer or read arbitrary files** (preview or glasses), so there is no in-Lens upload. The import is a one-time
**editor-side** step: run `tools/ImportMyModel.editor.ts` with `ExecuteEditorCode` (pass `args.path`, or omit it for the native file chooser).
It imports the file to `Assets/UserModels/`, reports triangles / bounds / units, writes a normalized `<name>_cm.prefab` (cm, upright, centred,
standing on y = 0) and assigns it to the `userModel` inputs. Then **Projects > My Model**: your model stands on the desk; **Visualize**
measures its interior; test-fit the parts of any of the six circuits, open the circuit on the bench or in the Circuit Lab, run the simulated test. Details:
[`tools/import-model.md`](tools/import-model.md). **Sample run (real):** `KyleRobot.fbx` (763 KB, from `N:\GameJams`) imported to
`Assets/UserModels/`: 6,132 triangles, 5,845 vertices, 1 mesh, 1 material, 1 texture, 1 animation, raw size 118.8 x 180.3 x 34.3 units
(a life-size humanoid in T-pose, so the unit guess is "centimetres of a 1.8 m robot"), upright (Y-up), scaled x0.0776 to 14 cm tall
(9.2 x 14 x 2.7 cm). It appears on the desk, standing and centred; its interior (the T-pose bounding box, minus walls) is flagged *estimated*.

## Honest limits
- **Real hand tracking is unverified.** The gesture detector runs on SIK joints; here it was exercised only with synthetic joint frames
  (the "virtual hand") and with the pinch-click fallback in the preview. Thresholds are in `PROJECT_PACK.gesture`.
- **Right-click cannot be the swipe:** in the preview right-drag is look-around and Lens scripts cannot read right-click.
- **Printed parts are real only for Sesame** (converted from the repo STLs). The other projects use primitives, labelled approximate: the Pet
  has no enclosure in its source, the Hand source has CAD screenshots only, the Car's chassis / wheels / motors are generic.
- **Power and motor wiring of the Car is not in its source and is not drawn.** The Pet's microphone VCC is not specified either.
- Illustrative placements everywhere; standard sizes for off-the-shelf parts; the Visualize interiors are estimates (a box, minus a wall).
- Simulated Play never claims a physical result; the virtual wiring validator only compares with the pack.
- My Model measures bounds, not a cavity; a model's inside is unknown to the Lens.
- Save/Continue is verified inside one preview run; surviving a full Lens restart is not verified (build a few steps, Save, stop and reopen the
  Preview, look for the Continue icon).
- A simulated IK arm (LEAF) lands about one icon high on the lower icons of the stack (re-checked after the menu rework: still fails) even after biasing the icon hit areas downward;
  real-arm precision is untested. The SpectaclesUIKit package is still installed but no UIKit button is used.
- Only the Lens Studio preview was used; feel on real glasses is unproven.

## Tests (LEAF)
**c10 Circuit Lab** (pin picker by pinch, wires, hints, auto-wire, all four function tests, forward / reverse motor, break and repair,
hazards, 74HC595-on-5V failure, wires kept across modes) was added. Pack integrity (c8) skips desk-hidden bench parts.
Set `autoRun` on `WizLeafClient` (`LeafIndex` object) and read the log. Scenarios: c1 title + gesture + menu, c2 guided build, c3 wires,
c4 Visualize workbench, c5 play + pause, c6 save/continue, **c7 Projects carousel (>= 5 projects, each loads, builds and plays)**, **c8 pack
integrity (all five packs + My Model for every template)**, **c9 My Model (imported FBX, measured interior, template switch, bench, circuit
test)**, pack single-source (no UIKit buttons), IK reachability. `autoRun` is left OFF.

## Revision 6: Phobo workshop (design brief v2)
See `devpost/design-brief-v2.md` (approved; the original `design-brief.md` is kept for reference).
- **Phobo** (`Assets/Models/Phobo`, from `ref/assets/vr_mathepia/robot_ai/export/Phobo.fbx`): the companion bot. It floats beside you, holds still while you only
  look around, follows when you walk, steps aside during Drive / Play, talks through a dialogue box and shows expressions on an analog-TV face
  (`WizPhobo.ts`, `WizPhoboFace.ts`). It speaks only when you are stuck (about 20 s) or after a wrong step.
- **Menu in every scene:** swipe down (preview: the small tab) shows it, swipe up (preview: the up-arrow handle) hides it; **Back** is on every page and
  goes one step back (it replaced Home). Build is not in the menu any more (the code stays for the tests).
- **Place:** the Place icon shows a virtual table (the preview stand-in for plane detection) with a ring that follows your gaze; a pinch places the
  workspace there, the grab bar under it moves it again (`WizPlacement.ts`, `WizMover.ts`).
- **Circuit Lab:** KiCad-style diagram (`WizSchematic.ts`) <-> 3D bench with tidy wires, hands-assemble animation, Drive mode (`WizDrive.ts`).
  **Smart rails:** supply and ground nets are connected for you (13 of 34 wires remain for the RC Car).
- **Upload CAD** icon: prompts for a model; the file itself is imported in Lens Studio (see `tools/import-model.md`).
- Voice is out of this version; no API key is stored anywhere in the Lens.
- Tests: LEAF c1-c12 (c11 Drive, c12 Phobo / menu / placement). Known failing: `x-ik-reachability` (see the status notes).

## Live AI key (optional)

The demo is fully offline and instant by default. Live Gemini (a background cache and "ASK MORE") needs a key:

1. Copy `.env.example` to `.env` and paste your key after `GEMINI_API_KEY=` (`.env` is git-ignored; never commit it).
2. Run `powershell -ExecutionPolicy Bypass -File tools/apply-env.ps1` from the project root. It writes the local module `Assets/Scripts/GeminiKeyLocal.ts` (it works with an empty key and never prints the key). Then run `git update-index --skip-worktree Assets/Scripts/GeminiKeyLocal.ts` (the script tries this itself) so the file does not show as modified.
3. In Lens Studio set `CircuitGuide > liveAi` ON and press play. Key order: the Inspector `geminiKey` field first, else `.env`, else none (offline).

Warnings: rotate any key that was ever pasted into a chat, a file or a screenshot. Clear the Inspector `geminiKey` field before saving or committing. `.virtual-scene.json` and `Assets/Scene.scene` copy Inspector values, so keep them clean too.
