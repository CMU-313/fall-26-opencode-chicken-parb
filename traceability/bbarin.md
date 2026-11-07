# Traceability: Batu Barin (bbarin)

**Target feature:** Skill Picker live fuzzy search/filtering in the OpenCode TUI. Main source: [`packages/tui/src/component/dialog-skill.tsx`](../packages/tui/src/component/dialog-skill.tsx) (`DialogSkill` and the pure `filterSkills` it calls on every keystroke), rendered by [`packages/tui/src/ui/dialog-select.tsx`](../packages/tui/src/ui/dialog-select.tsx) in `skipFilter` mode. Tests: [`packages/tui/test/component/dialog-skill.property.test.ts`](../packages/tui/test/component/dialog-skill.property.test.ts) (P4 properties, strengthened in P5), [`packages/tui/test/component/dialog-skill.opencode.property.test.ts`](../packages/tui/test/component/dialog-skill.opencode.property.test.ts) (P5 agent failure case: opencode's R7 property, strengthened), [`packages/tui/test/component/dialog-skill.test.ts`](../packages/tui/test/component/dialog-skill.test.ts) (unit examples), [`packages/tui/test/cli/tui/dialog-skill.test.tsx`](../packages/tui/test/cli/tui/dialog-skill.test.tsx) (rendered picker). Original implementation: PR #22. Mutation testing (P5): [`packages/tui/stryker.bbarin.config.json`](../packages/tui/stryker.bbarin.config.json), mutants and reports in [`mutants/bbarin/`](../mutants/bbarin/).

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-2, O-2 | The Skill Picker filters the visible skill list live as the user edits the query, without requiring Enter or another submit action. | Given loaded skills `pdf-extract`, `deploy-service`, and `release-notes`, typing `pdf` updates the visible list before Enter is pressed and removes non-matching skills. | No | None (keystroke/render behavior; covered by the rendered-picker tests) | `dialog-skill.test.tsx`: "narrows the visible list as a name query is typed" | None: R1 has no property, so no mutant is attributed to it (Stryker only mutated `filterSkills`, which R1's rendered tests do not isolate). |
| R2 | C-1, C-3, O-1, O-3 | A skill is discoverable when the query matches either its name/title or its description. | Given `pdf-extract` and `document-helper` whose description contains `PDF`, query `pdf` includes both skills even though only one matches by name. | No | "R2: every skill whose name or description contains the query is returned" (invariant)<br>"R2: a skill matching only through its description is found next to name matches" (invariant) | `dialog-skill.property.test.ts`; examples in `dialog-skill.test.ts`: "returns every skill that matches by name or description" | **H1, H6.** Stryker (final run, 12 of 42): #0, #4, #6, #7, #14, #29, #30, #31, #32, #33, #34, #41, e.g. #32 `"description"` → `""` (descriptions never searched) and #4 `/\s+/g` → `/\S+/g`. All 12 are also killed by another requirement's property. |
| R3 | C-5, C-6, O-5, S-3 | **Revised:** Search uses one case-insensitive policy and ignores leading, trailing and repeated spaces, so letter case and spacing never change the results or their order. The query is split into space-separated terms; a skill is returned exactly when every term's characters appear in order (contiguously, or with characters omitted between them) in the skill's name/title or in its description. A skill for which some term's characters do not appear in order in either field is unrelated and is never returned. | Queries `PDF`, `pdf`, and `pdf` typed with surrounding spaces return the same skills in the same order. Given a skill named `deploy-service`, query `depy` returns it (letters omitted), while query `zzzzq` returns no skill whose name or description lacks those letters in order. | Yes | "R3: the returned skills are exactly those whose name or description contains every term in order" (model/oracle)<br>"R3: changing letter case or adding spaces leaves the results and their order unchanged" (metamorphic)<br>"R3: omitting characters from a query never drops a skill that matched before" (metamorphic) | `dialog-skill.property.test.ts`; acceptance example in `dialog-skill.test.ts`: "ignores case and surrounding spaces, tolerates omitted letters, and rejects unrelated queries" | **H1, H2, H6.** Of R3's properties, only the case/spacing one kills H2. Stryker (final, 15 of 42): #0, #3, #4, #5, #6, #7, #12, #14, #29–#34, #41. Sole killer of #3 (`/\s+/g` → `/\s/g`, repeated spaces no longer collapsed), which survived the P4 version of the property. |
| R4 | C-4, O-4, O-9, S-2, S-5 | An empty or whitespace-only query restores the complete skill list in the original no-query ordering and preserves previous picker behavior. | Starting from the full list, query `pdf` narrows results. Clearing the query or entering only spaces restores every loaded skill in the same original order. | No | "R4: editing the query and then clearing it restores the original list and order" (round-trip) | `dialog-skill.property.test.ts`; also `dialog-skill.test.tsx`: "shows no stale skills for an unmatched query and restores the full list when it is cleared" | **H3, H6.** H3 only by R4. Stryker (final, 7 of 42): #0, #2, #6, #8, #12, #14, #33. Sole killer of #2 (`query.trim()` → `query`) and #8 (`if (!needle)` → `if (false)`): only R4 sends a blank query. |
| R5 | C-8, O-7 | A query with no matches displays a safe no-results state, and editing the same open query into a matching value restores results immediately. | Query `zzzzq` displays `No results found` with no hidden result selectable; changing the same open query to `pdf` displays matching skills again. | No | None (rendered empty state; covered by the rendered-picker tests) | `dialog-skill.test.tsx`: "shows no stale skills for an unmatched query and restores the full list when it is cleared", "switches from name matches to a description-only match when the query changes" | None: no property (rendered empty state). |
| R6 | C-2, C-9, C-11, O-2, O-8, O-10, S-1, S-6 | After filtering, navigation and Enter operate only on currently visible results; if the previously highlighted result is filtered out, the top visible result becomes highlighted. | After filtering to two visible skills, Up/Down moves only between those two and Enter selects the highlighted visible skill. If that item disappears under a new query, the first remaining result becomes highlighted. | No | None (keyboard/highlight state; covered by the rendered-picker tests) | `dialog-skill.test.tsx`: "selects the highlighted skill after arrowing through filtered results" | None: no property (keyboard/highlight state). |
| R7 | C-7, O-6, O-10, S-8 | **Revised:** When multiple skills match, results are ordered by match strength first and field second: (1) every query term appears contiguously (keyword-level) in the name/title; (2) otherwise, every term appears contiguously in the name/title or the description; (3) otherwise, every term's characters appear in order (character-level fuzzy) in the name/title; (4) all other matches, i.e. character-level matches that rely on the description. | For query `deploy`: `deploy-service` (keyword in the name) appears before `notes`, whose description says "How to deploy safely" (keyword in the description); both appear before `doc-employer` (the letters of `deploy` in order in its name only), which appears before `handbook`, whose description "Draft employee guide" has those letters in order only. | Yes | "R7: keyword matches outrank character-level matches, and name matches outrank description matches" (invariant)<br>P5: "R7: on realistic skills and queries, no result ranks above a result with a stronger match" (model/oracle)<br>P5 agent failure case: "orders keyword matches before character matches, and name before description" (invariant; written by opencode, strengthened) | `dialog-skill.property.test.ts`; `dialog-skill.opencode.property.test.ts`; examples in `dialog-skill.test.ts`: "ranks name keywords, then description keywords, then name letters, then description letters" and regression "ranks a name keyword above a description keyword even when the name is long" | **H1, H2, H4, H5, H6.** H4 and H5 only by R7; H5 only after P5 round 1, H2 by R7 only after round 2. Stryker (final, 38 of 42): every killed mutant except #2, #3, #8. Only killer of 24: #1, #9–#11, #13, #15–#28, #35–#39. These include #22 (`terms.every` → `terms.some`, the same change as H5) and #15 (a missing description ranked as if it held text), both of which survived the P4 version. |
| R8 | C-10, O-9, S-4 | A skill with a missing or empty description must not cause filtering to fail and must remain searchable by name/title. | Given `{ title: 'pdf-extract' }` with no description, query `pdf` returns the skill and filtering completes without an exception. | No | "R8: skills without a description never break filtering and stay findable by name" (invariant) | `dialog-skill.property.test.ts`; example in `dialog-skill.test.ts`: "tolerates skills without a description" | **H6.** Stryker (final, 10 of 42): #0, #4, #12, #14, #29, #30, #31, #33, #34, #41, e.g. #14 `option.description?.toLowerCase` → `option.description.toLowerCase` (the same crash as H6). #15 (a missing description ranked as if it held text) breaks R7 rather than R8's "never fails, stays findable" and is killed by R7's model/oracle property. |

Properties written or suggested by opencode or another AI tool: R2, R3, R4, R7, R8 (all properties and generators in `dialog-skill.property.test.ts` were designed and written with Claude Code, an AI coding assistant; I reviewed them and am responsible for their correctness).

P5: the hand-written mutants, the Stryker configuration and the P5 strengthening of the R3 and R7 properties (including the new R7 model/oracle property) were also designed and written with Claude Code; I reviewed them. One property was written by opencode: the R7 property in [`dialog-skill.opencode.property.test.ts`](../packages/tui/test/component/dialog-skill.opencode.property.test.ts). Its original version is in the opencode transcript, and the file now holds my strengthened version (see Agent failure case).

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R3 | Search follows one consistent case-sensitivity policy and supports fuzzy matching for small character omissions while rejecting unrelated queries. The current chosen policy is case-insensitive. | Search uses one case-insensitive policy and ignores leading, trailing and repeated spaces, so letter case and spacing never change the results or their order. The query is split into space-separated terms; a skill is returned exactly when every term's characters appear in order (contiguously, or with characters omitted between them) in the skill's name/title or in its description. A skill for which some term's characters do not appear in order in either field is unrelated and is never returned. | **Checkability.** "Small character omissions" and "unrelated" had no objective threshold, so no test could decide pass/fail. A fixed limit on omitted characters would also **conflict** with the prefix search R1/R2 rely on: `pdf` must find `pdf-extract` (8 characters unmatched), and the P3 acceptance example `depy` → `deploy-service` already leaves 10 unmatched. The revision keeps the interview intent as a mechanical rule: shortened forms match (C-5, C-6 "missing letter", "shortened form"); every typed character must be present in order, which is the relevance threshold O-5 asks for and why random strings like `zzzzq` cannot match (C-6); one case-insensitive policy (S-3, C-6 "`PDF` and `pdf` should behave the same"); and spacing never matters (C-5 "extra spaces", O-5 "surrounding spaces"), stated for order as well as inclusion because a user sees both. This is not the implementation's behavior written down: the revised wording exposed two bugs, fixed below (repeated spaces and repeated words in different case changed the order). |
| R7 | When multiple skills match, title/name matches rank ahead of description-only matches, and stronger keyword-level matches rank ahead of weaker character-level fuzzy matches. | When multiple skills match, results are ordered by match strength first and field second: (1) every query term appears contiguously (keyword-level) in the name/title; (2) otherwise, every term appears contiguously in the name/title or the description; (3) otherwise, every term's characters appear in order (character-level fuzzy) in the name/title; (4) all other matches, i.e. character-level matches that rely on the description. | **Conflict and checkability.** The two clauses contradict each other when a name matches only at character level and a description contains the whole keyword: clause 1 puts the name first, clause 2 puts the description first. The P3 acceptance criterion settles it: the description keyword match must appear before "a result that matches only through weaker letter-level fuzziness", so strength comes first and field second. "Keyword-level" and "character-level" were also undefined; they are now contiguous vs. in-order-with-gaps, per query term, which a test can check. The interview evidence (C-7, O-6, O-10, S-8: name hits and exact words should come first) is unchanged, and so is the original ordering for every case where the clauses agree. The acceptance criteria now spell out all four tiers. |

## Review notes for kept requirements

- **R1:** Feasible and already implemented: `DialogSelect` calls `onFilter` on every input change and `DialogSkill` re-filters from it. Observable and checked on the rendered picker. No conflict.
- **R2:** Checkable as written. Revised R3 now defines precisely what "matches" means, so the two stay consistent.
- **R4:** The acceptance criteria make "preserves previous picker behavior" concrete: every loaded skill, in the original order. `filterSkills` returns the loaded list unchanged for a blank query, so the round-trip property can check it mechanically.
- **R5:** "Safe" is defined by the acceptance criteria (`No results found`, nothing hidden is selectable). Checked on the rendered picker.
- **R6:** Feasible as implemented: `DialogSelect` moves the highlight back to the first visible result after every filter change and only navigates the visible list. Checked on the rendered picker. No conflict with the revised R7: R7 decides which result is on top, R6 highlights it.
- **R8:** Real, because the SDK types `description` as optional. Checkable as written.

## Property failures and triage

| Property | Counterexample (shrunk) | Diagnosis | Resolution |
|---|---|---|---|
| R7 invariant | Failed on the first generated case. Query `aa` over `aa-0` (name keyword), `b-1` (description `aa`), `aba-2` (name `a·b·a`), `b-3` (description `aba`). Returned `b-1, aa-0, b-3, aba-2`. | **Code bug.** fuzzysort scores a skill by its single best field and penalizes long targets, and the dialog pads every title to the longest name, so description hits regularly beat name hits. This breaks even the unrevised R7 clause 1. Realistic repro: `deploy` ranked a skill whose description is `deploy` above `auto-deploy-tool`. | `filterSkills` now uses fuzzysort only to decide matches and ranks by the R7 tiers, with fuzzysort's score ordering skills within a tier. Added a regression example to `dialog-skill.test.ts`. |
| R3 metamorphic (case/spacing) | Found by a 5,000-runs-per-property stress run (the default seed passed): `E D` vs. `E  D` over the same skills returned the same set in a different order. Reproduced on unmodified `main`. | **Code bug.** fuzzysort also scores the literal query string, so a second space changed scores and order. That breaks R3 ("spacing never changes the results or their order"; C-5 "extra spaces should not matter"). | `filterSkills` collapses whitespace runs before searching. |
| R3 metamorphic (case/spacing) | A targeted probe showed `B b` vs. `b b` ordered differently, but the property's generator almost never produced a word typed twice. | **Wrong (too weak) property generator**, then a **code bug**. After adding "repeated word" (`pdf PDF`) and "initials" (`d s`) query forms, the property failed: `o o` vs. `o  O`. fuzzysort de-duplicates query words *before* lower-casing them, so case changed how many words it scored. | Generator strengthened (comments explain why). `filterSkills` now lower-cases the normalized query. |

No requirement or property was weakened to make a test pass. After the fixes, every property passed three stress runs of 10,000 cases each with random seeds. With the improved generators, the suite at its normal run counts fails on the original code (R7 every run; R3 metamorphic in 4 of 5 runs).

## Tooling and CI notes

- `fast-check` was not added as a dependency. `packages/tui` already depends on `effect`, and its `effect/testing` module re-exports fast-check (4.8.0) as `FastCheck`. That is the convention `packages/core` tests already use, so `package.json` dependencies and `bun.lock` are unchanged.
- `packages/tui` was missing from the `turbo.json` test tasks, so its tests never ran in CI. Added `@opencode-ai/tui#test` (the pattern documented in `TESTING.md`). Also dropped `--only-failures` from the tui `test` script, so the CI log lists every passing test, properties included, instead of only the totals.
- P5: `@stryker-mutator/core` 10.1.1 is a dev dependency of `packages/tui`, added in its own shared commit (`chore: add Stryker mutation testing dependency`, branch `chore-stryker-dependency`), so teammates' Stryker configs share one `package.json`/`bun.lock` change. Stryker's working output (`reports/`, `.stryker-tmp/`) is ignored in `packages/tui/.gitignore`; the reports are committed as copies under `mutants/bbarin/`.
- P5 opencode sessions: the agent failure case transcript is [`mutants/bbarin/opencode-agent-property-transcript.txt`](../mutants/bbarin/opencode-agent-property-transcript.txt). Two separate sessions in which opencode analysed whether Stryker mutants #40 and #15 are equivalent, with my executed check of its answers, are in [`mutants/bbarin/opencode-mutant-analysis-transcripts.txt`](../mutants/bbarin/opencode-mutant-analysis-transcripts.txt).

## Hand-written mutants

Each mutant is a one- or two-line change to `filterSkills` in [`packages/tui/src/component/dialog-skill.tsx`](../packages/tui/src/component/dialog-skill.tsx), saved as a patch in [`mutants/bbarin/`](../mutants/bbarin/) (apply from the repo root with `git apply mutants/bbarin/H1.patch`). Each one is a bug a developer could plausibly write while touching this code. The predictions below were written and committed before any mutant was run. The property suite runs with the fixed fast-check seed `17313` (see Stryker comparison), so every result is reproducible.

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R2 (find a skill by its description) | `keys: ["title", "description"]` → `keys: ["title"]`. A tempting "fix" for the P4 ranking bug (description hits outranked names): stop fuzzysort from searching descriptions at all. | **Killed** by "R2: a skill matching only through its description is found next to name matches": its description-only skill has a name with none of the query's letters, so it disappears. Also expected: "R2: every skill whose name or description contains the query", the R3 model/oracle and R7 (tier 2/4 skills vanish, so the result count is wrong). | **Killed**, as predicted, by 4 of 8 properties: both R2 properties, the R3 model/oracle and R7. First failure: R2 slice, query `68` copied from a description returned nothing. **Final suite (after both P5 strengthening rounds):** still killed by the same 4 properties. |
| H2 | R3 (one case-insensitive policy) | `query.trim().replace(/\s+/g, " ").toLowerCase()` → drop `.toLowerCase()`. fuzzysort is already case-insensitive, so the lower-casing looks redundant. | **Killed** by "R3: changing letter case or adding spaces leaves the results and their order unchanged" only. Matching stays case-insensitive (fuzzysort lower-cases), so R2, the R3 oracle and R3 omission still pass; but the tier checks compare an upper-case term with a lower-cased title, so `PDF` and `pdf` rank differently. R7 cannot see it: its queries are always lower-case. | **Killed**, as predicted, only by the R3 case/spacing metamorphic property (after 119 cases): `e,` and `E,` over the same five skills came back in different orders. The other 7 properties passed. **Final suite:** killed by the R3 case/spacing property and, since round 2, by the new R7 model/oracle property (its short queries come in mixed case, and without lower-casing an upper-case term never counts as a keyword). |
| H3 | R4 (blank query restores the list) | `if (!needle) return options` → `if (!query) return options`. The early return tests the raw input instead of the normalized query. | **Killed** by "R4: editing the query and then clearing it restores the original list and order" when it clears to spaces/tabs: the normalized query is empty, fuzzysort returns no results, so the list is empty instead of complete. No other property sends a blank query (their generators filter blank queries out). | **Killed**, as predicted, only by R4 (after 3 cases). Shrunk: skills `[pdf]`, edit `p p`, then clear to `" "` returned `[]` instead of `[pdf]`. **Final suite:** still killed, only by R4. |
| H4 | R7 (strength first, field second) | Swap the tier 2 and tier 3 checks, so letters-in-order in the name rank above a contiguous keyword in the description. This is the "name matches first" reading of the original P3 R7, the conflict P4 resolved. | **Killed** by "R7: keyword matches outrank character-level matches, and name matches outrank description matches": every generated case has a description-keyword skill (tier 2) and a scattered-letters name skill (tier 3), and they now come out in the wrong order. | **Killed**, as predicted, only by R7 (first case). Shrunk: query `aa`; the scattered-name skill `aba-2` (tier 3) came out above the description-keyword skill `b-1` (tier 2). **Final suite:** killed by both R7 properties. |
| H5 | R7 (keyword tier needs every term) | `terms.every(...)` → `terms.some(...)` in the tier 2 check. A skill where only one of two query terms appears as a keyword is promoted to the keyword tier. | **Survives.** The R7 generator builds every skill so that all query terms match at the same strength in the same field: all contiguous in the name, all contiguous in name/description, all scattered in the name, or all scattered in the description. `some` and `every` differ only for a skill where one term is contiguous and another only scattered, which R7 never generates. The R3 properties do not check ranking across different skills' tiers. | **Survived**, as predicted: all 8 properties passed. **After P5 strengthening (round 1):** **killed by the R7 invariant** (after 2 cases); in the final suite also by the new R7 model/oracle property. Shrunk: query `aa aiw`; skill `aiw-3` has `aiw` as a keyword in its name but `aa` only scattered through its description (`ava`), so it is tier 4, yet `some` promoted it above the tier 3 skill `aa-abibw-2`. |
| H6 | R8 (missing description is safe) | `option.description?.toLowerCase() ?? ""` → `option.description!.toLowerCase()`. A non-null assertion that silences the type checker, assuming every SKILL.md has a description. | **Killed** by "R8: skills without a description never break filtering and stay findable by name": two of its five "missing" shapes are `undefined`, and ranking that skill throws `TypeError`. Also expected: R2, R3 and R4 properties, whose corpora include description-less skills. R7 should survive it: its generator always gives a string description. | **Killed**, as predicted, by R8 and also by both R2 properties, all three R3 properties and R4 (7 of 8). Shrunk R3 oracle case: one skill `pdf` with no description, query `p`, throws `TypeError`. Only R7 passed, as predicted. **Final suite:** killed by all 9 properties: the R7 invariant now builds skills without a description too, and the new R7 oracle uses the realistic corpora. |

All 6 predictions matched the initial results, including the one predicted survivor (H5). In the final suite every hand-written mutant is killed; all six patches still apply to the final code (`git apply --check`) and were re-run against it with the fixed seed.

## Stryker comparison

**Setup.** [`packages/tui/stryker.bbarin.config.json`](../packages/tui/stryker.bbarin.config.json) uses the command test runner with `bun test --timeout 30000 test/component/dialog-skill.property.test.ts`, so only my property file runs (`--timeout 30000` is the tui `test` script's own timeout; with bun's 5 s default, a slow property under 8 parallel Stryker workers timed out and was counted as a kill). `mutate` is `src/component/dialog-skill.tsx:90-107`, exactly `filterSkills`: the only production code the properties call. The `DialogSkill` component around it is covered by the rendered tests, not by properties, so it is not mutated. `coverageAnalysis` is `off` and the reporters are html, clear-text and progress. Run from `packages/tui` with `bunx stryker run stryker.bbarin.config.json`, using Stryker 10.1.1, the shared dev dependency of `packages/tui`.

**Fixed fast-check seed: `17313`**, set with `FastCheck.configureGlobal` for this file only and restored afterwards, so every mutant sees the same generated inputs. Three consecutive runs made exactly the same number of `expect()` calls each time: 8,690 with the P4 properties, 22,788 with the final ones.

| Run | Mutants | Killed | Survived | Timeout / no coverage / errors | Mutation score |
|---|---|---|---|---|---|
| Initial (P4 properties, fixed seed) | 42 | 38 | 4 (#3, #15, #22, #40) | 0 / 0 / 0 | 38 / 42 = **90.48%** |
| After strengthening round 1 (changes 1–2 below) | 42 | 40 | 2 (#15, #40) | 0 / 0 / 0 | 40 / 42 = 95.24% |
| Final, after round 2 (change 3), raw | 42 | 41 | 1 (#40) | 0 / 0 / 0 | 41 / 42 = **97.62%** |
| Final, excluding the equivalent mutant #40, adjusted | 41 | 41 | 0 | 0 / 0 / 0 | 41 / 41 = **100%** |

Every killed mutant in the final run failed with a fast-check counterexample or a `TypeError`, not a timeout. Reports: [`mutants/bbarin/mutation.html`](../mutants/bbarin/mutation.html) (final) and [`mutants/bbarin/mutation-initial.html`](../mutants/bbarin/mutation-initial.html) (initial). Mutant numbers are Stryker's ids in those reports; the source never changed, so the ids are the same in every run.

### Survivors

| Stryker mutant | Change | Behavior it breaks | Classification | Outcome |
|---|---|---|---|---|
| #3 Regex | `query.trim().replace(/\s+/g, " ")` → `replace(/\s/g, " ")` | R3. Repeated spaces are no longer collapsed, and fuzzysort gives a bonus to a query found verbatim, spaces included. Over `aa` (description `x y`) and `bb` (description `x-y`), the mutant returns `aa, bb` for `x y` but `bb, aa` for `x  y`. | Not equivalent: the P4 "extra spaces change the order" bug in another form | **Killed** in round 1 by the R3 case/spacing property (change 2). Shrunk: `n r` vs `n  r`. |
| #15 StringLiteral | `option.description?.toLowerCase() ?? ""` → `?? "Stryker was here!"` (line 96) | R7 clause (3) versus clause (2). A skill without a description whose query terms are all in its name, some only letter by letter, is tier (3). The mutant ranks it as if its missing description held text, so whenever every term occurs in that text, the skill counts as "every term contiguously in the name/title or the description", tier (2). Final-run counterexample: query `er`; `extract-release-6bm8` (no description, `e`…`r` only spread out in the name: tier 3) is ranked above `tibnbm-release-64z8q`, whose description contains `MeRGE` (keyword: tier 2). | Not equivalent | **Killed** in round 2 by the new R7 model/oracle property (change 3), after 4,661 cases with the fixed seed. |
| #22 MethodExpression | `terms.every(...)` → `terms.some(...)` in the tier 2 check | R7: a skill with one keyword term and one scattered term is promoted to tier 2. | Not equivalent; identical to H5 | **Killed** in round 1 by the R7 invariant (change 1). |
| #40 ArithmeticOperator | `.toSorted((a, b) => a.tier - b.tier \|\| b.score - a.score)` → `\|\| b.score + a.score` | Nothing observable | **Equivalent** (argument below) | Survives; excluded from the adjusted score. |

**Why #40 is equivalent.** `fuzzysort.go` already returns its matches best score first, and `toSorted` is stable, so sorting by tier alone leaves every tier in descending score order; the `b.score - a.score` tie-break never changes the result. The mutant's comparator returns a positive number for every pair in the same tier, and Bun's (JavaScriptCore's) stable sort then keeps that pair in its current order, so each tier again comes out in fuzzysort's order, identical to the original. I checked this two ways: 12,040 random arrays of 0–300 items sorted with the mutant comparator always matched a stable sort by tier, and a 20,000-case differential property (the suite's own corpus and query generators, mutant vs. original) found no difference. As a side effect, #40 shows that the score term in the comparator is redundant code.

### How the properties were strengthened

Only property generators, assertions and run counts changed. No example-based tests were added and no production code was changed.

1. **R7 invariant: generator (round 1; kills #22 and H5, and lets R7 kill H6).** The P4 generator gave every query term of a skill the same spot: all keywords in the name, all scattered through the description, and so on. It therefore never built a skill whose terms match at different strengths, the only kind of skill where `some` and `every` disagree.
   - Each term is now placed independently at one of four spots (keyword or scattered, in the name or the description), and the skill's expected tier is read from the placements using R7's own wording. Every case still contains skills of all four tiers.
   - Terms may no longer be subsequences of each other (P4 only ruled out substrings), so a term can only match where it was placed.
   - Skills whose terms are all in the name may now have no description, an empty one or filler (R8's shapes).
   - Runs went from 300 to 1,000 for the larger input space.

   This checks R7 for every combination of term strengths and fields, not only the one in the counterexample.
2. **R3 metamorphic (case/spacing): generator and run count (round 1; kills #3).** "Spacing never changes the order" can only be violated between two terms, but in P4 single-term queries made up about half the cases. Now half the cases are guaranteed multi-term queries, and runs went from 1,000 to 3,000, because the reordering only appears when two results in the same tier are close in score. Over 10 random seeds, the P4 version killed #3 in 5 runs and the strengthened one in 10. A "phrase copied from a description" query form did not raise the kill rate (3 of 10), so I dropped it.
3. **New R7 model/oracle property on realistic text, plus short queries (round 2; kills #15).**
   - **What was missing.** After round 1, I first accepted #15 as an "unkillable" survivor, because random letter terms never fall inside Stryker's string. That was the wrong conclusion. #15 breaks R7, and the real gap was that R7 had only ever been checked on synthetic corpora whose filler alphabet shares no letter with the query. R7 was never checked on ordinary text, where one short term such as `er` is a keyword in one skill's description and only spread out in another skill's name.
   - **New property.** "R7: on realistic skills and queries, no result ranks above a result with a stronger match" uses the realistic corpora of the R3 properties. `modelTier`, a literal reading of R7 (keyword = contiguous, character-level = `inOrder`, a missing description has no text), gives each returned skill's tier, and the list must never show a weaker tier above a stronger one.
   - **Short queries.** I added two query forms to the shared generator, word fragments (`dep`, `re`) and acronyms (`pe` for `pdf-extract`): the first keystrokes of most searches, and the most common keyword-level and character-level matches. Three in four cases of the new property use them, and the R3, R4 and R8 properties now see them too.
   - **How it was tuned.** Measured against #15 over random seeds: the oracle alone killed it 0 of 10 times; with fragments, 3 of 10; with fragments and acronyms, 7 of 10. A 20,000-case differential sample showed why: the mutant changes the output in only 26 short-query cases, and 14 of those break R7; the other 12 only reorder skills within a tier, which R7 does not define. Hence 10,000 runs. The fixed seed now kills it, as did 17 of 20 random seeds.

After the changes, the suite passed three stress runs on the unmodified code with random seeds at 5× the normal run counts (round 2 re-checked), so the new generators and the oracle produce no false failures. H1–H6 were re-run against the final suite; the results are in the Hand-written mutants table.

### Hand-written vs. Stryker

**1. Which of my hand-written mutants did Stryker never generate? Why not?** Stryker produced 3 of my 6. #22 is H5 character for character. #14 (`?.` → `.`) is H6's crash, and the same 7 properties killed it initially. #32 (`"description"` → `""`: fuzzysort reads `obj[""]` and never searches descriptions) behaves like H1, and the same 4 properties killed it. It never generated H2, H3 or H4. Its mutators edit one token or operator in place:

- it turns `toLowerCase` into `toUpperCase` (#1) but never deletes the call (H2);
- it rewrites `!needle` to `needle`, `true` or `false` (#6–#8) but never substitutes another variable in scope (H3 uses `query` instead of `needle`);
- it never reorders statements (H4 swaps two `if` lines).

Each of those three mutants comes from knowing what the code is for: which variable holds the normalized query, which order R7 requires, and which call only looks redundant.

**2. Which Stryker survivors would I never have thought of? Are any plausible bugs?**

- **#15:** I would not have written it. Its literal is silly, but its realistic version is a real bug: a placeholder such as `?? "No description"` leaking from the UI into ranking. Following it up showed that R7 had never been tested on ordinary text or on short queries, which the P4 suite could not reveal.
- **#40:** not a bug at all. It is equivalent, and it showed that the score tie-break in `filterSkills` is dead code.
- **#3:** a plausible bug. `/\s/g` looks like `/\s+/g` and still turns tabs into spaces, but it quietly brings back the P4 "extra spaces change the order" bug. I had considered whitespace normalization, but not that a one-character quantifier change would get past the R3 metamorphic property.

**3. What does hand-written mutation find that Stryker does not?**

- **Misread requirements.** H4 is the P3 R7 conflict itself: name-first instead of strength-first ranking. H3 checks the raw input instead of the normalized query. Stryker has no mutator for either, and both are realistic.
- **Bugs aimed at one property.** H2 was killed only by the R3 case/spacing property until round 2, so it measured that property alone. Stryker's closest mutant (#1, `toUpperCase`) is killed by R7, whose constructed queries are all lower-case.
- **Predictions.** Writing predictions first found the R7 generator gap (H5) before anything ran.

**4. What does Stryker find that hand-written mutation does not?**

- **Breadth.** It tried 42 mutants on these 18 lines, including spots I never targeted: the regex quantifier (#3), the `?? ""` default (#15) and the sort comparator (#35–#40). Its survivors exposed three gaps (too few multi-term queries for #3; R7 never checked on realistic text or short queries for #15) and one redundant line (#40).
- **Dependence on one requirement.** Its kill matrix shows how much the suite leans on R7: R7's properties are the only killers of 24 of the 42 mutants. R4 is the only killer of #2 and #8, and R3 of #3. My 6 hand-written mutants could not show that.

## Agent failure case

### OpenCode evidence

- **Session:** opencode 1.19.5 (official CLI), build agent, free model `opencode/big-pickle`, session `ses_e47fc93a8ffewKbEIecYq5SapO`, 2026-11-07 21:56–21:59 UTC.
- **Full transcript:** [`mutants/bbarin/opencode-agent-property-transcript.txt`](../mutants/bbarin/opencode-agent-property-transcript.txt). It contains the verbatim prompt, the output and the file opencode wrote.
- **Setup:** opencode ran in a scratch worktree of the P4 commit `3236166`, whose production code is identical to the final code, with my own property file deleted so it could not copy it (its attempt to read that file fails in the transcript). Its permissions only allowed editing the new test file, read-only shell commands (`ls`, `git status/diff/log`) and `bun test`.
- **Share link:** none. `/share` publishes the session on opencode.ai, so I did not create one.

Prompt (excerpt; the requirement text was quoted in full):

> In this repository, inspect the Skill Picker filtering/ranking implementation (`filterSkills` in `packages/tui/src/component/dialog-skill.tsx`) and this requirement from `traceability/bbarin.md`: R7: When multiple skills match, results are ordered by match strength first and field second: (1) … (4) … Write one fast-check property-based test that checks R7. Use `FastCheck` from `effect/testing` … Put the test in a new file `packages/tui/test/component/dialog-skill.opencode.property.test.ts`, run it … and explain the generator and the assertion. Do not modify production code.

opencode's response (verbatim excerpt):

> **Generator:** `term` builds a 2–4 letter query from `a`–`e`. For each term it constructs exactly four skills, one per R7 tier: term contiguous in title (name keyword), term contiguous in description only (description keyword), term as in-order characters with gaps in the title, and the same with gaps in the description. Filler `z` and gap `-` are outside the term alphabet, so each skill lands in its intended tier. A second arbitrary of four random integers is used as sort keys to shuffle the skills, so passing requires actual ranking rather than preserving input order.
>
> **Assertion:** For every generated term/order, `filterSkills(shuffled, term)` must return titles in the fixed tier order: name keyword → description keyword → name letters → description letters. Run with `numRuns: 200`.

### Original OpenCode property

The full file is reproduced verbatim at the end of the transcript; this is its core:

```ts
const term = FastCheck.array(FastCheck.constantFrom("a", "b", "c", "d", "e"), { minLength: 2, maxLength: 4 })
  .map((letters) => letters.join(""))
const tiers = (query: string): SkillOption[] => [
  { title: `name-${query}`, description: "zzzz" },
  { title: "1zzzz", description: `contains ${query} keyword` },
  { title: `2${query.split("").join("-")}`, description: "zzzz" },
  { title: "3zzzz", description: query.split("").join("-") },
]
// ...
expect(actual.map((skill) => skill.title)).toEqual(expected.map((skill) => skill.title))
```

### Surviving mutant

**H5**: `terms.every(...)` → `terms.some(...)` in the tier 2 check, the same change as Stryker **#22**. It targets R7, and opencode's R7 property passed with it applied. I also ran Stryker with opencode's property as the only test. It killed **31 of 42 mutants (73.81%)**. Among the 11 survivors, these break R7:

- #22 (H5);
- #18, the same `every` → `some` slip in the tier 1 check;
- #17 and #19, which disable the name-keyword tier check entirely;
- #14, which crashes on a missing description (H6's crash);
- #15.

### Why the property was weak

The assertion, an exact expected order, was fine; the generator was too uniform to give it anything to catch.

1. **Only one query term.** R7's tiers are defined by where *every* query term matches. With a single term, "some term" and "every term" mean the same thing, so H5, #22 and #18 cannot be told apart from the correct code.
2. **One fixed skill per tier, always the same shape.** The name-keyword skill `name-<q>` is always shorter than the description-keyword skill's `contains <q> keyword`, and fuzzysort's score happens to rank those four fixed texts in R7's order by itself. The property therefore passes even when the name-keyword tier is removed (#17, #19): it cannot tell ranking by tier from ranking by score.
3. **Every skill has a description.** Skills with a missing description, which R8 says exist, are never ranked, so the crash H6/#14 and #15 go unseen.

### Strengthened version

[`packages/tui/test/component/dialog-skill.opencode.property.test.ts`](../packages/tui/test/component/dialog-skill.opencode.property.test.ts) keeps opencode's structure (a term alphabet, a skill builder, random sort keys for shuffling, filler outside the alphabet) and changes four things:

- **Terms.** Queries have one or two terms, each from its own alphabet (`abcde`, `fghij`), so a term matches only where it was placed.
- **One skill per placement combination.** Each term goes to one of four spots (keyword or letters, name or description), giving 4 skills for one term and 16 for two. Skills therefore mix strengths and fields, and the expected tier is read off the placements using R7's wording.
- **Random-length filler** around every field, so a strong tier's text can be long and a weak tier's short; the order has to come from the tiers.
- **Missing descriptions.** Skills that match only by name have no description, an empty one or filler.

With several skills per tier there is no single correct order, so the assertion now checks that every skill is returned and that the tiers never decrease. Fixed seed 17313; 300 runs.

### Evidence

Fixed seed 17313; I added the seed to opencode's original only to make its result reproducible.

| Property | Unmodified code | `git apply mutants/bbarin/H5.patch`, then `bun test --timeout 30000 test/component/dialog-skill.opencode.property.test.ts` | Stryker with only this property |
|---|---|---|---|
| opencode's original | 1 pass, 200 `expect()` calls | **1 pass: H5 survives** | 31 / 42 killed (73.81%) |
| strengthened | 1 pass, 600 `expect()` calls | **1 fail: H5 killed after 2 cases** | 37 / 42 killed (88.10%) |

**The H5 counterexample.** Shrunk: query `aa ff`. The skill titled `szz` with description `a-a ff` (`ff` a keyword, `aa` only letter by letter, both in the description: tier 4) is ranked second by the mutant, above three tier-2 skills and three tier-3 skills. On unmodified code it comes after all of them.

**What the strengthened version kills.** Besides H5 it kills H6, #14, #17, #18, #19 and #22. Its remaining survivors fall outside this property's job:

- #2, #3 and #8 are blank-query and spacing bugs (R3/R4);
- #40 is equivalent;
- #15 is killed by the R7 model/oracle property in `dialog-skill.property.test.ts`, which uses realistic text.
