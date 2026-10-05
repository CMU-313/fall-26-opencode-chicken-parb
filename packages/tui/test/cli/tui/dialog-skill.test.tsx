/** @jsxImportSource @opentui/solid */
import { InputRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { describe, expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup, onMount } from "solid-js"
import { tmpdir } from "../../fixture/fixture"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createFetch, directory, eventSource, json } from "../../fixture/tui-sdk"

// Served out of alphabetical order so "original order" cannot pass by accident.
const skills = [
  { name: "release-notes", description: "Draft a changelog for the next release" },
  { name: "pdf-extract", description: "Pull text out of PDF documents" },
  { name: "deploy-worker", description: "Ship a service to production" },
  { name: "pdf-merge", description: "Combine several PDF files into one" },
]
const names = skills.map((skill) => skill.name)

// Skill names in the order they appear on screen.
function visible(frame: string) {
  return names.filter((name) => frame.includes(name)).toSorted((a, b) => frame.indexOf(a) - frame.indexOf(b))
}

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

async function mountSkills(root: string) {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const [
    { DialogProvider, useDialog },
    { DialogSkill },
    { KVProvider },
    { SDKProvider },
    { ThemeProvider },
    { TuiConfigProvider },
    { ToastProvider },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
  ] = await Promise.all([
    import("../../../src/ui/dialog"),
    import("../../../src/component/dialog-skill"),
    import("../../../src/context/kv"),
    import("../../../src/context/sdk"),
    import("../../../src/context/theme"),
    import("../../../src/config"),
    import("../../../src/ui/toast"),
    import("../../../src/keymap"),
  ])

  const selected: string[] = []
  const calls = createFetch((url) => (url.pathname === "/skill" ? json(skills) : undefined))

  // Open the picker the same way the /skills command does.
  function OpenSkills() {
    const dialog = useDialog()
    onMount(() => dialog.replace(() => <DialogSkill onSelect={(skill) => selected.push(skill)} />))
    return <box />
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig()
    const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)

    return (
      <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={resolvedConfig}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <ToastProvider>
                  <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={eventSource()}>
                    <DialogProvider>
                      <OpenSkills />
                    </DialogProvider>
                  </SDKProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 100, height: 30, kittyKeyboard: true })

  async function screen() {
    await app.renderOnce()
    return app.captureCharFrame()
  }

  // Skills load asynchronously and the filter input focuses itself on a timer.
  const start = Date.now()
  while (visible(await screen()).length !== names.length) {
    if (Date.now() - start > 2000) throw new Error(`timed out waiting for skills:\n${app.captureCharFrame()}`)
    await Bun.sleep(10)
  }
  await wait(() => app.renderer.currentFocusedRenderable instanceof InputRenderable)

  return {
    app,
    selected,
    screen,
    // Keys are spaced out like real typing: after each keystroke the picker
    // re-highlights the first match on a timer, which must run before navigation.
    async type(text: string) {
      await app.mockInput.typeText(text, 5)
    },
    async erase(text: string) {
      for (const _ of text) {
        app.mockInput.pressBackspace()
        await Bun.sleep(5)
      }
    },
  }
}

describe("dialog skill picker", () => {
  test("lists every skill in its original order and selects the first one when no query is typed", async () => {
    await using tmp = await tmpdir()
    const picker = await mountSkills(tmp.path)
    try {
      expect(visible(await picker.screen())).toEqual(names)

      picker.app.mockInput.pressEnter()

      expect(picker.selected).toEqual(["release-notes"])
    } finally {
      picker.app.renderer.destroy()
    }
  })

  test("narrows the visible list as a name query is typed", async () => {
    await using tmp = await tmpdir()
    const picker = await mountSkills(tmp.path)
    try {
      await picker.type("pdf")
      expect(visible(await picker.screen()).toSorted()).toEqual(["pdf-extract", "pdf-merge"])

      await picker.type("-m")
      expect(visible(await picker.screen())).toEqual(["pdf-merge"])
    } finally {
      picker.app.renderer.destroy()
    }
  })

  test("switches from name matches to a description-only match when the query changes", async () => {
    await using tmp = await tmpdir()
    const picker = await mountSkills(tmp.path)
    try {
      await picker.type("pdf")
      expect(visible(await picker.screen()).toSorted()).toEqual(["pdf-extract", "pdf-merge"])

      // "production" appears only in deploy-worker's description, never in a skill name.
      await picker.erase("pdf")
      await picker.type("production")
      expect(visible(await picker.screen())).toEqual(["deploy-worker"])
    } finally {
      picker.app.renderer.destroy()
    }
  })

  test("selects the highlighted skill after arrowing through filtered results", async () => {
    await using tmp = await tmpdir()
    const picker = await mountSkills(tmp.path)
    try {
      await picker.type("pdf")
      // Fuzzy results are ranked by match quality, so take the order from the screen.
      const shown = visible(await picker.screen())
      expect(shown.toSorted()).toEqual(["pdf-extract", "pdf-merge"])

      picker.app.mockInput.pressArrow("down")
      picker.app.mockInput.pressEnter()

      expect(picker.selected).toEqual([shown[1]])
      expect(visible(await picker.screen())).toEqual([])
    } finally {
      picker.app.renderer.destroy()
    }
  })

  test("shows no stale skills for an unmatched query and restores the full list when it is cleared", async () => {
    await using tmp = await tmpdir()
    const picker = await mountSkills(tmp.path)
    try {
      await picker.type("zzzz")
      const empty = await picker.screen()
      expect(empty).toContain("No results found")
      expect(visible(empty)).toEqual([])

      await picker.erase("zzzz")
      expect(visible(await picker.screen())).toEqual(names)
    } finally {
      picker.app.renderer.destroy()
    }
  })
})
