# Developer Guide

## Layout

| Path | What |
|---|---|
| `src/main.jsx` | App shell, routes, bottom nav, themes |
| `src/screens/` | Find, Wall, Section, Box, Item, Capture (Pack mode), Alerts, Me (+ People, Activity, Trash), Setup, Tags (+ Labels), Help |
| `src/ui/kit.jsx` | Icons, BoxTile, photo strip and viewer, sheets, toasts, ask() dialogs, confetti |
| `src/ui/pickers.jsx` | Section/shelf/box/owner/category choosers |
| `src/lib/store.js` | Local copy of records (IndexedDB), outbox, sync loop, optimistic changes, undo, photos |
| `src/lib/search.js` | Typo-tolerant search and `box 12` / `3-2` parsing; voice input |
| `src/lib/nfc.js` | Web NFC read/write |
| `shared/model.js` | **Rules used by both phone and server**: `decide()` (apply / request / deny), `viewFor()` (privacy), `describeOp()` (plain-English sentences) |
| `server/core.js` | API handlers: `/api/auth`, `/api/sync`, `/api/mutate`, `/api/photo`, `/api/cron`, assetlinks |
| `server/store-supabase.js` / `store-file.js` | Storage backends with the same interface |
| `api/*.js` | Vercel function wrappers |
| `android/` | Trusted Web Activity (android-browser-helper), built in CI with Gradle |

## Data model

Every record is `{ id, kind, data, updated_at }` in one table:

- `profile`: name, color, emoji, photo, role, prefs (`textSize`, `theme`, `motion`, `onEdit`, `onRemove`, `phoneAlerts`, `sound`)
- `auth:<profileId>`: scrypt PIN hash, failed attempts, lockout (never sent to phones)
- `settings`: household name, categories, area photos, NFC plan
- `section`: number, name, area, photo, `levels[] { id, name, photoId, nfcWrittenAt }`
- `box`: number, name, color, `sectionId`, `levelId`, owner, locked, private, `photoIds`, `contentPhotoIds`, notes
- `item`: name, qty, `boxId` *or* `sectionId`+`levelId`, owner, locked, private, status (`stored` / `out`), photos
- `request`: the proposed change, requester, approver, status
- `notification`, `activity`

Removing sets `deletedAt` (the Trash). Removing a box also marks its contents `deletedWithBox`, so restoring brings them back.

## Changes

The phone sends ops `{ opId, type: create|update|delete|restore|decide|cancel, kind, id, data }` to `/api/mutate`. The server loads the records involved, runs `decide()`, and then either applies the change (writing activity and notices), turns it into a request, or denies it. Ops are idempotent by `opId`, so retries after a network drop are safe.

## Sync

`/api/sync?since=<cursor>` returns records changed since the cursor, with a 15-second overlap. Each record is passed through `viewFor()` for the signed-in person, so private things come back as `{ gone: true }` or redacted.

## Commands

```bash
npm run dev      # app + API on :5173, data in ./Home Inventory/data
npm test         # API rule tests
npm run build    # production bundle in dist/
npm run serve    # NukeBox server (built app + API) on :5173
node scripts/make-icons.mjs   # re-render PNG icons from public/icon.svg
```
