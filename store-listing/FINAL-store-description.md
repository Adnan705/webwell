# WebWell 1.9.0: Chrome Web Store listing (final)

This file replaces store-listing/plus-listing-text.md and store-listing/permissions-text.md (both are now marked superseded). Paste the text between the BEGIN and END lines. Everything between those lines is plain text: no markdown, no HTML.

Facts this text relies on (change them here and on https://webwell.app/plus together): price $10 lifetime, one payment, no subscription; seller Adnan Khan, independent developer; payments by Paddle (seller of record); key checked offline in the extension; free history is the last 120 days.

Open items for the owner before pasting: see section F at the end.

---

## A. Short summary (max 132 characters)

=====BEGIN SUMMARY=====
A calm new tab with focus timer, music, site blocking and private screen time. Free. Optional Plus upgrade.
=====END SUMMARY=====

(107 characters. Alternative: "Calm new tab, focus timer, music, site blocking and private screen time. Free, with an optional $10 Plus upgrade." is 113 characters.)

---

## B. Detailed description (plain text, about 4,500 characters, limit 16,000)

=====BEGIN DESCRIPTION=====
WebWell is a calm new tab for Chrome and Brave. It gives you a clock, a daily focus and tasks, a focus timer with music, site blocking when you want it, and honest numbers about where your time goes. Your browsing data stays on your device. No account, no ads, no tracking.

WebWell is free and open source. An optional paid upgrade, WebWell Plus, adds more. Everything that is free today stays free. Details are in the PAID UPGRADE section below.

WHAT YOU GET, FREE
- A calm new tab: a big clock, a greeting, your focus for the day, tasks, quick links and a landmark photo that changes daily
- Save any page to your new tab with the bookmark button in the toolbar popup
- Focus sessions: a full-screen timer with calming sound. Sites you marked as distracting are blocked until the session ends
- Music on your new tab: Spotify (through Spotify's own player) and SoundCloud, lofi radio, offline rain, soft noise and wave sounds, and a heart button to save songs
- Private screen-time tracking: time per website, a daily score, streaks and a 24-hour rhythm. Only the active tab counts, and time stops when you are idle. The last 120 days are kept
- Protect: an adult-content filter, a short-video blocker (YouTube Shorts, Reels, TikTok and more), your own block list, a mindful pause before distracting sites, and a parent PIN
- Daily time limits and gentle alerts
- Export, import or reset your data any time in Settings
- Ask WebWell (optional): chat with your own stats using your own Google Gemini key

PAID UPGRADE: WEBWELL PLUS (OPTIONAL)
WebWell Plus is an optional upgrade. It costs $10, paid once. There is no subscription and no account. You can use the whole free extension without ever buying it.

Plus adds:
- Block schedules: block distracting sites on a timetable, such as weekdays 9 to 5
- Strict focus mode: a session cannot be ended early (there is an emergency exit)
- Intent check: say why you are going to a blocked site before it opens
- Earn your break: win minutes on a blocked site for each focus session you finish
- Weekly and monthly reports with trends and comparisons
- Unlimited history (free keeps the last 120 days), with CSV export and print to PDF
- Focus presets for study, deep work and wind-down
- Sound mixer: layer rain, cafe, fire, waves and more with your own volumes
- Extra themes, backgrounds and clock styles
- Focus garden and streaks
- AI weekly coach: a short plan built from your own numbers, using your own Google AI key. Only a short summary is sent, and only when you press the button

HOW PLUS IS SOLD AND UNLOCKED
- The seller is Adnan Khan, an independent developer. Google is not the seller.
- Payments are processed by Paddle, the merchant of record, on https://webwell.app/plus, not inside the browser extension. WebWell never sees your card details.
- After you pay, a license key is emailed to you. You paste it into WebWell (Dashboard, Plus) and it unlocks.
- The key is checked offline, inside the extension. Nothing is sent anywhere to unlock Plus.
- Terms: https://webwell.app/terms. Refunds: https://webwell.app/refund.

PRIVACY AND PERMISSIONS, IN PLAIN WORDS
- Chrome's install prompt shows one line: "Change the page you see when you open a new tab". WebWell is your new tab page.
- Everything else is optional and asked only when you turn the feature on, and you can say no:
  - Screen-time tracking (tabs, web navigation, site icons): lets WebWell see which site is in your active tab so it can count your time. Chrome may word this as "read your browsing history". It never leaves your device. If you leave it off, there are no screen-time stats, but the timer, music, tasks and backgrounds still work
  - Alerts (notifications): only if you want limit or focus reminders
  - Access to all sites: only if you switch on site blocking or short-video hiding
  - SoundCloud and Spotify: only when you play from them
  - Google AI: only if you use the optional AI chat or the Plus weekly coach with your own key
- Your stats, settings and saved songs live in your browser's local storage. There are no WebWell servers that receive your browsing data.
- WebWell records the website name and the seconds, not full addresses, page titles or page content.
- Uninstalling WebWell deletes everything it stored.
- No remote code: all code is in the package.

OPEN SOURCE
WebWell is MIT licensed. Read every line: https://github.com/Adnan705/webwell

SUPPORT
Website and help: https://webwell.app
Email: info.adnanak@gmail.com
Privacy policy: https://webwell.app/privacy
=====END DESCRIPTION=====

---

## C. What's new in 1.9.0 (release notes)

=====BEGIN WHATS NEW=====
New: WebWell Plus, an optional upgrade ($10 once, no subscription) with block schedules, strict focus mode, intent check, earn your break, weekly and monthly reports, unlimited history with CSV export and print to PDF, focus presets, a sound mixer, extra themes, a focus garden with streaks and an AI weekly coach.
Everything that was free is still free. Plus is sold on webwell.app by Adnan Khan through Paddle, and its key is checked offline inside the extension, so nothing is sent anywhere to unlock it.
Also from 1.8.3: save any page to your new tab with the bookmark button in the popup, and music moves on to the next saved song by itself.
=====END WHATS NEW=====

---

## D. Privacy practices tab

### D1. Single purpose

> WebWell is a calm new tab with a focus timer, music, site blocking and private screen-time tracking, to help people focus and see where their browsing time goes. WebWell Plus is an optional upgrade that adds more features for the same purpose.

### D2. Permission justifications (current manifest, version 1.9.0)

Required permissions (granted at install):

- storage: Saves the user's settings, tasks, stats, saved songs and the Plus key in the browser's local extension storage. Nothing is sent to a server.
- activeTab: Used only by the toolbar popup's "Save this page" button. When the user presses it, WebWell reads the title and address of the current tab to add it to the new tab dock. It is not used at any other time.
- idle: Pauses screen-time counting when the user steps away or the screen locks, so idle time is not counted.
- alarms: Runs the focus-session and break timers and the daily reset of the counters.
- offscreen: Keeps music and generated ambient sounds (rain, noise, waves) playing after the new tab is closed. Manifest V3 service workers cannot play audio.
- declarativeNetRequestWithHostAccess: Blocks or redirects distracting sites, the adult-content list and short-video feeds using the browser's own rules. It only works on sites the user has granted access to, and WebWell does not read the pages.
- scripting: Registers a small content script that hides short-video feeds (for example YouTube Shorts) on sites the user has allowed, when the user turns the short-video blocker on.
- search: The new tab search box runs the search with the user's default search engine.

Optional permissions (requested at runtime, only when the user turns the feature on):

- tabs: Lets WebWell see the address of the active tab so it can count time per website. Requested when the user turns screen-time tracking on.
- webNavigation: Detects page changes so blocked sites can be redirected and time is counted on the right site. Requested with screen-time tracking or blocking.
- favicon: Shows site icons from the browser's own cache in the dashboard. Requested with screen-time tracking.
- notifications: Time-limit alerts and focus reminders. Requested when the user first turns on a limit, alert or focus session.

Optional host permissions (requested at runtime):

- Access to all sites (all URLs): Needed by the browser to redirect a blocked page and to hide short-video feeds. Requested only when the user turns on a blocking feature. WebWell does not read or store page content.
- https://generativelanguage.googleapis.com/*: Sends the user's question and a short stats summary to Google's Gemini API, only when the user uses the optional AI chat or the Plus weekly coach with their own API key.
- https://*.soundcloud.com/* and https://*.sndcdn.com/*: Searches and plays SoundCloud tracks, only when the user plays from SoundCloud.
- https://open.spotify.com/*: Loads Spotify's own embedded player and the names and covers of songs the user pastes, only when the user plays from Spotify.

Other things a reviewer may ask about:

- web_accessible_resources (blocked/blocked.html, blocked/pause.html, matches all URLs): the pages shown when a site is blocked or paused. They contain no user data.
- declarative_net_request rule resource "adult" (disabled by default): the adult-site block list shipped inside the package. The user turns it on.

### D3. Remote code

> No. All JavaScript is bundled in the extension package. WebWell does not download or run remote code. The Plus license key is a signed code that is verified inside the extension with a public key, using the browser's built-in Web Crypto. No script or data is fetched to do this. Payment happens on the website (webwell.app/plus, processed by Paddle), not in the extension.

### D4. Data usage disclosures

What WebWell collects and sends:

- WebWell does not transmit browsing data, personal information or anything else to the developer or to any server the developer runs. Site names and time totals are stored only in the user's local browser storage.
- Plus purchase data (name, email address, order number, payment) is handled by Paddle on the website and by the seller's key-delivery email. The extension itself neither collects nor sends any purchase data. The extension only stores the license key locally.
- The Plus key is checked offline. It is not transmitted.
- Optional AI chat and Plus weekly coach: if the user adds their own Google AI key and asks a question or presses the button, the question and a short summary of their own numbers (site names and time totals) go to Google's API. This is user-initiated and the user's own key is used.

How to fill in the form:

- Chrome's data-usage form is about data the extension collects (transmits off the device) or shares. Because WebWell transmits no user data to the developer, the safest literal answer is to leave every "collects" category unchecked.
- Owner decision (see F): because the optional AI features can send site names and time totals to Google at the user's request, you may prefer to tick "Web history" (and describe it as sent to Google only on user request, with the user's own key) to be conservative. If you do, keep the justification consistent with the privacy policy section "When anything leaves your device".

Certifications (tick all three, as before):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: https://webwell.app/privacy

---

## E. Dashboard checklist for 1.9.0

1. Build the upload zip from D:\Extensions\webwell-store-1.9.0. Check manifest.json says "version": "1.9.0". The folder D:\Extensions\webwell-store-1.9.0 currently contains a `_metadata` folder (Chrome creates it for unpacked extensions): leave it out of the zip, since names starting with an underscore are reserved and can be rejected. Do not include tools/, tests or the key-generation private key.
2. Package tab: upload the zip. Confirm the new version number is higher than the published one.
3. Store listing tab:
   - Paste the summary (A) and description (B). The description must say that the paid upgrade is optional, who sells it and that Paddle processes payments. It does.
   - Category: Productivity. Language: English.
   - Support URL: https://webwell.app. Support email: info.adnanak@gmail.com. Homepage: https://webwell.app.
4. In-app purchase disclosure: in the dashboard, look for the setting "Disclose in-app purchases" (Chrome's help page is titled "Disclose in-app purchases and set visibility"). If it is offered, declare that the item offers paid features outside the store (via the developer's website), not through Chrome Web Store payments. If the dashboard does not show it for this item, rely on the PAID UPGRADE and HOW PLUS IS SOLD AND UNLOCKED sections of the description. Re-check the current Chrome Web Store policy wording before submitting.
5. Screenshots to refresh (1280x800, up to 5; the first three matter most):
   - The new tab (clock, daily focus, music player) with a short caption such as "A calm new tab. Free."
   - The Plus page in the dashboard (feature list and the license key box) with the caption "WebWell Plus: optional, $10 once"
   - A weekly report (Plus): trends, best and worst days
   - The sound mixer (Plus)
   - Protect page or the focus session screen
   Use test data only. Show no real site names the owner would not want public. Do not show a price or "buy now" button that is not live yet.
6. Promo tiles:
   - Small tile (440x280) text: "A calmer new tab" and under it "Focus. Music. Private screen time. Free."
   - Marquee (1400x560) text: "A calmer new tab for Chrome and Brave" and under it "Free and open source. Optional Plus upgrade, $10 once."
7. Privacy practices tab: paste D1 to D4. Confirm the listed permissions match the uploaded manifest exactly (the dashboard reads the manifest).
8. Distribution: public, all regions (or as before). Confirm the privacy policy URL https://webwell.app/privacy loads and says "applies to WebWell 1.9.0".
9. Notes for reviewers (Test instructions box), paste:

=====BEGIN REVIEWER NOTES=====
WebWell is a free new tab extension (focus timer, music, site blocking, private screen-time tracking). All free features work without any key or account.

WebWell Plus is an optional paid upgrade. The seller is the developer (Adnan Khan). Payments are processed by Paddle (merchant of record) on https://webwell.app/plus, outside the extension. The extension has no payment code. A purchase emails a license key. The key is verified offline inside the extension (ECDSA P-256 signature checked with Web Crypto against a public key in lib/plus.js). No network request is made to unlock.

How to test Plus: open the extension's dashboard (click the toolbar icon, then the dashboard link, or right-click the icon and choose Options), open the Plus tab, paste this test key into "Have a Plus key?" and press Activate: [TEST KEY]
The Plus features then unlock (block schedules, strict focus, reports, sound mixer, extra themes). Removing the key on the same page locks them again.

Permissions: only storage, activeTab, idle, alarms, offscreen, declarativeNetRequestWithHostAccess, scripting and search are required. tabs, webNavigation, favicon, notifications and host access (all sites, Google AI, SoundCloud, Spotify) are optional and requested only when the user turns the related feature on. No remote code. Source: https://github.com/Adnan705/webwell
=====END REVIEWER NOTES=====

10. After submitting: confirm the store page and the website agree (price $10, "optional", 120 days free history). Update webwell.app/changelog if 1.9.0 is no longer "In review".

---

## F. Open items for the owner

- Checkout status: https://webwell.app/plus currently says checkout is not open yet. Do not publish a listing that says Plus can be bought until the checkout works, or the reviewer and users will find nothing to buy. If you submit before it opens, remove the HOW PLUS IS SOLD section's present-tense purchase wording or open checkout first.
- [TEST KEY]: generate one with your key tool (no expiry or a long expiry) and replace the placeholder in the reviewer notes.
- Data-usage form: decide whether to tick "Web history" (see D4).
- Screenshots and promo tiles in E5 and E6 need to be made; none exist yet for Plus.
- The permission lists here were checked against both D:\Extensions\webwell-github\manifest.json and D:\Extensions\webwell-store-1.9.0\manifest.json (both version 1.9.0, identical permission lists).
- GitHub: push 1.9.0 so the manifest at github.com/Adnan705/webwell matches what the permissions study and the listing say.
