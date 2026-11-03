# Video to step list (offline pre-step for the Circuit Guide)

The Lens never analyses video and never calls an AI at run time. This step runs once, on your computer, before the Lens is built.

## Input
- The tutorial video file (you supply it).
- A key for Gemini (or a similar model) in an environment variable, for example `GEMINI_API_KEY`.
  The key is NEVER written into a file, a scene property or the Lens. The Inspector field `Gemini Key` on `CircuitGuide` exists only so a tool run from the editor can read it; the running Lens ignores it.

## What to extract
Only the parts of the video where the circuit is shown. For each such moment, one step:

| field | meaning |
|---|---|
| `kind` | `place` (a component onto the board or model) or `wire` (two pins joined) |
| `part`, `spot` | place: the part id and the drop spot id |
| `pins` | wire: `["esp32.IO12", "l293d.2"]` (part.pin, undirected) |
| `title`, `text` | the panel words: which component, which pin to which pin |
| `say` | the narration transcript for the step (also the caption) |
| `after` | the narration that carries on once the step is complete |
| `clip` | name of the audio clip cut for this step (`narr_step3`), or `""` |
| `hint` | one short sentence for the likely mistake |

The output is JSON in the shape of `GuidePack` (`Assets/Scripts/GuideData.ts`). `parseGuidePack()` validates it: unknown parts, spots or pins are rejected with a readable message.

## Audio
Cut the narration into one clip per step (for example with `ffmpeg -ss <start> -to <end> -i video.mp4 -vn narr_step3.wav`), import the clips into `Assets/`, and register them with `orb.registerClip("narr_step3", asset)`. Until a clip exists the caption is the fallback.

## Check
Compare the step list with the video once by eye before building. Its quality sets the quality of the guide.

## Status in this repo
No video was supplied. `RC_SAMPLE` in `GuideData.ts` is a clearly labelled hand-authored stand-in for the RC car pack. The panel footer says so: "SAMPLE step list (hand-authored stand-in, not analysed from a video)".
