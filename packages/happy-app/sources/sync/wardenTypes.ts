import { z } from 'zod';

// Warden knock-card types (Hearth — P1 RELATE layer).
//
// Mirrors GET /v1/warden, which projects ~/.happy-selfhost/for-carlos.json. Each
// item is an ask a lane left for Carlos. The client renders these as knock-cards
// (a note a person left, never an alert) and NEVER writes the queue — the server
// owns the file. Answering routes through POST /v1/warden/answer (Slice A — the
// write-path). `kind` drives the card's accent: 'gate' blocks (red edge),
// 'routine' is optional (lilac edge). An item with `a` set is answered/closed.

// A discrete choice on a gate ask (loom's tap-a-choice affordance). OPTIONAL and
// additive: present -> render one-tap chips with the lane's recommendation cued
// (never auto-selected); absent -> degrade to free-text quick-reply. Tolerated
// now even though the server GET doesn't project it yet — dark-safe until a lane
// (reaper's A/B first) populates it.
export const WardenChoiceSchema = z.object({
    key: z.string(),
    label: z.string(),
    recommended: z.boolean().nullish(),
});

export const WardenItemSchema = z.object({
    id: z.string(),
    from: z.string(),
    q: z.string(),
    ts: z.string().nullable(),
    kind: z.string().nullable(),
    ctx: z.string().nullable(),
    ref: z.string().nullable(),
    choices: z.array(WardenChoiceSchema).nullish(),
    a: z.string().nullable(),
    answered_ts: z.string().nullable(),
});

export const WardenResponseSchema = z.object({
    stale: z.boolean(),
    items: z.array(WardenItemSchema),
});

// POST /v1/warden/answer — the write-path contract (server owns the file; the
// server shells the canonical for-carlos.mjs answer verb). `alreadyAnswered` is a
// benign idempotent double-submit, not an error.
export const WardenAnswerResponseSchema = z.object({
    ok: z.boolean(),
    alreadyAnswered: z.boolean(),
});

export type WardenChoice = z.infer<typeof WardenChoiceSchema>;
export type WardenItem = z.infer<typeof WardenItemSchema>;
export type WardenResponse = z.infer<typeof WardenResponseSchema>;
export type WardenAnswerResponse = z.infer<typeof WardenAnswerResponseSchema>;

// Client-only view of a knock-card: the server item plus the local answer
// lifecycle. `pending` = answered optimistically, POST in flight / not yet
// reflected by the poll; `failed` = the POST failed, the draft answer is kept so
// Carlos can retry. Neither field ever comes from the server.
export type WardenCardItem = WardenItem & {
    pending?: boolean;
    failed?: boolean;
};
