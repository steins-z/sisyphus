# Sisyphus

Local AI agent orchestrator — Spotlight-style interaction, daemon architecture, task delegation to specialized workers.

## Install

```bash
git clone git@github.com:steins-z/sisyphus.git
cd sisyphus
pnpm install
pnpm run build
```

Run directly:
```bash
node dist/cli/index.js <command>
```

Or link globally:
```bash
pnpm link --global
sisyphus <command>
```

## Configuration

First run auto-creates `~/.sisyphus/config.yaml`:

```yaml
llm:
  provider: openai
  model: claude-opus-4.6
  baseUrl: "http://localhost:4141/v1"
  apiKey: ""
daemon:
  socketPath: ~/.sisyphus/sisyphus.sock
  dashboardPort: 3847
```

| Field | Description |
|-------|-------------|
| `llm.model` | Model name (any OpenAI-compatible model) |
| `llm.baseUrl` | API endpoint (supports OpenRouter, copilot-api, etc.) |
| `llm.apiKey` | API key (leave empty for self-hosted endpoints) |
| `daemon.dashboardPort` | TCP port for Web Dashboard (default: 3847) |

## Usage

### Daemon

```bash
sisyphus daemon start    # Start background daemon
sisyphus daemon stop     # Stop daemon
sisyphus daemon status   # Check daemon status
```

### Chat (interactive)

```bash
sisyphus chat            # Continue last session
sisyphus chat --new      # Start new session
```

Type `/new` in chat to start a fresh session.

### Fire & Forget

```bash
sisyphus "write a python calculator"
```

Submits task to daemon and exits. Check progress with `sisyphus tasks`.

### Tasks & Status

```bash
sisyphus tasks           # List all tasks
sisyphus tasks --watch   # Auto-refresh every 2s
sisyphus result <id>     # Show task result (supports partial ID)
sisyphus status          # Daemon info + task summary
```

### Dashboard

```bash
sisyphus dashboard       # Open Web Dashboard in browser
```

Web Dashboard at `http://localhost:3847/dashboard` — dark theme UI with real-time task updates via SSE. Views: System status, Sessions, Tasks, Workers.

### Logs

```bash
sisyphus logs            # Show last 50 lines of daemon log
sisyphus logs -n 100     # Show last 100 lines
sisyphus logs -f         # Follow log output (like tail -f)
```

### Agents

```bash
sisyphus agents list                          # List registered workers
sisyphus agents create myworker -d "desc"     # Create a new worker
sisyphus agents delete myworker --force       # Delete a worker
```

### Spotlight UI (macOS)

Build and run the native macOS app:

```bash
cd SisyphusUI
swift build
.build/debug/SisyphusUI
```

Or open `SisyphusUI/Package.swift` in Xcode.

**Keyboard shortcuts:**
- **⌥ Space** — Toggle Sisyphus panel
- **Return** — Send prompt (fire & forget)
- **⌘ Return** — Send and open chat mode
- **Esc** — Close panel
- Type `/new` — Start fresh session

The app runs in the menu bar (no Dock icon). Requires the Sisyphus daemon to be running.

## Workers

Workers live in `~/.sisyphus/workers/`. Each worker is a directory with a `soul.md` defining its capabilities:

```
~/.sisyphus/workers/
  coder/
    soul.md    # "You are a coding assistant..."
```

A default `coder` worker is created on first run. Add more with `sisyphus agents create` or manually by creating new directories with a `soul.md`.

## Notifications

On macOS, native notifications are automatically sent when tasks complete or fail (via `osascript`). No configuration needed.

## Token Usage

LLM token consumption is tracked per request. Query via API:

```bash
curl http://localhost:3847/api/usage
```

## Data Management

Sessions and tasks are persisted as JSON in `~/.sisyphus/data/`. Rolling cleanup runs on daemon startup (keeps 100 most recent sessions, 500 most recent tasks).

## Architecture

```
CLI → Unix Socket → Daemon → Orchestrator (LLM) → Worker (child process)
```

- **Daemon** — always-on background process, HTTP server on Unix Socket
- **Orchestrator** — understands intent, delegates to workers
- **Workers** — specialized agents (child processes), each with own identity
- **Sessions & Tasks** — persisted as JSON in `~/.sisyphus/data/`

### iMessage Bridge

Send messages to Sisyphus via iMessage. Configure in `~/.sisyphus/config.yaml`:

```yaml
imessage:
  enabled: true
  handle: "+1234567890"  # or email@icloud.com
  pollInterval: 2000
```

Start the bridge:
```bash
sisyphus imessage start    # Run in foreground
sisyphus imessage status   # Check configuration
```

Requires Full Disk Access permission for reading the Messages database.
