import fc from "fast-check"
import { test, expect, describe } from "bun:test"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/unstable/http"

import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Npm } from "@opencode-ai/core/npm"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"

import { Config } from "@/config/config"
import { Permission } from "../../src/permission"
import { ConfigParse } from "../../src/config/parse"
import { Auth } from "../../src/auth"
import { Account } from "../../src/account/account"
import { Env } from "../../src/env"

import { provideTmpdirInstance } from "../fixture/fixture"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import path from "path"

const unexpectedHttp = HttpClient.make((request) =>
  Effect.die(`unexpected http request: ${request.method} ${request.url}`),
)

const layer = LayerNode.compile(LayerNode.group([Config.node, FSUtil.node, Env.node, CrossSpawnSpawner.node]), [
  [Auth.node, AuthTest.empty],
  [Account.node, AccountTest.empty],
  [Npm.node, NpmTest.noop],
  [httpClient, Layer.succeed(HttpClient.HttpClient, unexpectedHttp)],
])

// Run a body in a fresh temporary project with the real Config service. A new
// project per sample keeps generated inputs isolated from one another.
const runInProject = <A, E, R>(body: (dir: string) => Effect.Effect<A, E, R>) =>
  Effect.runPromise(provideTmpdirInstance(body).pipe(Effect.scoped, Effect.provide(layer)))

const setPermission = (key: string, action: ConfigPermissionV1.Action) =>
  Config.Service.use((svc) =>
    svc.update(ConfigParse.schema(ConfigV1.Info, { permission: { [key]: action } }, "test:config")),
  )

const actionArb = fc.constantFrom(...ConfigPermissionV1.Action.literals)
const keyArb = fc.constantFrom(
  "read",
  "edit",
  "glob",
  "grep",
  "list",
  "bash",
  "task",
  "external_directory",
  "todowrite",
  "question",
  "webfetch",
  "websearch",
  "lsp",
  "doom_loop",
  "skill",
)

const RUNS = { numRuns: 25 }

describe("permissions (property-based)", () => {
  // R1: "The config.json file needs to be saved upon change."
  // Kind: round-trip
  test("R1: an updated permission action persists through save and reload", () =>
    fc.assert(
      fc.asyncProperty(keyArb, actionArb, actionArb, (key, initial, updated) =>
        runInProject(() =>
          Effect.gen(function* () {
            yield* setPermission(key, initial)
            yield* setPermission(key, updated)
            const reloaded = yield* Config.use.get()
            expect(reloaded.permission?.[key]).toBe(updated)
          }),
        ),
      ),
      RUNS,
    ))

  // R2: "If a permission is changed to deny, the user should never see a pop-up
  // asking for permission."
  // Kind: invariant
  test("R2: a tool set to deny evaluates to deny for every pattern", () =>
    fc.assert(
      fc.property(keyArb, fc.string(), (key, pattern) => {
        const ruleset = Permission.fromConfig({ [key]: "deny" })
        expect(Permission.evaluate(key, pattern, ruleset).action).toBe("deny")
      }),
    ))

  // R3: "If a setting is changed, it must be reversible."
  // Kind: round-trip
  test("R3: reverting a changed permission restores the original action", () =>
    fc.assert(
      fc.asyncProperty(keyArb, actionArb, actionArb, (key, original, changed) =>
        runInProject(() =>
          Effect.gen(function* () {
            yield* setPermission(key, original)
            yield* setPermission(key, changed)
            yield* setPermission(key, original)
            const reloaded = yield* Config.use.get()
            expect(reloaded.permission?.[key]).toBe(original)
          }),
        ),
      ),
      RUNS,
    ))

  // R5: "If a universal setting is changed, all sessions should update with this
  // new permission."
  // Kind: metamorphic
  test("R5: a universal permission change is visible to every later load", () =>
    fc.assert(
      fc.asyncProperty(actionArb, actionArb, (before, after) =>
        runInProject(() =>
          Effect.gen(function* () {
            yield* setPermission("*", before)
            const firstLoad = yield* Config.use.get()
            expect(firstLoad.permission?.["*"]).toBe(before)

            yield* setPermission("*", after)
            const reloadA = yield* Config.use.get()
            const reloadB = yield* Config.use.get()
            expect(reloadA.permission?.["*"]).toBe(after)
            expect(reloadB.permission?.["*"]).toBe(after)
          }),
        ),
      ),
      RUNS,
    ))
})
