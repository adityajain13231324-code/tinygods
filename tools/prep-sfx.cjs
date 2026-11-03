// Copies the chosen CC0 / CC-BY sound files into public/sfx; long gun WAVs are cut to the first
// 1.1 s and mixed to mono 16-bit so they stay small.   node tools/prep-sfx.cjs <folder with kenney/ thwack/ sounds/>
const fs = require('fs');
const path = require('path');
const src = process.argv[2];
const out = path.join(__dirname, '..', 'public', 'sfx');
fs.mkdirSync(out, { recursive: true });
const copy = (from, to) => fs.copyFileSync(path.join(src, from), path.join(out, to));
for (const n of ['impactPunch_heavy', 'impactPunch_medium', 'impactWood_heavy', 'impactWood_medium', 'impactMetal_medium', 'impactPlate_heavy', 'impactSoft_heavy', 'impactSoft_medium', 'impactGeneric_light']) {
  for (const i of [0, 1, 2]) copy(`kenney/Audio/${n}_00${i}.ogg`, `${n}_${i}.ogg`);
}
for (const i of ['01', '03', '05', '07']) copy(`thwack/PCM/thwack-${i}.wav`, `thwack-${i}.wav`);
function trim(file, name, seconds) {
  const b = fs.readFileSync(path.join(src, file));
  const rate = b.readInt32LE(24);
  let p = 12;
  while (b.toString('ascii', p, p + 4) !== 'data') p += 8 + b.readInt32LE(p + 4);
  const start = p + 8;
  const frames = Math.min(Math.floor(rate * seconds), Math.floor((b.length - start) / 4));
  const pcm = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    const l = b.readInt16LE(start + i * 4), r = b.readInt16LE(start + i * 4 + 2);
    const fade = i > frames - 2400 ? (frames - i) / 2400 : 1;
    pcm.writeInt16LE(Math.round(((l + r) / 2) * fade), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeInt32LE(16, 16); h.writeInt16LE(1, 20); h.writeInt16LE(1, 22); h.writeInt32LE(rate, 24);
  h.writeInt32LE(rate * 2, 28); h.writeInt16LE(2, 32); h.writeInt16LE(16, 34); h.write('data', 36); h.writeInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(out, name), Buffer.concat([h, pcm]));
}
trim('sounds/sounds/cz.wav', 'gun-cz.wav', 1.1);
trim('sounds/sounds/sks.wav', 'gun-sks.wav', 1.1);
trim('sounds/sounds/shotty.wav', 'gun-shotty.wav', 1.4);
