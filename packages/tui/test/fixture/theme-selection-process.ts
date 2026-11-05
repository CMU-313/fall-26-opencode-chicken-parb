import { mock } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import type { Renderable } from "@opentui/core"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import type { TuiPluginApi, TuiPluginMeta, TuiSlotPlugin } from "@opencode-ai/plugin/tui"
import type { HostSlots } from "../../src/plugin/slots"
import { createEventSource, createFetch } from "./tui-sdk"
import { createTuiResolvedConfig } from "./tui-runtime"

type Request = { initial: string; target: string; mode: "dark" | "light" }

const method = process.argv[2] as "slash" | "button"
const setup = await createTestRenderer({ width: 100, height: 32, useThread: false })
const core = await import("@opentui/core")
mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))

const [{ run }, { default: ThemeButton }] = await Promise.all([
  import("../../src/app"),
  import("../../src/feature-plugins/system/theme-button"),
])
const events = createEventSource()
const calls = createFetch(undefined, events)
let api!: TuiPluginApi
let slots: HostSlots | undefined
let started!: () => void
const ready = new Promise<void>((resolve) => {
  started = resolve
})

const task = Effect.runPromise(
  run({
    url: "http://test",
    directory: process.cwd(),
    config: createTuiResolvedConfig({ plugin_enabled: {} }),
    fetch: calls.fetch,
    events: events.source,
    args: {},
    pluginHost: {
      async start(input) {
        api = input.api
        slots = input.runtime.setupSlots(api)
        if (method === "button") {
          await ThemeButton.tui(
            {
              ...api,
              slots: {
                register(plugin: TuiSlotPlugin) {
                  slots!.register({ ...plugin, id: "test:theme-button" })
                  return "test:theme-button"
                },
              },
            },
            undefined,
            {} as TuiPluginMeta,
          )
        }
        started()
      },
      async dispose() {
        slots?.dispose()
      },
    },
  }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
)

await ready
await wait(() => api.state.ready)
await setup.renderOnce()
api.ui.dialog.clear()

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
    console.log(`THEME_RESULT:${JSON.stringify(await select(JSON.parse(line) as Request))}`)
  }
}

api.keymap.dispatchCommand("app.exit")
await task
mock.restore()

async function select(request: Request) {
  api.ui.dialog.clear()
  if (api.theme.mode() !== request.mode) api.keymap.dispatchCommand("theme.switch_mode")
  await wait(() => api.theme.mode() === request.mode)
  api.ui.dialog.clear()
  if (!api.theme.set(request.initial)) throw new Error(`invalid initial theme ${request.initial}`)
  await wait(() => api.theme.selected === request.initial)

  if (method === "slash") await openWithSlash()
  else await openWithButton()

  await wait(() => api.ui.dialog.open && setup.renderer.currentFocusedRenderable instanceof core.InputRenderable)
  await setup.mockInput.typeText(request.target, 1)
  await wait(() => api.theme.selected === request.target)
  const previewSelected = api.theme.selected
  setup.mockInput.pressEnter()
  await wait(() => !api.ui.dialog.open && api.theme.selected === request.target)

  return {
    previewSelected,
    selected: api.theme.selected,
    mode: api.theme.mode(),
    appearance: snapshotValue(api.theme.current),
  }
}

async function openWithSlash() {
  const prompt = find(setup.renderer.root, (item) => item instanceof core.TextareaRenderable)
  if (!prompt) throw new Error("home prompt was not rendered")
  prompt.focus()
  api.keymap.dispatchCommand("prompt.clear")
  await wait(() => setup.renderer.currentFocusedRenderable instanceof core.TextareaRenderable)
  await setup.mockInput.typeText("/themes", 1)
  await wait(() => setup.captureCharFrame().includes("Switch theme"))
  setup.mockInput.pressEnter()
}

async function openWithButton() {
  await wait(async () => {
    await setup.renderOnce()
    return setup.captureCharFrame().includes("Theme")
  })
  const lines = setup.captureCharFrame().split("\n")
  const y = lines.findLastIndex((line) => line.includes("Theme"))
  const x = lines[y]!.indexOf("Theme")
  await setup.mockMouse.click(x, y)
}

function find(item: Renderable, match: (item: Renderable) => boolean): Renderable | undefined {
  if (match(item)) return item
  return item.getChildren().map((child) => find(child, match)).find((child) => child !== undefined)
}

function snapshotValue(value: unknown): unknown {
  if (value instanceof core.RGBA)
    return { rgba: value.toInts(), meta: value.meta, intent: value.intent, slot: value.slot }
  if (Array.isArray(value)) return value.map(snapshotValue)
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotValue(item)]))
  return value
}

async function wait(check: () => boolean | Promise<boolean>, timeout = 5_000) {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > timeout) throw new Error("timed out waiting for theme selection state")
    await Bun.sleep(10)
  }
}
