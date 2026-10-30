# WebWell Plus consistency audit (2026-10-30)

Scope: website/ (all HTML, llms.txt, sitemap.xml, feed.xml, site.webmanifest, robots.txt, CSV), README.md, PRIVACY-POLICY-draft.md, and the earlier store-listing files. Source of truth: the facts in the brief and manifest.json (1.9.0). Nothing was deployed.

## Pages checked (29 items)

Edited: index.html (non-nav, non-hero parts only), privacy.html, goodbye.html, changelog.html, blog/extension-permissions-study.html, blog/is-momentum-plus-worth-it.html, blog/momentum-alternatives.html, blog/pomodoro-timer-chrome.html, blog/track-screen-time-chrome-privately.html, llms.txt, sitemap.xml, media/extension-permissions-2026-10.csv, README.md, PRIVACY-POLICY-draft.md, store-listing/permissions-text.md, store-listing/plus-listing-text.md.

Read, no change needed: install.html (already says one install line, optional permissions, free; no false claim), blog/index.html and blog/feed.xml (Momentum Plus is a competitor's product; "free alternative" wording is still true), blog/block-youtube-shorts-desktop.html, 404.html, site.webmanifest, robots.txt, analytics.js, blog/listen.js, blog/blog.js, blog/blog.css.

Off limits (not edited; only searched for stale phrases and checkout status, not read in full): plus.html, terms.html, refund.html, welcome.html, plus-checkout.js, vercel.json.

Also read: THIRD-PARTY-NOTICES.md, store-listing/plus-announcement.md (draft posts; consistent, not edited).

## Changes

| File | Before | After | Why |
|---|---|---|---|
| index.html | JSON-LD `softwareVersion` 1.7.0 | 1.9.0 | Stale version |
| index.html | JSON-LD `dateModified` 2026-10-21 | 2026-10-30 | Page text changed |
| index.html | Facts strip: "Free / everything on this page" | "Free / to use, Plus is optional" | The page now has a paid tier section, so "everything on this page" was false |
| index.html | FAQ "Is WebWell really free?" (HTML and JSON-LD): "...and everything on this page is included." | "The extension is free, with no trial and no account, and every feature above the Plus section is included. ..." | Same reason; the rest of the answer (Plus is $10 once, nothing free becomes paid) kept |
| index.html | Permissions card lacked activeTab | Added `activeTab`: only when you press "Save this page" | Manifest has it |
| index.html | Privacy ledger footnote: only AI chat mentioned | Added the Plus weekly coach (own Google AI key) and that Paddle handles buying with no browsing data | Plus exists |
| privacy.html | "applies to WebWell 1.8.2" | "1.9.0" | Stale version |
| privacy.html | Permission list had no activeTab/scripting | Added "Active tab and scripting" bullet | Manifest has them required |
| privacy.html | JSON-LD dateModified 2026-10-21 | 2026-10-30 | Text changed |
| goodbye.html | Nothing about Plus | Added: Plus key still works if you reinstall, link to refund policy | Buyers land here after removing the extension |
| changelog.html | Newest entry 1.8.3 "In review"; "Coming next: WebWell Plus" | Added 1.9.0 entry (Plus, offline keys), moved the "In review" pill to 1.9.0, aside retitled "About WebWell Plus" with $10 once; intro says "with an optional paid upgrade" | Plus is no longer "coming next" |
| blog/is-momentum-plus-worth-it.html | Disclosure said only "I make WebWell, the free option" | Disclosure adds the optional $10 WebWell Plus and that I am not neutral; line under the table says the WebWell column is the free version and Plus is optional | Honest comparison |
| blog/momentum-alternatives.html | "It is free, has no account and is open source."; table price "Free" | "free to use ... An optional paid upgrade, WebWell Plus ($10 once, no subscription) ..."; table "Free + optional $10 Plus"; fixed a stale link title for the screen-time post | Do not imply no paid tier |
| blog/pomodoro-timer-chrome.html | No mention of strict mode | One sentence: strict focus mode is a Plus feature; everything else in the setup is free | Honest pointer, no false claim |
| blog/track-screen-time-chrome-privately.html | Silent on history limit | Free keeps 120 days; Plus keeps everything and adds weekly and monthly reports | Accuracy |
| blog/extension-permissions-study.html | WebWell row: 11 required (tabs, notifications, favicon, webNavigation, declarativeNetRequest...), 4 named host sites required | WebWell 1.9.0 row, cards, glossary, key findings and text: 8 required (storage, activeTab, idle, alarms, offscreen, declarativeNetRequestWithHostAccess, scripting, search); optional: notifications, tabs, webNavigation, favicon; optional hosts all sites and four services. Added a dated update note near the top, "Limits" note, dateModified 2026-10-30 | Verified against manifest.json |
| media/extension-permissions-2026-10.csv | WebWell row 1.7.0, 11 permissions | 1.9.0, 8 required, optional permissions and hosts, snapshot_date 2026-10-30 | Match the page |
| sitemap.xml | lastmod 10-21 to 10-24 on edited pages | 2026-10-30 for /, /privacy, and the five edited blog posts | Changed content |
| llms.txt | Plus entry lacked intent check, earn your break, price, Paddle | Added them; added terms, refund and changelog links | Completeness |
| README.md | No Plus section; em dashes; permission note missing | Added Plus link, a "WebWell Plus (optional)" section ($10 once, key offline, Paddle, links), privacy bullets (one install line, activeTab, Plus key). Replaced 11 em dashes with colons or commas. Version badge already 1.9.0 | Brief |
| PRIVACY-POLICY-draft.md | Old permission list (tabs required etc.), no Plus or Paddle, placeholder contact | Rewritten to match privacy.html (1.9.0, required and optional lists, Plus keys, Paddle, contact info.adnanak@gmail.com) | Stale |
| store-listing/permissions-text.md, plus-listing-text.md | Old v1.8.2 and pre-launch text | Marked SUPERSEDED by FINAL-store-description.md | Replaced |

## Checks

- U+2014 em dashes: 0 in every file changed (HTML, CSV, XML, TXT, MD), including README.md after cleanup. Pre-existing em dashes in README.md and the PRIVACY-POLICY-draft title were removed.
- Phrase grep ("no paid", "free forever", "always free", "no premium", "forever", "completely free", "100% free", "no upgrade") across website/ and README: only two hits, both in off-limits pages and both true: refund.html ("The free WebWell extension is always free, so there is nothing to refund there.") and terms.html ("Lifetime" definition). No false statement left in editable files.
- Internal links and anchors (node script) on index, privacy, goodbye, changelog, install, blog index and the five edited posts: 0 broken files, 0 missing anchors.
- JSON-LD: every ld+json block in those pages parses with JSON.parse (10 blocks, 0 failures).
- Em dash check also run on FINAL-store-description.md: 0. Summary line is 107 characters (limit 132). Description is about 4,500 characters (limit 16,000).

## Not fixed, and why (for the owner)

1. Permissions-study graphics: the inline SVG grid and permissions-matrix-2026-10.png/.svg and og-permissions-study.jpg still show the 2026-10-22 snapshot (WebWell 1.7.0, 11 required). The page says so in its update note. Regenerate the image when you have time; I cannot rebuild the PNG here.
2. Permissions study last-push and star count for WebWell were not re-measured. The "Last push" cell says "Re-read 2026-10-30"; the CSV keeps last_push 2026-10-22 and stars 1.
3. The study tells readers to curl the manifest from GitHub main. That only matches if 1.9.0 is pushed to github.com/Adnan705/webwell.
4. plus.html (off limits) says "Checkout is not open yet"; llms.txt still says that too, to stay consistent. Update both when checkout opens. The Chrome listing should not go live promising a purchase before that.
5. Changelog: I moved "In review" to 1.9.0 and cleared it from 1.8.3. If 1.8.3 is still the one in review, or 1.9.0 is already live, adjust the pill.
6. privacy.html says "Last updated November 1, 2026", a future date relative to today (2026-10-30). I left the owner's date. Change it if unintended. The PRIVACY-POLICY-draft.md copy says 2026-10-30.
7. Home page FAQ "Is my data sent to a server?" and the Ask WebWell FAQ still speak only of the Gemini chat; the footnote covers the Plus coach. Left as is (still true).
8. The Chrome data-usage question about "Web history" (see FINAL-store-description.md, D4) is a judgment call left to the owner.
9. plus-announcement.md draft posts are consistent with the facts; not edited. Add Paddle/14-day refund mention if you want.
10. Pre-existing small inconsistency: blog/index.html JSON-LD lists the screen-time post as published 2026-10-22 while the sitemap and post metadata use 10-22 and 10-24 modified. Harmless; not changed.
