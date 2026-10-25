// WizPhoboAI.ts - Phobo's brain. A tiny Gemini call through Snap's Remote Service Gateway (the same pattern the Snap AiAgent template uses for
// prompt suggestions): the Lens never holds a key; the token is set by the user in the scene's RemoteServiceGatewayCredentials component.
// When no token is set (or the call fails) Phobo answers from the scripted hints below, so the experience never depends on the network.
// Owns: the prompt, the request, the answer clean-up. Must not: draw UI or decide when Phobo speaks (WizPhobo / WizMain do).

import {Gemini} from "RemoteServiceGateway.lspkg/HostedExternal/Gemini"
import {GoogleGenAITypes} from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes"
import {RemoteServiceGatewayCredentials, AvaliableApiTypes} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"

const MODEL = "gemini-3.1-flash-lite-preview"
const MAX_WORDS = 10

const SYSTEM =
  "You are Phobo, a small friendly companion robot inside an AR workshop where a maker designs a robot or circuit before building it. " +
  "Answer in at most " + MAX_WORDS + " plain words. No markdown, no emoji, no quotes. Be concrete and kind. Use the context to be specific."

export interface PhoboContext {
  scene: string // lab | visualize | drive | test | overview ...
  project: string // pack name
  next: string // the next wire / step, if any
  problem: string // the last error, if any
}

export class WizPhoboAI {
  /** Is a real token set (so a network call can work)? */
  static available(): boolean {
    const types: AvaliableApiTypes[] = [AvaliableApiTypes.Google, AvaliableApiTypes.Snap, AvaliableApiTypes.OpenAI]
    for (const t of types) {
      const tok = RemoteServiceGatewayCredentials.getApiToken(t)
      if (tok && tok.length > 8 && tok.indexOf("[INSERT") < 0) return true
    }
    return false
  }

  /** Ask Gemini for one short line. Resolves with "" when there is no token or the call fails (the caller then uses the scripted line). */
  static ask(question: string, ctx: PhoboContext): Promise<string> {
    if (!WizPhoboAI.available()) return Promise.resolve("")
    const request: GoogleGenAITypes.Gemini.Models.GenerateContentRequest = {
      model: MODEL,
      type: "generateContent",
      body: {
        contents: [
          {
            parts: [
              {
                text:
                  "Scene: " + ctx.scene + "\nProject: " + ctx.project + "\nNext step: " + (ctx.next !== "" ? ctx.next : "none") +
                  "\nProblem: " + (ctx.problem !== "" ? ctx.problem : "none") + "\nUser asks: " + question,
              },
            ],
            role: "user",
          },
        ],
        systemInstruction: {parts: [{text: SYSTEM}]},
        generationConfig: {temperature: 0.6, maxOutputTokens: 40},
      },
    }
    return Gemini.models(request)
      .then((response) => {
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text
        return text ? WizPhoboAI.tidy(text) : ""
      })
      .catch((e) => {
        print("[PhoboAI] request failed: " + e)
        return ""
      })
  }

  /** One line, at most MAX_WORDS words, no markup. */
  static tidy(text: string): string {
    const words = text.replace(/[*_`#>"]/g, "").replace(/\s+/g, " ").trim().split(" ")
    return words.slice(0, MAX_WORDS).join(" ")
  }

  /** The scripted answer used offline (and while the network answer is on its way). */
  static scripted(question: string, ctx: PhoboContext): string {
    if (question === "why") return ctx.problem !== "" ? ctx.problem : "Looks fine to me!"
    if (question === "next") return ctx.next !== "" ? "Try: " + ctx.next : "Nothing left. Press Test!"
    if (question === "what") return "Tap a part to see its pins"
    if (question === "where") return "Green outline = suggested spot"
    return "I am here to help"
  }
}
