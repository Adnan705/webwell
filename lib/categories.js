// Default productivity categories. Users can reclassify any site in the dashboard.
'use strict';

const DEFAULT_CATEGORIES = {
  // --- Distracting / time sinks ---
  'youtube.com': 'distracting', 'youtu.be': 'distracting',
  'facebook.com': 'distracting', 'fb.com': 'distracting',
  'instagram.com': 'distracting',
  'twitter.com': 'distracting', 'x.com': 'distracting',
  'tiktok.com': 'distracting',
  'reddit.com': 'distracting', 'old.reddit.com': 'distracting',
  'netflix.com': 'distracting', 'hulu.com': 'distracting', 'disneyplus.com': 'distracting',
  'primevideo.com': 'distracting',
  'twitch.tv': 'distracting',
  'pinterest.com': 'distracting',
  'snapchat.com': 'distracting',
  'whatsapp.com': 'distracting', 'web.whatsapp.com': 'distracting',
  'telegram.org': 'distracting', 'web.telegram.org': 'distracting',
  'messenger.com': 'distracting',
  'discord.com': 'distracting',
  '9gag.com': 'distracting', 'imgur.com': 'distracting',
  'buzzfeed.com': 'distracting',
  // --- Productive ---
  'github.com': 'productive', 'gitlab.com': 'productive', 'bitbucket.org': 'productive',
  'stackoverflow.com': 'productive', 'stackexchange.com': 'productive', 'serverfault.com': 'productive',
  'docs.google.com': 'productive', 'drive.google.com': 'productive', 'sheets.google.com': 'productive',
  'gmail.com': 'productive', 'mail.google.com': 'productive', 'outlook.com': 'productive', 'outlook.live.com': 'productive',
  'notion.so': 'productive', 'notion.site': 'productive',
  'trello.com': 'productive', 'asana.com': 'productive', 'todoist.com': 'productive',
  'figma.com': 'productive', 'canva.com': 'productive',
  'codepen.io': 'productive', 'replit.com': 'productive', 'codesandbox.io': 'productive',
  'developer.mozilla.org': 'productive', 'w3schools.com': 'productive', 'freecodecamp.org': 'productive',
  'coursera.org': 'productive', 'udemy.com': 'productive', 'edx.org': 'productive', 'khanacademy.org': 'productive',
  'vu.edu.pk': 'productive', 'lms.vu.edu.pk': 'productive',
  'medium.com': 'productive', 'dev.to': 'productive', 'news.ycombinator.com': 'productive',
  'wikipedia.org': 'productive',
  'chatgpt.com': 'productive', 'chat.openai.com': 'productive', 'claude.ai': 'productive', 'gemini.google.com': 'productive',
  'calendar.google.com': 'productive', 'meet.google.com': 'productive', 'zoom.us': 'productive', 'teams.microsoft.com': 'productive',
  'linkedin.com': 'productive',
  'docs.microsoft.com': 'productive', 'learn.microsoft.com': 'productive',
};

const CATEGORY_META = {
  productive:  { label: 'Productive',  color: '#1a9e6b', score: 100 },
  neutral:     { label: 'Neutral',     color: '#9aa0ae', score: 50 },
  distracting: { label: 'Distracting', color: '#e0523d', score: 0 },
};

// Best match: exact domain, then parent domains (mail.google.com -> google.com rules don't apply,
// but sub.news.site matches site rule). We check the full domain then progressively strip subdomains.
function categoryOf(domain, overrides) {
  // FIX: user overrides now also apply to subdomains (an override on
  // youtube.com used to be ignored for m.youtube.com / music.youtube.com).
  let d = domain;
  while (d) {
    if (overrides && overrides[d]) return overrides[d];
    if (DEFAULT_CATEGORIES[d]) return DEFAULT_CATEGORIES[d];
    const dot = d.indexOf('.');
    if (dot === -1) break;
    d = d.slice(dot + 1);
  }
  return 'neutral';
}

if (typeof module !== 'undefined') { module.exports = { DEFAULT_CATEGORIES, CATEGORY_META, categoryOf }; }
