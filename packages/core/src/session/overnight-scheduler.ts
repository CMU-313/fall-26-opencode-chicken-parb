export * as OvernightScheduler from "./overnight-scheduler"

import { Context, Duration, Effect, Layer, Schedule } from "effect"
import { and, eq, isNull } from "drizzle-orm"
import { Database } from "../database/database"
import { Config } from "../config"
import { SessionExecution } from "./execution"
import { SessionInputTable } from "./sql"
import { SessionSchema } from "./schema"
import { makeLocationNode } from "../effect/app-node"

export interface Interface {
  /** Returns the configured overnight start hour, or undefined if overnight is disabled. */
  readonly startHour: Effect.Effect<number | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/OvernightScheduler") {}

const CHECK_INTERVAL = Duration.minutes(5)

export const isWindowOpen = (startHour: number, now: Date = new Date()) => now.getHours() >= startHour

export const check = Effect.fn("OvernightScheduler.check")(function* (now?: Date) {
  const db = (yield* Database.Service).db
  const config = yield* Config.Service
  const execution = yield* SessionExecution.Service
  const startHour = yield* config.entries().pipe(Effect.map((entries) => Config.latest(entries, "overnight")?.start_hour))
  if (startHour === undefined) return
  if (!isWindowOpen(startHour, now ?? new Date())) return

  const rows = yield* db
    .selectDistinct({ session_id: SessionInputTable.session_id })
    .from(SessionInputTable)
    .where(and(isNull(SessionInputTable.promoted_seq), eq(SessionInputTable.delivery, "overnight")))
    .all()
    .pipe(Effect.orDie)

  yield* Effect.forEach(rows, (row) => execution.wake(SessionSchema.ID.make(row.session_id)).pipe(Effect.ignore))
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service

    const getStartHour = () =>
      config.entries().pipe(Effect.map((entries) => Config.latest(entries, "overnight")?.start_hour))

    yield* check().pipe(Effect.repeat(Schedule.spaced(CHECK_INTERVAL)), Effect.forkScoped)

    return Service.of({
      startHour: getStartHour(),
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Database.node, Config.node, SessionExecution.node],
})
