import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import {
  FIND_TEXT_SEARCH_LANGUAGES,
  FIND_TEXT_SEARCH_LIMIT,
  type FindTextSearchLanguage,
  type FindTextSearchRange,
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
    expect(shouldRunFindTextSearch("    ")).toBe(false)
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
        id: "src/main.ts:12: ï¿½40",
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

// Generator: a file path whose language is known by construction. Covers upper-case extensions,
// dotted directories, dotfiles like `.ts`, and extensionless names like `ts` that must not match.
const file = fc.oneof(
  fc
    .tuple(
      fc.constantFrom("", "src/", "lib.py/", ".git/"),
      fc.constantFrom("a", "index", "x.test"),
      fc.constantFrom(...FIND_TEXT_SEARCH_LANGUAGES),
    )
    .chain(([dir, stem, language]) =>
      fc
        .constantFrom(...language.extensions)
        .chain((extension) => fc.constantFrom(extension, extension.toUpperCase()))
        .map((extension) => ({
          path: `${dir}${stem}.${extension}`,
          language: language.id as FindTextSearchLanguage | undefined,
        })),
    ),
  fc
    .constantFrom(".ts", ".py", "ts", "py", "src.ts/readme", "a.txt", "ts.txt", "a.python", "a")
    .map((path) => ({ path, language: undefined as FindTextSearchLanguage | undefined })),
)

// Generator: one search API match. Only the path affects filtering, so the other fields stay fixed.
const match = file.map((entry) => apiMatch(entry.path))

// Generator: generates variables names, avoids language keywords
const variable = fc
  .stringMatching(/^[a-z_][a-z0-9_]{0,5}$/)
  .filter((word) => findTextSearchVariables(word).length === 1)

// Generator: Creates an unrelated line ending in a newline to avoid joining onto a word in the text after it. Helps test the metamorphic property.
const unrelatedLine = fc.string({ unit: fc.constantFrom(" ", ";", "(", ")", "=", "#") }).map((line) => line + "\n")

// Generators for segmenting: short text over word, `$`, and separator characters; ranges that may be
// empty, inverted, out of bounds, overlapping, touching, or unsorted; identifier variables including `$`.
const segmentText = fc.string({ unit: fc.constantFrom("a", "b", "$", "_", "1", " ", ".", "+"), maxLength: 12 })
const segmentRanges = fc.array(
  fc.record({ start: fc.integer({ min: -2, max: 14 }), end: fc.integer({ min: -2, max: 14 }) }),
  { maxLength: 5 },
)
const segmentVariables = fc.subarray(["a", "b", "ab", "$a", "a$", "_", "$", "b1"])

// Generator: identifiers that can never be keywords because they contain a digit, `_`, or `$`.
const KEYWORD_SAMPLE = ["return", "const", "if", "function", "True", "None"]
const identifier = fc.oneof(fc.stringMatching(/^[a-z]{1,3}[0-9_$]$/), fc.stringMatching(/^[$_][a-z0-9]{0,3}$/))

// Generator: a result line with surrounding whitespace and a body mixing 1-, 2-, and 4-byte UTF-8
// characters, plus two cut points inside the body for a submatch.
const edge = fc.constantFrom("a", "é", "😀")
const resultLine = fc
  .record({
    lead: fc.string({ unit: fc.constantFrom(" ", "\t") }),
    body: fc
      .tuple(edge, fc.array(fc.constantFrom("a", "é", "😀", " ")), edge)
      .map((parts) => [parts[0], ...parts[1], parts[2]]),
    trail: fc.string({ unit: fc.constantFrom(" ", "\t", "\n") }),
  })
  .chain((line) =>
    fc.record({ line: fc.constant(line), from: fc.nat(line.body.length), to: fc.nat(line.body.length) }),
  )

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

  // R2: Every API result is listed, in order, with its line text and submatch highlights mapped
  // from ripgrep's UTF-8 byte offsets onto the trimmed line.
  // Kind: model / oracle
  test("R2: listed entries keep each submatch on the same characters of the trimmed line", () => {
    fc.assert(
      fc.property(resultLine, (input) => {
        const start = Math.min(input.from, input.to)
        const end = Math.max(input.from, input.to)
        const body = input.line.body.join("")
        const submatch = input.line.body.slice(start, end).join("")
        const bytes = (text: string) => new TextEncoder().encode(text).length
        const entry = mapFindTextSearchResults([
          {
            ...apiMatch("a.ts"),
            lines: { text: input.line.lead + body + input.line.trail },
            submatches: [
              {
                match: { text: submatch },
                start: bytes(input.line.lead + input.line.body.slice(0, start).join("")),
                end: bytes(input.line.lead + input.line.body.slice(0, end).join("")),
              },
            ],
          },
        ])[0]
        expect(entry.text).toBe(body)
        expect(entry.matches.map((range) => entry.text.slice(range.start, range.end))).toEqual(
          start === end ? [] : [submatch],
        )
      }),
    )
  })

  // R3: For any set of files and any query with language L enabled, search(q, L) equals the
  // unfiltered search(q) results filtered to files with one of L's extensions.
  // Kind: model / oracle
  test("R3: a language search equals the unfiltered search filtered by that language's extensions", () => {
    fc.assert(
      fc.property(fc.array(file), fc.constantFrom(...FIND_TEXT_SEARCH_LANGUAGES), (files, selected) => {
        const matches = files.map((entry) => apiMatch(entry.path))
        expect(findTextSearchEntries(matches, selected.id)).toEqual(
          findTextSearchEntries(matches).filter((_, index) => files[index].language === selected.id),
        )
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

  // R4: Each maximal run of matched characters is underlined as one span, whole-word occurrences
  // of a searched variable inside it are highlighted, and all other text is plain. Joining the
  // spans reproduces the line.
  // Kind: model / oracle
  test("R4: segments underline exactly the matched characters and highlight whole-word variables", () => {
    fc.assert(
      fc.property(segmentText, segmentRanges, segmentVariables, (text, ranges, variables) => {
        expect(findTextSearchSegments(text, ranges, variables)).toEqual(expectedSegments(text, ranges, variables))
      }),
    )
  })

  // O-3: A search result's line exactly removes internal whitespace when padded
  // Kind: model / oracle
  test("O-3: a search result's line exactly removes internal whitespace when padded", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ unit: fc.constantFrom(" ", "\t", "\n", "a", "b", "c"), minLength: 3, maxLength: 10 }),
        (before, line) => {
          const expression = before + "a" + before
          const variables = findTextSearchVariables(before + "a" + before)
          const result = marked(findTextSearchSegments(line + expression, [{ start: before.length, end: before.length + 1 }], variables))
          const expected = marked(findTextSearchSegments(before + "a"_origin['sk'] + before, [{ start: 0, end: before.length + 1 }], variables))
          expect(result).toEqual(expected.map((segment) => ({ ...segment, start: segment.start + line.length })))
        },
      ),
    )
  })

  // R4: The highlighted variables are exactly the distinct non-keyword identifiers of the query.
  // Kind: model / oracle
  test("R4: the query's highlighted variables are its distinct non-keyword identifiers", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(identifier, fc.constantFrom(...KEYWORD_SAMPLE)),
        fc.constantFrom(" ", "(", ".", "+", ", "),
        (words, separator) => {
          expect(findTextSearchVariables(words.join(separator))).toEqual([
            ...new Set(words.filter((word) => !KEYWORD_SAMPLE.includes(word)),
          ])
        },
      ),
    )
  })

  // R4: A regex escape such as `\b` in the query separates words like whitespace does and is never
  // highlighted itself.
  // Kind: metamorphic
  test("R4: replacing a space in the query with a regex escape leaves the variables unchanged", () => {
    const part = fc.string({ unit: fc.constantFrom("a", "b", "1", "$", " ", "(") })
    fc.assert(
      fc.property(part, fc.constantFrom("b", "d", "w", "s", ".", "("), part, (before, escaped, after) => {
        expect(findTextSearchVariables(`${before}\\${escaped}${after}`)).toEqual(
          findTextSearchVariables(`${before} ${after}`),
        )
      }),
    )
  })
})

function apiMatch(path: string) {
  return { path: { text: path }, lines: { text: "x" }, line_number: 1, absolute_offset: 0 }
}

function marked(segments: FindTextSearchSegment[]) {
  return segments.reduce(
    (state, segment) => ({
      at: state.at + segment.text.length,
      found: segment.kind === "plain" ? state.found : [...state.found, { ...segment, start: state.at }],
    }),
    { at: 0, found: [] as (FindTextSearchSegment & { start: number })[] },
  ).found
}

// Per-character model: a character is matched when any input range covers it; matched runs are split
// into `[\\w$]+` tokens, and tokens equal to a variable are highlighted.
function expectedSegments(text: string, ranges: FindTextSearchRange[], variables: string[]) {
  return text
    .split("")
    .reduce<{ text: string; covered: boolean }[]>((runs, char, index) => {
      const covered = ranges.some((range) => range.start <= index && index < range.end)
      const last = runs.at(-1)
      if (last?.covered === covered) {
        last.text += char
        return runs
      }
      return [...runs, { text: char, covered }]
    }, [])
    .flatMap((run): FindTextSearchSegment[] =>
      run.covered ? highlighted(run.text, variables) : [{ text: run.text, kind: "plain" }],
    )
}

function highlighted(text: string, variables: string[]) {
  return text
    .split(/([\\w$]+)/)
    .filter((piece) => piece.length > 0)
    .reduce<FindTextSearchSegment[]>((segments, piece) => {
      const kind = variables.includes(piece) ? "variable" : "match"
      const last = segments.at(-1)
      if (kind === "match" && last?.kind === "match") {
        last.text += piece
        return segments
      }
      return [...segments, { text: piece, kind }]
    }, [])
}
