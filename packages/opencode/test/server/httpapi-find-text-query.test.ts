import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { FindTextQuery } from "../../src/server/routes/instance/httpapi/groups/file"

describe("FindTextQuery", () => {
  test("decodes optional limit from query strings", () => {
    const decode = Schema.decodeUnknownSync(FindTextQuery)

    expect(decode({ pattern: "needle" }).limit).toBeUndefined()
    expect(decode({ pattern: "needle", limit: "25" }).limit).toBe(25)
  })

  test("rejects invalid limit values", () => {
    const decode = Schema.decodeUnknownSync(FindTextQuery)

    expect(() => decode({ pattern: "needle", limit: "0" })).toThrow()
    expect(() => decode({ pattern: "needle", limit: "201" })).toThrow()
  })
})
