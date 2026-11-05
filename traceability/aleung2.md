# Traceability: Ashley Leung (aleung2)

**Target feature:** Theme switching in the OpenCode TUI, packages/tui/src/context/theme.tsx

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 |C-3, C-4, S-3, O-6 | Changing themes must preserve the user's current session, including chat history, messages, and command history. | Given an active session with existing messages and command history, switching to any other theme must preserve all messages and commands without modification or deletion. | No | Invariant| packages/tui/test/feature-plugins/theme.property.test.tsx (R1)|
| R2 | S-4 | Changing themes must preserve the positions and ordering of existing TUI components when terminal dimensions and application state remain unchanged. | Given two different themes, identical terminal dimensions, and unchanged application state, switching themes must not change the positions or ordering of the chat history, input field, or other existing TUI components. | Yes | Invariant | N/A | 
| R3 | C-5, S-5, O-7 | Switching from Theme A to Theme B and back to Theme A must restore the original appearance. | Given any two distinct valid themes A and B, selecting A, then B, then A must restore the original theme-controlled colors and styling. | No | Round-trip | packages/tui/test/feature-plugins/theme.property.test.tsx (R3) | 
| R4 | C-6, S-6, S-8, O-8 | Selecting the same theme through the /themes command and the on-screen theme button must produce identical results. | Given the same initial state and any valid theme, selecting it through /themes or the theme button must produce identical active theme selections and resolved TUI appearances. | No | Oracle | packages/tui/test/feature-plugins/theme.property.test.tsx (R4) | 
| R5 | C-7, S-7, O-10 | The user's selected theme must persist across OpenCode restarts. | Given any valid theme selected by the user, restarting OpenCode must restore that theme without requiring another selection, provided no configuration override takes precedence.| Yes | Round-trip | packages/tui/test/feature-plugins/theme.property.test.tsx (R5) | 
| R6 | C-4 | All built-in themes must maintain a contrast ratio of at least 4.5:1 between their primary text and background colors to support readability. | Given any built-in theme, its primary foreground and background colors must have a WCAG contrast ratio of at least 4.5:1. | Yes | Invariant | N/A | 

Properties written or suggested by opencode or another AI tool: R1, R3, R4, R5 (designed and written by ChatGPT; reviewed by Ashley).

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
|R2| Changing themes must preserve the TUI's layout and the locations of existing interface elements. | Changing themes must preserve the positions and ordering of existing TUI components when terminal dimensions and application state remain unchanged.| The original requirement did not distinguish theme-related layout changes from changes caused by terminal resizing or application state. The revision clarifies the conditions under which layout must remain consistent, making the requirement testable.| 
| R3 | Switching from Theme A to Theme B and back to Theme A must restore the original appearance. | Switching from Theme A to Theme B and back to Theme A must restore the original theme-controlled appearance. | The original acceptance criteria included fonts, which are generally controlled by the terminal emulator rather than OpenCode. The revision limits the requirement to colors and styling controlled by OpenCode while preserving the user's expectation that switching back restores the original appearance. | 
| R5 | The user's selected theme must persist across OpenCode restarts. | The user's selected theme must persist across OpenCode restarts unless an explicit theme configuration overrides the saved preference. | OpenCode initializes the active theme using config.theme before checking the saved theme in KV storage. The original requirement did not account for this configuration precedence, so the revision reflects the application's existing behavior. | 
| R6 | All themes must maintain sufficient contrast between text and background colors to ensure readability. | All built-in themes must maintain a contrast ratio of at least 4.5:1 between their primary text and background colors to support readability. | OpenCode supports custom themes whose colors may not meet accessibility standards. Restricting the requirement to built-in themes and specifying primary foreground/background colors makes the requirement more feasible and measurable. |