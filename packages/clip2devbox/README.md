# @devorama/clip2devbox

[![npm version](https://img.shields.io/npm/v/@devorama/clip2devbox.svg)](https://www.npmjs.com/package/@devorama/clip2devbox)
[![npm downloads](https://img.shields.io/npm/dm/@devorama/clip2devbox.svg)](https://www.npmjs.com/package/@devorama/clip2devbox)
[![license](https://img.shields.io/npm/l/@devorama/clip2devbox.svg)](https://github.com/rafito/devtools/blob/main/LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows-blue.svg)](#requirements)

Send a **clipboard file or screenshot** from Windows to a remote **devbox** over Tailscale + `scp`, then swap your clipboard for the **remote path prefixed with `@`** — ready to paste straight into Claude Code / ttyd.

**Flow:** copy (`Ctrl+C` a file · `Win+Shift+S` a screenshot · "copy link") → press `Ctrl+Alt+V` → in Claude on the devbox run `/clip` (or paste the `@/home/you/clips/...` path with `Ctrl+V` and hit Enter).

It handles three clipboard sources, in priority order:

1. **Bitmap** on the clipboard (screenshot, "copy image" from a browser, Paint/Photoshop) → uploaded as a `.png`
2. **File(s)** copied in Explorer — **any type** (PDF, `.csv`, source code, `.zip`, …), uploaded as-is, multiple supported
3. **URL** ("copy link/address") — downloaded and re-uploaded (filename inferred from `Content-Disposition`/URL)

Files larger than `--max-file-mb` (default 100 MB) are skipped with a warning.

## Requirements

- **Windows** (native clipboard + global hotkey)
- **Tailscale** running, with the devbox reachable and **Tailscale SSH** enabled (passwordless auth)
- `ssh`/`scp` on `PATH` (OpenSSH ships with Windows 10/11)
- On the devbox: Linux with `crontab` (for cleanup) and Claude Code (for `/clip`)

## Install

```bash
npm install -g @devorama/clip2devbox   # or: pnpm add -g @devorama/clip2devbox
clip2devbox install
```

`install` detects the devbox host via Tailscale (peer `devbox`), writes your `~/.ssh/config`, validates the connection, provisions the remote side (`~/clips`, the `/clip` slash command, and a cron cleanup job), and registers the global hotkey.

### Options

```bash
clip2devbox install \
  --host devbox.tailXXXX.ts.net \   # default: auto-detected via Tailscale
  --peer devbox \                   # Tailscale peer name to look for
  --alias devbox \                  # Host alias written to ~/.ssh/config
  --remote-user rafito \            # default: your local Windows username
  --remote-dir /home/rafito/clips \ # default: /home/<user>/clips
  --hotkey CTRL+ALT+V \             # global hotkey combination
  --retention-hours 24 \            # delete clips older than this
  --max-file-mb 100 \               # max size per file (0 = no limit)
  --progress-min-mb 5 \             # show a progress bar above this (0 = never)
  --no-auto-update                  # disable background auto-update
```

## Commands

| Command | What it does |
|---------|--------------|
| `clip2devbox install` | Set everything up (idempotent) |
| `clip2devbox run` | Run the action now (same as the hotkey) — handy for testing |
| `clip2devbox uninstall` | Remove the hotkey and local script |
| `clip2devbox uninstall --remote` | The above + remove `/clip` and the cron job on the devbox |

On the devbox, after any upload:

- `/clip` → load the most recent file from `~/clips` into context (image, PDF, text, …)
- `/clip 3` → load the 3 most recent files

## Feedback

- **High beep** + toast → uploaded
- **Low beep** + toast → error (empty clipboard, invalid URL, file over the limit, devbox unreachable, …)
- Large file (above `--progress-min-mb`, default 5 MB) → a **progress bar** during upload

## Auto-update

After a successful upload the script checks **once a day** (in the background, without delaying anything) whether a newer version is on npm. If there is, it runs `npm i -g` (or `pnpm add -g`) followed by `clip2devbox install` on its own. Disable it with `--no-auto-update` at install time. Auto-update only kicks in **after you've updated once** to a version that ships it (≥ 0.3.0).

## How it works

`install` renders a PowerShell script to `%LOCALAPPDATA%\clip2devbox\clip2devbox.ps1` with the host, directory, size limits, and version baked in, then creates a `.lnk` shortcut in the Start Menu bound to the global hotkey. Authentication is inherited from **Tailscale SSH**, so `scp` never prompts for a password. Cleanup is a single `crontab` line on the devbox (tagged `# clip2devbox-cleanup`).

## License

[MIT](./LICENSE) © Rafael D'Arrigo
