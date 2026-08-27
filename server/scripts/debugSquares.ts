/**
 * debugSquares.ts — Debug the square outline detector on a test image.
 */
import { readFileSync } from 'node:fs';
import { decodeImage, toGray } from '../src/ocr/image.js';
import { findSquareOutlines, findUnderlines } from '../src/ocr/detectFieldsRules.js';

const imagePath = process.argv[2] ?? 'C:/Users/siofa/AppData/Local/Temp/opencode/test-form2.png';
const bytes = readFileSync(imagePath);
const image = decodeImage(bytes.buffer as ArrayBuffer, 'image/png');
const gray = toGray(image, 1600);
console.log(`gray ${gray.width}x${gray.height}`);

const underlines = findUnderlines(gray);
console.log(`underlines: ${underlines.length}`);
for (const u of underlines) console.log(`  x=${u.x} y=${u.y} w=${u.width} h=${u.height}`);

const squares = findSquareOutlines(gray);
console.log(`squares: ${squares.length}`);
for (const s of squares) console.log(`  x=${s.x} y=${s.y} w=${s.width} h=${s.height}`);

// Manually probe the known squares (drawn at: Marital row y=1190, Yes/No y=1270, Gender y=1360)
const probes = [
  { name: 'Single', x: 160, y: 1190 },
  { name: 'Married', x: 420, y: 1190 },
  { name: 'Other', x: 690, y: 1190 },
  { name: 'Yes', x: 560, y: 1270 },
  { name: 'No', x: 700, y: 1270 },
  { name: 'Male', x: 200, y: 1360 },
  { name: 'Female', x: 400, y: 1360 },
];
for (const probe of probes) {
  const cx = probe.x + 13;
  const cy = probe.y + 13;
  let rowDark = 0;
  for (let x = probe.x - 2; x <= probe.x + 28; x += 1) {
    if (gray.data[probe.y * gray.width + x] < 150) rowDark += 1;
  }
  console.log(`probe ${probe.name} (${probe.x},${probe.y}): top-row dark px = ${rowDark}`);
}

// ── Manual step-by-step trace on the "Yes" square (560,1270,26px) ──────────
const size = 26;
const half = Math.floor(size / 2);
// Candidate window near center (573,1283) that the grid would try.
for (const [cx, cy] of [[571, 1282], [571, 1285], [574, 1282], [574, 1285]] as const) {
  const x0 = cx - half;
  const y0 = cy - half;
  const x1 = cx + half;
  const y1 = cy + half;
  const sd = (side: string, fixed: number, a: number, b: number) => {
    let best = 0;
    for (const off of [-2, -1, 0, 1, 2]) {
      let dark = 0;
      let total = 0;
      const f = fixed + off;
      if (side === 'top' || side === 'bottom') {
        if (f < 0 || f >= gray.height) continue;
        for (let x = a; x <= b; x += 1) { if (gray.data[f * gray.width + x] < 150) dark += 1; total += 1; }
      } else {
        if (f < 0 || f >= gray.width) continue;
        for (let y = a; y <= b; y += 1) { if (gray.data[y * gray.width + f] < 150) dark += 1; total += 1; }
      }
      if (total && dark / total > best) best = dark / total;
    }
    return best;
  };
  const top = sd('top', y0, x0, x1);
  const bottom = sd('bottom', y1, x0, x1);
  const left = sd('left', x0, y0, y1);
  const right = sd('right', x1, y0, y1);
  const cornerDark = (x: number, y: number) => {
    let dark = 0;
    for (let dy = -2; dy <= 2; dy += 1)
      for (let dx = -2; dx <= 2; dx += 1)
        if (gray.data[(y + dy) * gray.width + (x + dx)] < 160) dark += 1;
    return dark;
  };
  const c0 = cornerDark(x0, y0);
  const c1 = cornerDark(x1, y0);
  const c2 = cornerDark(x0, y1);
  const c3 = cornerDark(x1, y1);
  console.log(
    `window(${cx},${cy}) size${size}: top=${top.toFixed(2)} bottom=${bottom.toFixed(2)} left=${left.toFixed(2)} right=${right.toFixed(2)} corners=[${c0},${c1},${c2},${c3}]`
  );
}
process.exit(0);
