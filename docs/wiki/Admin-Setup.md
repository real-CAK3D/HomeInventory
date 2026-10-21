# Admin Setup

## 1. Database (one time)

The app keeps its data in the **TheGarden** Supabase project, so no extra project is needed:

- table `public.hi_records`: every section, box, thing, person, request and notice as a JSON record. Row-level security is on with no client access; only the server can read or write it.
- private storage bucket `home-inventory`: the photos.

Both already exist. To set them up somewhere else, run the SQL in `supabase/hi_records.sql`.

A daily Vercel cron calls `/api/cron`, which pings the database so the free Supabase plan doesn't pause it.

## 2. Vercel environment variables

**Vercel → home-inventory → Settings → Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://rmshsswlodfvdffnlqdy.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → TheGarden → Project Settings → API keys → **service_role** / secret key |
| `ANDROID_CERT_SHA256` | optional, see [[Android App]] |

Remove the old variables that pointed at the paused "Home Inventory" project (`HOME_INVENTORY_STATE_PATH`, and any old `SUPABASE_URL` / `SUPABASE_SECRET_KEY` values), then **Redeploy**.

To check it: `https://home-inventory-37.vercel.app/api/cron` should say `"ok": true, "store": "supabase"`.

## 3. People

The first sign-in creates **Andrew** (admin), **Victoria**, **Cork** and **Zayne**, each with PIN `0000`. Everyone picks their own PIN the first time they sign in.

**Me → People** lets you add someone, reset a forgotten PIN (back to `0000`), make someone an admin, or remove someone. Removing a person keeps their things in the inventory.

## 4. Build the shelves

**Me → Shelf setup.** Choose how many sections (for example 15) and name the shelves top to bottom (default: *Top shelf, Middle shelf, Bottom shelf, Floor*). Tap **Build**. Later, open any section → **Edit** to give it a nickname or room, or to add or remove a shelf.

Number the units left to right and put a sign or tag on each. See [[NFC Tags and Labels]].

## 5. Backups

**Me → Save a backup** downloads everything (except notices) as a JSON file. Removed things also wait in the Trash, and Supabase keeps its own backups.
