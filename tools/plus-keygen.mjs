// Makes a WebWell Plus key. Run on your own computer; the private key never goes in the repo.
//   node tools/plus-keygen.mjs --name "Mom" --plan family
//   node tools/plus-keygen.mjs --name "Sam" --plan lifetime --days 365     (a key that ends)
//   node tools/plus-keygen.mjs --check WWP1.xxxx.yyyy                      (test a key)
// The private key lives at D:\Extensions\webwell-private\plus-private.jwk. Back it up somewhere safe:
// without it no new keys can be made, and anyone who gets it can make keys.
// Every key you make is written to D:\Extensions\webwell-private\issued-keys.csv.
import crypto from 'node:crypto';
import fs from 'node:fs';

const DIR = 'D:/Extensions/webwell-private';
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : ''; };
const b64u = b => Buffer.from(b).toString('base64url');

const priv = crypto.createPrivateKey({ key: JSON.parse(fs.readFileSync(DIR + '/plus-private.jwk', 'utf8')), format: 'jwk' });
const pubJwk = crypto.createPublicKey(priv).export({ format: 'jwk' });
const pub = crypto.createPublicKey({ key: pubJwk, format: 'jwk' });

if (opt('check')) {
  const parts = opt('check').replace(/^WWP1\./, '').split('.');
  const data = Buffer.from(parts[0], 'base64url');
  const ok = crypto.verify('sha256', data, { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[1], 'base64url'));
  console.log(ok ? 'Valid: ' + data.toString() : 'NOT valid');
  process.exit(ok ? 0 : 1);
}

const name = opt('name'), plan = opt('plan') || 'lifetime', days = parseInt(opt('days'), 10);
if (!name) { console.log('Give the key a label: --name "Mom"'); process.exit(1); }
const payload = { v: 1, id: crypto.randomBytes(5).toString('hex'), plan, name, iat: Date.now() };
if (days > 0) payload.exp = Date.now() + days * 86400000;
const data = Buffer.from(JSON.stringify(payload));
const sig = crypto.sign('sha256', data, { key: priv, dsaEncoding: 'ieee-p1363' });
const key = 'WWP1.' + b64u(data) + '.' + b64u(sig);
fs.appendFileSync(DIR + '/issued-keys.csv', [new Date().toISOString(), payload.id, plan, JSON.stringify(name), payload.exp ? new Date(payload.exp).toISOString() : 'never', key].join(',') + '\n');
console.log('\nPlus key for ' + name + ' (' + plan + (payload.exp ? ', ends ' + new Date(payload.exp).toDateString() : ', does not end') + '):\n\n' + key + '\n');
