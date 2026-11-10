// Does the configured TURN relay really hand out relay candidates?  node tools/turn-probe.mjs
// Needs Playwright (NODE_PATH) and a Chrome; relay-only ICE means a candidate only appears if the TURN server accepts us.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage();
await page.goto('about:blank');
const servers = process.env.TURN_JSON ? JSON.parse(process.env.TURN_JSON) : [
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];
const res = await page.evaluate(async (iceServers) => {
  const out = [];
  for (const server of iceServers) for (const url of [].concat(server.urls)) {
    const pc = new RTCPeerConnection({ iceServers: [{ ...server, urls: [url] }], iceTransportPolicy: 'relay' });
    pc.createDataChannel('x');
    const found = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 8000);
      pc.onicecandidate = (e) => { if (e.candidate && /typ relay/.test(e.candidate.candidate)) { clearTimeout(t); resolve(e.candidate.candidate.split(' ').slice(4, 6).join(':')); } };
      pc.onicecandidateerror = (e) => { out.push(`  error ${url}: ${e.errorCode} ${e.errorText}`); };
      pc.createOffer().then((o) => pc.setLocalDescription(o));
    });
    out.push(`${found ? 'RELAY OK ' : 'NO RELAY'} ${url}${found ? ' -> ' + found : ''}`);
    pc.close();
  }
  return out;
}, servers);
console.log(res.join('\n'));
await browser.close();
