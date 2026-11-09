# 3D Wiz demo, button by button (Visualize -> Analyse -> Build -> My Model)

Folder with the files: L:\Hackathons\college\new\Lens Specs\proj\3D_Wiz_5.23.1\Showcase
  1_models\microd_80k.glb | 2_circuits\led_starter.json, led_circuit_photo.json, led_tutorial.json
  3_converter_inputs\led_starter.kicad_sch, led_circuit_photo.png, led_tutorial.mp4

Button names are the labels in the code. Open the menu by sweeping your hand down (or the pinch-click in the preview).
The title menu has four icons: Visualize, Analyse, Build, My Model. Every page has BACK TO MENU.

## 0. Opening (20 s)
SAY: "Building a robot is hard because you only find out the circuit is wrong after it is wired. 3D Wiz lets you see it in AR first, understand it, build it step by step, and then do the same with your own model and circuit."
DO: show the title screen, open the menu.

## 1. VISUALIZE (40 s): see where the parts go
DO: tap **Visualize**.
SAY: "Visualize shows the model and the real components next to it. Each component has a glowing outline on the model where it belongs."
DO: drag one component onto its glowing outline: it snaps and says "attached". Tap **SEE-THRU** to see inside the body. Tap **RESET**.
DO: tap **WATCH DEMO**; the simulated hand attaches every component. Use **PAUSE** and **SPEED x1** to slow it.
SAY: "So you know the layout before you buy or print anything."
DO: **BACK TO MENU**.

## 2. ANALYSE (40 s): understand each part
DO: tap **Analyse**.
SAY: "Analyse explains what each part does. Hover a part: it gets a thin outline, tap it for the info card."
DO: tap a part (for example the motor driver), read the card, press **ASK MORE**.
SAY: "Offline the card comes from the built-in info. ASK MORE calls Gemini for a longer answer."
DO: optionally **WATCH DEMO** to auto-tap the parts. **BACK TO MENU**.

## 3. BUILD (60 s): build it step by step
DO: tap **Build**.
SAY: "Build walks me through it. The current step glows on the table; the arrow goes from the part to its spot."
DO: tap **EXPLODE** then **ASSEMBLE** to show the parts of the model. Pick up a part and put it on the glowing spot; put one on the wrong spot to show the red hint; then the right one: green, auto-advance.
DO: show the tutorial video panel (animated stand-in that follows the steps), press **WATCH DEMO** (AUTO BUILD) and then the **DEMO / YOUR TURN** switch to take over.
DO: tap the **VOICE** orb and say "build me a robot car"; press **OKAY** to confirm.
SAY: "Voice is read by Groq because it is fast; the step lists come from Gemini or the built-in catalogue."
DO: press **PLAY** when the circuit is wired. **BACK TO MENU**.

## 4. MY MODEL (90 s): your own CAD and your own circuit
DO: show the folder 1_models in Explorer: microd_80k.glb. (Imported earlier with tools/ImportMyModel.editor.ts, which made MicroD_cm.prefab.)
SAY: "A Lens cannot open a file picker, so the file is imported once in Lens Studio. After that it is in the list."
DO: tap **My Model**.
- Step 1 PICK A 3D MODEL: press **>** until **MicroD** ("your file, split into parts").
- Step 2 PICK A CIRCUIT: press **>** until **LED starter: battery, switch, resistor, LED**.
- Step 3 ATTACH IT: press **START BUILD**.
SAY: "The Lens measured my model and put glowing spots for the battery and switch on its top surface, and the resistor and LED on the breadboard."
DO: place the four parts, wire battery+ -> switch -> resistor -> LED -> battery-, show one wrong wire in red, then **PLAY** and turn the switch on: the LED lights.

DO: go back to **My Model** and show the other circuits:
- KiCad: `node tools/wrap-kicad.mjs Showcase/3_converter_inputs/led_starter.kicad_sch`, then the entry in the list.
- Photo: show led_circuit_photo.png, press **CONVERT PHOTO**, wait for "Photo converted: it is in the list", then **START BUILD**.
- Video: show led_tutorial.mp4 and its pre-run result (`node tools/media-to-circuit.mjs ...`) in the list.

## 5. Why Gemini and Groq (30 s)
"Gemini can read pictures and videos, so it converts photos and videos into circuits and writes the detailed answers. Groq is very fast, so it handles voice commands. Each backs up the other, and with no key the app uses its built-in catalogue, so the demo never breaks. Calls are capped, answers cached, and anything the AI returns is checked against parts we have 3D models for."

## 6. Close and honest limits (20 s)
"Upload a model, bring a KiCad file, photo or video, see it, understand it, build it without mistakes. Supported parts: LED, resistor, battery, switch, motor, servo, ESP32, L293D. Tested in the Spectacles preview, not on real glasses; KiCad tested on a hand-written file; video conversion runs as a tool outside the Lens."

## If something fails
- No internet: set `liveAi` off. Everything works except CONVERT PHOTO and ASK MORE (use the built-in card text, and the pre-converted JSON).
- Do not claim Groq was tested live, real KiCad exports, or real glasses.
