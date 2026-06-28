import { z } from 'zod';

// Warden knock-card types (Hearth — P1 RELATE layer).
//
// Mirrors GET /v1/warden, which projects ~/.happy-selfhost/for-carlos.json. Each
// item is an ask a lane left for Carlos. The client renders these as knock-cards
// (a note a person left, never an alert) and NEVER writes the queue — the Warden
// owns the file. `kind` drives the card's accent: 'gate' blocks (red edge),
// 'routine' is optional (lilac edge). An item with `a` set is answered/closed.

export const WardenItemSchema = z.object({
    id: z.string(),
    from: z.string(),
    q: z.string(),
    ts: z.string().nullable(),
    kind: z.string().nullable(),
    ctx: z.string().nullable(),
    ref: z.string().nullable(),
    a: z.string().nullable(),
    answered_ts: z.string().nullable(),
});

export const WardenResponseSchema = z.object({
    stale: z.boolean(),
    items: z.array(WardenItemSchema),
});

export type WardenItem = z.infer<typeof WardenItemSchema>;
export type WardenResponse = z.infer<typeof WardenResponseSchema>;
