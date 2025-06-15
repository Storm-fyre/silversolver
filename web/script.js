/* eslint-env browser */
/* UI controller — handles play, error styling, and full restart */

const grid     = document.getElementById('grid');
const nextBtn  = document.getElementById('nextBtn');
const statusEl = document.getElementById('status');
const spinner  = document.getElementById('spinner');
const tipEl    = document.getElementById('tip');

let currentRow   = 0;
let gameActive   = true;      // false after “Solved!”
let errorState   = false;     // true only after contradictory feedback
let worker       = null;

/* -------------------------- helpers ----------------------------------- */
function makeGrid() {
  grid.innerHTML = '';
  for (let r = 0; r < 6; ++r) {
    for (let c = 0; c < 5; ++c) {
      const cell = document.createElement('div');
      cell.className = 'square gray';
      cell.dataset.row   = r;
      cell.dataset.state = '0';          // 0 gray | 1 yellow | 2 green
      cell.textContent   = '';
      grid.appendChild(cell);

      cell.addEventListener('click', () => {
        if (!gameActive) return;
        if (+cell.dataset.row !== currentRow) return;   // lock previous rows
        const next = (+cell.dataset.state + 1) % 3;
        cell.dataset.state = next;
        cell.className     = 'square ' + ['gray','yellow','green'][next];
      });
    }
  }
}

function rowToCode(row) {
  let code = 0, pow = 1;
  [...grid.children].slice(row*5, row*5+5).forEach(cell => {
    code += +cell.dataset.state * pow;
    pow  *= 3;
  });
  return code;               // 0‥242
}

function showSpinner(state) {
  spinner.classList.toggle('hidden', !state);
  nextBtn.disabled = state;
}

function setErrorVisual(on) {
  errorState = on;
  nextBtn.textContent = on ? 'I will cheat properly this time'
                           : 'Suggest Next Guess';

  tipEl.classList.toggle('border',        on);
  tipEl.classList.toggle('border-red-500', on);
  tipEl.classList.toggle('rounded',       on);
  tipEl.classList.toggle('p-2',           on);
}

/* -------------------------- worker lifecycle -------------------------- */
function createWorker() {
  if (worker) worker.terminate();
  worker = new Worker('worker.js', { type: 'module' });

  worker.onmessage = ({ data }) => {
    const { kind, guess, error } = data;
    showSpinner(false);

    if (kind === 'error') {
      /* contradictory feedback */
      statusEl.classList.replace('text-emerald-400', 'text-red-400');
      statusEl.textContent = error;
      setErrorVisual(true);
      return;
    }

    /* any successful response clears error visuals */
    if (errorState) setErrorVisual(false);

    /* write suggested word */
    [...grid.children].slice(currentRow*5, currentRow*5+5)
      .forEach((cell, i) => { cell.textContent = guess[i]; });

    statusEl.classList.replace('text-red-400', 'text-emerald-400');
    statusEl.textContent =
      kind === 'solved'
        ? `Solved! The word is “${guess}”. 🎉`
        : `Try “${guess}”`;

    if (kind === 'solved') {
      gameActive          = false;
      nextBtn.textContent = 'Cheat Again';
      nextBtn.disabled    = false;
      return;
    }
  };

  worker.postMessage({ kind: 'start' });
}

/* -------------------------- game restart ----------------------------- */
function startNewGame() {
  currentRow   = 0;
  gameActive   = true;
  statusEl.textContent = '';
  setErrorVisual(false);
  makeGrid();
  createWorker();
}

/* -------------------------- button logic ----------------------------- */
nextBtn.onclick = () => {
  /* Restart if we’re either finished (gameActive false) OR in errorState */
  if (!gameActive || errorState) {
    startNewGame();
    return;
  }

  showSpinner(true);
  worker.postMessage({ kind: 'next', feedback: rowToCode(currentRow) });
  currentRow++;          // lock this row for editing
};

/* -------------------------- boot ------------------------------------- */
makeGrid();
createWorker();
