const { withExtension } = require('./cdp-harness.cjs');
withExtension(async ({ open, ev, plusKey, shot }) => {
  console.log('key ok:', plusKey.slice(0, 6));
  const d = await open('dashboard/dashboard.html#plus');
  console.log('locked view:', (await ev(d, "document.querySelector('#view-plus .pl-status strong').textContent")));
  console.log('activate bad:', await ev(d, "plusActivate('nope').then(r=>JSON.stringify(r))"));
  console.log('activate good:', await ev(d, "plusActivate(" + JSON.stringify(plusKey) + ").then(r=>r.ok)"));
  await ev(d, "renderPlus()"); await new Promise(r => setTimeout(r, 500));
  console.log('unlocked view:', (await ev(d, "document.querySelector('#view-plus .pl-status strong').textContent")));
  await shot(d, process.env.TEMP + '\\plus-view.png');
  const r = await open('dashboard/dashboard.html#reports');
  console.log('reports view:', (await ev(r, "document.getElementById('view-reports').textContent.slice(0,60)")));
});
