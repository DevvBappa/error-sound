# Error Sound

A VS Code extension that plays audio feedback based on your terminal command results — so you know instantly whether your command succeeded or failed, without even looking at the screen.

## Features

- **Error sound** (`fahhh.wav`) — plays when a terminal command exits with a non-zero exit code
- **Success sound** (`heythatprettygood.wav`) — plays when a terminal command exits successfully
- **Smart filtering** — ignores routine commands like `cd`, `clear`, `mkdir`, environment activations (`conda activate`, `nvm use`, `source`), and VS Code task terminals
- **Exit code probing** — for external programs (`node`, `python`, `npm`, `git`, `cargo`, etc.), performs an extra `$LASTEXITCODE` probe to ensure accuracy
- **Debounce batching** — waits 1 second after the last command before playing a sound, so rapid command chains trigger only one sound
- **Cooldown** — prevents the same sound from spamming within 1 second

## How It Works

```
Terminal command finishes
        │
        ├─ Skip? (cd / clear / task terminal / no exit code) ──► ignore
        │
        ▼
Check exit code
        │
        ├─ External program? ──► probe $LASTEXITCODE for real exit code
        │
        ▼
Batch results (debounce 1s)
        │
        ├─ Any error? ──► fahhh.wav        + ❌ error message
        └─ All good?  ──► heythatprettygood.wav + ✅ info message
```

## Requirements

- **Windows** with PowerShell available (used for `.wav` playback via `play.ps1`)
- VS Code with **shell integration** enabled (enabled by default in modern VS Code)

## Extension Settings

This extension does not contribute any configurable settings currently.

## Known Issues

- Sound playback relies on PowerShell and is **Windows only** in the current implementation
- Shell integration must be active in the terminal for exit codes to be captured; some custom shell setups may disable it

## Release Notes

### 1.0.0

Initial release — terminal error/success sound feedback with smart filtering, exit code probing, debounce batching, and cooldown.
