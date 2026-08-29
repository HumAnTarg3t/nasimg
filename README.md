# nasimg

Organises media files from a NAS or fileshare into date-based folders. On each run it scans a source directory for supported media (jpg, jpeg, png, heic, mp4, mov) and moves each file into a `YYYY-MM-DD` folder in the destination, named after the file's **capture date**:

1. **Images** — EXIF `DateTimeOriginal` (wall-clock time at capture, taken verbatim)
2. **Videos** — QuickTime `CreationDate`/`CreateDate` (stored as UTC, converted to your home timezone so a 23:30 video doesn't land in tomorrow's folder)
3. **Fallback** — the file's modification time (local date) when no metadata exists

On the homelab server it runs as a systemd oneshot service triggered every 5 minutes.

## Direction

Uploads land in `original_file_path` (e.g. `/mnt/nas/sorting`); the sorted library is `new_file_path` (e.g. `/mnt/nas/photos`).

## Safety behaviour

- **Files still uploading are left alone** — anything modified in the last `MIN_AGE_MINUTES` (default 10) is skipped until a later run.
- **Cross-filesystem moves are verified** — copy to a temp name, size-check against a fresh stat of the source, rename into place, and only then delete the source. A crash at any point leaves the original intact.
- **Nothing is ever deleted on a name collision.** Same name + same size → the file is moved to `<destination>/duplicates/YYYY-MM-DD/` for manual review. Same name + different content → it is moved as `name-1.jpg`, `-2`, …
- **Config is validated before anything runs** — both paths must exist (an unmounted share aborts the run instead of writing to the local disk), be distinct, and not be nested in each other.
- **Failed files mark the run as failed** — the process exits non-zero so `systemctl status nasimg-main` actually shows breakage.

## Prerequisites

- Node.js ≥ 22 (required by `exiftool-vendored`)
- perl (used by the vendored ExifTool)
- Source and destination paths accessible on the filesystem (NAS paths mounted via CIFS — see [server/README-MOUNT.md](../Raspberry-Pi-stuff/server/README-MOUNT.md))

## Setup

```sh
cp .env_git .env
npm install
```

Edit `.env`:

```
original_file_path = /mnt/nas/sorting   # where uploads land
new_file_path      = /mnt/nas/photos   # the sorted library
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

On the server, the sanctioned manual run is `sudo systemctl start nasimg-main.service` (systemd serializes it against the timer). Avoid running `npm start` directly on the server while the timer is active.

Logs are written to `./logs/YYYY-MM-DD.log` and to stdout (`journalctl -u nasimg-main` on the server).

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

Pushing to `main` triggers `.github/workflows/deploy.yml` on the homelab server's self-hosted runner. It validates the GitHub vars and runtime (Node ≥ 22, perl), stops the timer, installs dependencies **before** syncing source (a failed install never leaves broken code live), syncs with `rsync --delete`, writes `.env`, smoke-checks the config against the real mounts, and restores the timer to its previous state.

**One-time setup:**

1. Register the server's self-hosted runner (labels `self-hosted,srv`) to this repository under Settings → Actions → Runners.
2. Add repository variables under Settings → Secrets and variables → Actions → Variables:
   - `ORIGINAL_FILE_PATH` — source path (e.g. `/mnt/nas/sorting`)
   - `NEW_FILE_PATH` — destination path (e.g. `/mnt/nas/photos`)
   - `TZ_HOME` — optional, IANA timezone for video dates (e.g. `Europe/Oslo`)
   - `DRY_RUN`, `MIN_AGE_MINUTES`, `CONCURRENCY` — optional; set them here rather than editing `.env` on the server, because every deploy rewrites `.env` from these vars

**Host hardening:**

1. Node 22 and `perl` — installed by `Raspberry-Pi-stuff/server/bootstrap.sh`; the deploy pre-flights both and fails without them.
2. `nasimg-main.service` (in `Raspberry-Pi-stuff/server/systemd/`) carries:
   ```
   RequiresMountsFor=/mnt/nas/sorting /mnt/nas/photos
   ```
   systemd refuses to start a run while either share is unmounted. `loadConfig()` already aborts in that case, so this is a second line of defence — but it fails at the unit level, where `systemctl status nasimg-main` shows it plainly. **These paths must match the `ORIGINAL_FILE_PATH` and `NEW_FILE_PATH` variables**; changing one without the other stops the timer firing at all.
3. **Not applied — known trade-off.** The runner account currently has `NOPASSWD: ALL`, matching what the previous host actually had. The narrow per-command alternative was never sufficient for the deploy workflows, and tightening it across all of them is deferred to its own change. Push access to `main` executes code on the server; keep the repo private and branch-protect `main`.

## Logs and cleanup

Daily logs live in `/srv/nasimg/logs/`. A systemd timer runs `cleanup-logs.sh` daily to delete logs older than 30 days. The same lines go to journald (`journalctl -u nasimg-main`).

Check the `duplicates/` folder in the destination occasionally — it collects files that already existed with identical name and size.
