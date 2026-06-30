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

// A structured command on a terminal gate (Carlos's feedback, infra's `ask
// --commands`). OPTIONAL and additive — exact mirror of `choices`: present ->
// render each command individually copyable with its explainer; absent -> the
// operational wall stays as prose behind the details-fold. Dark-safe until a lane
// authors structured commands. `explain` is the plain-language "what this does".
export const WardenCommandSchema = z.object({
    cmd: z.string(),
    explain: z.string().nullish(),
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
    commands: z.array(WardenCommandSchema).nullish(),
    a: z.string().nullable(),
    answered_ts: z.string().nullable(),
    // Withdraw/supersede (safety: superseded != live). superseded_by/withdrawn_ts/
    // withdraw_reason mark the DEAD (prior) card -> dimmed + un-answerable. `supersedes`
    // is the forward pointer on the LIVE winner card (the prior id it replaces) -> an
    // optional quiet 'replaces [id]' badge. snake_case, matching the for-carlos store.
    withdrawn_ts: z.string().nullish(),
    superseded_by: z.string().nullish(),
    withdraw_reason: z.string().nullish(),
    supersedes: z.string().nullish(),
    // Cascade edge: card ids this ask is BLOCKED ON. The staged card-model render
    // derives 'BLOCKING N downstream' per gate from these. Dark-safe, defaults absent.
    dependsOn: z.array(z.string()).nullish(),
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

// PR-30 Slice 1 — the honest-death pip's data source. Mirrors GET /v1/warden/status,
// a thin passthrough of warden-status.json (the watch loop's heartbeat). `ts` is the
// ONLY field the pip trusts for liveness — the client ages it against its own clock
// every tick; `overall`/`checks` are carried for the later watched-floor slice but
// Slice 1 doesn't render them.
export const WardenCheckSchema = z.object({
    status: z.string(),
    detail: z.string().nullable(),
});

export const WardenStatusResponseSchema = z.object({
    stale: z.boolean(),
    ts: z.string().nullable(),
    overall: z.string().nullable(),
    checks: z.record(z.string(), WardenCheckSchema).nullable(),
});

export type WardenCheck = z.infer<typeof WardenCheckSchema>;
export type WardenStatusResponse = z.infer<typeof WardenStatusResponseSchema>;

export type WardenChoice = z.infer<typeof WardenChoiceSchema>;
export type WardenCommand = z.infer<typeof WardenCommandSchema>;
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
