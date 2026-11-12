export const FIND_TEXT_SEARCH_LIMIT = 25

export const FIND_TEXT_SEARCH_LANGUAGES = [
  { id: "typescript", label: "TypeScript", extensions: ["ts", "tsx", "mts", "cts"] },
  { id: "javascript", label: "JavaScript", extensions: ["js", "jsx", "mjs", "cjs"] },
  { id: "python", label: "Python", extensions: ["py"] },
] as const

export type FindTextSearchLanguage = (typeof FIND_TEXT_SEARCH_LANGUAGES)[number]["id"]

export type FindTextMatch = {
  path: { text: string }
  lines: { text: string }
  line_number: number
  absolute_offset: number
  submatches?: { match: { text: string }; start: number; end: number }[]
}

export type FindTextSearchRange = { start: number; end: number }

export type FindTextSearchEntry = {
  id: string
  path: string
  line: number
  text: string
  matches: FindTextSearchRange[]
}

export type FindTextSearchSegment = { text: string; kind: "plain" | "match" | "variable" }

const KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "def",
  "default",
  "do",
  "elif",
  "else",
  "export",
  "extends",
  "false",
  "fn",
  "for",
  "from",
  "func",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "new",
  "None",
  "null",
  "of",
  "pub",
  "return",
  "self",
  "static",
  "switch",
  "this",
  "throw",
  "true",
  "True",
  "False",
  "try",
  "type",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
])

export function findTextSearchLimitParam(limit = FIND_TEXT_SEARCH_LIMIT) {
  return String(limit)
}

export function shouldRunFindTextSearch(query: string) {
  return query.trim().length > 0
}

export function mapFindTextSearchResults(matches: FindTextMatch[]): FindTextSearchEntry[] {
  return matches.map((match) => {
    const text = match.lines.text.trim()
    const leading = match.lines.text.length - match.lines.text.trimStart().length
    return {
      id: `${match.path.text}:${match.line_number}:${match.absolute_offset}`,
      path: match.path.text,
      line: match.line_number,
      text,
      matches: (match.submatches ?? [])
        .map((submatch) => ({
          start: clamp(charOffset(match.lines.text, submatch.start) - leading, text.length),
          end: clamp(charOffset(match.lines.text, submatch.end) - leading, text.length),
        }))
        .filter((range) => range.end > range.start),
    }
  })
}

/** The entries the search dialog lists for an API response; an empty result shows the "no results" message. */
export function findTextSearchEntries(matches: FindTextMatch[], language?: FindTextSearchLanguage) {
  return filterFindTextSearchResults(mapFindTextSearchResults(matches), language)
}

export function findTextSearchLanguage(path: string) {
  const name = path.split("/").pop() ?? ""
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return
  const extension = name.slice(dot + 1).toLowerCase()
  return FIND_TEXT_SEARCH_LANGUAGES.find((language) =>
    (language.extensions as readonly string[]).includes(extension),
  )?.id
}

export function filterFindTextSearchResults(entries: FindTextSearchEntry[], language?: FindTextSearchLanguage) {
  if (!language) return entries
  return entries.filter((entry) => findTextSearchLanguage(entry.path) === language)
}

/** Identifiers in the query that are not language keywords. Regex escapes like `\b` are ignored. */
export function findTextSearchVariables(query: string) {
  return [...new Set(query.replace(/\\./g, " ").match(/[A-Za-z_$][\w$]*/g) ?? [])].filter(
    (word) => !KEYWORDS.has(word),
  )
}

/**
 * Splits `text` so every match range is marked, and whole-word occurrences of
 * `variables` inside a match range are marked separately. Joining the segment
 * texts always reproduces `text`.
 */
export function findTextSearchSegments(
  text: string,
  matches: FindTextSearchRange[],
  variables: string[],
): FindTextSearchSegment[] {
  const pattern = variables.length
    ? new RegExp(`(?<![\\w$])(?:${variables.map(escapeRegExp).join("|")})(?![\\w$])`, "g")
    : undefined
  const ranges = mergeRanges(matches, text.length)
  const segments = ranges.flatMap((range, index) => {
    const before = { text: text.slice(ranges[index - 1]?.end ?? 0, range.start), kind: "plain" as const }
    return [before, ...matchSegments(text.slice(range.start, range.end), pattern)]
  })
  segments.push({ text: text.slice(ranges.at(-1)?.end ?? 0), kind: "plain" })
  return segments.filter((segment) => segment.text.length > 0)
}

function matchSegments(text: string, pattern: RegExp | undefined): FindTextSearchSegment[] {
  if (!pattern) return [{ text, kind: "match" }]
  const found = [...text.matchAll(pattern)]
  const segments = found.flatMap((hit, index) => {
    const previous = found[index - 1]
    const start = previous ? previous.index + previous[0].length : 0
    return [
      { text: text.slice(start, hit.index), kind: "match" as const },
      { text: hit[0], kind: "variable" as const },
    ]
  })
  const last = found.at(-1)
  segments.push({ text: text.slice(last ? last.index + last[0].length : 0), kind: "match" })
  return segments
}

function mergeRanges(ranges: FindTextSearchRange[], length: number) {
  return ranges
    .map((range) => ({ start: clamp(range.start, length), end: clamp(range.end, length) }))
    .filter((range) => range.end > range.start)
    .toSorted((a, b) => a.start - b.start)
    .reduce<FindTextSearchRange[]>((merged, range) => {
      const last = merged.at(-1)
      if (last && range.start <= last.end) {
        last.end = Math.max(last.end, range.end)
        return merged
      }
      merged.push({ ...range })
      return merged
    }, [])
}

// ripgrep reports submatch offsets in UTF-8 bytes; JS strings index UTF-16 code units.
function charOffset(line: string, byte: number) {
  return new TextDecoder().decode(new TextEncoder().encode(line).slice(0, byte)).length
}

function clamp(value: number, max: number) {
  return Math.min(Math.max(value, 0), max)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
