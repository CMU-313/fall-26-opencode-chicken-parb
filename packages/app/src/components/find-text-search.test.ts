import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import {
  FIND_TEXT_SEARCH_LANGUAGES,
  FIND_TEXT_SEARCH_LIMIT,
  type FindTextSearchSegment,
  findTextSearchEntries,
  findTextSearchLimitParam,
  findTextSearchSegments,
  findTextSearchVariables,
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
        matches: [],
      },
    ])
  })
})

// Generator: mixes whitespace and non-whitespace text, making sure that we get whiteespace only queries often
const query = fc.string({ unit: fc.constantFrom(" ", "\t", "\n", "a") })

// Generator: one search API match. Only the file extension affects filtering, so the other
// fields stay fixed.
const match = fc
  .constantFrom("a.ts", "a.tsx", "a.js", "a.py", "a.python", "a.txt", "a")
  .map((path) => ({ path: { text: path }, lines: { text: "x" }, line_number: 1, absolute_offset: 0 }))

// Generator: generates variables names, avoids language keywords 
const variable = fc
  .stringMatching(/^[a-z_][a-z0-9_]{0,5}$/)
  .filter((word) => findTextSearchVariables(word).length === 1)

// Generator: Creates an unrelated line ending in a newline to avoid joining onto a word in the text after it. Helps test the metamorphic property.
const unrelatedLine = fc.string({ unit: fc.constantFrom(" ", ";", "(", ")", "=", "#") }).map((line) => line + "\n")


describe("find text search properties", () => {
  // R1: Whitespace-only queries never trigger a search from the dialog.
  // Kind: invariant
  test("R1: a search runs exactly when the query has non-whitespace text", () => {
    fc.assert(fc.property(query, (text) => shouldRunFindTextSearch(text) === (text.trim() !== "")))
  })

  // R2: The "no results found" message is shown if and only if the search API returns
  // zero results for the query.
  // Kind: invariant
  test("R2: the dialog lists no results exactly when the API returns none", () => {
    fc.assert(
      fc.property(fc.array(match), (matches) => {
        expect(findTextSearchEntries(matches).length === 0).toBe(matches.length === 0)
      }),
    )
  })
  // R3: For any set of files and any query with language L enabled, search(q, L) equals the
  // unfiltered search(q) results filtered to files with one of L's extensions.
  // Kind: model / oracle
  test("R3: a language search equals the unfiltered search filtered by that language's extensions", () => {
    fc.assert(
      fc.property(fc.array(match), fc.constantFrom(...FIND_TEXT_SEARCH_LANGUAGES), (matches, selected) => {
        const extensions: readonly string[] = selected.extensions
        const expected = findTextSearchEntries(matches).filter((entry) =>
          extensions.includes(entry.path.includes(".") ? (entry.path.split(".").pop() ?? "") : ""),
        )
        expect(findTextSearchEntries(matches, selected.id)).toEqual(expected)
      }),
    )
  })

  // R4: With highlighting on, prepending an unrelated line that doesn't contain the variable
  // leaves the underlined expression and highlighted variable unchanged.
  // Kind: metamorphic
  test("R4: prepending an unrelated line only shifts highlighted and underlined text", () => {
    fc.assert(
      fc.property(fc.string(), variable, fc.string(), unrelatedLine, (before, x, after, line) => {
        const expression = `return ${x}`
        const text = before + expression + after
        const range = { start: before.length, end: before.length + expression.length }
        const variables = findTextSearchVariables(expression)

        const original = marked(findTextSearchSegments(text, [range], variables))
        const shifted = marked(
          findTextSearchSegments(
            line + text,
            [{ start: range.start + line.length, end: range.end + line.length }],
            variables,
          ),
        )

        expect(original).toContainEqual(expect.objectContaining({ kind: "variable", text: x }))
        expect(shifted).toEqual(original.map((segment) => ({ ...segment, start: segment.start + line.length })))
      }),
    )
  })
})

function marked(segments: FindTextSearchSegment[]) {
  return segments.reduce(
    (state, segment) => ({
      at: state.at + segment.text.length,
      found: segment.kind === "plain" ? state.found : [...state.found, { ...segment, start: state.at }],
    }),
    { at: 0, found: [] as (FindTextSearchSegment & { start: number })[] },
  ).found
}
