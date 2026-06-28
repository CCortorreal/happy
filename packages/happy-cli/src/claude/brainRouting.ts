/**
 * brainRouting — selects which "brain" (LLM endpoint) a spawned Claude/Happy
 * seat runs against: the cloud Anthropic API (default) or the local fallback
 * brain (Ollama on the 3090, fronted by an Anthropic-Messages -> /v1 adapter).
 *
 * The seam is pure env injection: Claude Code honors ANTHROPIC_BASE_URL /
 * ANTHROPIC_API_KEY / ANTHROPIC_MODEL, so routing requires NO SDK fork — it just
 * sets those three vars on the spawned process env. `applyBrainEnv()` is the
 * single source of brain-truth, called by BOTH spawn paths (the SDK query and
 * the local PTY launcher) so cloud/local stays consistent across modes.
 *
 * Adapter interface (infra seat-595fbb, 2026-06-27):
 *   ANTHROPIC_BASE_URL = http://localhost:8787   (CC appends /v1/messages)
 *   ANTHROPIC_API_KEY  = any-non-empty           (CC requires it; adapter ignores it)
 *   model              = llama3.1:8b             (pass-through to Ollama; default)
 * The adapter runs on CarlosPC and proxies to the 3090 (upstream
 * http://100.64.0.2:11434/v1). The 8B is the session default — the 30B
 * (qwen3:30b-a3b) is verified-correct but ~1.9 tok/s, too slow for real use.
 * All three values are overridable via HAPPY_LOCAL_BRAIN_URL / _API_KEY /
 * _MODEL (see configuration.ts).
 */

import { configuration } from '@/configuration'
import { logger } from '@/ui/logger'

export type ResolvedBrain = 'cloud' | 'local'

/**
 * Resolve the brain for this run. Decided once at spawn time (never mid-turn)
 * so a single turn never straddles cloud and local.
 */
export function resolveBrain(): ResolvedBrain {
    if (configuration.brainMode === 'local') return 'local'
    // 'auto' = probe cloud reachability and fall back to local — a follow-on.
    // Until that probe exists, 'auto' resolves to cloud (the safe default).
    return 'cloud'
}

/**
 * Mutate the spawned-process env in place to point Claude Code at the local
 * brain, when local routing is active. No-op for cloud — leaves the env (and
 * thus the cloud Anthropic auth) untouched.
 */
export function applyBrainEnv(env: NodeJS.ProcessEnv): void {
    if (resolveBrain() !== 'local') return
    env.ANTHROPIC_BASE_URL = configuration.localBrainUrl
    env.ANTHROPIC_API_KEY = configuration.localBrainApiKey
    env.ANTHROPIC_MODEL = configuration.localBrainModel
    logger.debug(`[brain] routing to LOCAL brain ${configuration.localBrainModel} @ ${configuration.localBrainUrl}`)
}
