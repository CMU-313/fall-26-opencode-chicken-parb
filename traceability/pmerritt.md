# Traceability: Parker Merritt (pmerritt)

**Target feature:** Allow changing permissions in the UI — `packages/tui/src/component/dialog-permissions.tsx`, `packages/opencode/src/config/config.ts`, `packages/opencode/test/config/config.test.ts`

## Requirements

| ID  | Interview evidence                                                    | Requirement                                                                                        | Acceptance Criteria                                                                                                                                                      | Changed in P4? | Property (kind) | Test                                                                                                | Mutants it kills |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | --------------- | --------------------------------------------------------------------------------------------------- | ---------------- |
| R1  | C-4: Keep the settings the same, yes.                                 | The config.json file needs to be saved upon change.                                                | If a user changes a setting in the UI, it needs to be reflected in the config.json file and saved even if the computer is immediately shut off without ending a session. | No             | Round-trip      | `permissions.property.test.ts`: "R1: an updated permission action persists through save and reload" | none             |
| R2  | C-5: I should never see the pop-up, yeah.                             | If a permission is changed to deny, then the user should never see a pop-up asking for permission. | If the setting changes to Deny, config.json needs to update this setting and reset the rules for the LLM so the pop-up never shows.                                      | No             | Invariant       | `permissions.property.test.ts`: "R2: a tool set to deny evaluates to deny for every pattern"; "R2: a denied tool rejects with a denied error instead of asking"; "R2: an allowed tool resolves without asking" | H2, H3           |
| R3  | S-5: yes, revert the change                                           | If a setting is changed, it must be reversible.                                                    | If a user changes a setting from ask to deny, then clicking the setting two more times should cycle back to deny (because there are three total options for a setting).  | No             | Round-trip      | `permissions.property.test.ts`: "R3: reverting a changed permission restores the original action"   | none             |
| R4  | S-6: I'd say the json file should be the source of truth.             | The settings displayed in the UI should be the same as in the config.json file.                    | For all settings, the UI should display the exact permission properties as the config.json file.                                                                         | No             | NA              | Not implimented                                                                                     | none             |
| R5  | C-6: Yes, if they are universal, the settings should then be changed. | If a universal setting is changed, all sessions should update with this new permission.            | When a universal setting changes, all active sessions need to reload their permissions.                                                                                  | No             | Metamorphic     | `permissions.property.test.ts`: "R5: a universal permission change is visible to every later load"  | H1, H5           |

Properties written or suggested by opencode or another AI tool: R1, R2, R3, R5 (drafted with AI assistance, especially with respect to creating the temporary json files).

## Requirement changes

No change made - All requirements are feasible and implementable. They test two different properties, and ensure the settings do truly match the config.json file.

## Hand-written mutants

Predictions were recorded before `bun test test/config/permissions.property.test.ts` was run on each applied patch. Each patch was reverted before the next run.

| ID  | Requirement targeted | Change                                                                               | Predicted killer                                                 | Actual result                                                                                                                            |
| --- | -------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | R1                   | config file is never reloaded on a change                                            | R5 - permission changes should reload globally upon a change     | Killed by R5. Counterexample ["ask", "deny"]: the reload still returned "ask".                                                           |
| H2  | R2                   | Forget to check if a rule is denied, so it is treated like it needs permission       | R2 - The user should not see the popup after changing it to deny | Survived. R2 never actually calls the function for denying the UI pop up as oppposed to it's theoretical evulation outside of the pop up |
| H3  | R2                   | Forget the when writing permissions, so permissions become "" instead of ""          | R2. The generator includes non-empty patterns like ""            | Killed by R2. Counterexample ["read", " "], but you cannot have empty permission strings.                                                |
| H4  | R4                   | Accidently return ask instead of allow for a permission if one doesn't already exist | None.                                                            | Survived.                                                                                                                                |
| H5  | R5                   | Don't write over existing global permissions                                         | R5 - All sessions should have the new changes updated            | Killed by R5. Counterexample ["ask","ask"], we got an undefined result                                                                   |

## Stryker comparison

Config: `packages/opencode/stryker.pmerritt.config.json`. It runs only `test/config/permissions.property.test.ts` and mutates only the lines our hand-written mutants targeted (`src/config/config.ts:638-641` and `:648-649`, `src/permission/index.ts:75-79` and `:190`, and `../tui/src/component/dialog-permissions.tsx:98`). fast-check seed is fixed at 42 via `fc.configureGlobal({ seed: 42 })`.

Mutation score: before strengthening, 38.89% (7 of 18 killed, 11 survived). After adding the two R2 pop-up properties that drive `Permission.ask` directly, 83.33% (12 killed, 3 timed out, 3 survived). Excluding the 3 equivalent mutants below, the score is 100% (15 of 15).

Strengthening: the 8 survivors in the `Permission.ask` deny block all survived because every property only exercised `Permission.evaluate` / `Permission.fromConfig`, never the code that raises the pop-up. The new "R2: a denied tool rejects with a denied error instead of asking" property calls `ask` with a deny ruleset (plus an unrelated rule) under a timeout and asserts it fails with `PermissionDeniedError` whose `ruleset` equals only the matching deny rule; the companion "R2: an allowed tool resolves without asking" asserts an allow ruleset resolves. Together they kill all control-flow mutants (including the pending-instead-of-denying ones, via the timeout) and the ruleset-payload mutants (empty object, unfiltered ruleset, and the always-false filter).

### Equivalent mutants

All three survivors are in `writeConfigFile` / `update` and only flip the `changed` short-circuit:

- `config.ts:640` `const changed = serialized !== before` -> `const changed = true`
- `config.ts:641` `if (changed)` -> `if (true)` around the file write
- `config.ts:649` `if (result.changed)` -> `if (true)` around the cache invalidation

Each only forces a redundant rewrite or reload of byte-identical content: when nothing changed, `serialized === before`, so rewriting the same bytes and reloading the same data produces no state any `Config.get()` can observe. Killing them would require asserting on write counts or file mtimes, which tests an implementation detail rather than a requirement, so we treat them as equivalent.

### Comparison questions

- Which hand-written mutants did Stryker never generate? H1 (never reload on change) and H5 (drop the universal key before serializing) are statement removals/insertions that Stryker's operators do not produce; it only rewrote the surrounding conditionals. H4 sits in the TUI file, which the opencode run cannot mutate across the package boundary (the `../tui/...` glob matched no files), so Stryker never saw it.
- Which Stryker survivors would you never have thought of? The three `changed`-conditional mutants. A real developer could plausibly write `if (true)` or drop the `changed` guard while "simplifying," and none of them break observable behavior, which is exactly why they are equivalent.
- What does each approach find that the other doesn't? Stryker systematically enumerated the low-level conditional/boundary mutants in code we only partly tested, surfacing the equivalent ones. Hand-written mutants captured semantic, multi-line bugs (removing a reload, deleting a key) that match real regressions but lie outside Stryker's per-node operators.
