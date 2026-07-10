# nasimg

Organises media files from a NAS or fileshare into date-based folders. On each run it scans a source directory for supported media (jpg, jpeg, png, heic, mp4, mov) and moves each file into a `YYYY-MM-DD` folder in the destination, named after the file's **capture date**:

1. **Images** — EXIF `DateTimeOriginal` (wall-clock time at capture, taken verbatim)
2. **Videos** — QuickTime `CreationDate`/`CreateDate` (stored as UTC, converted to your home timezone so a 23:30 video doesn't land in tomorrow's folder)
3. **Fallback** — the file's modification time (local date) when no metadata exists

On the Raspberry Pi it runs as a systemd oneshot service triggered every 5 minutes.

## Direction

Uploads land in `original_file_path` (e.g. `/mnt/sorting`); the sorted library is `new_file_path` (e.g. `/mnt/photos`).

## Safety behaviour

- **Files still uploading are left alone** — anything modified in the last `MIN_AGE_MINUTES` (default 10) is skipped until a later run.
- **Cross-filesystem moves are verified** — copy to a temp name, size-check against a fresh stat of the source, rename into place, and only then delete the source. A crash at any point leaves the original intact.
- **Nothing is ever deleted on a name collision.** Same name + same size → the file is moved to `<destination>/duplicates/YYYY-MM-DD/` for manual review. Same name + different content → it is moved as `name-1.jpg`, `-2`, …
- **Config is validated before anything runs** — both paths must exist (an unmounted share aborts the run instead of writing to the SD card), be distinct, and not be nested in each other.
- **Failed files mark the run as failed** — the process exits non-zero so `systemctl status nasimg-main` actually shows breakage.

## Prerequisites

- Node.js ≥ 22 (required by `exiftool-vendored`)
- perl (preinstalled on Raspberry Pi OS; used by the vendored ExifTool)
- Source and destination paths accessible on the filesystem (NAS paths mounted via CIFS — see [pimachine/README-MOUNT.md](../Raspberry-Pi-stuff/pimachine/README-MOUNT.md))

## Setup

```sh
cp .env_git .env
npm install
```

Edit `.env`:

```
original_file_path = /mnt/sorting   # where uploads land
new_file_path      = /mnt/photos    # the sorted library
```

Optional settings (defaults in parentheses):

```
TZ_HOME         = Europe/Oslo   # timezone used to date videos (machine's zone)
DRY_RUN         = 0             # 1 = log planned actions, move nothing
MIN_AGE_MINUTES = 10            # settle window for in-progress uploads
CONCURRENCY     = 2             # parallel file operations
```

## Running

```sh
npm start
```

Try a change safely first with `DRY_RUN=1 npm start` — it logs every planned move without touching a file.

On the Pi, the sanctioned manual run is `sudo systemctl start nasimg-main.service` (systemd serializes it against the timer). Avoid running `npm start` directly on the Pi while the timer is active.

Logs are written to `./logs/YYYY-MM-DD.log` and to stdout (`journalctl -u nasimg-main` on the Pi).

## Tests

```sh
npm test
```

Uses Node's built-in test runner — no extra dependencies. Covers config validation, scanning, date resolution (against real fixture files in `test/fixtures/`), collision planning, verified moves, and an end-to-end integration run.

## Code layout

| Module | Responsibility |
|---|---|
| `lib/config.js` | env validation, fail-fast |
| `lib/scanner.js` | recursive media discovery (real files only — symlinks/dirs excluded) |
| `lib/dateResolver.js` | capture date from EXIF/QuickTime, mtime fallback |
| `lib/planner.js` | pure decisions: settle window, duplicate/suffix policy |
| `lib/executor.js` | verified moves, quarantine, dry-run, per-file error isolation |
| `lib/queue.js` | bounded-concurrency pool |
| `lib/logger.js` | timestamped, sanitized file + console logging |
| `main.js` | thin wiring |

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml` on the Pi's self-hosted runner. It validates the GitHub vars and runtime (Node ≥ 22, perl), stops the timer, installs dependencies **before** syncing source (a failed install never leaves broken code live), syncs with `rsync --delete`, writes `.env`, smoke-checks the config against the real mounts, and re-enables the timer.

**One-time setup:**

1. Register the Pi's self-hosted runner to this repository under Settings → Actions → Runners.
2. Add repository variables under Settings → Secrets and variables → Actions → Variables:
   - `ORIGINAL_FILE_PATH` — source path on the Pi (e.g. `/mnt/sorting`)
   - `NEW_FILE_PATH` — destination path on the Pi (e.g. `/mnt/photos`)
   - `TZ_HOME` — optional, IANA timezone for video dates (e.g. `Europe/Oslo`)
   - `DRY_RUN`, `MIN_AGE_MINUTES`, `CONCURRENCY` — optional; set them here rather than editing `.env` on the Pi, because every deploy rewrites `.env` from these vars

**Pi-side hardening (one-time, manual):**

1. Upgrade to Node 22 LTS and check `perl -v` works.
2. Add to the `[Unit]` section of `nasimg-main.service`:
   ```
   RequiresMountsFor=/mnt/sorting /mnt/photos
   ```
   systemd then refuses to start a run while a share is unmounted — without this, a dead mount silently no-ops (source) or risks filling the SD card (destination).
3. Scope the runner user's sudoers entry to exactly `systemctl stop nasimg-main.timer` and `systemctl start nasimg-main.timer` — not `NOPASSWD:ALL`. Push access to `main` executes code on the Pi; keep the repo private and branch-protect `main`.

## Logs and cleanup

Daily logs live in `/home/piuser/nasimg/logs/`. A systemd timer runs `cleanup-logs.sh` daily to delete logs older than 30 days. The same lines go to journald (`journalctl -u nasimg-main`).

Check the `duplicates/` folder in the destination occasionally — it collects files that already existed with identical name and size.
