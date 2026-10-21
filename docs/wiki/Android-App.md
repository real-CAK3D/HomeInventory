# Android App, Web App, Website

There are three ways to open Home Inventory. They all use the **same sign-in and the same data**, so a box added on Dad's phone shows up on everyone's within seconds.

## 1. Android app

1. On the phone, open the [latest release](https://github.com/real-CAK3D/HomeInventory/releases/latest).
2. Download **HomeInventory-vX.Y.Z.apk** and open it.
3. If Android asks, allow your browser to *install unknown apps*.
4. Open **Inventory** from the home screen.

The app runs the site inside Chrome (a *Trusted Web Activity*). That means NFC writing, the camera, alerts and offline mode work exactly like the website, and an NFC tag or QR label opens straight into the app. It shares Chrome's sign-in on that phone.

> If you see a thin address bar at the top, the app isn't linked to the site yet. See *Full-screen linking* below. Everything still works.

## 2. Installed web app (any phone)

- **Android:** open the site in Chrome → ⋮ → **Add to Home screen** / **Install app**.
- **iPhone:** open the site in Safari → Share → **Add to Home Screen**.

It gets its own icon, opens full-screen and works offline.

## 3. Website

Open **https://home-inventory-37.vercel.app** on anything with a browser.

## For Andrew: building releases

Releases build on their own when a version tag is pushed:

```bash
git tag v2.0.1
git push origin v2.0.1
```

GitHub Actions runs the tests, builds the APK (and an AAB for Google Play), and publishes a release with install instructions.

### Signing (recommended)

Without a signing key, each release gets a **debug** APK. It installs fine, but a phone can't upgrade from one debug build to the next unless both were signed the same way. To sign properly, make an upload key once:

```bash
keytool -genkeypair -v -storetype pkcs12 -keystore upload.p12 -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Then add these **repository secrets** (GitHub → Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_B64` | `base64 -w0 upload.p12` output |
| `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
| `ANDROID_KEY_ALIAS` | `upload` |

Keep `upload.p12` and its password safe. You need the same key for every update.

### Full-screen linking

Each release run prints the signing key's **SHA-256 fingerprint** in its summary. Put it in the Vercel environment variable `ANDROID_CERT_SHA256` and redeploy. The site then serves `/.well-known/assetlinks.json`, and the app drops its address bar. If you use Google Play app signing, add Play's fingerprint too, separated by a comma.
