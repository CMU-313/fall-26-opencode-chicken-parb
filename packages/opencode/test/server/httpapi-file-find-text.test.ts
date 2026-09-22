import { afterEach, describe, expect, test } from "bun:test"
import { Context } from "effect"
import path from "path"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { FilePaths } from "../../src/server/routes/instance/httpapi/groups/file"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>

function request(route: string, directory: string, query?: Record<string, string>) {
  const url = new URL(`http://localhost${route}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value)
  }
  return HttpApiApp.webHandler().handler(
    new Request(url, {
      headers: {
        "x-opencode-directory": directory,
      },
    }),
    context,
  )
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("file HttpApi findText", () => {
  test("returns line matches with legacy shape", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "src", "main.ts"), "export const needle = 1\n")

    const response = await request(FilePaths.findText, tmp.path, { pattern: "needle" })
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toContainEqual(
      expect.objectContaining({
        path: { text: expect.stringContaining("main.ts") },
        lines: { text: expect.stringContaining("needle") },
        line_number: 1,
      }),
    )
  })

  test("respects the limit query parameter", async () => {
    await using tmp = await tmpdir({ git: true })
    await Promise.all([
      Bun.write(path.join(tmp.path, "a.txt"), "needle"),
      Bun.write(path.join(tmp.path, "b.txt"), "needle"),
    ])

    const response = await request(FilePaths.findText, tmp.path, { pattern: "needle", limit: "1" })
    expect(response.status).toBe(200)
    expect(await response.json()).toHaveLength(1)
  })

  test("returns an empty array when nothing matches", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(path.join(tmp.path, "empty.txt"), "hello")

    const response = await request(FilePaths.findText, tmp.path, { pattern: "missing-token" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
  })
})
