const { withExtension } = require('./cdp-harness.cjs');
withExtension(async ({ open, ev, plusKey, shot }) => {
  const d = await open('dashboard/dashboard.html');
  console.log('free label:', await ev(d, "document.querySelector('.go-plus .gp-label').textContent"));
  await shot(d, process.env.TEMP + '\\rail-free.png');
  await ev(d, "document.querySelector('.go-plus').click()"); await new Promise(r => setTimeout(r, 700));
  console.log('opens Plus page:', await ev(d, "!document.getElementById('view-plus').classList.contains('hidden') && /Get more from WebWell/.test(document.getElementById('view-plus').innerText)"));
  await shot(d, process.env.TEMP + '\\rail-free-active.png');
  await ev(d, 'plusActivate(' + JSON.stringify(plusKey) + ')'); await new Promise(r => setTimeout(r, 800));
  console.log('plus label:', await ev(d, "document.querySelector('.go-plus .gp-label').textContent + ' | is-plus=' + document.querySelector('.go-plus').classList.contains('is-plus')"));
  await ev(d, "showView('overview')"); await new Promise(r => setTimeout(r, 400));
  await shot(d, process.env.TEMP + '\\rail-plus.png');
});
