// GuideVoice.ts - the logic of the voice-to-build flow (no scene access): the tutorial catalogue, intent parsing and validation, the local
// keyword fallback, and the Gemini client.
// Owns: CATALOGUE, parseIntentJson / keywordIntent / filterCatalogue, geminiText / parseStepsJson (strict validation) and GeminiClient.
// Must not: touch the scene, log or echo the API key, or block the flow: every Gemini path has a local fallback and a timeout.
//
// HONEST NOTE: the "videos" are a small LOCAL catalogue (titles only, no video picture, no live YouTube search). With a key, Gemini
// only reads the spoken sentence (intent) and may write the step list; without a key the keyword match and RC_SAMPLE are used.

import {GuidePack, RC_SAMPLE, parseGuidePack} from "./GuideData"

export interface Tutorial {
  id: string // also the project name Gemini must answer with
  title: string
  blurb: string
  tags: string[]
  ready: boolean // a step list exists in this build
}

export const CATALOGUE: Tutorial[] = [
  {id: "rc-car", title: "RC Car", blurb: "Motor driver + steering servo", tags: ["rc", "car", "drive", "motor", "build", "remote", "toy"], ready: true},
  {id: "servo-hand", title: "Servo Hand", blurb: "One servo per finger (no step list yet)", tags: ["hand", "servo", "finger", "arm", "robot"], ready: false},
  {id: "desk-pet", title: "Desk Pet", blurb: "OLED face pet (no step list yet)", tags: ["pet", "desk", "oled", "face", "cat", "buddy"], ready: false},
  {id: "led-blink", title: "LED Starter", blurb: "First circuit: battery, switch, resistor, LED", tags: ["led", "light", "lamp", "blink", "starter", "simple", "basic", "first"], ready: true},
]

/** Add a step list the user brought (KiCad file, circuit photo, tutorial video): it shows up in the search results like a bundled one. */
export function registerTutorial(t: Tutorial): void {
  for (let i = 0; i < CATALOGUE.length; i++) {
    if (CATALOGUE[i].id === t.id) {
      CATALOGUE[i] = t
      return
    }
  }
  CATALOGUE.push(t)
}

export interface Intent {
  intent: "build"
  project: string
  search_query: string
}

/** Key order: the Inspector field first, else the generated local module (.env), else none (offline). Pure, so it is unit-tested with fake strings. */
export function pickKey(inspector: string, local: string): string {
  const a = inspector.trim()
  return a.length > 0 ? a : local.trim()
}

/** Two providers: a key that starts with gsk_ is a Groq key (OpenAI-compatible endpoint, very fast); anything else (AQ., AIza) is Gemini. */
export type Provider = "groq" | "gemini"
export function providerOf(key: string): Provider {
  return key.trim().indexOf("gsk_") === 0 ? "groq" : "gemini"
}

/** Key order: the Inspector field first, else a local .env module (Groq first because it is the faster one, then Gemini), else none. */
export function pickKeyMulti(inspector: string, groqLocal: string, geminiLocal: string): string {
  const a = inspector.trim()
  if (a.length > 0) return a
  const g = groqLocal.trim()
  return g.length > 0 ? g : geminiLocal.trim()
}

/** The text of an OpenAI-style (Groq) chat completion answer. */
export function groqText(body: any): string {
  const c = body && body.choices && body.choices[0] && body.choices[0].message ? body.choices[0].message.content : ""
  if (typeof c !== "string" || c.trim().length === 0) throw new Error("empty groq answer")
  return c
}

export const SCRIPTED_LINE = "I want build car"

/** Strict validation of the JSON Gemini returns for the spoken sentence. Returns null on anything unexpected. */
export function parseIntentJson(text: string): Intent | null {
  let o: any
  try {
    o = JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/```$/, ""))
  } catch (e) {
    return null
  }
  if (!o || typeof o !== "object") return null
  if (o.intent !== "build") return null
  if (typeof o.project !== "string" || CATALOGUE.filter((t) => t.id === o.project).length === 0) return null
  if (typeof o.search_query !== "string") return null
  const q = o.search_query.trim().toLowerCase()
  if (q.length === 0 || q.length > 40 || !/^[a-z0-9 \-]+$/.test(q)) return null
  return {intent: "build", project: o.project, search_query: q}
}

/** The offline path: a keyword match on the transcript. Always returns an intent (default: the RC car). */
export function keywordIntent(transcript: string): Intent {
  const t = " " + transcript.toLowerCase() + " "
  let best = CATALOGUE[0]
  let bestScore = 0
  for (const c of CATALOGUE) {
    let s = 0
    for (const tag of c.tags) if (t.indexOf(" " + tag + " ") >= 0 || t.indexOf(" " + tag + "s ") >= 0) s += 2
    if (t.indexOf(c.title.toLowerCase()) >= 0) s += 3
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }
  const q = best.id === "rc-car" ? "rc car" : best.title.toLowerCase()
  return {intent: "build", project: best.id, search_query: q}
}

/** Ranked, filtered catalogue for what is typed (empty text = everything). */
export function filterCatalogue(query: string): Tutorial[] {
  const toks = query.toLowerCase().split(/\s+/).filter((x) => x.length > 0)
  if (toks.length === 0) return CATALOGUE.slice()
  const scored = CATALOGUE.map((c) => {
    let s = 0
    const hay = (c.title + " " + c.blurb + " " + c.tags.join(" ")).toLowerCase()
    for (const t of toks) if (hay.indexOf(t) >= 0) s += c.title.toLowerCase().indexOf(t) >= 0 ? 3 : 1
    return {c: c, s: s}
  })
  return scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c)
}

/** Text of the first candidate of a Gemini generateContent response (or "" when the shape is wrong). */
export function geminiText(resp: any): string {
  try {
    const t = resp.candidates[0].content.parts[0].text
    return typeof t === "string" ? t : ""
  } catch (e) {
    return ""
  }
}

/** The longest AI-written step list that is accepted (the bundled RC list has 19 steps, so a full build must fit). */
export const MAX_AI_STEPS = 24

/** Gemini's step list -> a validated GuidePack (RC_SAMPLE's parts / pins / spots / board with new steps). null if anything does not resolve. */
export function stepsProblem(text: string): string {
  try {
    const o = JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/```$/, ""))
    const steps = Array.isArray(o) ? o : o.steps
    if (!Array.isArray(steps) || steps.length < 2 || steps.length > MAX_AI_STEPS) return "step count outside 2.." + MAX_AI_STEPS
    parseGuidePack(JSON.stringify({...RC_SAMPLE, steps: steps}))
    return ""
  } catch (e) {
    return String(e).substring(0, 120)
  }
}

export function parseStepsJson(text: string): GuidePack | null {
  try {
    const o = JSON.parse(text.trim().replace(/^```json\s*/i, "").replace(/```$/, ""))
    const steps = Array.isArray(o) ? o : o.steps
    if (!Array.isArray(steps) || steps.length < 2 || steps.length > MAX_AI_STEPS) return null
    const pack: GuidePack = {...RC_SAMPLE, steps: steps, source: "Step list written by Gemini (validated), not analysed from a video"}
    return parseGuidePack(JSON.stringify(pack))
  } catch (e) {
    return null
  }
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/"
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

export class GeminiClient {
  /** Last call, for the log (never the key): http status, milliseconds, a short note. */
  lastStatus = 0
  lastMs = 0
  lastNote = ""
  stepsNote = ""
  /** `getKey` reads the Inspector field at call time; the key is only ever put in a request header and never logged or stored. */
  constructor(private getKey: () => string, private model: () => string, private delay: (sec: number, f: () => void) => void, private enabled: () => boolean = () => true, private groqModel: () => string = () => "llama-3.3-70b-versatile", private getGroqKey: () => string = () => "") {}

  /** Which provider serves a request: the visible intent prefers Groq (fast), step lists and ASK MORE prefer Gemini; each falls back to the other provider's key,
   *  and with no key at all the caller uses its local fallback. Providers are decided by key prefix (gsk_ = Groq), never by the field they came from. */
  private pick(kind: "intent" | "steps" | "ask"): {prov: Provider; key: string} | null {
    const gm = this.getKey().trim()
    const gq = this.getGroqKey().trim()
    const all: {prov: Provider; key: string}[] = []
    for (const k of [gq, gm]) if (k.length > 10) all.push({prov: providerOf(k), key: k})
    const groqs = all.filter((x) => x.prov === "groq")
    const gems = all.filter((x) => x.prov === "gemini")
    const order = kind === "intent" ? groqs.concat(gems) : gems.concat(groqs)
    return order.length > 0 ? order[0] : null
  }

  /** Which provider a kind of request would use right now (for logs / tests): "groq", "gemini" or "none". */
  providerFor(kind: "intent" | "steps" | "ask"): string {
    const p = this.pick(kind)
    return p === null ? "none" : p.prov
  }

  /** Quota guards: answers are cached in memory by request text (never by key), identical in-flight calls are shared, a session makes at most
   *  `maxCalls` network calls and nothing is retried. Not persisted: a persisted copy would only be prompts and answers, but it is not needed yet. */
  private cache: {[k: string]: string} = {}
  private inflight: {[k: string]: Promise<string>} = {}
  calls = 0
  maxCalls = 8

  /** Live AI is on only when the Inspector switch `liveAi` is on AND a key is set. Off = no network call is ever made. */
  available(): boolean {
    return this.enabled() && (this.getKey().trim().length > 10 || this.getGroqKey().trim().length > 10)
  }

  hasCached(prompt: string): boolean {
    return this.cache[prompt] !== undefined
  }

  /** A step list written earlier (pre-warmed) for this project, already validated, or null. Never starts a call. */
  cachedSteps(project: string): GuidePack | null {
    const t = this.cache[this.stepsPrompt(project) + "|json"]
    return t !== undefined ? parseStepsJson(t) : null
  }

  /** The intent already read for this sentence, or null. Never starts a call. */
  cachedIntent(transcript: string): Intent | null {
    const t = this.cache[this.intentPrompt(transcript) + "|json"]
    return t !== undefined ? parseIntentJson(t) : null
  }

  /** Fire and forget: fill the cache in the background (one call per distinct request). The UI never waits for it. */
  warmSteps(project: string): void {
    if (!this.available() || this.cachedSteps(project) !== null) return
    this.steps(project).catch(() => undefined)
  }

  warmIntent(transcript: string): void {
    if (!this.available() || this.cachedIntent(transcript) !== null) return
    this.intent(transcript).catch(() => undefined)
  }

  private post(prompt: string, json: boolean = true, timeoutS: number = 12, kind: "intent" | "steps" | "ask" = "ask"): Promise<string> {
    const ck = prompt + (json ? "|json" : "|text")
    if (this.cache[ck] !== undefined) return Promise.resolve(this.cache[ck])
    if (!this.available()) return Promise.reject(new Error("live AI is off"))
    let base = this.inflight[ck]
    if (base === undefined) {
      if (this.calls >= this.maxCalls) return Promise.reject(new Error("call cap reached"))
      this.calls++
      base = this.rawFetch(prompt, json, kind)
      this.inflight[ck] = base
      // the call is kept until it really finishes: a caller that gave up (timeout) neither loses the answer (it still fills the cache)
      // nor causes a second identical call while this one is running
      base.then(
        (t) => {
          this.cache[ck] = t
          delete this.inflight[ck]
        },
        () => {
          delete this.inflight[ck]
        },
      )
    }
    const wait = new Promise<string>((_, rej) => this.delay(timeoutS, () => rej(new Error("timeout"))))
    return Promise.race([base, wait])
  }

  private async rawFetch(prompt: string, json: boolean, kind: "intent" | "steps" | "ask"): Promise<string> {
    const net: any = require("LensStudio:InternetModule")
    const pk = this.pick(kind)
    if (pk === null) throw new Error("no key")
    const groq = pk.prov === "groq"
    const key = pk.key
    const req = groq
      ? new Request(GROQ_ENDPOINT, {
          method: "POST",
          headers: {"Content-Type": "application/json", Authorization: "Bearer " + key},
          body: JSON.stringify(
            json
              ? {model: this.groqModel().trim(), messages: [{role: "user", content: prompt}], temperature: 0.1, response_format: {type: "json_object"}}
              : {model: this.groqModel().trim(), messages: [{role: "user", content: prompt}], temperature: 0.3, max_tokens: 400},
          ),
        } as any)
      : new Request(ENDPOINT + this.model().trim() + ":generateContent", {
          method: "POST",
          headers: {"Content-Type": "application/json", "x-goog-api-key": key},
          body: JSON.stringify({contents: [{parts: [{text: prompt}]}], generationConfig: json ? {responseMimeType: "application/json", temperature: 0.1} : {temperature: 0.3, maxOutputTokens: 900}}),
        } as any)
    const t0 = getTime()
    const call = (async () => {
      const res: any = await net.fetch(req)
      this.lastStatus = res.status
      const body = await res.text()
      this.lastMs = Math.round((getTime() - t0) * 1000)
      if (res.status !== 200) {
        let msg = ""
        try {
          msg = String(JSON.parse(body).error.message).substring(0, 100)
        } catch (e) {
          msg = ""
        }
        this.lastNote = "http " + res.status + (msg ? " " + msg : "")
        throw new Error(this.lastNote)
      }
      this.lastNote = "ok"
      return groq ? groqText(JSON.parse(body)) : geminiText(JSON.parse(body))
    })()
    // a hard stop so a hung request cannot block identical requests for the rest of the session
    const hard = new Promise<string>((_, rej) => this.delay(60, () => rej(new Error("hard timeout"))))
    return Promise.race([call, hard])
  }

  /** Read a circuit photo / drawing (Gemini vision). Returns the model's JSON text; the caller validates it (circuitFromJson). Needs a Gemini key and liveAi on. */
  async vision(prompt: string, base64: string, mime: string, timeoutS: number = 45): Promise<string> {
    const key = this.getKey().trim()
    if (!this.enabled() || key.length <= 10 || providerOf(key) !== "gemini") throw new Error("reading a photo needs a Gemini key and live AI on")
    if (this.calls >= this.maxCalls) throw new Error("call cap reached")
    this.calls++
    const net: any = require("LensStudio:InternetModule")
    const req = new Request(ENDPOINT + this.model().trim() + ":generateContent", {
      method: "POST",
      headers: {"Content-Type": "application/json", "x-goog-api-key": key},
      body: JSON.stringify({contents: [{parts: [{text: prompt}, {inline_data: {mime_type: mime, data: base64}}]}], generationConfig: {responseMimeType: "application/json", temperature: 0.1}}),
    } as any)
    const t0 = getTime()
    const call = (async () => {
      const res: any = await net.fetch(req)
      this.lastStatus = res.status
      const body = await res.text()
      this.lastMs = Math.round((getTime() - t0) * 1000)
      if (res.status !== 200) {
        this.lastNote = "http " + res.status
        throw new Error(this.lastNote)
      }
      this.lastNote = "ok"
      const t = geminiText(JSON.parse(body))
      if (t === "") throw new Error("empty answer")
      return t
    })()
    const hard = new Promise<string>((_, rej) => this.delay(timeoutS, () => rej(new Error("timeout"))))
    return Promise.race([call, hard])
  }

  private intentPrompt(transcript: string): string {
    const names = CATALOGUE.map((c) => c.id).join(", ")
    return (
      'You read what a maker said and answer ONLY with strict JSON {"intent":"build","project":"<one of: ' + names + '>","search_query":"<2-4 lowercase words to search a tutorial>"}. ' +
      'Sentence: "' + transcript.replace(/"/g, "'") + '"'
    )
  }

  async intent(transcript: string): Promise<Intent | null> {
    return parseIntentJson(await this.post(this.intentPrompt(transcript), true, 12, "intent"))
  }

  /** Short free-text answer for the ANALYSE page ("Ask more"). Only called when a key is set; the caller falls back to the local card. */
  async ask(part: string, what: string, timeoutS: number = 12): Promise<string> {
    const t = await this.post("In 3 short plain sentences, tell a maker more about this part of a DIY RC car: " + part + " (" + what + "). No markdown.", false, timeoutS, "ask")
    return t.trim()
  }

  private stepsPrompt(project: string): string {
    const parts = RC_SAMPLE.parts.map((p) => p.id + " pins: " + p.pins.map((q) => q.id).join(",")).join("; ")
    const spots = RC_SAMPLE.spots.map((s) => s.id).join(", ")
    return (
      'Write the build steps of an RC car circuit as strict JSON {"steps":[...]}. Each step: {"id":"s1","kind":"place"|"wire","title":"","text":"","part":"","spot":"","pins":["part.pin","part.pin"],"say":"","after":"","clip":"","hint":""}. ' +
      "place steps use part+spot only; wire steps use pins only. Use ONLY these ids. Parts: " + parts + ". Board pins: bb.P+, bb.N. Spots: " + spots + ". " +
      "6 to 10 steps, plain words, say = one narration sentence, hint = one short sentence for the likely mistake. (" + project + ")"
    )
  }

  async steps(project: string): Promise<GuidePack | null> {
    if (project !== "rc-car") return null
    const text = await this.post(this.stepsPrompt(project), true, 30, "steps")
    const why = stepsProblem(text)
    this.stepsNote = why === "" ? "accepted by parseGuidePack" : "rejected: " + why
    return parseStepsJson(text)
  }
}
