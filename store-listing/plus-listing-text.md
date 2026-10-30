# WebWell Plus: Chrome Web Store text

> SUPERSEDED by store-listing/FINAL-store-description.md (version 1.9.0). Kept for history only. It lacks the seller and Paddle disclosure and says no new permissions are needed, which is no longer accurate. Do not paste from this file.

Do not paste until payment is live and the extension version with Plus is published.

## 1. Description block (append to the end of the existing description)

```
WEBWELL PLUS (OPTIONAL)
WebWell is free, and everything in it stays free. WebWell Plus is an optional upgrade for people who want more. It is a one-time $10 (launch price), with no subscription and no account.

Plus adds:
• Block schedules: block distracting sites on a timetable
• Strict focus mode: a session cannot be ended early (with an emergency exit)
• Intent check: say why you are opening a blocked site
• Earn your break: win minutes on a blocked site for each focus session you finish
• Weekly and monthly reports with trends and comparisons
• Full history (free keeps the last 120 days), CSV export and print to PDF
• Focus presets: Study, Deep work, Wind down
• Sound mixer: rain, waves, noise, cafe, fireplace, wind and crickets, all generated on your device
• Extra themes, backgrounds and clock styles
• Focus garden and streaks
• AI weekly coach (uses your own Google AI key)

Plus is unlocked with a key that is checked inside the extension, offline. No server is contacted and nothing is sent anywhere. Details: https://webwell.app/plus
```

## 2. What's new (pick one, or use as release notes)

Short:
```
Added WebWell Plus, an optional upgrade ($10 once). Everything that was free stays free.
```

Longer:
```
New: WebWell Plus, an optional upgrade with block schedules, strict focus mode, intent check, earn your break, weekly and monthly reports, full history with CSV export, focus presets, a sound mixer, extra themes, a focus garden and an AI weekly coach.
Everything that was free before is still free.
Plus is unlocked with a key that is checked inside the extension. Nothing is sent anywhere.
```

## 3. Privacy tab: honest answers

Single purpose:
> A calm new tab with a focus timer, music, site blocking and private screen-time tracking. WebWell Plus is an optional upgrade that adds more features to the same purpose.

Remote code:
> No. All code is bundled in the extension package. Plus does not download or run any remote code. The Plus key is a signed code that is verified inside the extension with a public key, using the browser's built-in Web Crypto. No script or data is fetched to do this.

Permission justifications: no new permissions are needed for Plus. (Confirm against the final manifest before submitting. If the AI weekly coach needs a host permission for Google's API, reuse the existing wording for the optional Gemini chat.)

Data usage disclosures:
- Plus key check: local only. The key is stored in the browser's local extension storage on the user's device. It is never transmitted. No server is contacted.
- The key is not "personal communications", "authentication information sent to a server" or similar, because it is not sent anywhere. Leave the collection boxes unchecked for anything related to Plus.
- AI weekly coach (optional): if the user adds their own Google AI key and presses the button, a short summary of their own numbers is sent to Google's API. This matches how the existing optional AI chat is already disclosed. Make sure the existing disclosure for that feature covers it.

Certifications (same as before): data is not sold, not used for unrelated purposes, not used for creditworthiness or lending.

Privacy policy URL (unchanged): https://webwell.app/privacy

## 4. Notes for the owner

- The store listing must keep saying the extension is free. Plus is optional and unlocked outside the store (key). Check the current Chrome Web Store policy on "payments" and in-extension purchases before submitting, and describe the key unlock accurately.
- Do not use words like "unlimited" except for history, and there say "full history" and mention that free keeps the last 120 days.
- The price shown in the extension (`PLUS_PRICE_TEXT` in lib/plus.js) and on https://webwell.app/plus must match.
