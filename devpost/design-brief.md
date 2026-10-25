---
status: approved
---

# Design brief: 3DWiz

*Visualize it. Build it. Test it.*

<!-- Filled in by plan-lens from the learner's interview. Values the learner did not choose are marked (default). -->

## The one spatial moment
I'm looking at my desk. A cat-like ESP32 desktop pet robot, 12-15 cm tall, sits on it at real size. I rotate it, pull it apart into an exploded view, and inspect the ESP32 board and OLED display. I follow its wiring as highlighted 3D wires and a guided assembly, then press virtual touch and motion inputs and watch the OLED face change expression, without any hardware.

## Why it belongs on glasses
- Uses: **draws in the world** (robot at real scale on the desk, wiring drawn on the parts it connects); **leaves your body free** (hands free, eyes on the robot while building).
- Why it's better than the phone or laptop version: the parts, wires and instructions sit on the thing they describe at real size, so you inspect and build without switching between a CAD app, a wiring diagram and a tutorial.

## Product or overlay
- Type: **product** (the virtual robot, circuit and test lab are the experience).
- What the real version would sense: touch, motion and sound on a physical robot. The Lens does not sense a real robot.
- Stand-in for the preview: a **Load Project** button loads an offline-prepared "project pack" for the pet robot (prepared from github.com/SukunDev/ESP32-Pet-Robot, MIT). **Virtual Touch / Shake / Tilt / Sound** buttons stand in for the touch sensor, motion sensor and microphone. The video and README say the analysis is done offline and that sensor input is simulated.

## Project pack (single source of truth)
One data file defines the whole project. Every mode reads it, and no script keeps its own copy of component or connection data. It holds: project identity; components (id, type, name, purpose, scene-object reference); mechanical assembly relationships and exploded-view offsets; electrical connections (source component and pin, destination component and pin, wire id, explanation); guided steps (instruction, highlighted component, highlighted wire); expression and input behaviour; and expected virtual validation results.

Component IDs (stable, used everywhere): `esp32`, `oled`, `imu` (MPU6050), `touch_sensor` (TTP223), `microphone`, `body_shell`, `ears`, `base`. (default: the shell, ears and base are my split of the body; adjust if you want different parts.)

Verified connections from the source repo's README (only these may appear in the circuit; none are invented):

| Wire | From | To |
|---|---|---|
| i2c_sda_oled | ESP32 pin 8 | OLED SDA |
| i2c_scl_oled | ESP32 pin 9 | OLED SCL |
| i2c_sda_imu | ESP32 pin 8 | MPU6050 SDA (shared bus) |
| i2c_scl_imu | ESP32 pin 9 | MPU6050 SCL (shared bus) |
| touch_sig | ESP32 pin 7 | TTP223 signal |
| mic_sig | ESP32 pin 4 | Microphone signal |
| power_3v3 | ESP32 3V3 | OLED VCC, MPU6050 VCC, TTP223 VCC |
| ground | ESP32 GND | OLED, MPU6050, microphone, TTP223 GND |

Not stated in the source, so the pack must say "not specified" and not guess: I2C addresses, the microphone's analog or digital type, the microphone's VCC, and whether the pin numbers are GPIO numbers. Before the build, cross-check `diagram.json` in the repo (a Wokwi wiring file) against this table.

Expressions in the source: default (auto-blink), happy, angry, sleepy, asleep, scared, curiosity, tilted left/right. Source behaviour: touch in default or curiosity gives a random happy or angry; touch while asleep gives angry; sound while asleep gives scared or angry; shake or lift/drop gives scared; tilt makes the eyes look that way; 5 s idle gives sleepy, 10 s idle gives asleep.

## Where things live
- Where the user is looking during the main task: at the robot on the desk, about 55 cm away, a little below eye level. Glancing left for wiring and right for instructions.
- Robot: on the desk, real size 12-15 cm tall, centred in front of the user. Parts stay aligned with their real positions inside the robot. Built from primitive shapes, one scene object per component. (default: no robot FBX is available; swap one in later if supplied.)
- Circuit panel: floating to the robot's left, compact (default: about 12 x 10 cm), wires drawn between the real components on the model.
- Assembly steps card: to the robot's right, compact (default: about 12 x 8 cm), one instruction at a time.
- Test panel: below and slightly to the side of the robot (default: about 12 x 6 cm).
- Main menu: a small persistent bar with Explore, Build, Circuit and Test (default: below the robot, never covering it). A Load Project button sits on the opening screen.
- Everything stays inside the narrow view (about 23 x 38 cm usable at 55 cm). Text is light on dark and readable at arm's length (default: at least 1 cm cap height).

## Hands and input
- Load Project, mode buttons, Next, Previous, Reset, Back: pinch to press, big buttons.
- Rotate robot: grab and drag (mouse drag in the preview).
- Exploded view: the Explore Components button toggles it; parts can also be grabbed and dragged. Selecting a part highlights it and shows its label.
- Circuit: pinch a wire or endpoint to highlight it and see source pin, destination pin and what it does.
- Virtual sensors: Touch, Shake, Tilt Left/Right and Sound buttons in the Test panel.
- Targets are big and highlight when aimed at.
- Voice: none planned.

## When things show
- Robot: always visible once the project is loaded, anchored on the desk.
- Circuit panel: hidden by default; shows on the left in Circuit mode; hides on close or mode switch. Active wire and its endpoints are highlighted; the rest of the circuit stays visible but dimmed.
- Assembly steps: show on the right in Build mode, one at a time with the relevant component glowing and a "Step N of total" indicator; hide on exit.
- Part labels: show when a component is selected or pointed at (name and purpose); fade when the user moves on.
- Exploded view: only in Explore mode; parts separate smoothly and return on exit.
- Test panel: shows in Test mode; hides on exit.
- Main menu: always visible, small.
- Only one main task panel is open at a time. Switching modes dismisses the previous panel, restores the right robot view and keeps content anchored to the desk.
- If something needs attention out of view: none (everything is within the desk-view area).

## Done criteria
Each one can be checked in Lens Studio's preview.
1. **Load and inspect.** Click Load Project and the cat-like desktop pet appears at desk scale. Dragging rotates it. Clicking the ESP32 board and the OLED shows each one's name and purpose.
2. **Exploded view.** In Explore, the robot separates into its individual parts (the same objects as the assembled robot). Selecting a part highlights it and shows its name and purpose. Exiting restores the assembled model.
3. **Follow the circuit.** In Circuit, the OLED, ESP32, MPU6050, touch sensor and microphone appear connected by highlighted wires that match the connection table above. Selecting a wire shows its source and destination pins.
4. **Guided assembly.** In Build, each step shows an instruction, highlights its component, and updates "Step N of total". Next and Previous work, and Back returns to the overview.
5. **Virtual pet test.** In Test, pressing Touch, Shake, Tilt and Sound changes the OLED face (happy, angry, scared, eyes looking left or right) in the preview. Leaving the pet alone makes it sleepy and then asleep. The panel marks everything as simulated.

## Out of scope
- Analysing a GitHub repo inside the Lens at runtime. Packs are prepared offline.
- Arbitrary circuit generation and real electrical measurement. The validator only checks selections against the pack. A virtual pass does not prove a physical robot works.
- Real touch, motion and microphone sensing; real hand-tracking quality.
- Imported FBX or Blender models (primitives are used).
- Recording, identifying or following people. Multi-user sharing.
- Saving progress between sessions.

## Risks and open questions
- Custom hand gestures cannot be shown in the preview. "Rotate" and "pull apart" are built as standard grab and drag, which the mouse can drive. Feel on real glasses: unproven.
- The repo README does not state I2C addresses, the microphone type or its VCC pin. The pack will say "not specified" for these, and `diagram.json` should be cross-checked before the build.
- The robot is made of primitive shapes. A cat-like silhouette (ears, round head, OLED face) has to read well at 12-15 cm.
- Virtual validation (confirming connections) is not a physical test.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.
- Keep one project-pack data file as the only definition of components, connections, steps and behaviours. Use the stable IDs above in the scene, circuit, assembly and simulation.
- Keep the virtual circuit validator separate from the pet-behaviour simulation, and label simulated sensor input as virtual.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources

## Revision 2 (user-requested): Sesame Quadruped
The first version (generic ESP32 cat-like pet with primitive shapes) was rejected as "not what I envisioned". The earlier ESP32 pet pack is **superseded**. Changes:
- Main menu titled "3D Wiz" with tagline "Visualize it. Build it. Test it.", a Sesame Quadruped project card, a Load Project button, and a Home button in the mode bar.
- Project: the open-source Sesame Robot (Apache-2.0; Dorian Borian, replication by Soham Kadu), Lolin S2 Mini hand-wired. Servo pins {1,2,4,6,8,10,13,14} = R1,R2,L1,L2,R4,R3,L3,L4 (firmware); OLED SSD1306 0x3C, SDA GPIO33, SCL GPIO35; battery -> rocker switch -> buck converter (5 V) -> 5 V and GND rails -> servo headers, OLED and S2 Mini VBUS/GND, as drawn in the wiring diagram.
- Real printed parts (frame, bottom cover, Cat top cover, joints L1-L4/R1-R4) converted from the repo STLs, shown life-size on a virtual desk with cm dimension boxes; Life-size / Enlarged toggle.
- Tinkercad-style circuit bench with coloured wires, pin labels and cross-highlight to the robot; virtual validator kept separate.
- Test Lab simulates the firmware movement commands and OLED faces (SIMULATED, no hardware).
- 12 build steps from the repo build-guide order. Unspecified or illustrative data is flagged in the pack.

## Revision 3 (user-requested): no buttons, gesture menu, guided map, virtual workbench
Feedback on Revision 2: the main menu was not visible, there was too much text, and the build needed a simple guided map. Changes (nothing above is removed):
- **No buttons at all.** All UIKit buttons and panels are gone. Interaction is direct manipulation of 3D objects plus one SAO-style icon menu.
- **Title screen:** animated "3D Wiz" logo, tagline, robot idling, swipe-hint icon; the icon menu also auto-opens about 3 s after launch.
- **Gesture:** index + middle finger up, ring/pinky curled, palm sweep down opens, up closes; either hand; debounced. Preview fallback: pinch-click or drag-down on the hint icon, plus a synthetic virtual hand through the same detector. Real hand tracking is unverified.
- **Menu icons:** Visualize, Build, Play (locked until built), Wires, Pause/Resume, Save, Home, Continue (only with a save), Arrange, Show-me.
- **Guided-map build:** offered part glows and starts turned wrong; a plain pinch turns 90 degrees; pulsing target region, insertion arrow, path line; amber/cyan/green; wrong drop springs back. Quests, XP, stars, badges, confetti. Quest order follows the repo build order (Frame, Wiring, Servos, Life).
- **Wires** is a mini-game (pinch the glowing wire). **Visualize** is a virtual try-before-you-build workbench: alternative servos, screws, screwdrivers, green/amber/red fit, Arrange, virtual screw rules, simulated circuit test, wordless ghost-hand demo, `userModel` slot.
- **Pause** freezes and dims; **Save/Continue** via PersistentStorageSystem.
- **Generic pack** `3dwiz-pack/1` (see `tools/pack-from-guide.md`); guide-to-pack is an offline step.
- **Text budget:** titles of at most three words, icons, numbers, pips.
- Labels: logic proven in the preview and LEAF; hand-tracking feel and glasses feel unproven.

## Revision 4 (user-requested): five example projects, a Projects carousel, My Model import
- **Five sourced examples** selectable from the Projects icon as a row of rotating 3D cards (icon + name of at most two words): Sesame Robot (real STL parts), Desk Pet (ESP32-C3, OLED eyes), Obstacle Car (Uno + L298N + HC-SR04), Servo Hand (5 x SG90 + flex glove), Button LED (Arduino starter on a breadboard). One pack per project, one engine. Sources: SukunDev/ESP32-Pet-Robot (MIT), sanjana-n07/Obstacle-Avoiding-Robot (MIT), SATHv1kk/bionic-arm-flex-sensor-control (MIT), Arduino docs Button + Blink (CC BY-SA 4.0).
- **Honesty rules:** only wires the source states are encoded; anything unstated is listed in `notSpecified` (Car power / motor wiring, Pet microphone VCC, all enclosures / printed shapes without an STL); every placement is illustrative; part sizes are standard sizes.
- **My Model:** a Lens cannot open a file explorer, so the import is editor-side (`tools/ImportMyModel.editor.ts`, native file chooser or path): FBX / OBJ / GLB -> `Assets/UserModels/`, normalized wrapper prefab (cm, upright, centred), assigned to the `userModel` inputs. In the Lens: the model on the desk, a measured (estimated) interior, the parts of any of the five circuits to test-fit, the circuit on the bench, a simulated circuit test.
- Reachability: icon hit areas are biased downward; the simulated IK arm still lands about one icon high on the lower icons (open finding).
- Labels: logic proven in the preview and LEAF (c1-c9); real hand tracking, real glasses and arm precision are unproven.

## Revision 5 (user-requested): Circuit Lab, RC Car, CAD upload
- **CAD upload:** STEP / STL / IGES are converted offline (tools/cad/ConvertCad.mjs: true-size metres, Y-up, per-colour materials, a triangle
  budget so a 425k-triangle assembly becomes a Lens-sized mesh) and imported like any model into My Model.
- **RC Car project:** the repo's 8 STL parts + the full BOM as real component CAD (KiCad / Adafruit libraries, fetched with tools/cad/FetchPart.mjs).
- **Circuit Lab:** free-form wiring through a pin picker (big round pin buttons), a pure-logic DC simulator (CircuitSim.ts) that tries every GPIO
  combination, function tests (Power / Drive / Steer / Lights) with playback on the bench, hazards (short, LED overcurrent, GPIO overload),
  hints and auto-wire from a reference design. Text budget: pips, icons and two-to-four word reasons.
- Honesty: the source has no wiring (reference wiring is illustrative); the simulator is a simplified DC model; a virtual pass is not a physical test.
