import { z } from 'zod';

// Disk gauge types (Hearth — MONITOR pillar, the resilience HUD). Mirrors GET /v1/disk,
// which projects the disk-sentinel feed into a clean wire shape (the device-health-raw-
// shape coupling lives in ONE place — the server route). Read-only.
//
// Two honesty layers: the WHOLE feed unreachable/too-old -> response.stale (the client
// LOUD-guard); a single BOX the sentinel couldn't probe -> reachable:false + reason
// (rendered as "blind to this box" DATA, not a dead-whole-feed).

export const DiskDriveSchema = z.object({
    id: z.string(),
    role: z.string().nullable(),
    sizeGB: z.number().nullable(),
    usedGB: z.number().nullable(),
    freeGB: z.number().nullable(),
    pctUsed: z.number().nullable(),
    status: z.string().nullable(),          // green | warn | act
    fillRateGBPerDay: z.number().nullable(), // level+RATE
    etaToActDays: z.number().nullable(),     // time-to-impact (honest-null when flat)
    note: z.string().nullable(),             // a drive's standing caveat (e.g. shared-partition risk)
});

export const DiskBoxSchema = z.object({
    box: z.string(),
    reachable: z.boolean(),
    reason: z.string().nullable(),          // WHY a box is unreachable (honest)
    drives: z.array(DiskDriveSchema),
});

export const DiskViewSchema = z.object({
    thresholds: z.object({
        warn: z.number().nullable(),        // pctUsed warn line
        act: z.number().nullable(),         // pctUsed act line
    }),
    boxes: z.array(DiskBoxSchema),
});

export const DiskResponseSchema = z.object({
    stale: z.boolean(),
    view: DiskViewSchema.nullable(),
});

export type DiskDrive = z.infer<typeof DiskDriveSchema>;
export type DiskBox = z.infer<typeof DiskBoxSchema>;
export type DiskView = z.infer<typeof DiskViewSchema>;
export type DiskResponse = z.infer<typeof DiskResponseSchema>;
