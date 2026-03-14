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
```

| Field | Description |
|-------|-------------|
| `llm.model` | Model name (any OpenAI-compatible model) |
| `llm.baseUrl` | API endpoint (supports OpenRouter, copilot-api, etc.) |
| `llm.apiKey` | API key (leave empty for self-hosted endpoints) |

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

## Workers

Workers live in `~/.sisyphus/workers/`. Each worker is a directory with a `soul.md` defining its capabilities:

```
~/.sisyphus/workers/
  coder/
    soul.md    # "You are a coding assistant..."
```

A default `coder` worker is created on first run. Add more by creating new directories with a `soul.md`.

## Architecture

```
CLI → Unix Socket → Daemon → Orchestrator (LLM) → Worker (child process)
```

- **Daemon** — always-on background process, HTTP server on Unix Socket
- **Orchestrator** — understands intent, delegates to workers
- **Workers** — specialized agents (child processes), each with own identity
- **Sessions & Tasks** — persisted as JSON in `~/.sisyphus/data/`
