import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createComponent, onMount } from "solid-js"
import { TuiConfigProvider } from "../../src/config"
import { KVProvider } from "../../src/context/kv"
import { ThemeProvider, useTheme, type Theme } from "../../src/context/theme"
import { TestTuiContexts } from "./tui-environment"
import { createTuiResolvedConfig } from "./tui-runtime"
import path from "node:path"

type Request = {
  action: "save" | "restore"
  root: string
  state: string
  theme?: string
  mode: "dark" | "light"
  lockMethod?: "setMode" | "lock"
}

const reader = Bun.stdin.stream().pipeThrough(new TextDecoderStream()).getReader()
let input = ""
for (;;) {
  const next = await reader.read()
  if (next.done) break
  input += next.value
  const lines = input.split("\n")
  input = lines.pop() ?? ""
  for (const line of lines) {
    if (!line) continue
    console.log(`THEME_RESULT:${JSON.stringify(await run(JSON.parse(line) as Request))}`)
  }
}

async function run(request: Request) {
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
      directory: request.root,
      paths: { home: request.root, state: request.state, worktree: request.root },
      get children() {
        return createComponent(TuiConfigProvider, {
          config: createTuiResolvedConfig(request.action === "restore" && request.theme ? { theme: request.theme } : {}),
          get children() {
            return createComponent(KVProvider, {
              get children() {
                return createComponent(ThemeProvider, {
                  mode: request.action === "save" && request.lockMethod === "lock" ? request.mode : "dark",
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

  try {
    await ready
    const initialSelected = theme.selected
    const initialLocked = theme.locked()
    if (request.action === "save") {
      if (!request.theme) throw new Error("save requires a theme")
      if (request.lockMethod === "lock") theme.lock()
      else theme.setMode(request.mode)
      if (!theme.set(request.theme)) throw new Error(`invalid theme ${request.theme}`)
      await waitForPersistence(path.join(request.state, "kv.json"), request.theme, request.mode)
    }
    return {
      initialSelected,
      initialLocked,
      selected: theme.selected,
      mode: theme.mode(),
      locked: theme.locked(),
      appearance: snapshotValue(theme.theme),
    }
  } finally {
    app.renderer.destroy()
  }
}

function snapshotValue(value: unknown): unknown {
  if (value instanceof RGBA)
    return { rgba: value.toInts(), meta: value.meta, intent: value.intent, slot: value.slot }
  if (Array.isArray(value)) return value.map(snapshotValue)
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotValue(item)]))
  return value
}

async function waitForPersistence(file: string, selected: string, locked: "dark" | "light") {
  const started = Date.now()
  while (Date.now() - started < 2_000) {
    const value = await Bun.file(file)
      .json()
      .catch(() => undefined)
    if (
      value &&
      typeof value === "object" &&
      Reflect.get(value, "theme") === selected &&
      Reflect.get(value, "theme_mode_lock") === locked
    )
      return
    await Bun.sleep(10)
  }
  throw new Error(`timed out waiting for theme ${selected} and mode ${locked} to persist`)
}
