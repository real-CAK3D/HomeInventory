# Home Inventory

A family storage app for shelves full of boxes. Snap the storage area, each shelf section, each shelf, each box and what's inside. Then anyone in the family can type, say or scan their way to the exact box: *"blender" → Section 7 › Middle shelf › Box 41*, with the box glowing on a map of the shelves.

**Live:** https://home-inventory-37.vercel.app · **Guide:** [the wiki](https://github.com/real-CAK3D/HomeInventory/wiki) · **Download:** [latest release](https://github.com/real-CAK3D/HomeInventory/releases/latest)

## What it does

- **Find anything.** One big search box with voice input. It forgives typos and plurals and understands `box 12`, `12`, `section 3` and `3-2`. Results show the full path to the item, and **Show me** lights it up on the shelf wall.
- **The shelf wall.** Every section drawn as a rack with its shelves and boxes. Swipe along it like you're walking the aisle, and filter to one person's things.
- **Pack mode.** A guided loop: pick the shelf → photo of the shelf → photo of the box → photo of the inside → type the contents (`4 mugs, blender, knives`) → next box. Box numbers count up on their own.
- **Photos at every level.** The whole area, each section, each shelf, the outside and inside of each box, and each item. Photos are shrunk on the phone, kept for offline use, and stored privately.
- **Family accounts.** Everyone picks their face and types a 4-digit PIN, and stays signed in on their phone. PINs are hashed, wrong guesses lock out for a while, and an admin can reset a PIN or add people.
- **Locks and approvals.** Lock a box or item and nobody else can move, change or remove it without your OK. You get the request in Alerts with big Yes and No buttons, and they hear back. Each person also chooses what happens with their unlocked things: *tell me*, *ask me first* or *don't bother me*.
- **Private things.** Others see only that a private box exists on the shelf, not what's in it.
- **Taken out / put back.** Mark something as taken out (with a note) so everyone knows where it went.
- **Undo and trash.** Every change offers Undo, and removed things wait in the Trash.
- **Works with no signal.** The full inventory lives on each phone. Changes and photos made offline sync on their own later.
- **NFC tags and QR labels.** A tag planner for your 30 tags (one per section, spares for key boxes). On Android it writes the tag straight from the app. Also prints box labels and section signs with QR codes.
- **Easy to read.** Large tap targets, three text sizes, light/dark/automatic themes and a calm-animation option.

## Three ways to use it, one account

| | How | Best for |
|---|---|---|
| **Android app** | Install the `.apk` from the [latest release](https://github.com/real-CAK3D/HomeInventory/releases/latest) | Tapping NFC tags straight into the app |
| **Installed web app** | Open the site in Chrome → ⋮ → *Add to Home screen* (iPhone: Safari → Share → *Add to Home Screen*) | Any phone; no download |
| **Website** | https://home-inventory-37.vercel.app | Computers, tablets, guests |

All three talk to the same server, so the data is always the same everywhere. The Android app is a Trusted Web Activity: it runs the site inside Chrome, so Web NFC, the camera, notifications and offline mode all work. It also shares Chrome's sign-in on that phone.

## How it's built

```
src/            React app (Vite, motion): screens/, ui/, lib/ (offline store, search, NFC, router)
shared/model.js Rules shared by phone and server: ownership, locks, approvals, privacy, wording
server/core.js  The API: sign-in, delta sync, changes with approvals, photos, keep-alive
server/store-*  Storage: Supabase (production) or a local folder (development / NukeBox)
api/*.js        Vercel serverless functions (thin wrappers around server/core.js)
android/        Trusted Web Activity Android app
docs/wiki/      Wiki pages (published to the GitHub wiki by a workflow)
tests/          API rules tests (node --test)
```

The server enforces every rule, not just the phone, so locks and privacy can't be bypassed. Data is stored as JSON records in the Supabase table `hi_records`, and photos go in the private bucket `home-inventory`. A daily Vercel cron pings the database so the free Supabase project doesn't pause.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. With no Supabase keys set, data saves to `Home Inventory/data/` (git-ignored). Everyone's first PIN is `0000`, and the app asks them to pick their own.

```bash
npm test
```

### On the NukeBox (LAN server)

```powershell
.\start-nukebox.ps1
```

Builds the app and serves it on port 5173 to every device on the network, saving to the folder you pass in.

## Deploy (Vercel)

Set these in **Vercel → Project → Settings → Environment Variables**, then redeploy:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://rmshsswlodfvdffnlqdy.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | The **service_role** (or secret) key from Supabase → Project Settings → API |
| `ANDROID_CERT_SHA256` | *(optional)* fingerprint printed by the release workflow |

Never commit real keys. `.env.example` lists every option.

## Releases

Push a tag to build the Android app and publish a GitHub release:

```bash
git tag v2.0.0 && git push origin v2.0.0
```

For a signed release build, add the repo secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`. Without them, the release gets a debug APK, which installs fine. See the wiki page [Android App](https://github.com/real-CAK3D/HomeInventory/wiki/Android-App).

## License

MIT, see [LICENSE](LICENSE).
