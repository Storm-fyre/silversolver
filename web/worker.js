/* eslint-env worker */
let guesses, solutions, candidates, currentGuess;

/* ------------------------------------------------------------------ util */
function distinct(w){ return new Set(w).size; }

function code(guess,answer){
  let x=0,p=1;
  const pool=[...answer];
  const col=[0,0,0,0,0];

  // greens
  for(let i=0;i<5;i++){
    if(guess[i]===answer[i]){ col[i]=2; pool[i]=null; }
  }
  // yellows
  for(let i=0;i<5;i++){
    if(col[i]===0){
      const j=pool.indexOf(guess[i]);
      if(j!==-1){ col[i]=1; pool[j]=null; }
    }
  }
  for(const t of col){ x+=t*p; p*=3; }
  return x;              // 0‥242
}

async function loadLists(){
  if(guesses) return;     // already cached

  /* Build absolute URLs so they work from any sub-folder & any host */
  const base   = new URL(import.meta.url);
  const gURL   = new URL('data/guesses.json',   base).href;
  const sURL   = new URL('data/solutions.json', base).href;

  try{
    const [g,s]=await Promise.all([fetch(gURL),fetch(sURL)]);
    guesses   = await g.json();
    solutions = await s.json();
    candidates= solutions.slice();      // copy
  }catch(err){
    self.postMessage({kind:'error',error:'Failed to load word lists ('+err+')'});
  }
}

/* ---------------------------------------------------------------- main */
self.onmessage= async({data})=>{
  const{kind,feedback}=data;
  await loadLists();
  if(!guesses) return;                  // load failed → error already sent

  if(kind==='start'){
    const OPENERS = ['SALET','SLATE','TRACE','CRANE','CARTE','ROATE','REAST'];
    currentGuess  = OPENERS[Math.floor(Math.random() * OPENERS.length)];
    self.postMessage({kind:'guess',guess:currentGuess});
    return;
  }

  /* Narrow candidates by previous feedback */
  candidates=candidates.filter(w=>code(currentGuess,w)===feedback);

  if(candidates.length===0){
    self.postMessage({kind:'error',error:'Contradictory feedback!'});
    return;
  }
  if(candidates.length===1){
    self.postMessage({kind:'solved',guess:candidates[0]});
    return;
  }

  /* Pick next guess (entropy ≈ minimise Σ n²) */
  let bestScore=Infinity, bestWord='', bestDistinct=0;
  for(const g of guesses){
    const buckets=new Uint16Array(243);
    for(const s of candidates) buckets[code(g,s)]++;
    let score=0;
    for(const n of buckets) score+=n*n;

    if(score<bestScore || (score===bestScore && distinct(g)>bestDistinct)){
      bestScore=score; bestWord=g; bestDistinct=distinct(g);
    }
  }
  currentGuess=bestWord;
  self.postMessage({kind:'guess',guess:bestWord});
};
