> SUPERSEDED by store-listing/FINAL-store-description.md (version 1.9.0). Kept for history only. Do not paste from this file.

# Paste at the TOP of the Chrome Web Store description (v1.8.2)

YOUR PRIVACY, YOUR CHOICE
WebWell never collects your data. No account, no servers, no ads. Everything stays on your device.

Chrome's install prompt shows just one line:
• "Change the page you see when you open a new tab": WebWell is your new tab page (clock, focus timer, music).

Everything else is optional, off until you switch it on in the welcome screens or in Settings, and you can say no:
• Screen-time tracking: lets WebWell see which site is in your active tab so it can count your time. Chrome may word this as "read your browsing history". It never leaves your device. If you leave it off, there are no screen-time stats or site limits, but the timer, music, tasks and backgrounds still work.
• Alerts: only if you want limit or focus reminders.
• Access to all sites: only if you switch on site blocking.
• SoundCloud / Spotify: only when you play from them.
• Google AI: only if you use the optional AI chat with your own key.

Open source, so you can check every line: github.com/Adnan705/webwell
Privacy policy: webwell.app/privacy

---

# Suggested "What's new" (1.8.3)

New: save any page to your new tab with the bookmark button in the popup, and see it in the dock. Music now moves on to the next saved song by itself when one ends. Also from 1.8.2: your choice, up front. Installing now asks for nothing but the new tab page. A new welcome screen lets you decide whether WebWell may count your screen time and send alerts, with plain explanations. Blocking, music services and AI ask only when you use them. Watching a show or video no longer stops the time counting. Your data still never leaves your device.

---

# Privacy tab justifications to review in the dashboard

- tabs / webNavigation / favicon (optional): identify the active site for local screen-time stats, redirect blocked pages, show site icons. Requested only when the user turns tracking on.
- declarativeNetRequestWithHostAccess + scripting: block sites and hide short-video feeds on sites the user allows (optional host access requested on demand).
- optional notifications / host permissions: requested at use.
- Remote code: none.
