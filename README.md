# nasimg

Organises media files from a NAS or fileshare into date-based folders. On each run it scans a source directory for supported media (jpg, jpeg, png, heic, mp4, mov), creates `YYYY-MM-DD` subdirectories in the destination based on each file's modification date, and moves the files there. Duplicate files at the destination are skipped.

On the Raspberry Pi it runs as a systemd oneshot service triggered every 5 minutes.

## Prerequisites

- Node.js ≥ 18
- Source and destination paths accessible on the filesystem (NAS paths mounted via CIFS — see [pimachine/README-MOUNT.md](../Raspberry-Pi-stuff/pimachine/README-MOUNT.md))

## Setup

```sh
cp .env_git .env
```

Edit `.env` and fill in both paths:

```
original_file_path = /mnt/photos
new_file_path      = /mnt/sorting
```

Install dependencies:

```sh
npm install
```

## Running locally

```sh
npm start
```

Logs are written to `./logs/YYYY-MM-DD.log` and to stdout.

## How it works

1. **foundation** — reads `original_file_path` recursively, filters to supported extensions, builds a list of `{ path, fileName }` objects
2. **createFolders** — stats each file, collects unique modification dates, creates `YYYY-MM-DD` directories in `new_file_path`
3. **moveFiles** — moves each file into its date folder; falls back from `rename` to copy+delete for cross-filesystem moves; skips files that already exist at the destination

## Deployment

Pushing to `main` triggers the GitHub Actions workflow in `.github/workflows/deploy.yml`. It copies the app files to `/home/piuser/nasimg/` on the Pi and runs `npm ci --omit=dev`.

**One-time setup:** the Pi's self-hosted runner must be registered to this repository under Settings → Actions → Runners. The `.env` file on the Pi is not touched by the workflow.

## Logs and cleanup

Daily logs live in `/home/piuser/nasimg/logs/`. A systemd timer runs `cleanup-logs.sh` daily to delete logs older than 30 days.
