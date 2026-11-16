// A small seeded random generator (mulberry32). Every galley is generated from a seed, so the
// same seed always gives the same words: the basis for friend challenges and a daily galley later.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
