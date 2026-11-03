---
status: approved
---

# Design brief: Circuit Guide

## The one spatial moment
The user stands at a table with an uploaded FBX model (for example an RC car) split into parts, and a breadboard. A voice orb plays the narration from a tutorial video. At each step the video pauses, a glowing guide shows exactly where to drop the component and which pins to wire, and the user does it with their hands. When the step is right it glows green and the next step starts by itself. At the end the user presses Play and drives the finished model.

## Why it belongs on glasses
- Uses: draws in the world, leaves your body free.
- Why it's better than the phone or laptop version: the guide sits on the real breadboard and parts, so the user never pauses a video and looks back and forth between screen and bench. Both hands stay on the parts.

## Product or overlay
- Type: product. The virtual model, breadboard and guide are the experience.
- What the real version would sense: nothing. Placement and wiring are checked inside the Lens.
- Stand-in for the preview: none for sensing. The video is analysed ahead of time (once, before the Lens runs) by Gemini or a similar model. Only the steps where the circuit is shown are kept. They are saved into the Lens as a fixed step list, with the narration audio cut into one clip per step and a short voice hint for each likely mistake. The Lens never depends on live AI. The user supplies the video file. The Gemini key goes in the Inspector only and is never written into a file.

## Where things live
- Where the user is looking during the main task: down at the table, at the model and breadboard.
- Model (from the FBX): starts on a virtual table in front of the user at roughly arm's length (default 60 cm away, a little below eye level). Its parts can be pulled apart and snapped back together. The user can grab it and place it anywhere in free space, between steps and after the last step.
- Breadboard and real-looking component models: on the same table beside the model. Use realistic models and textures, not generic boxes or spheres.
- Guide glow: on the exact drop spot and on the exact pins for the current step. White or cyan glow (default), red for a mistake, green for success.
- Left-side step panel: lists the current step in words (which component, which pin to which pin). It sits to the left of the work area, kept small so it never covers the model. Size about 25 cm wide (default).
- Voice orb: a small glowing orb floating near the user, off to one side of the work area (default: front-right at about 50 cm). It speaks the video's narration and shows a caption under it.
- Virtual controller (end of build): joystick and buttons for a car, or one slider per arm part for a servo hand. Appears next to the model after Play.

## Hands and input
- Attach a component: grab the part and drop it on the glowing spot.
- Wire: drag a wire end to a pin. Both endpoints must be set.
- Move the model: grab it and place it anywhere, at any step. Parts can be separated and reattached.
- Play: one big pinch button after the last step.
- Drive or control: joystick and buttons for a car, sliders for servo arm parts, depending on the model.
- Targets are big and highlight when aimed at.
- Voice: the orb only speaks. Nothing is controlled by voice. Every spoken line also appears as a caption, because audio in the preview can be unreliable.

## When things show
- Step panel and guide glow: show for the current step only, update when the step is complete.
- Orb: speaks the narration clip when a step starts. The narration pauses while the user works, and carries on when the step is complete.
- Wrong placement or wire: the wrong connection turns red, the orb speaks a short hint (with caption), and the part returns to its previous position so the user can try again.
- Correct step: green glow, then the next step starts automatically. There is no Next button.
- Virtual controller: appears only after the final step and Play.
- If something needs attention out of view: none planned (default).

## Done criteria
Each one can be checked in Lens Studio's preview.
1. I can load an FBX model, pull its parts apart, put them back together, and place the model anywhere in the AR space with the mouse as a grab.
2. At each step the Lens shows exactly where the component and wires go, with glowing highlights on the correct drop spot and pins, matching the steps from the analysed video.
3. When I connect something incorrectly, the connection turns red, the orb gives a short voice hint with a caption, and the part returns to its previous position.
4. When I complete a step correctly it glows green and moves to the next step automatically, with the narration continuing from the video.
5. After the last step I can press Play and test the model: drive a virtual car with a joystick, or control a servo hand with sliders.

## Out of scope
- Live video understanding while the Lens is running.
- Real phone control or any real hardware or physical circuit.
- Showing the tutorial video's picture (only the narration audio plays).
- Voice commands.
- A separate mode for building circuits without a video (planned for later).
- Saving progress between sessions, or two people sharing a Lens.

## Risks and open questions
- Analysing the video is a step done before the Lens runs. It must extract the exact sequence of component placements, pin connections, narration clips and mistake hints. Each step must match what the person says and demonstrates. Its quality sets the quality of the steps, so check the step list against the video once.
- Which non-car models and controls exist depends on that analysis (for example one slider per servo arm).
- Decided: reuse the existing Circuit Lab project where possible (see `devpost/STATUS.md`), and update it to support this workflow. Do not break its current functionality.
- Decided: this version is video-guided building only. A separate mode for building circuits without a video comes later (listed under Out of scope).
- Voice hint audio may not play in the preview. The caption is the fallback.
- Feel unproven: hand-tracking comfort, grabbing small pins on real glasses.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Reuse the existing Circuit Lab code where possible and keep its current functionality working. Re-run its existing LEAF scenarios after changes.
- Everything is simulated in the preview: grabbing components, wiring, free-space placement and testing the finished model. Assume no physical hardware.
- Use realistic component models and textures. Do not use plain primitive shapes for components.
- Never store the Gemini key in any file. Read it from an Inspector field only.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

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
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step panel 15 cm lower and next to the breadboard. Make the Play button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
