/* eslint-env browser */

/* ───────────────── Secret-door logic ───────────────── */
const silverSpan = document.getElementById('silver');
const solverSpan = document.getElementById('solver');

const PATTERN   = ['silver','solver','silver','solver','silver','solver'];
const WINDOW_MS = 3000;

let seqIdx   = 0;
let seqStart = 0;
let ultraOn  = false;

function resetSeq () { seqIdx = 0; seqStart = 0; }

function recordTap (name) {
  const now = Date.now();

  // too slow - restart
  if (seqIdx && (now - seqStart) > WINDOW_MS) resetSeq();

  if (seqIdx === 0) seqStart = now;

  if (PATTERN[seqIdx] !== name) {          // wrong element
    resetSeq();
    return;
  }
  seqIdx++;

  if (seqIdx === PATTERN.length) {         // success!
    unlockUltra();
    resetSeq();
  }
}

silverSpan.addEventListener('click', () => recordTap('silver'));
solverSpan.addEventListener('click', () => recordTap('solver'));

function unlockUltra () {
  if (ultraOn) return;
  ultraOn = true;

  /* change heading */
  document.getElementById('title').textContent = 'Ultra Solver';

  /* reveal extra controls */
  backBtn.classList.remove('hidden');
  anotherBtn.classList.remove('hidden');
  editBtn.classList.remove('hidden');
}

/* ───────────────────────── DOM refs ───────────────────────── */
const grid       = document.getElementById('grid');
const nextBtn    = document.getElementById('nextBtn');
const statusEl   = document.getElementById('status');
const spinner    = document.getElementById('spinner');
const tipEl      = document.getElementById('tip');

const backBtn    = document.getElementById('backBtn');
const anotherBtn = document.getElementById('anotherBtn');
const editBtn    = document.getElementById('editBtn');
const wordInput  = document.getElementById('wordInput');

/* ───────────────────────── Game state ─────────────────────── */
let currentRow     = 0;
let gameActive     = true;
let errorState     = false;
let editMode       = false;

let altList        = [];   // safe alternatives (index 0 = main suggestion)
let altIdx         = 0;
let altWarnWord    = null; // costlier alternative if all safe ones are used

let worker;

/* ─────────────────────── helper utilities ─────────────────── */
function makeGrid () {
  grid.innerHTML = '';
  for (let r = 0; r < 6; ++r) {
    for (let c = 0; c < 5; ++c) {
      const cell = document.createElement('div');
      cell.className   = 'square gray';
      cell.dataset.row = r;
      cell.dataset.state = '0';
      grid.appendChild(cell);

      cell.addEventListener('click', () => {
        if (!gameActive || +cell.dataset.row !== currentRow) return;
        const next = (+cell.dataset.state + 1) % 3;
        cell.dataset.state = next;
        cell.className     = 'square ' + ['gray', 'yellow', 'green'][next];
      });
    }
  }
}

function clearRow (rowIdx) {
  [...grid.children]
    .slice(rowIdx * 5, rowIdx * 5 + 5)
    .forEach(cell => {
      cell.textContent   = '';
      cell.dataset.state = '0';
      cell.className     = 'square gray';
    });
}

function paintRow (rowIdx, word) {
  const cells = [...grid.children].slice(rowIdx * 5, rowIdx * 5 + 5);
  for (let i = 0; i < 5; ++i) cells[i].textContent = word[i];
}

function rowToCode (rowIdx) {
  let code = 0; let pow = 1;
  [...grid.children]
    .slice(rowIdx * 5, rowIdx * 5 + 5)
    .forEach(cell => {
      code += +cell.dataset.state * pow;
      pow  *= 3;
    });
  return code;
}

function showSpinner (on) {
  spinner.classList.toggle('hidden', !on);
  nextBtn.disabled = on;
}

function setErrorVisual (on) {
  errorState          = on;
  nextBtn.textContent = on
    ? 'I will cheat properly this time'
    : 'Suggest Next Guess';

  tipEl.classList.toggle('border',         on);
  tipEl.classList.toggle('border-red-500', on);
  tipEl.classList.toggle('rounded',        on);
  tipEl.classList.toggle('p-2',            on);
}

function updateInputToGrid () {
  if (!editMode) return;
  const word = wordInput.value.toUpperCase().slice(0, 5);
  wordInput.value = word;
  paintRow(currentRow, word.padEnd(5, ' '));
  nextBtn.disabled = (word.length !== 5);
}

/* ──────────────────────── worker wiring ───────────────────── */
function createWorker () {
  if (worker) worker.terminate();
  worker = new Worker('worker.js', { type: 'module' });

  worker.onmessage = ({ data }) => {
    const { kind, guess, alts, altWarn, error, undone } = data;

    if (kind === 'ack') return;
    if (undone)        return;

    showSpinner(false);

    if (kind === 'error') {
      statusEl.classList.replace('text-emerald-400', 'text-red-400');
      statusEl.textContent = error;
      setErrorVisual(true);
      return;
    }

    if (errorState) setErrorVisual(false);

    /* record alternative list for “Another” cycling */
    altList     = alts || [guess];
    altIdx      = 0;
    altWarnWord = altWarn || null;
    anotherBtn.disabled = (altList.length === 1 && !altWarnWord);

    paintRow(currentRow, guess);

    statusEl.classList.replace('text-red-400', 'text-emerald-400');

    if (kind === 'solved') {
      statusEl.textContent   = `Solved! The word is “${guess}”. 🎉`;
      gameActive             = false;               // Back still works
      nextBtn.textContent    = 'Cheat Again';
      nextBtn.disabled       = false;
    } else {
      statusEl.textContent = `Try “${guess}”`;
    }
  };

  worker.postMessage({ kind: 'start' });
}

/* ───────────────────────── New game reset ─────────────────── */
function startNewGame () {
  currentRow       = 0;
  gameActive       = true;
  editMode         = false;
  altList          = [];
  altIdx           = 0;
  altWarnWord      = null;

  wordInput.classList.add('hidden');
  wordInput.value = '';

  statusEl.textContent = '';
  setErrorVisual(false);

  makeGrid();
  createWorker();
}

/* ──────────────────────── button handlers ─────────────────── */
nextBtn.onclick = () => {
  if (!gameActive || errorState) { startNewGame(); return; }

  if (editMode) {
    const manualWord = wordInput.value.toUpperCase();
    if (!/^[A-Z]{5}$/.test(manualWord)) {
      statusEl.classList.replace('text-emerald-400', 'text-red-400');
      statusEl.textContent = 'Enter a valid 5-letter word first';
      return;
    }
    worker.postMessage({ kind: 'manual', guess: manualWord });
    editMode = false;
    wordInput.classList.add('hidden');
    wordInput.value = '';
    editBtn.textContent = 'Edit';
  }

  showSpinner(true);
  worker.postMessage({ kind: 'next', feedback: rowToCode(currentRow) });
  currentRow++;
};

editBtn.onclick = () => {
  if (!gameActive || errorState) return;

  editMode = !editMode;
  if (editMode) {
    wordInput.classList.remove('hidden');
    wordInput.focus();
    editBtn.textContent = 'Cancel';
    clearRow(currentRow);
    updateInputToGrid();
  } else {
    wordInput.classList.add('hidden');
    wordInput.value = '';
    editBtn.textContent = 'Edit';
    updateInputToGrid();
  }
};

backBtn.onclick = () => {
  if (editMode) {                   // exit manual mode first
    editMode = false;
    wordInput.classList.add('hidden');
    wordInput.value = '';
    editBtn.textContent = 'Edit';
  }

  /* Refresh-opener mode */
  if (currentRow === 0) {
    clearRow(0);
    worker.postMessage({ kind: 'reroll' });
    statusEl.textContent = '';
    if (errorState) setErrorVisual(false);
    if (!gameActive) {
      gameActive          = true;
      nextBtn.textContent = 'Suggest Next Guess';
    }
    return;
  }

  /* True undo mode */
  clearRow(currentRow);
  currentRow--;
  worker.postMessage({ kind: 'undo' });
  statusEl.textContent = '';
  if (errorState) setErrorVisual(false);
  if (!gameActive) {
    gameActive          = true;
    nextBtn.textContent = 'Suggest Next Guess';
  }
};

/* ---------- “Another” button ---------- */
anotherBtn.onclick = () => {
  if (!gameActive || errorState || editMode || anotherBtn.disabled) return;

  /* Safe alternates still available */
  if (altList.length > 1) {
    altIdx = (altIdx + 1) % altList.length;
    const newWord = altList[altIdx];
    paintRow(currentRow, newWord);
    worker.postMessage({ kind: 'manual', guess: newWord });
    statusEl.textContent = `Try “${newWord}”`;
    return;
  }

  /* Only costly alt left */
  if (altWarnWord) {
    paintRow(currentRow, altWarnWord);
    worker.postMessage({ kind: 'manual', guess: altWarnWord });
    statusEl.classList.replace('text-emerald-400', 'text-yellow-400');
    statusEl.textContent =
      'This alternative will not be as awesome as you :), ' +
      'so if you want perfection, just press "Back"—rest assured, ' +
      'this works too, almost always';
    /* after using the costly alt once, disable Another */
    altWarnWord      = null;
    anotherBtn.disabled = true;
  }
};

wordInput.addEventListener('input', updateInputToGrid);

/* ─────────────────────────── boot ─────────────────────────── */
makeGrid();
createWorker();
