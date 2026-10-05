import { describe, expect, test } from "bun:test"
import {
  FIND_TEXT_SEARCH_LIMIT,
  findTextSearchLimitParam,
  mapFindTextSearchResults,
  shouldRunFindTextSearch,
} from "./find-text-search"

describe("find text search helpers", () => {
  test("skips empty queries", () => {
    expect(shouldRunFindTextSearch("")).toBe(false)
    expect(shouldRunFindTextSearch("   ")).toBe(false)
    expect(shouldRunFindTextSearch("needle")).toBe(true)
  })

  test("uses the default search limit on the wire", () => {
    expect(findTextSearchLimitParam()).toBe(String(FIND_TEXT_SEARCH_LIMIT))
    expect(findTextSearchLimitParam(10)).toBe("10")
  })

  test("maps legacy find matches into list entries", () => {
    expect(
      mapFindTextSearchResults([
        {
          path: { text: "src/main.ts" },
          lines: { text: "  const needle = true\n" },
          line_number: 12,
          absolute_offset: 40,
        },
      ]),
    ).toEqual([
      {
        id: "src/main.ts:12:40",
        path: "src/main.ts",
        line: 12,
        text: "const needle = true",
      },
    ])
  })
})
