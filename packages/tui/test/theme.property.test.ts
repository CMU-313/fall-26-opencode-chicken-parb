import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { Message, Session, TextPart } from "@opencode-ai/sdk/v2"
import fc from "fast-check"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { createComponent, onMount } from "solid-js"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { DEFAULT_THEMES, resolveTheme, ThemeProvider, useTheme, type Theme } from "../src/context/theme"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { TestTuiContexts } from "./fixture/tui-environment"
import { tmpdir } from "./fixture/fixture"
import { mountThemeSession, wait } from "./fixture/theme-session"
import { MAX_HISTORY_ENTRIES, type PromptInfo } from "../src/prompt/history"

const PROPERTY_SEED = 17313
const PROPERTY_RUNS = 100
const PERSISTENCE_SEED = 517313
const PERSISTENCE_RUNS = 20
const STALE_PERSISTENCE_RUNS = 10
const SESSION_SEED = 117313
const SESSION_RUNS = 40
const EQUIVALENCE_SEED = 417313
const EQUIVALENCE_RUNS = 30

const themeName = fc.constantFrom(...Object.keys(DEFAULT_THEMES))
const persistedThemeName = fc.constantFrom(...Object.keys(DEFAULT_THEMES).filter((name) => name !== "opencode"))

// The reserved prefix guarantees an invalid name while the generated suffix
// covers empty, ASCII, and Unicode boundary data in selection, config, and stale KV state.
const invalidThemeName = fc.string({ maxLength: 40 }).map((name) => `missing:${name}`)

// Generating two names and rejecting equal pairs guarantees that every case
// exercises a real intermediate theme change instead of an A -> A -> A no-op.
const distinctThemes = fc.tuple(themeName, themeName).filter(([initial, intermediate]) => initial !== intermediate)

// Both modes are generated because theme definitions may resolve different
// color and styling values in their dark and light branches.
const themeMode = fc.constantFrom<"dark" | "light">("dark", "light")

// Both public locking operations are generated so persistence is checked after
// pinning an explicit mode and after locking the provider's current mode.
const modeLockMethod = fc.constantFrom<"setMode" | "lock">("setMode", "lock")

// A non-default selection proves restoration came from disk rather than the
// provider fallback. Overrides are absent, equal, distinct, or guaranteed-invalid;
// the invalid boundary checks that an unresolvable config cannot replace the saved appearance.
const persistenceCase = persistedThemeName.chain((selected) =>
  fc.oneof(
    fc.constant({ selected, override: undefined as string | undefined, kind: "none" as const }),
    fc.constant({ selected, override: selected as string | undefined, kind: "same" as const }),
    themeName
      .filter((override) => override !== selected)
      .map((override) => ({ selected, override: override as string | undefined, kind: "different" as const })),
    invalidThemeName.map((override) => ({ selected, override: override as string | undefined, kind: "invalid" as const })),
  ),
)

const generatedText = fc.oneof(
  fc.string({ maxLength: 80 }),
  fc.constantFrom("", "你好，世界", "🙂 café", "مرحبا بالعالم", "e\u0301"),
)
const historyEntry = fc.record({
  input: generatedText,
  mode: fc.option(fc.constantFrom<"normal" | "shell">("normal", "shell"), { nil: undefined }),
  parts: fc.array(generatedText.map((text) => ({ type: "text" as const, text })), { maxLength: 3 }),
})

// History sizes cover empty, single, ordinary multi-entry, and the 49/50/51
// retention boundary. Generated text includes empty strings and Unicode.
const historyCase = fc.oneof(
  fc.constant({ kind: "empty" as const, entries: [] as PromptInfo[] }),
  historyEntry.map((entry) => ({ kind: "single" as const, entries: [entry] })),
  fc.array(historyEntry, { minLength: 2, maxLength: 8 }).map((entries) => ({ kind: "multiple" as const, entries })),
  fc.constantFrom(49, 50, 51).chain((size) =>
    fc
      .array(historyEntry, { minLength: size, maxLength: size })
      .map((entries) => ({ kind: `boundary-${size}` as const, entries })),
  ),
)

const messageEntry = fc.record({ role: fc.constantFrom<"user" | "assistant">("user", "assistant"), text: generatedText })

// Chat transcripts explicitly include empty, single-message, and multiple-message cases.
const messageCase = fc.oneof(
  fc.constant({ kind: "empty" as const, entries: [] as { role: "user" | "assistant"; text: string }[] }),
  messageEntry.map((entry) => ({ kind: "single" as const, entries: [entry] })),
  fc.array(messageEntry, { minLength: 2, maxLength: 8 }).map((entries) => ({ kind: "multiple" as const, entries })),
)

const sessionMetadata = fc.record({ title: generatedText, created: fc.integer({ min: 0, max: 2_000_000_000 }) })

test("R3 restores resolved appearance after a theme round-trip", async () => {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  let theme!: ReturnType<typeof useTheme>
  let mounted!: () => void
  const ready = new Promise<void>((resolve) => {
    mounted = resolve
  })

  function Probe() {
    theme = useTheme()
    onMount(mounted)
    return null
  }

  const app = await testRender(() =>
    createComponent(TestTuiContexts, {
      directory: tmp.path,
      paths: {
        home: tmp.path,
        state,
        worktree: tmp.path,
      },
      get children() {
        return createComponent(TuiConfigProvider, {
          config: createTuiResolvedConfig(),
          get children() {
            return createComponent(KVProvider, {
              get children() {
                return createComponent(ThemeProvider, {
                  mode: "dark",
                  source: { discover: async () => ({}) },
                  get children() {
                    return createComponent(Probe, {})
                  },
                })
              },
            })
          },
        })
      },
    }),
  )

  let lastTheme: string | undefined
  try {
    await ready

    // R3 — Theme reversibility: Switching from Theme A to Theme B and back to Theme A must restore the original theme-controlled appearance. (Round-trip)
    fc.assert(
      fc.property(distinctThemes, themeMode, invalidThemeName, ([initial, intermediate], mode, invalid) => {
        theme.setMode(mode)
        expect(theme.mode()).toBe(mode)

        expect(theme.set(initial)).toBe(true)
        expect(theme.selected).toBe(initial)
        const before = snapshotThemeAppearance(theme, app.renderer)
        expect(before.background).toEqual(before.theme.background)
        expect(theme.set(invalid)).toBe(false)
        expect(theme.selected).toBe(initial)
        expect(snapshotThemeAppearance(theme, app.renderer)).toEqual(before)

        expect(theme.set(intermediate)).toBe(true)
        expect(theme.selected).toBe(intermediate)
        const changed = snapshotThemeAppearance(theme, app.renderer)
        expect(changed.background).toEqual(changed.theme.background)
        expect(changed).not.toEqual(before)

        expect(theme.set(initial)).toBe(true)
        expect(theme.selected).toBe(initial)
        const restored = snapshotThemeAppearance(theme, app.renderer)
        expect(restored.background).toEqual(restored.theme.background)
        expect(restored).toEqual(before)
        lastTheme = initial
      }),
      { seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS },
    )

    if (lastTheme) await waitForSavedTheme(path.join(state, "kv.json"), lastTheme)
  } finally {
    app.renderer.destroy()
  }
})

test("R1 preserves the current session and histories while switching themes", async () => {
  const historyKinds = new Set<string>()
  const messageKinds = new Set<string>()
  let sawUnicode = false

  // R1 — Session preservation: Changing themes must preserve the user's current session, including chat history, messages, and command history. (Invariant)
  await fc.assert(
    fc.asyncProperty(
      distinctThemes,
      themeMode,
      sessionMetadata,
      messageCase,
      historyCase,
      async ([initial, target], mode, metadata, generatedMessages, generatedHistory) => {
        historyKinds.add(generatedHistory.kind)
        messageKinds.add(generatedMessages.kind)
        sawUnicode ||= [metadata.title, ...generatedMessages.entries.map((item) => item.text), ...generatedHistory.entries.map((item) => item.input)].some(
          (text) => /[^\x00-\x7F]/.test(text),
        )

        await using tmp = await tmpdir()
        const state = path.join(tmp.path, "state")
        const historyFile = path.join(state, "prompt-history.jsonl")
        await mkdir(state, { recursive: true })
        await Bun.write(path.join(state, "kv.json"), "{}")
        await Bun.write(historyFile, serializeHistory(generatedHistory.entries))

        const harness = await mountThemeSession(tmp.path, state)
        const retainedHistory = generatedHistory.entries.slice(-MAX_HISTORY_ENTRIES)
        try {
          await waitForFile(historyFile, serializeHistory(retainedHistory))
          await waitForHistory(harness.history, retainedHistory.length)

          const sessionID = "ses_theme_property"
          const session: Session = {
            id: sessionID,
            slug: "theme-property",
            projectID: "proj_test",
            directory: tmp.path,
            title: metadata.title,
            version: "1.18.15",
            metadata: { generated: true },
            time: { created: metadata.created, updated: metadata.created + 1 },
          }
          const messages = createMessages(sessionID, tmp.path, generatedMessages.entries)
          const parts = messages.map(
            (message, index): TextPart => ({
              id: `prt_${index}`,
              sessionID,
              messageID: message.id,
              type: "text",
              text: generatedMessages.entries[index]!.text,
            }),
          )

          harness.emit({ id: "evt_session", type: "session.updated", properties: { sessionID, info: session } })
          messages.forEach((info) =>
            harness.emit({ id: `evt_${info.id}`, type: "message.updated", properties: { sessionID, info } }),
          )
          parts.forEach((part, index) =>
            harness.emit({
              id: `evt_${part.id}`,
              type: "message.part.updated",
              properties: { sessionID, part, time: index },
            }),
          )
          harness.route.navigate({ type: "session", sessionID })
          await wait(() => {
            const current = harness.sync.session.get(sessionID)
            return (
              current?.title === session.title &&
              harness.route.data.type === "session" &&
              harness.route.data.sessionID === sessionID &&
              (harness.sync.data.message[sessionID]?.length ?? 0) === messages.length &&
              parts.every((part) => {
                const loaded = harness.sync.data.part[part.messageID]
                return (
                  loaded?.length === 1 &&
                  loaded[0]?.id === part.id &&
                  loaded[0].type === "text" &&
                  loaded[0].text === part.text
                )
              })
            )
          })
          expect(snapshotValue(harness.sync.session.get(sessionID))).toEqual(snapshotValue(session))
          expect(snapshotValue(harness.sync.data.message[sessionID] ?? [])).toEqual(snapshotValue(messages))
          expect(
            snapshotValue(
              Object.fromEntries(messages.map((message) => [message.id, harness.sync.data.part[message.id] ?? []])),
            ),
          ).toEqual(snapshotValue(Object.fromEntries(parts.map((part) => [part.messageID, [part]]))))

          const expectedHistory = [...retainedHistory].reverse().map(snapshotValue)
          const loadedHistory = snapshotPromptHistory(harness.history, retainedHistory.length)
          expect(loadedHistory).toEqual(expectedHistory)
          expect(snapshotPromptHistory(harness.history, retainedHistory.length)).toEqual(loadedHistory)

          harness.theme.setMode(mode)
          expect(harness.theme.set(initial)).toBe(true)
          const before = snapshotSession(harness, sessionID, messages, retainedHistory.length)
          const historyBefore = await Bun.file(historyFile).text()

          expect(harness.theme.set(target)).toBe(true)
          expect(harness.theme.selected).toBe(target)
          expect(snapshotSession(harness, sessionID, messages, retainedHistory.length)).toEqual(before)
          expect(await Bun.file(historyFile).text()).toBe(historyBefore)
          await waitForSavedTheme(path.join(state, "kv.json"), target)
        } finally {
          harness.app.renderer.destroy()
        }
      },
    ),
    { seed: SESSION_SEED, numRuns: SESSION_RUNS },
  )

  expect(historyKinds).toEqual(new Set(["empty", "single", "multiple", "boundary-49", "boundary-50", "boundary-51"]))
  expect(messageKinds).toEqual(new Set(["empty", "single", "multiple"]))
  expect(sawUnicode).toBe(true)
}, 120_000)

test("R4 produces equivalent results through slash command and theme button", async () => {
  await using tmp = await tmpdir()
  const slashRoot = path.join(tmp.path, "slash")
  const buttonRoot = path.join(tmp.path, "button")
  await Promise.all([mkdir(slashRoot, { recursive: true }), mkdir(buttonRoot, { recursive: true })])
  const slash = createThemeSelectionWorker("slash", slashRoot)
  const button = createThemeSelectionWorker("button", buttonRoot)
  const modes = new Set<string>()

  try {
    // R4 — Selection method equivalence: Selecting the same theme through `/themes` and the on-screen theme button must produce identical results. (Model/oracle)
    // Distinct built-in pairs force both real entry paths to change the theme, while
    // generating both modes compares mode-specific resolved appearances.
    await fc.assert(
      fc.asyncProperty(distinctThemes, themeMode, async ([initial, target], mode) => {
        modes.add(mode)
        const [fromSlash, fromButton] = await Promise.all([
          slash.run({ initial, target, mode }),
          button.run({ initial, target, mode }),
        ])

        expect(fromSlash.previewSelected).toBe(target)
        expect(fromButton.previewSelected).toBe(target)
        expect(fromSlash.selected).toBe(target)
        expect(fromButton.selected).toBe(target)
        expect(fromSlash.mode).toBe(mode)
        expect(fromButton.mode).toBe(mode)
        expect({ selected: fromSlash.selected, appearance: fromSlash.appearance }).toEqual({
          selected: fromButton.selected,
          appearance: fromButton.appearance,
        })
        expect(fromSlash.appearance).toEqual(snapshotResolvedTheme(resolveTheme(DEFAULT_THEMES[target]!, mode)))
      }),
      { seed: EQUIVALENCE_SEED, numRuns: EQUIVALENCE_RUNS },
    )
    expect(modes).toEqual(new Set(["dark", "light"]))
  } finally {
    await Promise.all([slash.close(), button.close()])
  }
}, 120_000)

test("R5 restores persisted themes and honors configuration overrides", async () => {
  const kinds = new Set<string>()
  const lockMethods = new Set<string>()
  const save = createRecyclingPersistenceWorker()
  const restore = createRecyclingPersistenceWorker()
  try {
    // R5 — Theme persistence: The selected theme must persist across OpenCode restarts unless an explicit configuration override takes precedence. (Round-trip)
    await fc.assert(
      fc.asyncProperty(
        persistenceCase,
        themeMode,
        modeLockMethod,
        async ({ selected, override, kind }, mode, lockMethod) => {
          kinds.add(kind)
          lockMethods.add(lockMethod)
          await using tmp = await tmpdir()
          const state = path.join(tmp.path, "state")
          await mkdir(state, { recursive: true })
          await Bun.write(path.join(state, "kv.json"), "{}")

          const saved = await save.run({ action: "save", root: tmp.path, state, theme: selected, mode, lockMethod })
          expect(saved.initialSelected).toBe("opencode")
          expect(saved.initialLocked).toBe(false)
          expect(saved.selected).toBe(selected)
          expect(saved.mode).toBe(mode)
          expect(saved.locked).toBe(true)
          expect(saved.appearance).toEqual(snapshotResolvedTheme(resolveTheme(DEFAULT_THEMES[selected]!, mode)))

          const restarted = await restore.run({ action: "restore", root: tmp.path, state, theme: override, mode })
          expect(restarted.initialSelected).toBe(override ?? selected)
          expect(restarted.selected).toBe(override ?? selected)
          expect(restarted.mode).toBe(mode)
          expect(restarted.locked).toBe(true)
          if (kind === "different")
            expect(restarted.appearance).toEqual(
              snapshotResolvedTheme(resolveTheme(DEFAULT_THEMES[override!]!, mode)),
            )
          else expect(restarted.appearance).toEqual(saved.appearance)

          if (!override) return
          const withoutOverride = await restore.run({ action: "restore", root: tmp.path, state, mode })
          expect(withoutOverride.initialSelected).toBe(selected)
          expect(withoutOverride.selected).toBe(selected)
          expect(withoutOverride.locked).toBe(true)
          expect(withoutOverride.appearance).toEqual(saved.appearance)
        },
      ),
      { seed: PERSISTENCE_SEED, numRuns: PERSISTENCE_RUNS },
    )
    expect(kinds).toEqual(new Set(["none", "same", "different", "invalid"]))
    expect(lockMethods).toEqual(new Set(["setMode", "lock"]))
  } finally {
    await Promise.all([save.close(), restore.close()])
  }
}, 120_000)

test("R5 falls back from stale persisted theme names", async () => {
  const restore = createRecyclingPersistenceWorker()
  try {
    // Generated invalid names cover stale ASCII and Unicode KV values, while both
    // modes verify that restart resolves the real default appearance and retained lock.
    await fc.assert(
      fc.asyncProperty(invalidThemeName, themeMode, async (invalid, mode) => {
        await using tmp = await tmpdir()
        const state = path.join(tmp.path, "state")
        await mkdir(state, { recursive: true })
        await Bun.write(path.join(state, "kv.json"), JSON.stringify({ theme: invalid, theme_mode_lock: mode }))

        const restarted = await restore.run({ action: "restore", root: tmp.path, state, mode })
        expect(restarted.initialSelected).toBe(invalid)
        expect(restarted.mode).toBe(mode)
        expect(restarted.locked).toBe(true)
        expect(restarted.appearance).toEqual(snapshotResolvedTheme(resolveTheme(DEFAULT_THEMES.opencode, mode)))
      }),
      { seed: PERSISTENCE_SEED, numRuns: STALE_PERSISTENCE_RUNS },
    )
  } finally {
    await restore.close()
  }
}, 120_000)

type PersistenceResult = {
  initialSelected: string
  initialLocked: boolean
  selected: string
  mode: "dark" | "light"
  locked: boolean
  appearance: unknown
}
type PersistenceRequest = {
  action: "save" | "restore"
  root: string
  state: string
  theme?: string
  mode: "dark" | "light"
  lockMethod?: "setMode" | "lock"
}

type ThemeSelectionResult = {
  previewSelected: string
  selected: string
  mode: "dark" | "light"
  appearance: unknown
}
type ThemeSelectionRequest = { initial: string; target: string; mode: "dark" | "light" }

function createThemeSelectionWorker(method: "slash" | "button", root: string) {
  const child = Bun.spawn(
    [process.execPath, path.join(import.meta.dir, "fixture/theme-selection-process.ts"), method],
    {
      cwd: path.join(import.meta.dir, ".."),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(root, "config"),
        XDG_DATA_HOME: path.join(root, "data"),
        XDG_STATE_HOME: path.join(root, "state"),
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader()
  const errors = new Response(child.stderr).text()
  let output = ""

  async function result(): Promise<ThemeSelectionResult> {
    for (;;) {
      const lines = output.split("\n")
      output = lines.pop() ?? ""
      const result = lines.find((line) => line.startsWith("THEME_RESULT:"))
      if (result) return JSON.parse(result.slice("THEME_RESULT:".length)) as ThemeSelectionResult
      const next = await reader.read()
      if (next.done) throw new Error((await errors) || output || "theme selection worker exited")
      output += next.value
    }
  }

  return {
    async run(request: ThemeSelectionRequest) {
      child.stdin.write(JSON.stringify(request) + "\n")
      await child.stdin.flush()
      return result()
    },
    async close() {
      child.stdin.end()
      await child.exited
    },
  }
}

function createPersistenceWorker() {
  const child = Bun.spawn([process.execPath, path.join(import.meta.dir, "fixture/theme-persistence-process.ts")], {
    cwd: path.join(import.meta.dir, ".."),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader()
  const errors = new Response(child.stderr).text()
  let output = ""

  async function result(): Promise<PersistenceResult> {
    for (;;) {
      const lines = output.split("\n")
      output = lines.pop() ?? ""
      const result = lines.find((line) => line.startsWith("THEME_RESULT:"))
      if (result) return JSON.parse(result.slice("THEME_RESULT:".length)) as PersistenceResult
      const next = await reader.read()
      if (next.done) throw new Error((await errors) || output || "theme persistence worker exited")
      output += next.value
    }
  }

  return {
    async run(request: PersistenceRequest) {
      child.stdin.write(JSON.stringify(request) + "\n")
      await child.stdin.flush()
      return result()
    },
    async close() {
      child.stdin.end()
      child.kill()
      await child.exited
    },
  }
}

function createRecyclingPersistenceWorker() {
  let worker = createPersistenceWorker()
  let requests = 0
  return {
    async run(request: PersistenceRequest) {
      if (requests === 5) {
        await worker.close()
        worker = createPersistenceWorker()
        requests = 0
      }
      requests++
      return worker.run(request)
    },
    close() {
      return worker.close()
    },
  }
}

function createMessages(
  sessionID: string,
  directory: string,
  entries: { role: "user" | "assistant"; text: string }[],
): Message[] {
  return entries.map((entry, index) => {
    const id = `msg_${index}`
    if (entry.role === "user")
      return {
        id,
        sessionID,
        role: "user",
        time: { created: index },
        agent: "build",
        model: { providerID: "test", modelID: "model" },
      }
    return {
      id,
      sessionID,
      role: "assistant",
      time: { created: index, completed: index + 1 },
      parentID: index ? `msg_${index - 1}` : "msg_parent",
      modelID: "model",
      providerID: "test",
      mode: "build",
      agent: "build",
      path: { cwd: directory, root: directory },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }
  })
}

function snapshotSession(
  harness: Awaited<ReturnType<typeof mountThemeSession>>,
  sessionID: string,
  messages: Message[],
  historySize: number,
) {
  return snapshotValue({
    route: harness.route.data,
    session: harness.sync.session.get(sessionID),
    messages: harness.sync.data.message[sessionID] ?? [],
    parts: Object.fromEntries(messages.map((message) => [message.id, harness.sync.data.part[message.id] ?? []])),
    history: snapshotPromptHistory(harness.history, historySize),
  })
}

function snapshotPromptHistory(
  history: Awaited<ReturnType<typeof mountThemeSession>>["history"],
  size: number,
) {
  const entries: unknown[] = []
  let input = ""
  for (let index = 0; index < size; index++) {
    const item = history.move(-1, input)
    if (!item) throw new Error(`prompt history ended at ${index} of ${size}`)
    entries.push(snapshotValue(item))
    input = item.input
  }
  for (let index = 0; index < size; index++) input = history.move(1, input)?.input ?? ""
  return entries
}

async function waitForHistory(history: Awaited<ReturnType<typeof mountThemeSession>>["history"], size: number) {
  if (!size) return
  await wait(() => {
    const item = history.move(-1, "")
    if (!item) return false
    history.move(1, item.input)
    return true
  })
}

function serializeHistory(history: PromptInfo[]) {
  if (!history.length) return ""
  return history.map((item) => JSON.stringify(item)).join("\n") + "\n"
}

async function waitForFile(file: string, expected: string) {
  const started = Date.now()
  while (Date.now() - started < 2_000) {
    if ((await Bun.file(file).text().catch(() => undefined)) === expected) return
    await Bun.sleep(10)
  }
  throw new Error(`timed out waiting for ${file}`)
}

function snapshotThemeAppearance(theme: ReturnType<typeof useTheme>, renderer: object) {
  return {
    theme: snapshotResolvedTheme(theme.theme),
    background: snapshotValue(Reflect.get(renderer, "backgroundColor")),
    syntax: snapshotValue(Object.fromEntries(theme.syntax().getAllStyles())),
    subtleSyntax: snapshotValue(Object.fromEntries(theme.subtleSyntax().getAllStyles())),
  }
}

function snapshotResolvedTheme(theme: Theme) {
  return snapshotValue(theme) as Record<string, unknown>
}

function snapshotValue(value: unknown): unknown {
  if (value instanceof RGBA)
    return { rgba: value.toInts(), meta: value.meta, intent: value.intent, slot: value.slot }
  if (Array.isArray(value)) return value.map(snapshotValue)
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotValue(item)]))
  return value
}

async function waitForSavedTheme(file: string, expected: string) {
  const started = Date.now()
  while (Date.now() - started < 2_000) {
    const value = await Bun.file(file)
      .json()
      .catch(() => undefined)
    if (value && typeof value === "object" && Reflect.get(value, "theme") === expected) return
    await Bun.sleep(10)
  }
  throw new Error(`timed out waiting for theme ${expected} to persist`)
}
