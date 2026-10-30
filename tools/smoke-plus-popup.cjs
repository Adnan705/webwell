const { withExtension } = require('./cdp-harness.cjs');
withExtension(async ({ open, ev, plusKey, shot, br }) => {
  const p = await open('popup/popup.html');
  console.log('go plus visible (free):', await ev(p, "!document.getElementById('goPlus').hidden"));
  await shot(p, process.env.TEMP + '\\popup-goplus.png');
  console.log('layout fits:', await ev(p, "(()=>{const b=document.getElementById('goPlus').getBoundingClientRect();return Math.round(b.bottom)+' of '+innerHeight})()"));
  await ev(p, 'plusActivate(' + JSON.stringify(plusKey) + ')'); await new Promise(r => setTimeout(r, 800));
  console.log('hidden after unlock:', await ev(p, "document.getElementById('goPlus').hidden"));
  await ev(p, 'plusRemove()'); await new Promise(r => setTimeout(r, 800));
  const before = (await br.send('Target.getTargets')).result.targetInfos.length;
  await ev(p, "document.getElementById('goPlus').click()"); await new Promise(r => setTimeout(r, 1500));
  const t = (await br.send('Target.getTargets')).result.targetInfos;
  console.log('opened dashboard#plus:', t.some(x => /dashboard\/dashboard\.html#plus/.test(x.url)), '| tabs', before, '->', t.length);
});
