// WebWell AI + forecasting helpers. No DOM here — safe to importScripts in the
// service worker as well as the dashboard.
'use strict';

const AI_MODEL = 'gemini-3.5-flash-lite'; // confirmed in Google's model list (released 2026-07-21)
const AI_MODEL_FALLBACK = 'gemini-3.1-flash-lite'; // used if the primary ever returns 404 (retired)

function aiUrl(model) {
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
}

function hourLabel(h) {
  h = ((h % 24) + 24) % 24;
  const ap = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + ap;
}

// Call Gemini with the user's own key (stored locally in `aiKey`).
async function aiGenerate(prompt, maxTokens) {
  const r = await storeGet(['aiKey']);
  const key = ((r && r.aiKey) || '').trim();
  if (!key) { const e = new Error('no-key'); e.code = 'no-key'; throw e; }
  // FIX: send the key in a header, not the URL (URLs end up in logs/history).
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: maxTokens || 600 }
  });
  const call = m => fetch(aiUrl(m), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body
  });
  let res = await call(AI_MODEL);
  if (res.status === 404) res = await call(AI_MODEL_FALLBACK);
  if (!res.ok) { const e = new Error('Gemini error ' + res.status); e.code = 'api-' + res.status; throw e; }
  const j = await res.json();
  const text = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Empty reply from Gemini.');
  return text;
}

async function aiTestKey(key) {
  const body = JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word: ok' }] }],
    generationConfig: { maxOutputTokens: 10 } });
  const call = m => fetch(aiUrl(m), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() }, body
  });
  let res = await call(AI_MODEL);
  if (res.status === 404) res = await call(AI_MODEL_FALLBACK);
  if (!res.ok) throw new Error('Gemini error ' + res.status + ' — check the key.');
  return true;
}

// Compact text summary of recent stats, for AI prompts. Keeps prompts small.
function buildDataSummary(days, categories) {
  const lines = [];
  const todayK = dayKey(Date.now());
  const t = days[todayK] || { domains: {}, visits: {}, hourly: {}, total: 0 };
  const entries = Object.keys(t.domains || {}).map(d => ({
    d, s: t.domains[d], c: categoryOf(d, categories)
  })).sort((a, b) => b.s - a.s);
  let p = 0, x = 0, n = 0;
  for (const e of entries) {
    if (e.c === 'productive') p += e.s; else if (e.c === 'distracting') x += e.s; else n += e.s;
  }
  lines.push('Today: ' + fmtDur(t.total) + ' total (' + fmtDur(p) + ' productive, ' +
    fmtDur(n) + ' neutral, ' + fmtDur(x) + ' distracting).');
  if (entries.length) {
    lines.push('Top sites today: ' + entries.slice(0, 12).map(e =>
      e.d + ' ' + fmtDurShort(e.s) + ' [' + e.c + ']').join(', ') + '.');
  }
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    const dd = days[k];
    week.push(d.toLocaleDateString('en-US', { weekday: 'short' }) + ':' + fmtDurShort(dd ? dd.total : 0));
  }
  lines.push('Last 7 days screen time: ' + week.join(' ') + '.');
  let ph = -1, pv = 0;
  for (let h = 0; h < 24; h++) {
    const v = (t.hourly && t.hourly[h]) || 0;
    if (v > pv) { pv = v; ph = h; }
  }
  if (ph >= 0) lines.push('Peak hour today: ' + hourLabel(ph) + ' (' + fmtDurShort(pv) + ').');
  return lines.join('\n');
}

const AI_SYSTEM = 'You are WebWell, a friendly digital-wellbeing coach living inside a browser extension. ' +
  'Below are the user\'s real browsing stats (tracked privately on their device). ' +
  'Answer their question using ONLY this data — never invent numbers, sites, or times. ' +
  'Be concise (under 120 words), warm, specific, and honest. Use plain everyday words, no jargon. ' +
  'If the data cannot answer the question, say so plainly. No markdown headers; short lines are fine.';

function buildAskPrompt(summary, history, question) {
  const hist = (history || []).slice(-6).map(m =>
    (m.role === 'user' ? 'User: ' : 'Coach: ') + m.text).join('\n');
  return AI_SYSTEM + '\n\n--- stats ---\n' + summary +
    (hist ? '\n\n--- recent conversation ---\n' + hist : '') +
    '\n\nUser: ' + question + '\nCoach:';
}

// ---------------------------------------------------------------------------
// Distraction forecast (pure statistics, no AI). Finds the user's usual
// "slump" hour and "golden" productive hour from the last 14 days.
// ---------------------------------------------------------------------------
function computeForecast(days, categories) {
  const disByHour = new Array(24).fill(0);
  const prodByHour = new Array(24).fill(0);
  const nByHour = new Array(24).fill(0);
  let daysUsed = 0;
  for (let i = 1; i <= 14; i++) { // skip today — still in progress
    const d = new Date(); d.setDate(d.getDate() - i);
    const dd = days[dayKey(d.getTime())];
    if (!dd || (dd.total || 0) < 600) continue; // need 10+ min of data
    daysUsed++;
    let ps = 0, xs = 0;
    for (const dom of Object.keys(dd.domains || {})) {
      const c = categoryOf(dom, categories);
      if (c === 'productive') ps += dd.domains[dom];
      else if (c === 'distracting') xs += dd.domains[dom];
    }
    const pShare = dd.total ? ps / dd.total : 0;
    const xShare = dd.total ? xs / dd.total : 0;
    for (let h = 0; h < 24; h++) {
      const t = (dd.hourly && dd.hourly[h]) || 0;
      if (t < 300) continue;
      disByHour[h] += t * xShare;
      prodByHour[h] += t * pShare;
      nByHour[h]++;
    }
  }
  if (daysUsed < 3) return { daysUsed, slumpHour: -1, goldenHour: -1 };
  let slumpHour = -1, slumpAvg = 0, goldenHour = -1, goldenAvg = 0;
  for (let h = 0; h < 24; h++) {
    if (nByHour[h] < 2) continue;
    const dAvg = disByHour[h] / nByHour[h];
    const pAvg = prodByHour[h] / nByHour[h];
    if (dAvg > slumpAvg && dAvg > 600) { slumpAvg = dAvg; slumpHour = h; }
    if (pAvg > goldenAvg && pAvg > 600) { goldenAvg = pAvg; goldenHour = h; }
  }
  return { daysUsed, slumpHour, slumpAvg, goldenHour, goldenAvg };
}

if (typeof module !== 'undefined') {
  module.exports = { AI_MODEL, hourLabel, buildDataSummary, buildAskPrompt, computeForecast, AI_SYSTEM };
}
