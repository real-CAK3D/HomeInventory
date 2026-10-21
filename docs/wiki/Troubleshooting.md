# Troubleshooting

**"That PIN is not right" / "Taking a short break"**: after 5 wrong tries, the app waits before the next one, and the wait grows with each miss. Andrew can reset a PIN under **Me → People**.

**I can't change a box**: it's probably locked by someone else. Make the change anyway and the app sends them a request. Check the owner's name on the box page.

**A box says "Private"**: it belongs to someone who made it private. You can see where it sits, but not what's inside.

**The NFC Write button is missing**: writing tags needs Chrome on Android (or the Android app). Elsewhere, copy the link and use the NFC Tools app. See [[NFC Tags and Labels]].

**The tag doesn't open anything**: turn NFC on in the phone settings. Hold the tag to the *middle of the back* of the phone for a second. Use **Check a tag** to see what's on it.

**The Android app shows an address bar**: the app isn't linked to the site yet. See *Full-screen linking* in [[Android App]].

**"Opening your inventory…" never finishes**: check the internet. If it's a brand-new phone with no signal, it needs to connect once before it can work offline.

**The site says the database isn't set up**: the Vercel environment variables are missing. See [[Admin Setup]].

**Something got removed by mistake**: **Me → Trash → Bring back**.
