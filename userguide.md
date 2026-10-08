This file describes the changes made to the opencode repository as part of the project 2 requirements. 

**Rohan** Global Search: The global search feature allows a user to search across all files in a project, with a highlighted line and line number being returned. The search dialouge boxes limits these returns to 25, so even common terms don't have unreasonable amounts of returned results. A user can also activate global search with Aditionally, if the user calls the search API directly, they can specify their custom limit: 

Tests: This feature can be tested along 4 prongs - search helpers, command level, query validation, and endpoint. New tests ensure that whitespaces are skipped, files from across the project are returned, and the limiting feature works as intended. These 4 areas are completley exhaustive relative to the changes made in this feature.

Search helper tests: packages/app/src/components/find-text-search.test.ts (https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/app/src/components/find-text-search.test.ts)

Command: packages/app/src/pages/session/file-search-content-command.test.ts (https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/app/src/pages/session/file-search-content-command.test.ts)

Limit: packages/opencode/test/server/httpapi-find-text-query.test.ts (https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/opencode/test/server/httpapi-find-text-query.test.ts)

API: packages/opencode/test/server/httpapi-file-find-text.test.ts (https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/opencode/test/server/httpapi-file-find-text.test.ts)
packages/opencode/test/server/httpapi-file.test.ts (https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/opencode/test/server/httpapi-file.test.ts)



**Parker** Always Allow Bypass: You can now edit the config.json file directly in Opencode's UI via the /permissions command, cycling between permissions using the arrow keys and space bar (or alternatively clicking via a mouse).

Tests: Ensures the config file changes as expected and that these settings remain constant across new sessions. Ensures current sessions reload their config files. These tests are sufficient because the feature only edits the config.json file and has no side effects, so testing that the config.json file has changed and is reflected across sessions is sufficient.

packages/opencode/test/config/config.test.ts (https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/opencode/test/config/config.test.ts) (note that most of these are previously existing tests. The commits containing the specific tests I implemented are here: https://github.com/CMU-313/fall-26-opencode-chicken-parb/pull/25/commits)



**Ashley** Theme Button on TUI: There is now a dedicated, on-screen button on the TUI for changing the active theme. 

Tests: One test checks that the theme-button is registered as a built-in plugin. Another test checks that, when the theme button is clicked, the same theme selection window is opened as when /themes is used. Latter test also checks that the theme is correctly rendered in, when selected.
Tests are located in: packages/tui/test/feature-plugins/theme-button.test.tsx (https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/tui/test/feature-plugins/theme-button.test.tsx)


## **Batu** Skill Picker Search and Filtering

The `/skills` picker in the terminal UI can be searched. Typing in the picker filters and ranks skills by their name and description, so a skill can be found without scrolling through the whole list.

### How to use

1. In the OpenCode prompt, type `/skills` and press Enter. The **Skills** picker opens with every available skill, and the `Search skills...` box is focused.
2. Start typing. The list updates on every keystroke, using fuzzy matching across each skill's name and description:
   - Matching ignores case. The typed characters must appear in order but do not need to be next to each other, so `pdext` matches `pdf-extract`.
   - Results are ranked by relevance. The best match is listed first and highlighted automatically.
   - Fuzzy matching is permissive. Descriptions contain a lot of text, so weaker matches can stay visible below the best ones. For a non-empty query, results are not kept in the original list order.
3. Use the Up and Down arrow keys to move through the results.
4. Press Enter to select the highlighted skill. The picker closes and `/<skill-name> ` is inserted into the prompt. Nothing is sent until you press Enter again.
5. Delete the query with Backspace to restore the full list in its original order. If nothing matches, the picker shows `No results found`. Press Esc to close the picker.

### Manual verification

These steps use four throwaway project skills so the expected results are predictable. Skills you already have installed (for example in `~/.claude/skills`) will also be listed; that is expected.

1. Create the demo skills from any POSIX shell (Git Bash works on Windows):

   ```sh
   D="$HOME/skill-picker-demo"
   for s in "release-notes|Draft a changelog for the next release" \
            "pdf-extract|Pull text out of PDF documents" \
            "deploy-worker|Ship a service to production" \
            "pdf-merge|Combine several PDF files into one"; do
     n="${s%%|*}"; mkdir -p "$D/.opencode/skills/$n"
     printf -- '---\nname: %s\ndescription: %s\n---\n\n# %s\n' "$n" "${s#*|}" "$n" > "$D/.opencode/skills/$n/SKILL.md"
   done
   ```

2. From the repository root, run `bun install` (first time only), then `bun dev "$HOME/skill-picker-demo"`.
3. Follow these steps in order:

| Step | Do this | Expected result |
| --- | --- | --- |
| 1. Full list | Type `/skills` and press Enter | The picker opens and lists every skill, including the four demo skills. The first row is highlighted. |
| 2. Name search, live update | Type `pdf` | The list changes as you type. `pdf-extract` and `pdf-merge` are at the top, and the first one is highlighted. |
| 3. Description-only search | Backspace until the box is empty, then type `production` | `deploy-worker` is the first result. It matches only through its description. |
| 4. Arrow navigation | Clear the box, type `pdf`, press Down | The highlight moves from the first result to the second. |
| 5. Enter selection | Press Enter | The picker closes and the prompt contains `/<skill> ` for the highlighted skill (for example `/pdf-merge `). Do not press Enter again. |
| 6. Clearing restores the list | Clear the prompt, open `/skills` again, type `pdf`, then Backspace until the box is empty | The complete list returns in the same order as step 1. |
| 7. No match | Type `zzzzqx` | `No results found` is shown and no skills are listed. |
| 8. Clearing after no match | Backspace until the box is empty | The complete list returns again. |

Press Esc to close the picker and Ctrl+C to quit. Remove the demo afterwards with `rm -rf "$HOME/skill-picker-demo"`.

### Automated tests

Run these from `packages/tui`. Tests cannot be run from the repository root.

```sh
cd packages/tui
bun test test/component/dialog-skill.test.ts test/cli/tui/dialog-skill.test.tsx
```

- `packages/tui/test/component/dialog-skill.test.ts` has 7 unit tests for the `filterSkills()` matching function:
  - a name match
  - a fuzzy, case-insensitive name match (`PDext` finds `pdf-extract`)
  - a description-only match
  - multiple matches from both name and description, compared as a set because ranking order is not part of the feature
  - an empty or whitespace-only query returns the original list in its original order
  - a query with no match returns nothing
  - skills without a description neither break the search nor hide valid matches
- `packages/tui/test/cli/tui/dialog-skill.test.tsx` (https://github.com/CMU-313/fall-26-opencode-chicken-parb/blob/main/packages/tui/test/cli/tui/dialog-skill.test.tsx) has 5 rendered tests. Each opens the real skill picker the same way `/skills` does, using a fake skill list and the default key bindings, then checks what is drawn on screen:
  - with no query, every skill is shown in the original order and Enter selects the first
  - typing a name query narrows the visible list (`pdf`, then `pdf-m`)
  - changing to a description-only query (`production`) replaces the previous results
  - after filtering, Down then Enter selects the highlighted (second) result and closes the picker
  - an unmatched query shows `No results found` with no leftover skills, and clearing it restores the full list in the original order

### Why this verification is sufficient

The feature has two parts: the `filterSkills()` matching function, and the wiring that connects the picker's search box to it. Each part is tested where it can break. The manual steps confirm the same behaviour in the real terminal UI.

| Acceptance criterion | Automated evidence | Manual step |
| --- | --- | --- |
| The picker accepts text while open | Rendered tests type into the real picker's search box | 2, 3 |
| The visible list updates as the user types | Rendered tests: a name query narrows the list, and switching to a description query replaces it | 2, 3 |
| Matching uses the skill name and description | Unit tests: name, fuzzy and case-insensitive, description-only, multiple matches. Rendered: description-only result | 2, 3 |
| Clearing the query restores the full list | Unit: empty and whitespace-only queries. Rendered: clearing after a no-match restores the original order | 6, 8 |
| Keyboard navigation and selection still work after filtering | Rendered: Down then Enter selects the highlighted filtered skill | 4, 5 |
| Behaviour is unchanged when no query is entered | Unit: an empty query returns the same list unchanged. Rendered: full list in original order, Enter selects the first skill | 1 |
| Tests cover filtering, the empty query and no-match | Both test files | 7, 8 |

The rendered tests would fail if the search box stopped updating the query, or if the picker's built-in filter (which only searches names and categories) were applied on top, because the description-only result would disappear. Running both test files 20 times in a row (240 test runs) produced no failures. Two things are not asserted directly by the automated tests. The highlight colour is checked indirectly, through which skill Enter selects. The relevance order of fuzzy results is not checked, because it is not part of the feature. The manual steps show both in the real terminal UI.
