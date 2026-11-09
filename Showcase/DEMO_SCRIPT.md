# 3D Wiz demo: about 4 minutes

Pitch in one line: **see the robot and its circuit in AR before you build it, then build it step by step, on your own CAD model and your own circuit.**

## Files in this folder (copies of the project files; the Lens reads the originals in Assets/)
| Folder | File | Use |
|---|---|---|
| 1_models | microd_80k.glb  (prefab: Assets/UserModels/MicroD_cm.prefab) | the custom CAD model shown on My Model (tested with the LED build, g18) |
| 1_models | KyleRobot.fbx | second model, a humanoid |
| 2_circuits | led_starter.json | LED Starter circuit (battery, switch, resistor, LED) |
| 2_circuits | led_circuit_photo.json | circuit converted from a picture by Gemini |
| 2_circuits | led_tutorial.json | circuit converted from a video by Gemini |
| 3_converter_inputs | led_starter.kicad_sch | KiCad schematic (convert with tools/wrap-kicad.mjs) |
| 3_converter_inputs | led_circuit_photo.png | circuit drawing, CONVERT PHOTO input |
| 3_converter_inputs | led_tutorial.mp4 | tutorial video, input for tools/media-to-circuit.mjs |

## Before you present (2 minutes)
1. Open the project in Lens Studio, Preview = Spectacles. Make sure `CircuitGuide` has: `userModels` includes MicroD_cm, `circuitFiles` = the three JSONs, `circuitPhoto` = led_circuit_photo.png, `liveAi` ON, key set (from .env). If the internet is bad, turn `liveAi` OFF: everything except CONVERT PHOTO still works offline.
2. Pre-run the video converter once so the result is ready: `node tools/media-to-circuit.mjs Showcase/3_converter_inputs/led_tutorial.mp4`
3. Clear the Inspector `geminiKey` after the demo.

## The script (say / do)
**0:00 Hook.** SAY: "Building a robot is hard because you cannot see where the circuit goes until it is already wired wrong. 3D Wiz lets you see it first, in AR, then build it step by step." DO: show the title screen; sweep the hand down to open the menu.

**0:30 Visualize.** DO: Menu -> an example project (RC car) -> Visualize / Analyse. SAY: "This is the 3D model with its parts. Hover a part, it gets an outline and I can ask what it does." Tap a part, show the info card; press ASK MORE. SAY: "That answer comes from Gemini."

**1:15 Your own model + your own circuit (the main point).** DO: Menu -> **My Model**. Model: pick MicroD (our imported CAD file). Circuit: pick **LED Starter**. Press START BUILD. SAY: "I did not build this model in the Lens. I uploaded a CAD file, and the Lens split it into parts and found its top surface. The circuit parts now have glowing spots on it."

**2:00 Build and test.** DO: grab each part, put it on the glowing spot (battery, switch, resistor, LED), then wire battery+ -> switch -> resistor -> LED -> battery-. Show a wrong wire turning red with a hint. Press PLAY, turn the switch on: the LED lights. SAY: "It checks every wire against the circuit, so a mistake is caught before you solder."

**2:50 Bring your own circuit.** SAY: "My circuit can come from three places." (a) Show the KiCad file converting: `node tools/wrap-kicad.mjs ...` and the new entry in the circuit list. (b) On My Model press **CONVERT PHOTO**: Gemini reads the drawing (led_circuit_photo.png) and adds the circuit to the list (takes a few seconds). (c) Show the video result (pre-run): "A tutorial video turns into the same kind of step list." Pick the new circuit, START BUILD again.

**3:40 Close.** SAY: "Upload a model, bring a schematic, a photo or a video, see it in AR, build it without mistakes."

## Why Gemini and why Groq (say this when asked)
- **Gemini** reads pictures and videos (vision, Files API) and writes careful, longer answers. We use it for: CONVERT PHOTO, the video converter, step lists, and ASK MORE. Nothing else we use does images and video in one API.
- **Groq** is very fast. We use it for the voice command ("build me a robot car") where a half-second delay feels broken. Each provider is the fallback for the other, and with no key the app falls back to a built-in catalogue, so the demo never breaks.
- Safety by design: AI never blocks the demo (answers are cached, max 8 calls per session), the key lives only in .env / Inspector and is never logged, and the AI's circuit is validated against the parts and pins the Lens has 3D models for, so a wrong AI answer cannot make an impossible build.

## Honest limits (say them before a judge finds them)
- Only parts with 3D models are supported: LED, resistor, battery, switch, motor, servo, ESP32, L293D.
- KiCad was tested on a hand-written KiCad 7 file. A Lens cannot open a file picker, so "upload" = add the file in Assets and list it in the Inspector.
- Video conversion runs as a tool outside the Lens. Tested in the preview only, not on real glasses.
- Groq has not been exercised live in testing; Gemini has.
