/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { JSX } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { TuiPluginApi, TuiPluginMeta } from "@opencode-ai/plugin/tui"
import { createBuiltinPlugins } from "../../src/feature-plugins/builtins"
import ThemeButton from "../../src/feature-plugins/system/theme-button"

test("registers the theme button as a built-in plugin", () => {
  expect(createBuiltinPlugins({ experimentalEventSystem: false }).some((plugin) => plugin.id === ThemeButton.id)).toBe(true)
})

test("renders Theme and opens the theme picker on click", async () => {
  let renderButton: (() => JSX.Element) | undefined
  let replaceDialog: (() => JSX.Element) | undefined
  const api = {
    slots: {
      register(plugin: { slots: { app_bottom: () => JSX.Element } }) {
        renderButton = plugin.slots.app_bottom
        return "theme-button"
      },
    },
    theme: { current: { accent: RGBA.fromInts(255, 128, 0) } },
    ui: {
      dialog: {
        replace(component: () => JSX.Element) {
          replaceDialog = component
        },
      },
    },
  } as unknown as TuiPluginApi

  await ThemeButton.tui(api, undefined, {} as TuiPluginMeta)
  expect(renderButton).toBeDefined()

  const app = await testRender(() => renderButton!(), { width: 30, height: 3 })
  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("Theme")

    await app.mockMouse.click(1, 0)

    expect(replaceDialog).toBeTypeOf("function")
  } finally {
    app.renderer.destroy()
  }
})
