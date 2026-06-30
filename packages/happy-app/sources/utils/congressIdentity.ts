import { CongressSeat } from '@/sync/congressTypes';

// The Hearthside identity line: role, with the pedal (the lane's current thread)
// appended when present — e.g. "BUILD lane · happy-dev". Shared by every surface
// that renders a session's title (SessionsList's full row, ActiveSessionsGroupCompact's
// compact row) so a seat's honest identity never disagrees between them — PR-15.
export function congressIdentity(seat: CongressSeat): string {
    const role = seat.role?.trim();
    const pedal = seat.pedal?.trim();
    if (role && pedal) return `${role} · ${pedal}`;
    return role || pedal || seat.seat;
}
