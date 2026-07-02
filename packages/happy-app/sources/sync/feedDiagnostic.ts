// feedDiagnostic — parse-failure diagnostics for POLLED honest feeds (CKP-08).
//
// console.log ON PURPOSE, never console.error/warn: these feeds already
// degrade honestly (stale → useHonestFeed's LOUD-guard → FeedUnreachable on
// the plane), so the human-facing signal is the plane, not the console. In a
// dev build, console.error feeds LogBox's red toast — which is how a raw zod
// dump with a climbing count ended up on the daily-driver surface (the
// 2026-07-02 audit's ~24/min error storm). A polled feed that fails schema
// parse every cycle must stay a console diagnostic, not a screaming overlay.
//
// Scope: polled infra feeds only (congress roster/relay/kanban, backlog,
// heartbeat, disk, vram, warden). One-shot user flows (friends, artifacts,
// persistence, encryption) keep console.error — a failure there is a real
// defect the developer should see loudly, not a liveness blip.
export function feedDiagnostic(feed: string, error: unknown): void {
    const summary = error instanceof Error
        ? error.message.split('\n').slice(0, 6).join('\n')
        : String(error);
    console.log(`[honest-feed] ${feed}: response failed schema parse (plane renders unreachable): ${summary}`);
}
