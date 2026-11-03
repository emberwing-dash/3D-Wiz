---
status: approved
---

# Design brief: 3DWiz (v2: Phobo workshop)

*Visualize it. Build it. Test it.*

<!-- Filled in by plan-lens from the learner's interview. Values the learner did not choose are marked (default). -->

## The one spatial moment
I put on the glasses and the first thing I see is **Phobo**, a companion bot that floats beside me and follows me around, with the main menu in front of it. I place my workspace on a table in my room, grab a part from my inventory and set it where I want, or import my own model and set the circuit on it wherever I like. I build the circuit like a real engineer (breadboard, jump wires), flip between a 2D circuit diagram and the 3D view, press Play and watch it run. Phobo guides me in every mode. The point of the video: **a virtual space to design and test a robot or circuit, with my own model, before I buy parts or 3D print.**

## The robots in the workshop
- **The cat-like OLED desktop pet** (ESP32, 128x64 OLED face, touch and motion sensors) stays the main example robot. It is a project to load, assemble, wire and test.
- **The obstacle-avoiding car** stays as the second example robot (the RC Car circuit with motor, servo and LEDs is its Circuit Lab / Drive twin).
- **My Model** is the learner's own uploaded model, with the same circuits placed on it.
- **Phobo** is not one of these: it is the companion guide that follows the user and helps in every mode.

## Why it belongs on glasses
- Uses: **draws in the world** (workspace, model and circuit sit on my real table at real size); **leaves your body free** (hands only pinch and grab, eyes stay on the build).
- Why it's better than the phone or laptop version: the parts, the wires and Phobo's help sit on the thing they describe at real size, and I can walk around the build instead of switching between a CAD app, a schematic and a tutorial.

## Product or overlay
- Type: **product** (the virtual workshop is the experience).
- What the real version would sense: the real table surface (plane detection). Nothing else.
- Stand-in for the preview: a **virtual table** the Lens provides. A placement marker follows where I look and lands on it; a pinch places the workspace there. A grab bar under the workspace moves it again. (default)

## Where things live
- Where I look during the main task: down at the workspace on the table, arm's length (about 55 to 80 cm), a little below eye level.
- **Phobo**: floats beside me, slightly ahead and to one side, near eye level, about 50 cm away (default), always inside my view. It follows me when I move. It holds still while I'm just looking around. It never covers the workspace.
- **Dialogue box**: above Phobo's head, a short line of text (about 8 words, default). Shown when I'm stuck or when a step needs me.
- **Menu**: swipe down shows the icon stack, swipe up hides it. In the preview a small handle (click or drag) does the same. At most 7 icons per page, targets at least 2 cm with at least 1 cm gaps, Back is on every page.
- **Workspace**: on the table. Model in the middle, inventory tray in front (parts to grab), circuit view to one side.
- **Circuit**: a real-looking **breadboard with jump wires** in 3D, and a **2D circuit diagram** (KiCad style). One icon switches 2D and 3D; both show the same circuit.
- **Placement spots on my model**: when I carry a part (for example the battery), a green outline shows the suggested place on the model. I can ignore it and drop the part anywhere I like.

## Hands and input
- Show or hide the menu: swipe down / swipe up (preview: handle).
- Place the workspace: pinch on the table marker. Move it: grab the bar and drag.
- Take a part from the inventory: grab, move, release on the model or the breadboard.
- Make a wire: pinch a pin, pinch another pin. Pinch a wire to remove it.
- Tap Phobo: it answers with an expression on its screen.
- Play / Drive: pinch the big round buttons (hold to drive).
- Targets are big and highlight when aimed at.
- Voice (if any) and the button that does the same job: **voice is out of this version**. Phobo uses the dialogue box. (A voice reply could be added later through a small server of the learner's; no API key is stored in the Lens.)

## When things show
- **Phobo**: always visible, in every mode. Holds still when I am only looking around; follows when I walk or turn; steps aside (small, to the edge of my view) during Play and Drive. Speaks only when I'm stuck (no progress for a while, default 20 s) or after a wrong step.
- **Menu icons**: shown on swipe down, hidden on swipe up, and hidden while I am dragging something.
- **Suggested spots**: shown only while I carry a part.
- **Wrong connection**: the wire turns red and Phobo explains in a few words, then I can try again with no penalty.
- If something needs attention out of view: Phobo points with a small arrow.

## Gamification
Make it feel like a robotics workshop where progress comes from learning and building correctly.
- **XP** for each part placed well, each correct wire and each finished step, with a visible XP counter and a progress bar.
- **Build streak**: a bonus for several correct steps in a row without using hints.
- **Circuit Master badge** after every required connection is correct; a few more unlockable badges (Driver, Neat Wiring, Own Model).
- **Phobo unlocks**: new expressions and animations on its TV face after the tests are passed.
- **Workshop levels**: Beginner Builder, Circuit Explorer, Robotics Engineer.
- Wrong answers give a helpful explanation and another attempt, never a permanent penalty.
- Finish with a **"Robot Activated!"** screen after the virtual build and test.

## Keep it simple (the learner's rule: nothing clumsy, everything organised)
- One main action per screen. The same four places for everything: menu, Phobo, workspace, circuit view.
- **Fewer wires**: power and ground are drawn as labelled rails (and can be auto-connected), so I only wire signals and the choices that matter (default). The reference circuit goes from about 34 wires to about 12.
- No unexplained text on screen: icons plus one short word, and Phobo for anything longer.
- Wires on the breadboard run straight and tidy, and never cross a part.

## Done criteria
Each one can be checked in Lens Studio's preview.
1. **Meet Phobo.** On start I see Phobo with the main menu in front of it. When I walk or look around Phobo follows me; when I stand still it holds still. Clicking Phobo changes the expression on its analog-TV screen.
2. **Menu everywhere.** In every mode, swipe down (handle in the preview) shows the icon menu and swipe up hides it. Back is always on the menu and goes one step back.
3. **Place and move.** A marker follows where I look onto the virtual table; a pinch places the workspace; the grab bar moves it again.
4. **Build the circuit with verified pins.** On the breadboard I connect pins with jump wires. Every wire is checked against the project's **verified pin connections** (the real pin list of each board): a correct connection turns green, a wrong one turns red and Phobo explains why, with another try and no penalty. A completion indicator counts the verified connections. The 2D/3D icon shows the same circuit in both views.
5. **Place parts on my model and test.** I import a model, grab the battery from the inventory, see the suggested spot, put it somewhere else if I want.
6. **Virtual test.** For the cat-like OLED pet I press simulated **touch and motion** inputs (touch, shake, tilt, sound) and the OLED face shows the matching **expression**; finishing the test sequence shows a success result and unlocks expressions. For the obstacle-avoiding car, Play and Drive run from my own wiring. Phobo steps aside while the test runs, XP rises and "Robot Activated!" appears.

## Out of scope
- A file picker inside the Lens: models are imported in Lens Studio (FBX, GLB, OBJ; STEP and STL through the converter).
- Voice and any API key inside the Lens.
- Recognising a real table or real objects (a virtual table stands in).
- Two-hand and custom gestures; two people sharing a Lens; remembering progress between sessions.

## Risks and open questions
- The real swipe gesture needs hand tracking and cannot be tried with a mouse; the handle is the preview stand-in. "Feel unproven."
- The learner pasted a live API key into the chat. It was not stored; it should be rotated.
- Plane detection on real glasses is not proven here: the preview uses a virtual table.
- Simulation is a simplified DC model: a virtual pass does not prove a physical build works.
- Phobo.fbx is a small model (about 36 KB); its TV screen is built in the Lens, so the expression art is new work.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.
- Reuse what exists: the Circuit Lab and simulator (CircuitSim), the KiCad-style diagram, Drive mode, the menu, the mover bar, the CAD converter. Phobo asset: `ref/assets/vr_mathepia/robot_ai/export/Phobo.fbx` and `dialogueBox/`.

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
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move Phobo 15 cm lower and make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
