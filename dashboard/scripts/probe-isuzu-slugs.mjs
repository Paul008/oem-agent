#!/usr/bin/env node
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const carNames = [
  'D-MAX-4x4-X-TERRAIN-Crew-Cab-Ute',
  'D-MAX-4x4-LS-U+-Crew-Cab-Ute',
  'D-MAX-4x4-LS-U-Crew-Cab-Ute',
  'D-MAX-4x4-LS-U-Crew-Cab-Chassis',
];

for (const cn of carNames) {
  const ek = `isuzu-${slugify(cn)}`;
  console.log(`${cn} → ${ek}`);
}
