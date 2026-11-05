# Traceability: <Rohan  Bhagra> (<rbhagra>)

**Target feature:** <OpenCode Global Search, https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/app/src/components/dialog-search-content.tsx>

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | O-3 | Whitespace-only queries never trigger a search | for any string s, search(s) === (s.trim() !== ""). | Yes  | Invariant  | Search runs only when query has non-whitespace input
 R2 | S-1 | When a global search query returns no results, there should be a popup to say so | "Cars" run on the search API returns no results, UI displays "no results found," closest_search runner runs searches to find nearby hits, UI displays a search "car" button | Yes | Invariant | UI Dialog shows none iff API returns None  
| R3 | O-2, S-2 | Users should be able to search by programming language, only results that exist in that language should be returned | In a project where we have a.ts, b.python, c.txt with each having text "rotate", searching for "rotate" with python enabled only returns b.python | No | Oracle |  a language search equals the unfiltered search filtered by that language's extensions through standard means 
| R4 | C-7 | When searching for a variable name in a broader expression (users can toggle this), the variable name is highlighted | When "return x" is searched, in results, the whole return x statement is underlined, and x is highlighted. | No  | Metamorphic  | A empty/extraneous string is added before each input, and the variable is still highlighted, simply shifted. 
| R5 | C-4, S-4, O-4 | If results of a search are changed via git fetch, a UI element should should let users rerun search | "Import {poll}" is populated via git fetch. The UI should throw a "new results present" button, that allows users to rerun search | No  | Not included in the 4 properties.



Properties written or suggested by opencode or another AI tool: <Property for R1, Property for R4.>

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
|R1 | When a query has multiple results, if there is one in the current package, it should be displayed first. |Whitespace-only queries never trigger a search|This is hard to test and there is not a reliable way to test what directory a user is in and accordingly verify what is returned first. |
|R2 | When a global search query returns no results, there should be a popup to say so, and a button that suggests a nearby search | When a global search query returns no results, there should be a popup to say so | This adds additional testing complexity and is non-determinisitc. 