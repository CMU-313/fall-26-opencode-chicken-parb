export * as SessionDelivery from "./session-delivery"

import { Schema } from "effect"

export const Delivery = Schema.Literals(["steer", "queue", "overnight"])
export type Delivery = typeof Delivery.Type
