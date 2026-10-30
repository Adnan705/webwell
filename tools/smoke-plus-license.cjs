const { withExtension } = require('./cdp-harness.cjs');
withExtension(async ({ open, ev, plusKey, shot }) => {
  const d = await open('dashboard/dashboard.html#plus');
  await ev(d, 'plusActivate(' + JSON.stringify(plusKey) + ')'); await ev(d, 'renderPlus()'); await new Promise(r => setTimeout(r, 500));
  console.log(await ev(d, "document.querySelector('.pl-status').innerText.split('\\n').join(' | ')"));
  await shot(d, process.env.TEMP + '\\plus-lic.png');
});
