import { PLACES } from '../config/content.js';
import { WORLD } from '../config/tunables.js';

// Town layouts. Every layout keeps the same nine place ids (orders, cards and dialogue all refer to
// them) and only moves them around, adds terrain (canals with bridges, a hill) and cover props.
// Pure data plus tiny geometry helpers: it runs in Node (tests, bots) as well as the browser.

const place = (id, x, y, radius) => ({ ...PLACES.find((p) => p.id === id), x, y, radius });
const P = (kind, id, x, y, w, h, extra = {}) => ({ id, kind, x, y, w, h, ...extra });

/** How hard each kind of prop is to see over and to break. cover: 0..1 (1 blocks a lot). hp: damage a blast must deal. */
export const PROP_KINDS = {
  bench: { cover: 0.55, hp: 40, burnable: true, label: 'Bench' },
  stall: { cover: 0.85, hp: 90, burnable: true, label: 'Market stall', goods: true },
  wall: { cover: 1, hp: 160, burnable: false, label: 'Stone wall' },
  barrel: { cover: 0.5, hp: 30, burnable: true, label: 'Barrels' },
  hay: { cover: 0.7, hp: 35, burnable: true, label: 'Hay bale' },
  rock: { cover: 1, hp: 9999, burnable: false, label: 'Boulder' },
};

const classicPlaces = () => PLACES.map((p) => ({ ...p }));

function classicProps(places) {
  const at = (id) => places.find((p) => p.id === id);
  const plaza = at('plaza'), park = at('park'), market = at('market'), pond = at('pond'), armory = at('armory'), houses = at('houses');
  const props = [];
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    props.push(P('bench', `bench-plaza-${i}`, plaza.x + Math.cos(a) * (plaza.radius - 18), plaza.y + Math.sin(a) * (plaza.radius - 18) * 0.9, 30, 16));
  }
  props.push(P('bench', 'bench-park-0', park.x - 52, park.y + 8, 30, 16), P('bench', 'bench-park-1', park.x + 14, park.y - 52, 30, 16));
  props.push(P('bench', 'bench-pond-0', pond.x + 20, pond.y + pond.radius * 0.7 + 22, 30, 16));
  [[-96, -66], [-14, -72], [70, -62], [-62, 6], [6, 16]].forEach(([dx, dy], i) => props.push(P('stall', `stall-${i}`, market.x + dx + 28, market.y + dy + 18, 56, 44, { look: i })));
  props.push(P('wall', 'wall-armory-0', armory.x - 70, armory.y - 70, 90, 16), P('wall', 'wall-armory-1', armory.x + 50, armory.y - 70, 60, 16));
  props.push(P('wall', 'wall-houses-0', houses.x - 10, houses.y - 85, 110, 16));
  return props;
}

const grass = (id, x, y, r = 70) => ({ id, x, y, r });

export const LAYOUTS = {
  classic: {
    id: 'classic', name: 'Classic town', blurb: 'The original: a plaza hub with paths to every place.',
    places: classicPlaces,
    props: classicProps,
    grass: () => [grass('g0', 150, 560), grass('g1', 1770, 560), grass('g2', 1130, 1000)],
    canals: [], hill: null,
  },
  canal: {
    id: 'canal', name: 'Canal town', blurb: 'Two canals split the town into three. Only four narrow bridges link the districts.',
    places: () => [
      place('plaza', 960, 540, 150), place('park', 330, 270, 130), place('market', 1590, 270, 120), place('well', 960, 190, 75),
      place('houses', 330, 830, 130), place('armory', 1590, 830, 100), place('pond', 400, 540, 95), place('farm', 1530, 540, 110), place('bakery', 960, 900, 90),
    ],
    props: (places) => classicProps(places),
    grass: () => [grass('g0', 130, 450), grass('g1', 1790, 650), grass('g2', 1180, 990)],
    canals: [
      { id: 'c0', c: 640, half: 36, bridges: [{ c: 330, half: 42 }, { c: 760, half: 42 }] },
      { id: 'c1', c: 1280, half: 36, bridges: [{ c: 320, half: 42 }, { c: 790, half: 42 }] },
    ],
    hill: null,
  },
  market: {
    id: 'market', name: 'Market street', blurb: 'A crowded street of stalls runs through the middle: lots of cover, tight fights.',
    places: () => [
      place('plaza', 430, 540, 120), place('park', 300, 200, 120), place('market', 1150, 540, 215), place('well', 700, 170, 70),
      place('houses', 260, 880, 125), place('armory', 1700, 230, 95), place('pond', 660, 880, 95), place('farm', 1700, 860, 100), place('bakery', 1020, 920, 85),
    ],
    props: (places) => {
      const market = places.find((p) => p.id === 'market');
      const props = classicProps(places).filter((p) => !p.id.startsWith('stall'));
      for (let i = 0; i < 6; i++) {
        props.push(P('stall', `stall-n${i}`, market.x - 195 + i * 78, market.y - 62, 56, 44, { look: i % 5 }));
        props.push(P('stall', `stall-s${i}`, market.x - 195 + i * 78, market.y + 62, 56, 44, { look: (i + 2) % 5 }));
      }
      props.push(P('barrel', 'barrel-m0', market.x - 215, market.y + 4, 18, 18), P('barrel', 'barrel-m1', market.x + 215, market.y - 6, 18, 18));
      return props;
    },
    grass: () => [grass('g0', 150, 600), grass('g1', 1780, 560), grass('g2', 880, 1010)],
    canals: [], hill: null,
  },
  farms: {
    id: 'farms', name: 'Scattered farms', blurb: 'Wide open fields with hay bales and dry grass. Fights spread out, and fire loves it here.',
    places: () => [
      place('plaza', 960, 540, 120), place('park', 270, 220, 120), place('market', 1650, 230, 110), place('well', 960, 150, 70),
      place('houses', 250, 860, 120), place('armory', 1660, 850, 95), place('pond', 640, 420, 95), place('farm', 1330, 650, 150), place('bakery', 960, 940, 85),
    ],
    props: (places) => {
      const props = classicProps(places).filter((p) => !p.id.startsWith('wall-houses'));
      [[520, 640], [740, 760], [1130, 380], [1450, 470], [1100, 800], [430, 960], [1580, 640], [780, 260]].forEach(([x, y], i) => props.push(P('hay', `hay-${i}`, x, y, 34, 26)));
      return props;
    },
    grass: () => [grass('g0', 540, 520, 85), grass('g1', 1200, 300, 80), grass('g2', 1480, 790, 85), grass('g3', 780, 880, 80), grass('g4', 330, 560, 75), grass('g5', 1740, 480, 75)],
    canals: [], hill: null,
  },
  hill: {
    id: 'hill', name: 'Hill village', blurb: 'A village built around a hill: the climb is slow, boulders give hard cover.',
    places: () => [
      place('plaza', 960, 540, 90), place('park', 480, 300, 110), place('market', 1390, 350, 105), place('well', 960, 230, 70),
      place('houses', 560, 880, 115), place('armory', 1600, 700, 95), place('pond', 330, 640, 90), place('farm', 1330, 900, 100), place('bakery', 960, 980, 85),
    ],
    props: (places) => {
      const props = classicProps(places).filter((p) => !p.id.startsWith('wall'));
      for (let i = 0; i < 9; i++) {
        const a = (Math.PI * 2 * i) / 9 + 0.3;
        props.push(P('rock', `rock-${i}`, 960 + Math.cos(a) * 205, 560 + Math.sin(a) * 175, 38, 30));
      }
      return props;
    },
    grass: () => [grass('g0', 200, 380), grass('g1', 1760, 420), grass('g2', 1220, 1000)],
    canals: [], hill: { x: 960, y: 560, rx: 270, ry: 235, speed: 0.78 },
  },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);
export const layoutOf = (id) => LAYOUTS[id] ?? LAYOUTS.classic;

// ---- terrain geometry ---------------------------------------------------------------

/** True if (x, y) is open water: inside a canal strip and not on one of its bridges. */
export function isWater(canals, x, y) {
  for (const c of canals) {
    if (Math.abs(x - c.c) >= c.half) continue;
    if (c.bridges.some((b) => Math.abs(y - b.c) < b.half)) continue;
    return true;
  }
  return false;
}

/** The nearest dry point to (x, y): out of the water toward the closer bank (or the bridge). */
export function landNear(canals, x, y) {
  let nx = x;
  for (const c of canals) {
    if (!isWater(canals, nx, y)) continue;
    if (Math.abs(nx - c.c) >= c.half) continue;
    nx = nx < c.c ? c.c - c.half - 2 : c.c + c.half + 2;
  }
  return [nx, y];
}

/**
 * Where a walker at (x, y) should steer to reach (tx, ty): straight there, unless a canal is in the
 * way, in which case via the nearest bridge. Pure, allocation-free apart from the return pair.
 */
export function routeVia(canals, x, y, tx, ty) {
  for (const c of canals) {
    const side = Math.sign(x - c.c) || 1;
    const goal = Math.sign(tx - c.c) || 1;
    const inStrip = Math.abs(x - c.c) < c.half;
    if (side === goal && !inStrip) continue; // same bank: no crossing
    // choose the bridge that makes the whole trip shortest
    let best = c.bridges[0];
    let bestCost = Infinity;
    for (const b of c.bridges) {
      const cost = Math.abs(y - b.c) + Math.abs(ty - b.c);
      if (cost < bestCost) { bestCost = cost; best = b; }
    }
    const reach = c.half + 16;
    if (inStrip) return [c.c + goal * reach, best.c]; // already on the bridge: walk off the far side
    const entryX = c.c + side * reach;
    const atEntry = Math.abs(x - entryX) < 24 && Math.abs(y - best.c) < best.half - 10;
    if (atEntry) return [c.c + goal * reach, best.c];
    return [entryX, best.c];
  }
  return [tx, ty];
}

export const onHill = (hill, x, y) => hill && ((x - hill.x) / hill.rx) ** 2 + ((y - hill.y) / hill.ry) ** 2 < 1;

/** Place sanity for tests and for world creation: every place is on dry land and inside the map. */
export function layoutProblems(layout) {
  const out = [];
  const places = layout.places();
  for (const p of places) {
    if (p.x < WORLD.margin || p.x > WORLD.width - WORLD.margin || p.y < WORLD.margin || p.y > WORLD.height - WORLD.margin) out.push(`${layout.id}: ${p.id} is outside the map`);
    if (isWater(layout.canals, p.x, p.y)) out.push(`${layout.id}: ${p.id} stands in water`);
    for (const c of layout.canals) if (Math.abs(p.x - c.c) < c.half + p.radius * 0.45) out.push(`${layout.id}: ${p.id} touches canal ${c.id}`);
  }
  for (const pr of layout.props(places)) if (isWater(layout.canals, pr.x, pr.y)) out.push(`${layout.id}: prop ${pr.id} stands in water`);
  return out;
}
