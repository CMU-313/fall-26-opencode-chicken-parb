# Traceability: Ashley Leung (aleung2)

**Target feature:** Theme switching in the OpenCode TUI, packages/tui/src/context/theme.tsx

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills | 
|---|---|---|---|---|---|---|---|
| R1 |C-3, C-4, S-3, O-6 | Changing themes must preserve the user's current session, including chat history, messages, and command history. | Given an active session with existing messages and command history, switching to any other theme must preserve all messages and commands without modification or deletion. | No | Invariant| packages/tui/test/feature-plugins/theme.property.test.tsx (R1)| H1 | 
| R2 | S-4 | Changing themes must preserve the positions and ordering of existing TUI components when terminal dimensions and application state remain unchanged. | Given two different themes, identical terminal dimensions, and unchanged application state, switching themes must not change the positions or ordering of the chat history, input field, or other existing TUI components. | Yes | Invariant | N/A | N/A | 
| R3 | C-5, S-5, O-7 | Switching from Theme A to Theme B and back to Theme A must restore the original appearance. | Given any two distinct valid themes A and B, selecting A, then B, then A must restore the original theme-controlled colors and styling. | No | Round-trip | packages/tui/test/feature-plugins/theme.property.test.tsx (R3) | H2 | 
| R4 | C-6, S-6, S-8, O-8 | Selecting the same theme through the /themes command and the on-screen theme button must produce identical results. | Given the same initial state and any valid theme, selecting it through /themes or the theme button must produce identical active theme selections and resolved TUI appearances. | No | Oracle | packages/tui/test/feature-plugins/theme.property.test.tsx (R4) | H3 | 
| R5 | C-7, S-7, O-10 | The user's selected theme must persist across OpenCode restarts. | Given any valid theme selected by the user, restarting OpenCode must restore that theme without requiring another selection, provided no configuration override takes precedence.| Yes | Round-trip | packages/tui/test/feature-plugins/theme.property.test.tsx (R5) | H4, H5 | 
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
| H5 | R5 | Incorrectly reapply the saved theme over a distinct explicit override. | R5 | Killed: R5's distinct-override case restored the saved theme instead of applying the explicit configuration override. | 

## Stryker Comparison 
Stryker created 31 mutants within `src/context/theme.tsx:256-298`. Of these, 2 were killed, 18 survived, and 11 timed out, for a total mutation score of 41.94%. 

Stryker did not generate any of my five hand-written mutants. On a high level, Stryker's mutants focus much more on targetting explicitly incorrect code. For example, many of its mutants changed conditionals to case on always true or always false. To contrast, my mutants focused more on subtley incorrect code, like incorrect placement of correct lines. 

One of the mutants Stryker created that I would not have thought of, was simply changing the right hand side of an arrow function to undefined. However, I do not think a real developer would write that code into production. One of the smaller mutants, like writing "===" versus "!==" might be more possible as an accident. 

The tradeoff is that hand-written mutants are fewer and depend on realistic human judgment, while Stryker generates broader coverage but also produces equivalent, out-of-requirement, or timeout-based mutants. The two approaches are complementary: hand-written mutants test expected domain faults, while Stryker reveals unexpected gaps in what the tests observe.

The properties were strengthened to generate invalid and stale theme names and verify resolved styling, renderer backgrounds, syntax styles, persistence fallbacks, and mode-lock behavior across restarts.

Excluding the 1 equivalent mutant below, the score is 100% (30 of 30).

The equivalent mutant below changes a conditional statement to case on always true. OpenCode itself can produce only: a string saved by kv.set("theme", theme), in which case both versions enter the branch, or undefined, in which case the mutant enters the conditional statement, finds no matching theme, and falls through to the same default theme. 
Original: 
if (typeof saved === "string") {
Mutant: 
if (true) {

## Agent Failure Case
I asked the AI agent to implement a property for R3:

> Switching from Theme A to Theme B and back to Theme A must restore the
> original theme-controlled appearance.

The original property selected two distinct generated themes, performed
A → B → A through the real `ThemeProvider`, and compared snapshots produced
from `theme.theme`:

```ts
const before = snapshotResolvedTheme(theme.theme)

expect(theme.set(intermediate)).toBe(true)
expect(snapshotResolvedTheme(theme.theme)).not.toEqual(before)

expect(theme.set(initial)).toBe(true)
expect(snapshotResolvedTheme(theme.theme)).toEqual(before)
``` 
Mutant that survived
Stryker replaced the renderer update:
```ts
createEffect(() => renderer.setBackgroundColor(values().background)) 
```
with a no-op:
```ts
createEffect(() => undefined)
```