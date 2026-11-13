# Traceability: Ashley Leung (aleung2)

**Target feature:** Theme switching in the OpenCode TUI, packages/tui/src/context/theme.tsx

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills | 
|---|---|---|---|---|---|---|---|
| R1 |C-3, C-4, S-3, O-6 | Changing themes must preserve the user's current session, including chat history, messages, and command history. | Given an active session with existing messages and command history, switching to any other theme must preserve all messages and commands without modification or deletion. | No | Invariant| packages/tui/test/theme.property.test.ts (R1)| H1 |
| R2 | S-4 | Changing themes must preserve the positions and ordering of existing TUI components when terminal dimensions and application state remain unchanged. | Given two different themes, identical terminal dimensions, and unchanged application state, switching themes must not change the positions or ordering of the chat history, input field, or other existing TUI components. | Yes | Invariant | N/A | N/A | 
| R3 | C-5, S-5, O-7 | Switching from Theme A to Theme B and back to Theme A must restore the original appearance. | Given any two distinct valid themes A and B, selecting A, then B, then A must restore the original theme-controlled colors and styling. | No | Round-trip | packages/tui/test/theme.property.test.ts (R3) | H2 |
| R4 | C-6, S-6, S-8, O-8 | Selecting the same theme through the /themes command and the on-screen theme button must produce identical results. | Given the same initial state and any valid theme, selecting it through /themes or the theme button must produce identical active theme selections and resolved TUI appearances. | No | Model/oracle | packages/tui/test/theme.property.test.ts (R4) | H3 |
| R5 | C-7, S-7, O-10 | The user's selected theme must persist across OpenCode restarts. | Given any valid theme selected by the user, restarting OpenCode must restore that theme without requiring another selection, provided no configuration override takes precedence.| Yes | Round-trip | packages/tui/test/theme.property.test.ts (R5) | H4, H5 |
| R6 | C-4 | All built-in themes must maintain a contrast ratio of at least 4.5:1 between their primary text and background colors to support readability. | Given any built-in theme, its primary foreground and background colors must have a WCAG contrast ratio of at least 4.5:1. | Yes | Invariant | N/A | N/A| 

Properties written or suggested by opencode or another AI tool: R1, R3, R4, R5 (designed and written by ChatGPT; reviewed by Ashley).

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
|R2| Changing themes must preserve the TUI's layout and the locations of existing interface elements. | Changing themes must preserve the positions and ordering of existing TUI components when terminal dimensions and application state remain unchanged.| The original requirement did not distinguish theme-related layout changes from changes caused by terminal resizing or application state. The revision clarifies the conditions under which layout must remain consistent, making the requirement testable.| 
| R3 | Switching from Theme A to Theme B and back to Theme A must restore the original appearance. | Switching from Theme A to Theme B and back to Theme A must restore the original theme-controlled appearance. | The original acceptance criteria included fonts, which are generally controlled by the terminal emulator rather than OpenCode. The revision limits the requirement to colors and styling controlled by OpenCode while preserving the user's expectation that switching back restores the original appearance. | 
| R5 | The user's selected theme must persist across OpenCode restarts. | The user's selected theme must persist across OpenCode restarts unless an explicit theme configuration overrides the saved preference. | OpenCode initializes the active theme using config.theme before checking the saved theme in KV storage. The original requirement did not account for this configuration precedence, so the revision reflects the application's existing behavior. | 
| R6 | All themes must maintain sufficient contrast between text and background colors to ensure readability. | All built-in themes must maintain a contrast ratio of at least 4.5:1 between their primary text and background colors to support readability. | OpenCode supports custom themes whose colors may not meet accessibility standards. Restricting the requirement to built-in themes and specifying primary foreground/background colors makes the requirement more feasible and measurable. |

## Hand-written Mutants

| ID | Requirement Targeted | Change | Predicted Killer | Actual Result | 
|---|---|---|---|---|
| H1 | R1 | Changed prompt-history retention from the newest 50 entries to the newest 49, introducing an off-by-one truncation error. | R1 | Killed: R1 timed out because the mutant retained 49 entries while the property expected 50 for the 50/51-entry boundary cases. | 
| H2 | R3 | Moved the active-theme lookup outside createMemo, causing resolved appearance to remain stale after theme selection changes. | R3 | Killed: R3 failed because the appearance did not change after switching from Theme A to Theme B. | 
| H3 | R4 | Changed the theme button from dialog.replace(...) to dialog.clear(), preventing it from opening DialogThemeList. | R4 | Killed: R4 timed out waiting for the button path to open the theme-selection dialog. | 
| H4 | R5 | Removed kv.set("theme", theme), so the selected theme changed in memory but was not persisted. | R5 | Killed: R5 failed because the selected theme was not available after restart. |
| H5 | R5 | Incorrectly reapplied the saved theme over a distinct explicit override. | R5 | Killed: R5's distinct-override case restored the saved theme instead of applying the explicit configuration override. |

## Stryker Comparison 
Stryker ran only `test/theme.property.test.ts` and mutated `src/context/theme.tsx:256-298`. The fixed fast-check seeds were R3 `17313`, R1 `117313`, R4 `417313`, and R5 `517313`.

In the initial run, Stryker created 31 mutants: 2 were killed, 18 survived, and 11 timed out, for a mutation score of 41.94%. After strengthening the properties, the committed report contains 17 killed, 13 timed out, and 1 surviving mutant. Stryker counts killed and timed-out mutants as detected, so the final raw mutation score is **96.77% (30/31)**.

Stryker never generated the exact five hand-written changes. H1 and H3 were outside the configured mutation range because they change `history.tsx` and `theme-button.tsx`. H2 moves a reactive lookup across a `createMemo` boundary, H4 deletes a persistence side effect, and H5 changes precedence by composing two existing lookups; these coordinated statement-level edits are not among the local operator substitutions Stryker generated.

The Stryker survivor I would not have thought of was replacing the right-hand side of an arrow function with `undefined`. An exact `() => undefined` edit is less likely to be committed deliberately, but a developer could plausibly disconnect a renderer update by leaving an empty callback during a refactor. Stryker's equality-operator replacements, such as changing `===` to `!==`, are also realistic typographical bugs.

Hand-written mutation testing found feature-specific faults that require coordinated edits, including the history boundary, the independent button path, stale reactivity, and configuration precedence. Stryker systematically explored small expression and callback changes that I would not have enumerated manually, but it also produced timeouts and an equivalent mutant. The approaches are complementary: hand-written mutants emphasize realistic domain mistakes, while Stryker exposes unexpected weaknesses in the properties' observations.

The properties were strengthened to generate invalid and stale theme names and verify resolved styling, renderer backgrounds, syntax styles, persistence fallbacks, and mode-lock behavior across restarts. These are property-based assertions over generated inputs, not additional example-based tests.

The one final survivor changes `if (typeof saved === "string")` to `if (true)`. The KV value can only be a saved theme-name string or `undefined`: strings already enter the original branch, while `undefined` enters only the mutant branch, fails to find a matching theme, and falls through to the same default theme. Therefore the change has no observable effect for any reachable provider state and is equivalent; excluding it gives an adjusted score of **100% (30/30)**.

## Agent Failure Case
The course staff clarified that this case may use any AI agent. I asked ChatGPT/Codex to implement a property for R3.

**Prompt excerpt:**

> Please proceed with Phase 1 and implement only the R3 round-trip property. Use the real ThemeProvider and production theme-selection logic. Ensure the resolved theme snapshots compare actual styling values rather than object references, and verify that the intermediate selection successfully changes to Theme B.

**Agent response excerpt (the generated oracle):**

```ts
const before = snapshotResolvedTheme(theme.theme)

expect(theme.set(intermediate)).toBe(true)
expect(snapshotResolvedTheme(theme.theme)).not.toEqual(before)

expect(theme.set(initial)).toBe(true)
expect(snapshotResolvedTheme(theme.theme)).toEqual(before)
```

The property used distinct generated themes and both color modes, then performed A → B → A through the real `ThemeProvider`. However, its oracle observed only `theme.theme`, the provider's resolved theme value. It never observed the renderer background side effect, so the resolved values could remain correct even when the visible renderer stopped updating.

**Mutant that survived:** Stryker replaced the renderer update

```ts
createEffect(() => renderer.setBackgroundColor(values().background)) 
```

with

```ts
createEffect(() => undefined)
```

The original property passed this mutant because changing `theme.theme` does not prove that `renderer.setBackgroundColor` ran. This is a weak oracle: it checked the source value that should drive the appearance, but not the actual rendered appearance controlled by the mutated effect.

**Strengthened property:** `snapshotThemeAppearance` now captures the complete resolved theme, the renderer's actual `backgroundColor`, and both normal and subtle syntax styles. For the initial, intermediate, and restored themes, the property also asserts that the renderer background equals the resolved theme background:

```ts
const before = snapshotThemeAppearance(theme, app.renderer)
expect(before.background).toEqual(before.theme.background)

expect(theme.set(intermediate)).toBe(true)
const changed = snapshotThemeAppearance(theme, app.renderer)
expect(changed.background).toEqual(changed.theme.background)
expect(changed).not.toEqual(before)

expect(theme.set(initial)).toBe(true)
const restored = snapshotThemeAppearance(theme, app.renderer)
expect(restored.background).toEqual(restored.theme.background)
expect(restored).toEqual(before)
```

In the committed final Stryker report, this renderer mutation is mutant 12 (`ArrowFunction`, replacement `() => undefined`) and its status is **Killed**. Thus the strengthened property directly observes the behavior the original AI-written property missed.
