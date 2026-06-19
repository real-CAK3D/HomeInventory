# Home Inventory

Family inventory app for NFC tags, shared dashboard access, profile PINs, shelf/bin locations, item status history, and public tag pages.

The app can run two ways:

- Vercel production: `/api/state` stores the shared inventory JSON in a private Supabase Storage bucket.
- Local Nukebox fallback: `server.js` stores the shared inventory JSON in a local `Home Inventory/inventory-data.json` file.

## Vercel Setup

Set these environment variables in Vercel. Do not commit real secret values to git.

```text
SUPABASE_URL=https://hdjicmuhhcmcdtqlmfsn.supabase.co
SUPABASE_SECRET_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
HOME_INVENTORY_BUCKET=home-inventory
HOME_INVENTORY_STATE_PATH=state.json
```

The serverless API creates the private Supabase Storage bucket on first use if it does not already exist. The browser never receives the service-role key.

Dashboard/login:

```text
https://home-inventory-37.vercel.app/
```

NFC tag examples:

```text
https://home-inventory-37.vercel.app/tag/001
https://home-inventory-37.vercel.app/tag/005
```

## Local Nukebox Run

```powershell
.\start-nukebox.ps1
```

The local server listens on `0.0.0.0:5173`, so phones on the same network use the Nukebox LAN address, for example:

```text
http://NUKEBOX-IP-ADDRESS:5173
```

`127.0.0.1` only works on the device running the server. On a phone, `127.0.0.1` means the phone itself.

## Login

Profiles are Andrew, Zayne, Victoria, and Cork. Each profile starts with PIN `0000`; after first login the app prompts for a new 4 digit PIN and verification.

## Commands

```bash
npm install
npm run build
npm run serve
```
