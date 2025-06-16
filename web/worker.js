/* eslint-env worker */

/* ─────────────────────── Word lists & constants ────────────────────── */
/* reordered list + seconds%7 opener selection */
const OPENERS = ['SLATE', 'TRACE', 'CRANE', 'CARTE', 'ROATE', 'SALET', 'REAST'];

let guesses, solutions;
let candidates    = [];
let currentGuess  = '';

const stateStack  = [];   // history for Back

/* ─────────────────────────── utilities ─────────────────────────────── */
function distinct (w) { return new Set(w).size; }

function code (guess, answer) {
  let x = 0; let p = 1;
  const pool = [...answer];
  const col  = [0, 0, 0, 0, 0];

  // greens
  for (let i = 0; i < 5; ++i) {
    if (guess[i] === answer[i]) { col[i] = 2; pool[i] = null; }
  }
  // yellows
  for (let i = 0; i < 5; ++i) {
    if (col[i] === 0) {
      const j = pool.indexOf(guess[i]);
      if (j !== -1) { col[i] = 1; pool[j] = null; }
    }
  }
  for (const t of col) { x += t * p; p *= 3; }
  return x;                               // 0‥242
}

async function loadLists () {
  if (guesses) return;

  const base = new URL(import.meta.url);
  const gURL = new URL('data/guesses.json',   base).href;
  const sURL = new URL('data/solutions.json', base).href;

  try {
    const [g, s] = await Promise.all([fetch(gURL), fetch(sURL)]);
    guesses   = await g.json();
    solutions = await s.json();
  } catch (err) {
    self.postMessage({ kind: 'error', error: 'Word lists failed to load' });
  }
}

function threshold (n) {
  if (n > 300) return 2;
  if (n > 20)  return 0.5;
  return 0;
}

/* ────────────────── scoring & alternative finder ───────────────────── */
function chooseGuess () {
  const N = candidates.length;
  let bestScore = Infinity;
  let bestWord  = '';

  /* Pass 1 – find absolute best */
  for (const g of guesses) {
    let score = 0;
    const buckets = new Uint16Array(243);
    for (const s of candidates) buckets[code(g, s)]++;
    for (const n of buckets) score += n * n;
    if (score < bestScore || (score === bestScore && distinct(g) > distinct(bestWord))) {
      bestScore = score;
      bestWord  = g;
    }
  }

  const bestE   = bestScore / N;
  const limit   = threshold(N);
  const safeAlt = [bestWord];      // ensure bestWord is always index 0

  let secondBestE = Infinity;
  let secondBest  = '';

  /* Pass 2 – collect safe alternatives (ΔE ≤ limit) */
  for (const g of guesses) {
    if (g === bestWord) continue;

    let score = 0;
    const buckets = new Uint16Array(243);
    for (const s of candidates) buckets[code(g, s)]++;
    for (const n of buckets) score += n * n;

    const e = score / N;
    if (e - bestE <= limit) {
      safeAlt.push(g);
    } else if (e < secondBestE) {
      secondBestE = e;
      secondBest  = g;
    }
  }

  return { bestWord, safeAlt, costlyAlt: secondBest || null };
}

/* ─────────────────────── History helpers ───────────────────────────── */
function pushState () {
  stateStack.push({ candidates: [...candidates], currentGuess });
}
function popState () {
  if (!stateStack.length) return false;
  const prev   = stateStack.pop();
  candidates    = prev.candidates;
  currentGuess  = prev.currentGuess;
  return true;
}

/* ─────────────────────────── main logic ────────────────────────────── */
self.onmessage = async ({ data }) => {
  const { kind, feedback, guess } = data;
  await loadLists();
  if (!guesses) return;

  /* ─── initial start ─── */
  if (kind === 'start') {
    candidates        = solutions.slice();
    stateStack.length = 0;

    /* pick opener deterministically: seconds % 7 */
    const sec   = new Date().getSeconds();
    currentGuess = OPENERS[sec % OPENERS.length];

    self.postMessage({
      kind : 'guess',
      guess: currentGuess,
      alts : OPENERS                  // Another cycles strictly within the prime 7
    });
    return;
  }

  /* ─── manual / alt guess ─── */
  if (kind === 'manual') {
    currentGuess = guess.toUpperCase();
    self.postMessage({ kind: 'ack' });
    return;
  }

  /* ─── undo ─── */
  if (kind === 'undo') {
    if (popState()) {
      self.postMessage({ kind: 'guess', guess: currentGuess, undone: true });
    } else {
      self.postMessage({ kind: 'error', error: 'Nothing to undo' });
    }
    return;
  }

  /* ─── reroll opener ─── */
  if (kind === 'reroll') {
    const sec   = new Date().getSeconds();
    currentGuess = OPENERS[sec % OPENERS.length];
    self.postMessage({ kind: 'guess', guess: currentGuess, alts: OPENERS });
    return;
  }

  /* ─── compute next suggestion ─── */
  if (kind === 'next') {
    pushState();
    candidates = candidates.filter(w => code(currentGuess, w) === feedback);

    if (candidates.length === 0) {
      self.postMessage({ kind: 'error', error: 'Contradictory feedback!' });
      return;
    }
    if (candidates.length === 1) {
      self.postMessage({ kind: 'solved', guess: candidates[0] });
      return;
    }

    const { bestWord, safeAlt, costlyAlt } = chooseGuess();
    currentGuess = bestWord;
    self.postMessage({
      kind   : 'guess',
      guess  : bestWord,
      alts   : safeAlt,
      altWarn: costlyAlt || null
    });
  }
};
