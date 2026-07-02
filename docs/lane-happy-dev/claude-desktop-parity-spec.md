# Claude Desktop -> Happy UI parity spec

North-star: Happy's UI reaches 1:1 feature parity with Claude Desktop's user-facing UX + UI toggles, where applicable to Happy's role as a self-hosted Claude-CODE client (mobile/Expo-web/Tauri-desktop) driving coding sessions + a congress of seats. Parity != blind copy — chat-consumer-only features are cataloged but flagged, not silently dropped.

Audited: `happy/packages/happy-app/sources` (components/, app/(app)/, settings screens) on 2026-06-30.

---

## 1. Claude Desktop UX + toggle inventory (cited)

### 1.1 Top-level surface
- Three-tab structure: **Chat** (conversation, projects, memory, artifacts — no local file access) / **Cowork** (Dispatch, longer agentic work) / **Code** (software development) [O-mega: Claude Desktop, Cowork & Code](https://o-mega.ai/articles/claude-desktop-cowork-and-code-complete-guide)
- Model selector in the chat composer — current lineup includes Sonnet/Opus variants; older Opus versions get retired from the picker over time [Claudefa.st changelog](https://claudefa.st/blog/guide/changelog)

### 1.2 Conversation management
- **New chat**: Cmd/Ctrl+N [FastShortcuts cheat sheet](https://fastshortcuts.com/shortcuts/claude/)
- **Search conversations**: Cmd/Ctrl+K; searches **titles only**, not content [AI Chat Importer guide](https://ai-chat-importer.com/blog/how-to-organise-your-claude-ai-conversations)
- **Rename**: click the title in the sidebar [AI Chat Importer guide](https://ai-chat-importer.com/blog/how-to-organise-your-claude-ai-conversations)
- **Star/pin**: a "Starred" sidebar section for important conversations [AI Chat Importer guide](https://ai-chat-importer.com/blog/how-to-organise-your-claude-ai-conversations)
- **Branch**: every edit/retry creates a tree branch; UI exposes only a tiny "‹ 2/3 ›" version-arrow stepper — one path visible at a time [AI Chat Importer guide](https://ai-chat-importer.com/blog/how-to-organise-your-claude-ai-conversations)
- **Share**: "Share" button top-right -> generates a shareable link; private by default, unshare available [Claude Help Center: Share and unshare chats](https://support.claude.com/en/articles/10593882-share-and-unshare-chats)
- **Export**: full account-level export via profile icon -> download — ZIP of structured JSON, not a per-chat export [AI Chat Importer guide](https://ai-chat-importer.com/blog/how-to-organise-your-claude-ai-conversations)
- **Delete**: implied standard chat-management action (not separately sourced this pass — low-risk catalog gap, see §4 needs-eyes list)

### 1.3 Settings & preferences
- **Appearance**: Settings -> Appearance (theme) [Claude Help Center: Customizing your appearance settings](https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings)
- **Memory**: viewable/editable at Settings -> Capabilities -> Memory; can be disabled [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)
- **Data/privacy controls**: conversation-data retention opt-out at Settings -> Privacy -> Data Usage, separate from memory toggle [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)
- **Custom instructions / profile**: user-level instruction storage (CLAUDE.md-style for Code; profile custom-instructions field for chat) [Code docs: Desktop application](https://code.claude.com/docs/en/desktop)
- **Keyboard shortcuts**: Cmd/Ctrl+N new chat, Cmd/Ctrl+K search, Cmd/Ctrl+Enter send, Cmd/Ctrl+, settings; desktop app additionally has quick session-switching and a command palette [FastShortcuts cheat sheet](https://fastshortcuts.com/shortcuts/claude/), [MindStudio: Claude Code Desktop App](https://www.mindstudio.ai/blog/claude-code-desktop-app-features)
- **Notifications**: system notification support exists; exact toggle surface not confirmed this pass -> **needs eyes-ground-truth**

### 1.4 MCP / connectors / integrations
- **Connectors**: MCP servers with a GUI setup flow for quick integration (Asana, Google Calendar, Slack, etc.) [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/), [Toolradar: MCP Server Setup 2026](https://toolradar.com/blog/claude-desktop-mcp-server-setup)
- MCP available on Pro/Max/Team/Enterprise; artifacts can call MCP-connected services interactively [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)
- Enterprise-managed MCP connector provisioning via identity provider (Okta) — org-admin feature, out of Happy's individual-user scope [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)
- Local config file fallback: `claude_desktop_config.json` (per-OS path) for manual MCP server registration [Claude Lab: Desktop App Complete Guide](https://claudelab.net/en/articles/claude-ai/claude-desktop-app-complete-guide-2026)

### 1.5 Artifacts / canvas
- Dedicated artifacts space: documents, code snippets, visualizations, small web apps, interactive elements generated mid-chat [Claude Help Center: What are artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them), [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)
- Artifacts now also surface inside **Claude Code** sessions as live shareable web pages (PR walkthroughs, incident pages, dashboards, checklists) — directly relevant since Happy is a Code client [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)
- Artifacts can connect to MCP for read/write interactivity [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)

### 1.6 Projects + project knowledge
- Projects: organize chats by topic; per-project shared context (custom instructions + uploaded knowledge files e.g. style guide, API docs, coding standards) auto-inherited by every conversation in the project [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)

### 1.7 File / image / screenshot upload
- File uploads supported in chat composer alongside web search and artifacts [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/) — exact screenshot-capture-to-chat affordance not independently confirmed -> **needs eyes-ground-truth**

### 1.8 Voice
- Voice mode (launched ~March 2026), invoked via `/voice`, available on desktop app [Suprmind: Claude Features 2026 / aggregated changelog search]
- Exact settings surface (language picker, mic permissions, voice selection) not confirmed this pass -> **needs eyes-ground-truth**

### 1.9 Extended thinking toggle
- Composer-level "Extended thinking" toggle — deeper reasoning before responding, slower but higher-quality on complex tasks [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/), [Platform docs: Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)

### 1.10 Web search toggle
- Web search toggle in chat — pulls real-time info; available on all plans, Pro/Max get priority [Suprmind: Claude Features 2026](https://suprmind.ai/hub/claude/features/)

### 1.11 Usage / context indicators
- Not separately documented in this pass for the consumer desktop app (usage indicators are better documented for Claude Code/API context); Claude Code surfaces context-window/usage indicators in-session [Code docs: Desktop application](https://code.claude.com/docs/en/desktop) -> **needs eyes-ground-truth** for exact consumer-app indicator UI

---

## 2. Happy current-UX inventory (source-grounded)

Paths relative to `happy/packages/happy-app/sources/`.

- **Model/mode selection**: `components/modelModeOptions.ts`, `components/PermissionModeSelector.tsx`, `app/(app)/settings/agents.tsx` — per-agent (Claude/Codex/Gemini/OpenClaw) default model, effort level, permission mode, with per-session override via `AgentInput.tsx`.
- **Sessions (= conversations)**: `components/SessionsList.tsx`, `components/SessionsListWrapper.tsx`, `components/ActiveSessionsGroupCompact.tsx`.
  - Actions (`hooks/useSessionQuickActions.ts`, `components/SessionActionsPopover.tsx`, `SessionActionsNativeMenu.*`): **details, resume (cross-machine), fork** (git-branch icon — spins a new session off current state), **duplicate, copy-metadata, copy-metadata+logs, archive** (destructive). No rename, no star/pin, no delete-with-share-link, no per-conversation export.
  - `components/DuplicateSheet.tsx` — duplicate-session flow.
- **Search**: `app/(app)/friends/search.tsx` (people search), `components/CommandPalette/*` (Cmd/Ctrl+K-style: New Session, View All Sessions, Settings, Account, Connect Device, jump-to-recent-session, Sign Out, Developer Menu — web-only per `settings/features.tsx` `commandPaletteEnabled` flag). No conversation-content search; no title search confirmed in this pass.
- **Settings** (`app/(app)/settings/*`, `components/SettingsView.tsx`):
  - `account.tsx` — identity (anonymous ID, public ID), link new device (QR), profile (GitHub), connected services (Anthropic/Gemini/OpenAI), secret-key backup reveal/copy, analytics opt-out, push-notification permission management + registered push-token list with per-token delete, logout.
  - `appearance.tsx` — theme (adaptive/light/dark cycle), language picker, inline-tool-calls toggle, expand-todo-lists, show-line-numbers (diffs + tool views), wrap-lines-in-diffs, diff style (split/unified), always-show-context-size, avatar style (pixelated/gradient/brutalist), show-flavor-icons. (Text size / font / accent color / compact mode are present in code but commented out / `disabled`.)
  - `voice.tsx` + `voice/language.tsx` — usage bars (seconds + conversation count vs plan limit), BYO custom ElevenLabs agent ID, bypass-token toggle, language picker, dev-only experiment overrides.
  - `agents.tsx` — per-agent (claude/codex/gemini/openclaw) default model / effort / permission-mode overrides.
  - `features.tsx` — File Diffs Sidebar toggle, group-tool-calls toggle, experimental-features master toggle, markdown-copy-v2, hide-inactive-sessions, resume-disconnected-session toggle, image-upload (experimental), analytics opt-out (duplicate of account.tsx), web-only: enter-to-send, command-palette-enabled.
  - `language.tsx` — app-language picker (9 languages, see CLAUDE.md i18n section).
  - `usage.tsx` — `components/usage/UsagePanel.tsx`, `UsageChart.tsx`, `UsageBar.tsx` — cost/usage tracking (`SessionCostBadge.tsx`, `ContextGauge.tsx`).
  - `connect/claude.tsx` — OAuth connect flow for Claude Code account linking.
  - About section (in `SettingsView.tsx`): What's New/changelog, GitHub link, report issue, privacy policy, terms, EULA, version.
- **MCP**: tool-call **rendering only** — `components/tools/views/MCPToolView.tsx` displays MCP tool calls made by the underlying CLI session. No MCP server registration/connector GUI in Happy itself (by design: MCP config lives in Claude Code on the host machine, not in the Happy client).
- **Artifacts**: full feature — `app/(app)/artifacts/index.tsx` (list, FAB to create), `artifacts/new.tsx`, `artifacts/[id].tsx`, `artifacts/edit/[id].tsx`.
- **Projects / project knowledge**: no equivalent screen found. Happy's unit is a "session" tied to a working directory/machine, not an Anthropic-style Project with uploaded knowledge files + shared custom instructions.
- **File/image upload**: `components/AgentInputAttachmentStrip.tsx`, gated behind experimental `expImageUpload` flag in `features.tsx`.
- **Voice**: full first-class feature — `VoiceAssistantStatusBar.tsx`, `VoiceBars.tsx`, realtime LiveKit integration (per root CLAUDE.md), dedicated settings screens.
- **Extended-thinking toggle**: not found as a discrete Happy UI toggle (effort level in `agents.tsx` is the closest analog — maps to CLI-level reasoning effort, not a per-message thinking toggle).
- **Web-search toggle**: not found in Happy UI (web search is a Claude-Code-CLI/tool-permission concern, not exposed as a Happy chat-composer toggle).
- **Context/usage indicators**: strong existing coverage — `ContextGauge.tsx`, `DiskGauge.tsx`, `VramGauge.tsx`, `SessionCostBadge.tsx`, `alwaysShowContextSize` setting.
- **Keyboard shortcuts**: `useGlobalKeyboard` (web-only per root CLAUDE.md) backs the command palette; no dedicated keybindings-customization settings screen found (cf. desktop `keybindings-help` skill exists at the *Claude Code CLI* tooling layer, not in Happy's own UI).
- **Notifications**: push-notification permission + token management in `account.tsx`; no granular per-event notification-preference toggles (e.g. mute specific sessions) found.

---

## 3. Parity matrix + PR-shaped gap items

| # | Claude Desktop feature | Happy status | Gap | PR-shaped item |
|---|---|---|---|---|
| 1 | Rename conversation | ABSENT | No rename action on sessions anywhere in `useSessionQuickActions.ts` | **"Add session rename action"** — scope: add `id:'rename'` entry to `useSessionQuickActions.ts` + prompt-modal (reuse `Modal.prompt` pattern from `voice.tsx`'s custom-agent-ID flow) + sync op to persist session title override. files: `hooks/useSessionQuickActions.ts`, `sync/ops.ts`, `sync/storageTypes.ts`. |
| 2 | Star/pin conversation | ABSENT | No starred/pinned session concept in `SessionsList.tsx` | **"Add session star/pin + Starred section"** — scope: boolean flag per session, sort/section in `SessionsList.tsx`, toggle in `useSessionQuickActions.ts`. files: `components/SessionsList.tsx`, `hooks/useSessionQuickActions.ts`, `sync/storageTypes.ts`. |
| 3 | Share conversation (link) | ABSENT | No share/public-link flow | **"Add session share-link generation"** — scope: share action + backend endpoint for a read-only session snapshot link, unshare control. files: `hooks/useSessionQuickActions.ts`, new `sync/apiShare.ts`, settings/account privacy section for "shared sessions" list. Needs backend (`happy-server`) support — cross-package scope, flag for sequencing. |
| 4 | Export conversation | ABSENT | No per-session or account-level export | **"Add session export (Markdown/JSON)"** — scope: export action in session menu, client-side serialize-to-file using existing message/event log already in `sync/reducer/`. files: `hooks/useSessionQuickActions.ts`, new `utils/exportSession.ts`. |
| 5 | Conversation content search | PARTIAL | Command palette only matches recent-session titles (`CommandPaletteProvider.tsx`); no full-text search across message history | **"Add full-text session/message search"** — scope: extend `CommandPaletteResults.tsx` + a dedicated search screen indexing local decrypted message cache. files: `components/CommandPalette/*`, new `app/(app)/search/index.tsx`. |
| 6 | Branch / version stepper on edit-retry | PARTIAL | `fork` action exists (spins a new session) but no inline "‹ 1/3 ›" edit-and-retry version stepper on a single message | **"Add message-edit branch stepper"** — scope: UI to show/cycle sibling branches on `MessageView.tsx` after a user edits+resends a turn (Happy's per-session edit semantics differ from chat.ai's per-message tree — confirm CLI/protocol support before committing scope). files: `components/MessageView.tsx`, `sync/reducer/reducer.ts`. flagged: needs protocol-level check, see §4 applicability. |
| 7 | Notifications fine-grained preferences | PARTIAL | Push token registration/permission exists (`account.tsx`); no per-session/per-event mute or notification-type toggles | **"Add per-event notification preferences"** — scope: notification-type checklist (new message, permission request, session done, error) in `account.tsx` or new `settings/notifications.tsx`. files: `app/(app)/settings/account.tsx` or new screen, `sync/pushRegistration.ts`. |
| 8 | Keyboard shortcuts customization screen | ABSENT (Happy UI layer) | `useGlobalKeyboard` exists but no discoverable in-app shortcuts reference/editor (cf. Claude Code CLI's own `~/.claude/keybindings.json` is a different layer/product) | **"Add keyboard-shortcuts help/reference screen"** — scope: read-only shortcuts list screen (web-first, since `useGlobalKeyboard` is web-only), low-effort. files: new `app/(app)/settings/shortcuts.tsx`. |
| 9 | Artifacts in Projects-style shared-knowledge context | N/A vs PRESENT | Happy has full artifacts (PRESENT, arguably exceeds parity since artifacts are first-class screens not chat-embedded panels) | No gap — note as strength, not action item. |
| 10 | Projects + project knowledge (shared custom instructions + uploaded docs per project) | ABSENT | No grouping-of-sessions-by-project with inherited context/knowledge files | **"Add Project grouping with shared context"** — scope: new entity wrapping multiple sessions under one working-directory/repo, with a knowledge-files upload + shared custom-instructions field inherited by sessions in that group. Largest item on this list — files: new `sync/projectTypes.ts`, new `app/(app)/project/[id].tsx`, `components/SessionsList.tsx` grouping logic. Needs design pass before scoping further — flag for Carlos. |
| 11 | Memory (Settings -> Capabilities -> Memory, viewable/editable) | ABSENT | No equivalent of chat.ai persistent cross-conversation memory surfaced in Happy settings | Applicability flag — see §4 (memory in Happy's context would mean CLAUDE.md/session-continuity files on the host, which Happy already surfaces indirectly via file browsing; a literal "Memory" settings panel may not map). Catalog only, no PR yet — ask Carlos. |
| 12 | Extended-thinking toggle (composer-level) | PARTIAL | `agents.tsx` exposes "effort level" per agent default (closest analog) but no per-message/per-turn quick-toggle in the composer | **"Add per-turn extended-thinking quick-toggle"** — scope: toggle button in `AgentInput.tsx` next to model selector, wired to CLI's reasoning-effort flag for the turn. files: `components/AgentInput.tsx`, `components/modelModeOptions.ts`. |
| 13 | Web-search toggle (composer-level) | ABSENT | No composer-level web-search on/off; web search in Happy's context is a Claude-Code tool-permission setting, not a per-message toggle | Applicability flag — see §4. If wanted, scope would be a permission-mode-adjacent toggle, not a new tool. |
| 14 | Data-retention / privacy controls (Settings -> Privacy -> Data Usage) | PARTIAL | Analytics opt-out exists (`account.tsx`, `features.tsx` — duplicated, minor cleanup opportunity) but no conversation-data-retention control | **"Add data-retention privacy control"** — scope: depends on what Happy server actually retains; needs a backend audit first. files: TBD pending backend audit. |
| 15 | Custom instructions / profile (chat.ai-style) | ABSENT (Happy UI layer) | Happy relies on CLAUDE.md on the host machine (correct for a Code client) — no Happy-side "custom instructions" profile field | Applicability flag — likely correctly out of scope; CLAUDE.md IS Happy's equivalent, just host-side not client-side. Catalog only. |
| 16 | MCP connector GUI (add/configure MCP servers) | ABSENT (Happy UI layer) | Happy only renders MCP tool-call results (`MCPToolView.tsx`); no add/manage-connector flow | Applicability flag — see §4. MCP config is normally edited in Claude Code's own config/settings on the host, not the Happy client; a Happy-side MCP manager would be a meaningful scope expansion, not a small gap-fill. Flag for Carlos rather than auto-PR. |
| 17 | Delete conversation | PARTIAL/UNCLEAR | `archive` (destructive) exists; unclear if archive == delete or a soft-state; no confirmed hard-delete action | **"Clarify/add explicit delete vs archive distinction"** — scope: audit `sessionArchive`/`sessionKill` semantics in `sync/ops.ts`, add explicit delete if archive is non-destructive soft-hide. files: `sync/ops.ts`, `hooks/useSessionQuickActions.ts`. |
| 18 | Theme/appearance settings | PRESENT | Adaptive/light/dark, avatar style, diff style, line numbers, etc. — meets/exceeds parity | No gap. |
| 19 | Account/profile + connected services | PRESENT | GitHub, Anthropic, Gemini, OpenAI connections, secret-key backup, push management — meets/exceeds parity (push-token granularity exceeds chat.ai) | No gap. |
| 20 | Voice mode | PRESENT | Full LiveKit-backed voice with usage tracking, BYO agent — meets/exceeds parity | No gap. |
| 21 | Usage/context indicators | PRESENT | `ContextGauge`, `SessionCostBadge`, `UsagePanel` — meets/exceeds parity (chat.ai's own indicator UI wasn't even confirmable this pass) | No gap. |
| 22 | File/image upload | PARTIAL | Exists but gated behind experimental flag (`expImageUpload`) | **"Graduate image-upload out of experimental flag"** — scope: stability review, then flip default-on or remove flag. files: `app/(app)/settings/features.tsx`, `components/AgentInputAttachmentStrip.tsx`. |
| 23 | Screenshot-to-chat capture | UNCLEAR | Not confirmed present or absent this pass | Needs eyes-ground-truth (both sides) — see §4. |

### Top-5 PR-shaped gaps by leverage (lean, independently shippable, high user-visible value)
1. Add session rename action (#1)
2. Add session star/pin + Starred section (#2)
3. Add full-text session/message search (#5)
4. Add per-turn extended-thinking quick-toggle (#12)
5. Add session export (Markdown/JSON) (#4)

---

## 4. Applicability flags + needs-eyes-ground-truth list

### Applicability flags (parity != blind copy — catalog, don't silently drop)
- **MCP connector GUI** (#16): Claude Desktop's GUI connector flow is consumer-grade onboarding for non-technical users connecting SaaS tools. Happy's MCP config naturally lives in Claude Code on the host (the actual MCP client). Building a Happy-side MCP manager would mean either (a) remote-editing the host's MCP config over the wire, or (b) duplicating config. Real scope decision — flag for Carlos, don't auto-build.
- **Projects + project knowledge** (#10): chat.ai Projects = shared-context container for casual chat threads. Happy's "session" is already scoped to a working directory + machine, which is a different (arguably stronger) grouping primitive. A literal port may be redundant with existing directory/machine grouping — needs a design conversation, not a blind port.
- **Memory** (#11): chat.ai's cross-conversation memory is chat-consumer-only; Happy's analog is CLAUDE.md + session continuity on the host filesystem, which Happy already exposes via file browsing. A "Memory" settings panel may be solving an already-solved problem in a different shape.
- **Web-search toggle** (#13): in chat.ai this is a first-party Anthropic-hosted tool; in Happy's context it's a Claude Code CLI tool-permission concern (allow/deny `WebSearch` in permission mode), already partially covered by `PermissionModeSelector.tsx`. A composer-level toggle would need to map to that permission system, not duplicate it.
- **Branch/version stepper** (#6): chat.ai's tree-branching is per-message-edit; Happy's `fork` is per-session. Confirm whether Claude Code's session protocol even supports message-level branching before scoping a literal port.
- **Custom instructions/profile** (#15): correctly satisfied today by CLAUDE.md on the host — flagged as already-equivalent, not a gap, but worth confirming with Carlos that no Happy-side mirror/editor is wanted for convenience.

### Needs eyes-ground-truth (observe claude.ai / installed desktop app directly)
- Exact notification-settings surface (toggle granularity, where it lives in Settings)
- Screenshot-to-chat capture affordance (is there a native "paste screenshot" or capture button distinct from file upload?)
- Exact usage/context-window indicator UI in the consumer chat surface (vs. Claude Code's own, which is better documented)
- Delete-conversation action — exact label/location/confirmation flow (couldn't confirm via search this pass)
- Voice mode settings surface in the installed app (language picker, mic permission flow, voice selection) — only the `/voice` invocation and launch date were confirmed
- Whether the three-tab Chat/Cowork/Code structure exposes different settings per tab or one global settings surface
