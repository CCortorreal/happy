import { z } from 'zod';

// Congress relay types (cockpit-v2 RELAY plane, 2026-07-02).
//
// Mirrors a future GET /v1/congress/relay response — the inter-seat message
// log (PA broadcast + direct relay traffic; see the building's relay log
// mechanism in the mission's building mechanism map). Mission A3: a
// newest-last feed of [ts, from, to, excerpt] rows the RELAY plane renders
// in the tail's mono style.
//
// Route does not exist server-side yet (grepped: no /v1/congress/relay in
// congressRoutes.ts as of this commit) — same honest-not-yet-backed posture
// as congressKanbanTypes.ts: this client codes against the wire contract now,
// and getCongressRelay's non-OK fallback (stale:true, items:[]) renders as an
// honest empty section via useHonestFeed, never a fabricated feed.

export const CongressRelayItemSchema = z.object({
    id: z.string(),
    ts: z.number().nullable(),
    from: z.string(),
    to: z.string(),
    excerpt: z.string(),
});

export const CongressRelayResponseSchema = z.object({
    ts: z.number().nullable(),
    stale: z.boolean(),
    // Newest-last (oldest -> newest), matching the mono tail's reading order
    // (see useLaneTail.ts's reverse() convention this plane mirrors).
    items: z.array(CongressRelayItemSchema),
});

export type CongressRelayItem = z.infer<typeof CongressRelayItemSchema>;
export type CongressRelayResponse = z.infer<typeof CongressRelayResponseSchema>;
