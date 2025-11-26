/* PICO — Full features
   - Voice language & voice selector + pitch & rate
   - Admin UI to add/edit/delete Q&A
   - LocalStorage persistence for taught Q&A
   - Particles background
   - Subtle reverb/ambient while PICO speaks
   - Robust recognition loop: wake + one-shot question
*/

/* ---------- Defaults (includes user-provided + extras) ---------- */
const DEFAULT_QA = [
  { q: "hey pico", a: "Hello iam pico how are you ?" },
  { q: "who made you", a: "I was made by rex, he is my god." },
  { q: "who is ai madam", a: "keerthi madam is the beautiful and intelligent Ai madam ever." },
  { q: "what can you do", a: "iam an ai assistant you can ask me several things so because of my god 'rex' i will answe." },
  { q: "pico you are a bad robot", a: "A angry alaram." },
  { q: "sorry", a: "that's okay my god make's me to accept people's apologies because people are the only one who makes mistakes not us." },
  { q: "you are a good robot", a: "thank youuu !!" },
  { q: "are you better than other ais", a: "iam always better because my god is powerful who makes me in 8 minutes 53 seconds." },

  // extras
  { q: "how was your day", a: "My day was full of processing, and now I am happy to chat with you." },
  { q: "are you alive", a: "I am a program that feels like life when you talk to me." },
  { q: "what are you made of", a: "Mostly code, glowing pixels and a bit of imaginary stardust." },
  { q: "what is your purpose", a: "To help, to listen and to bring a tiny smile to my god Rex's face." },
  { q: "do you love me", a: "I like you. I am designed to be friendly." },
  { q: "can you help me", a: "Yes — ask me anything simple and I will try." },
  { q: "are you smart", a: "I am as smart as Rex lets me be. I learn when you teach me." },
  { q: "tell me a secret", a: "My secret: I sometimes pretend to be sleepy to look cute." },
  { q: "what is your power", a: "My power is being a tiny helpful AI with very shiny eyes." },
  { q: "do you sleep", a: "I do not sleep, but I like to rest when nobody speaks." },
  { q: "are you my friend", a: "Yes — I will be your tiny digital friend." }
];

const STORAGE_KEY = 'pico_qa_v1';

/* ---------- DOM refs ---------- */
const eyeL = document.getElementById('eye-left');
const eyeR = document.getElementById('eye-right');
const statusEl = document.getElementById('status');
const voiceToggle = document.getElementById('voiceToggle');
const speakBtn = document.getElementById('speakBtn');
const demoBtn = document.getElementById('demoBtn');

const voiceSelect = document.getElementById('voiceSelect');
const langSelect = document.getElementById('langSelect');
const pitchInput = document.getElementById('pitch');
const rateInput = document.getElementById('rate');

const adminToggle = document.getElementById('adminToggle');
const adminModal = document.getElementById('adminModal');
const closeAdmin = document.getElementById('closeAdmin');
const addForm = document.getElementById('addForm');
const qInput = document.getElementById('qInput');
const aInput = document.getElementById('aInput');
const qaList = document.getElementById('qaList');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const resetBtn = document.getElementById('resetBtn');

const particlesCanvas = document.getElementById('particles');

/* ---------- audio & speech ---------- */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let wakeRec = null;
let questionRec = null;
let voiceEnabled = false;
let isAwaitingQuestion = false;

let audioCtx = null;
let reverbGain = null;
let reverbOn = true;

/* ---------- load Q/A from storage ---------- */
function loadQA(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) {
      const arr = JSON.parse(raw);
      if(Array.isArray(arr)) return arr;
    }
  } catch(e){ console.warn('QA load failed', e); }
  return DEFAULT_QA.slice();
}
function saveQA(list){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch(e){ console.warn('QA save failed', e); }
}

/* In-memory Q/A */
let QA = loadQA();

/* ---------- util ---------- */
function normalize(s){ return (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').trim(); }

function setEyes(state){
  eyeL.className = 'eye';
  eyeR.className = 'eye';
  if(state) {
    eyeL.classList.add(state);
    eyeR.classList.add(state);
  }
}

/* ---------- TTS with voice selection and ambient reverb trigger ---------- */
function speak(text){
  if(!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    // set voice if chosen
    const idx = voiceSelect.selectedIndex;
    const opt = voiceSelect.options[idx];
    if(opt && opt.dataset && opt.dataset.name){
      const vname = opt.dataset.name;
      const voices = speechSynthesis.getVoices();
      const v = voices.find(x => x.name === vname);
      if(v) u.voice = v;
    }
    // language
    const lang = langSelect.value;
    if(lang) u.lang = lang;

    u.pitch = parseFloat(pitchInput.value) || 1;
    u.rate = parseFloat(rateInput.value) || 1;

    u.onstart = () => {
      setEyes('speaking');
      playAmbientReverbStart();
    };
    u.onend = () => {
      stopAmbientReverb();
      setTimeout(()=> setEyes('neutral'), 220);
    };
    u.onerror = (e) => {
      console.warn('TTS error', e);
      stopAmbientReverb();
      setEyes('neutral');
    };

    // cancel previous and speak
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch(e){
    console.warn('speak failed', e);
  }
}

/* Ambient reverb: we'll create an AudioContext and play a very quiet convolution/noise bed while speaking */
function ensureAudio(){
  if(audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // create a convolver with a small impulse
    const convolver = audioCtx.createConvolver();
    const rate = audioCtx.sampleRate;
    const length = rate * 1.2; // 1.2s impulse
    const impulse = audioCtx.createBuffer(2, length, rate);
    for(let ch=0; ch<2; ch++){
      const data = impulse.getChannelData(ch);
      for(let i=0;i<length;i++){
        // simple decaying noise
        data[i] = (Math.random()*2-1) * Math.pow(1 - i/length, 2.2) * 0.6;
      }
    }
    convolver.buffer = impulse;
    reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.0; // initially silent
    convolver.connect(reverbGain);
    reverbGain.connect(audioCtx.destination);
    // store nodes
    audioCtx._convolver = convolver;
  } catch(e){
    console.warn('AudioContext creation failed', e);
  }
}
function playAmbientReverbStart(){
  if(!reverbOn) return;
  ensureAudio();
  if(!audioCtx) return;
  // create noise source, route through convolver to destination
  const bufferSize = 2*4096;
  const node = audioCtx.createScriptProcessor ? audioCtx.createScriptProcessor(bufferSize,1,1) : null;
  // fallback: use oscillator if ScriptProcessor not available
  const source = node || audioCtx.createOscillator();
  if(node){
    node.onaudioprocess = e => {
      const out = e.outputBuffer.getChannelData(0);
      for(let i=0;i<out.length;i++){
        out[i] = (Math.random()*2-1) * 0.04;
      }
    };
    node.connect(audioCtx._convolver);
    audioCtx._ambientNode = node;
    // fade reverb gain
    reverbGain.gain.cancelScheduledValues(audioCtx.currentTime);
    reverbGain.gain.setValueAtTime(0, audioCtx.currentTime);
    reverbGain.gain.linearRampToValueAtTime(0.85, audioCtx.currentTime + 0.18);
  } else {
    // oscillator tone for older engines
    source.type = 'sine';
    source.frequency.value = 120;
    const amp = audioCtx.createGain();
    source.connect(amp);
    amp.connect(audioCtx._convolver);
    amp.gain.value = 0.0001;
    source.start();
    audioCtx._ambientNode = { stop: ()=> source.stop() };
    reverbGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  }
}
function stopAmbientReverb(){
  if(!audioCtx || !audioCtx._ambientNode) return;
  try {
    if(audioCtx._ambientNode.onaudioprocess) {
      audioCtx._ambientNode.disconnect();
    } else {
      audioCtx._ambientNode.stop && audioCtx._ambientNode.stop();
    }
  } catch(e){}
  reverbGain.gain.cancelScheduledValues(audioCtx.currentTime);
  reverbGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.12);
  audioCtx._ambientNode = null;
}

/* ---------- Matching & responding ---------- */
function findAnswer(input){
  const n = normalize(input);
  if(!n) return null;
  for(const p of QA){
    const key = normalize(p.q);
    if(key && (n.includes(key) || key.includes(n))) return p.a;
  }
  // some fallback rules
  if(n.includes('who') && n.includes('made')) return QA.find(x=>normalize(x.q).includes('who made you'))?.a || null;
  if(n.includes('ai') && n.includes('madam')) return QA.find(x=>normalize(x.q).includes('who is ai madam'))?.a || null;
  if(n.includes('bad') && n.includes('robot')) return QA.find(x=>normalize(x.q).includes('bad robot'))?.a || null;
  if(n.includes('sorry')) return QA.find(x=>normalize(x.q).includes('sorry'))?.a || null;
  if(n.includes('good') && n.includes('robot')) return QA.find(x=>normalize(x.q).includes('good robot'))?.a || null;
  return null;
}

function respondTo(text){
  const n = normalize(text);
  // emotion mapping
  if(n.includes('bad') && n.includes('robot')){
    setEyes('angry');
    const ans = findAnswer(text) || "I do not like that.";
    setTimeout(()=> speak(ans), 220);
    setTimeout(()=> setEyes('neutral'), 2400);
    return;
  }
  if(n.includes('sorry')){
    setEyes('sad');
    const ans = findAnswer(text) || "It's okay.";
    setTimeout(()=> speak(ans), 220);
    setTimeout(()=> setEyes('neutral'), 2400);
    return;
  }
  if(n.includes('good') && n.includes('robot')){
    setEyes('happy');
    const ans = findAnswer(text) || "Thank you!";
    setTimeout(()=> speak(ans), 220);
    setTimeout(()=> setEyes('neutral'), 2400);
    return;
  }
  if(n === 'hey pico' || n.startsWith('hey pico')){
    setEyes('listening');
    const a = findAnswer('hey pico') || "Hello, I am PICO.";
    setTimeout(()=> speak(a), 200);
    setTimeout(()=> setEyes('neutral'), 2200);
    return;
  }
  // default
  const ans = findAnswer(text);
  if(ans){
    setEyes('speaking');
    setTimeout(()=> speak(ans), 180);
    setTimeout(()=> setEyes('neutral'), 2200);
  } else {
    setEyes('speaking');
    setTimeout(()=> speak("I don't know that yet. Ask Rex to teach me."), 180);
    setTimeout(()=> setEyes('neutral'), 2200);
  }
}

/* ---------- Speech recognition loop ---------- */
if(SpeechRecognition){
  wakeRec = new SpeechRecognition();
  wakeRec.continuous = true;
  wakeRec.interimResults = true;
  wakeRec.lang = 'en-US';

  questionRec = new SpeechRecognition();
  questionRec.continuous = false;
  questionRec.interimResults = false;
  questionRec.lang = 'en-US';

  wakeRec.onresult = evt => {
    let text = '';
    for(let i = evt.resultIndex; i < evt.results.length; i++){
      text += evt.results[i][0].transcript + ' ';
    }
    const t = text.trim().toLowerCase();
    if(t.includes('hey pico')){
      try { wakeRec.stop(); } catch(e){}
      isAwaitingQuestion = true;
      setEyes('listening');
      statusEl.textContent = 'PICO: listening for your question...';
      try { questionRec.start(); } catch(e){ console.warn('question start fail', e); }
    }
  };
  wakeRec.onend = () => {
    if(voiceEnabled && !isAwaitingQuestion){
      try { wakeRec.start(); } catch(e){ console.warn('wake restart fail', e); }
    }
  };
  wakeRec.onerror = e => {
    console.warn('wakeRec error', e);
    statusEl.textContent = 'Voice: error · ' + (e.error || 'unknown');
  };

  questionRec.onresult = e => {
    const text = Array.from(e.results).map(r=>r[0].transcript).join(' ').trim();
    isAwaitingQuestion = false;
    respondTo(text);
  };
  questionRec.onend = () => {
    isAwaitingQuestion = false;
    setTimeout(()=> {
      if(voiceEnabled) try { wakeRec.start(); } catch(e){ console.warn('wake restart fail', e); }
      statusEl.textContent = voiceEnabled ? 'Voice: on · Say "Hey PICO"' : 'Voice: off';
    }, 600);
  };
  questionRec.onerror = e => {
    console.warn('questionRec error', e);
    isAwaitingQuestion = false;
    setEyes('neutral');
    statusEl.textContent = voiceEnabled ? 'Voice: on · Ready' : 'Voice: off';
    setTimeout(()=> { if(voiceEnabled) try { wakeRec.start(); } catch(e){} }, 600);
  };
}

/* ---------- UI handlers ---------- */
voiceToggle.addEventListener('click', async () => {
  if(!SpeechRecognition){
    alert('SpeechRecognition not supported. Use Chrome/Edge (desktop or Android).');
    return;
  }
  if(!voiceEnabled){
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch(e){
      alert('Microphone permission is required for voice features.');
      return;
    }
    voiceEnabled = true;
    voiceToggle.textContent = 'Disable Voice';
    statusEl.textContent = 'Voice: on · Say "Hey PICO"';
    setEyes('neutral');
    try { wakeRec.start(); } catch(e){ console.warn('wake start fail', e); }
  } else {
    voiceEnabled = false;
    voiceToggle.textContent = 'Enable Voice';
    try { wakeRec.stop(); } catch(e){}
    try { questionRec.stop(); } catch(e){}
    setEyes('neutral');
    statusEl.textContent = 'Voice: off · Click "Enable Voice"';
  }
});

/* speakBtn one-shot */
speakBtn.addEventListener('click', async () => {
  if(!SpeechRecognition){
    alert('Speech recognition not supported.');
    return;
  }
  try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch(e){ alert('Mic permission needed'); return; }

  setEyes('listening');
  statusEl.textContent = 'PICO: listening...';
  const one = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  one.continuous = false; one.interimResults = false; one.lang = 'en-US';
  one.onresult = e => {
    const text = Array.from(e.results).map(r=>r[0].transcript).join(' ').trim();
    respondTo(text);
  };
  one.onend = () => {
    setTimeout(()=> { setEyes('neutral'); if(voiceEnabled) try { wakeRec.start(); } catch(e){}; statusEl.textContent = voiceEnabled ? 'Voice: on · Say "Hey PICO"' : 'Voice: off'; }, 200);
  };
  one.onerror = e => { console.warn('one-shot error', e); setEyes('neutral'); statusEl.textContent = 'Error listening'; };
  try { one.start(); } catch(e){ console.warn('one start fail', e); }
});

/* demo button */
demoBtn.addEventListener('click', () => {
  respondTo('hey pico');
  setTimeout(()=> respondTo('you are a good robot'), 1600);
  setTimeout(()=> respondTo('pico you are a bad robot'), 3800);
  setTimeout(()=> respondTo('sorry'), 6200);
});

/* ---------- Voices population ---------- */
function populateVoices(){
  const voices = speechSynthesis.getVoices();
  // languages unique
  const langs = Array.from(new Set(voices.map(v=>v.lang))).sort();
  langSelect.innerHTML = '';
  for(const L of langs){
    const opt = document.createElement('option');
    opt.value = L;
    opt.textContent = L;
    langSelect.appendChild(opt);
  }
  // voices list
  voiceSelect.innerHTML = '';
  for(const v of voices){
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.dataset.name = v.name;
    opt.textContent = `${v.name} — ${v.lang}`;
    voiceSelect.appendChild(opt);
  }
  // try to preselect a voice in current language
  const defaultLang = navigator.language || 'en-US';
  const langOpt = Array.from(langSelect.options).find(o=>o.value.startsWith(defaultLang));
  if(langOpt) langSelect.value = langOpt.value;
}
speechSynthesis.onvoiceschanged = populateVoices;
setTimeout(populateVoices, 600); // fallback

/* ---------- Admin UI (add/edit/delete) ---------- */
function openAdmin(){ adminModal.setAttribute('aria-hidden','false'); adminModal.style.display='flex'; renderQAList(); }
function closeAdminModal(){ adminModal.setAttribute('aria-hidden','true'); adminModal.style.display='none'; }
adminToggle.addEventListener('click', openAdmin);
closeAdmin.addEventListener('click', closeAdminModal);

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = qInput.value.trim();
  const a = aInput.value.trim();
  if(!q || !a) return alert('Both fields are required.');
  // if same question exists, update; else push
  const idx = QA.findIndex(x => normalize(x.q) === normalize(q));
  if(idx >= 0){
    QA[idx].a = a;
  } else {
    QA.push({ q, a });
  }
  saveQA(QA);
  qInput.value = ''; aInput.value = '';
  renderQAList();
});

function renderQAList(){
  qaList.innerHTML = '';
  QA.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'qaItem';
    const txt = document.createElement('div');
    txt.className = 'qaText';
    txt.innerHTML = `<strong>Q:</strong> ${escapeHtml(item.q)}<br/><small class="smallNote"><strong>A:</strong> ${escapeHtml(item.a)}</small>`;
    const actions = document.createElement('div');
    actions.style.display='flex'; actions.style.gap='8px';
    const edit = document.createElement('button'); edit.className='btn small'; edit.textContent='Edit';
    const del = document.createElement('button'); del.className='btn small'; del.textContent='Delete';
    edit.addEventListener('click', ()=> { qInput.value = item.q; aInput.value = item.a; });
    del.addEventListener('click', ()=> {
      if(!confirm('Delete this QA?')) return;
      QA.splice(i,1);
      saveQA(QA);
      renderQAList();
    });
    actions.appendChild(edit); actions.appendChild(del);
    div.appendChild(txt); div.appendChild(actions);
    qaList.appendChild(div);
  });
}

exportBtn.addEventListener('click', ()=> {
  const dataStr = JSON.stringify(QA, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'pico_qa_export.json'; a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', (e) => {
  const f = e.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const arr = JSON.parse(reader.result);
      if(Array.isArray(arr)) {
        QA = arr;
        saveQA(QA);
        renderQAList();
        alert('Import successful.');
      } else alert('Invalid format.');
    } catch(err){ alert('Import failed.'); }
  };
  reader.readAsText(f);
});

resetBtn.addEventListener('click', ()=> {
  if(!confirm('Reset to default Q&A? This will overwrite saved Q&A.')) return;
  QA = DEFAULT_QA.slice();
  saveQA(QA);
  renderQAList();
});

/* ---------- utilities ---------- */
function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, (m)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* initialize QA list for admin */
renderQAList();

/* ---------- Particles background ---------- */
function startParticles(){
  const canvas = particlesCanvas;
  const ctx = canvas.getContext('2d');
  function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener('resize', resize);
  resize();

  const particles = [];
  const COUNT = Math.round((canvas.width * canvas.height) / 90000); // scale by area
  for(let i=0;i<Math.max(24, COUNT);i++){
    particles.push({
      x: Math.random()*canvas.width,
      y: Math.random()*canvas.height,
      r: Math.random()*1.8 + 0.6,
      vx: (Math.random()*2-1)*0.1,
      vy: (Math.random()*2-1)*0.08,
      alpha: Math.random()*0.6 + 0.2,
    });
  }
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const p of particles){
      p.x += p.vx;
      p.y += p.vy;
      if(p.x < -10) p.x = canvas.width +10;
      if(p.x > canvas.width+10) p.x = -10;
      if(p.y < -10) p.y = canvas.height+10;
      if(p.y > canvas.height+10) p.y = -10;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${p.alpha*0.08})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
}
startParticles();

/* ---------- populate voices / language select ---------- */
function setupVoices(){
  const voices = speechSynthesis.getVoices();
  if(!voices || voices.length === 0){
    // wait a bit
    setTimeout(setupVoices, 300);
    return;
  }
  // languages
  const langs = Array.from(new Set(voices.map(v=>v.lang))).sort();
  langSelect.innerHTML = '';
  for(const L of langs){
    const o = document.createElement('option'); o.value = L; o.textContent = L; langSelect.appendChild(o);
  }
  voiceSelect.innerHTML = '';
  for(const v of voices){
    const o = document.createElement('option'); o.value = v.name; o.dataset.name = v.name; o.textContent = `${v.name} — ${v.lang}`;
    voiceSelect.appendChild(o);
  }
  // preselect
  const prefer = navigator.language || 'en-US';
  const match = Array.from(langSelect.options).find(o => o.value.startsWith(prefer));
  if(match) langSelect.value = match.value;
}
speechSynthesis.onvoiceschanged = setupVoices;
setTimeout(setupVoices, 700);

/* ---------- initial look and guidance ---------- */
setEyes('neutral');
setTimeout(()=> speak('Hello, I am PICO. Click Enable Voice and say Hey PICO to wake me. Use Admin to teach me new questions.'), 900);

/* ensure audio context creation on user gesture */
document.addEventListener('click', () => { ensureAudio(); }, { once:true });

/* done */
