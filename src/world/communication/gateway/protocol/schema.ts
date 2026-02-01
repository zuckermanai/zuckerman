import { Type, type Static } from "@sinclair/typebox";

// Protocol primitives
export const NonEmptyString = Type.String({ minLength: 1 });

// Request/Response types
export const GatewayRequest = Type.Object({
  type: Type.Optional(Type.Literal("req")), // Optional for backward compatibility
  id: Type.String(),
  method: NonEmptyString,
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export const GatewayResponse = Type.Object({
  type: Type.Optional(Type.Literal("res")), // Optional for backward compatibility
  id: Type.String(),
  ok: Type.Boolean(),
  result: Type.Optional(Type.Unknown()),
  error: Type.Optional(
    Type.Object({
      code: Type.String(),
      message: Type.String(),
    }),
  ),
});

export const GatewayEvent = Type.Object({
  type: Type.Literal("event"),
  event: NonEmptyString,
  payload: Type.Optional(Type.Unknown()),
});

export type GatewayRequest = Static<typeof GatewayRequest>;
export type GatewayResponse = Static<typeof GatewayResponse>;
export type GatewayEvent = Static<typeof GatewayEvent>;

// Health check response
export const HealthSnapshot = Type.Object({
  ts: Type.Number(),
  uptime: Type.Number(),
  version: Type.String(),
  status: Type.Union([
    Type.Literal("healthy"),
    Type.Literal("degraded"),
    Type.Literal("unhealthy"),
  ]),
});

export type HealthSnapshot = Static<typeof HealthSnapshot>;
