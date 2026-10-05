export const FIND_TEXT_SEARCH_LIMIT = 25

export type FindTextMatch = {
  path: { text: string }
  lines: { text: string }
  line_number: number
  absolute_offset: number
}

export type FindTextSearchEntry = {
  id: string
  path: string
  line: number
  text: string
}

export function findTextSearchLimitParam(limit = FIND_TEXT_SEARCH_LIMIT) {
  return String(limit)
}

export function shouldRunFindTextSearch(query: string) {
  return query.trim().length > 0
}

export function mapFindTextSearchResults(matches: FindTextMatch[]): FindTextSearchEntry[] {
  return matches.map((match) => ({
    id: `${match.path.text}:${match.line_number}:${match.absolute_offset}`,
    path: match.path.text,
    line: match.line_number,
    text: match.lines.text.trim(),
  }))
}
