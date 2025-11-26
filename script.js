// -------------------------
// PICO — Split JS File
// -------------------------

// Q/A from Pico.txt
const QA = [
  { q: "hey pico", a: "Hello iam pico how are you ?" },
  { q: "who made you", a: "I was made by rex, he is my god." },
  { q: "who is ai madam", a: "keerthi madam is the beautiful and intelligent Ai madam ever." },
  { q: "what can you do", a: "iam an ai assistant you can ask me several things so because of my god 'rex' i will answe." },
  { q: "pico you are a bad robot", a: "A angry alaram." },
  { q: "sorry", a: "that's okay my god make's me to accept people's apologies because people are the only one who makes mistakes not us." },
  { q: "you are a good robot", a: "thank youuu !!" },
  { q: "are you better than other ais", a: "iam always better because my god is powerful who makes me in 8 minutes 53 seconds." }
];

function normalize(s){
  return (s||"").toLowerCase().replace(/[^a-z0-9\s]/g,"").trim();
}

const eyeL = document.getElementById("eye-left");
const eyeR = document.getElementById("eye-right");
const statusBox = document.getElementById("status");
const chat = document.getElementById("chat");
const voiceToggle = document.getElementById("voiceToggle");
const wakeDemo = document.getElementById("wakeDemo");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const speakBtn = document.getElementById("speakBtn");

// Speech objects
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let wakeRecognition = null;
let questionRecognition = null;
let voiceEnabled = false;
let isAwake = false;

if (SpeechRecognition) {
  wakeRecognition = new SpeechRecognition();
  wakeRecognition.continuous = true;
  wakeRecognition.interimResults = true;
  wakeRecognition.lang = "en-US";

  questionRecognition = new SpeechRecognition();
  questionRecognition.continuous = false;
  questionRecognition.interimResults = false;
  questionRecognition.lang = "en-US";
}

// UI helpers
function setEyeState(state){
  eyeL.classList.remove("listening","speaking");
  eyeR.classList.remove("listening","speaking");
  if(state) {
    eyeL.classList.add(state);
    eyeR.classList.add(state);
  }
}

function pushBubble(who,text){
  const b = document.createElement("div");
  b.classList.add("bubble", who==="user" ? "user" : "pico");
  b.textContent = text;
  chat.appendChild(b);
  chat.scrollTop = chat.scrollHeight;
}

function say(text){
  if(!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  u.pitch = 1;
  u.onstart = ()=> setEyeState("speaking");
  u.onend = ()=> setEyeState(null);
  speechSynthesis.speak(u);
}

function findAnswer(input){
  const n = normalize(input);
  for(const pair of QA){
    if(n.includes(normalize(pair.q))) return pair.a;
  }
  return null;
}

function handleQuestionText(text){
  pushBubble("user", text);
  const ans = findAnswer(text);
  if(ans){
    pushBubble("pico", ans);
    say(ans);
  } else {
    const fallback = "I don't know that yet. Ask Rex to teach me.";
    pushBubble("pico", fallback);
    say(fallback);
  }
}

// Wake detection
function wakeDetected(){
  isAwake = true;
  statusBox.textContent = "PICO is awake · Listening for your question...";
  setEyeState("listening");

  if(questionRecognition){
    questionRecognition.start();
  }
}

// Events
if(questionRecognition){
  questionRecognition.onresult = e => {
    const text = Array.from(e.results).map(r=>r[0].transcript).join(" ");
    handleQuestionText(text);
  };
  questionRecognition.onend = () => {
    setEyeState(null);
    isAwake = false;
    statusBox.textContent = voiceEnabled ? "Voice: on · Waiting for wake word" : "Voice: off";
  };
}

if(wakeRecognition){
  wakeRecognition.onresult = e => {
    let t = "";
    for(let i = e.resultIndex; i < e.results.length; i++){
      t += e.results[i][0].transcript + " ";
    }
    t = t.toLowerCase();
    if(t.includes("hey pico")){
      wakeRecognition.stop();
      wakeDetected();
      setTimeout(()=> wakeRecognition.start(), 3000);
    }
  };
  wakeRecognition.onerror = e => console.warn("Wake error",e);
}

// Buttons
voiceToggle.onclick = async () => {
  if(!SpeechRecognition){
    alert("Your browser does not support voice recognition.");
    return;
  }

  if(!voiceEnabled){
    try{
      await navigator.mediaDevices.getUserMedia({audio:true});
    }catch(e){
      alert("Microphone permission needed.");
      return;
    }
    voiceEnabled = true;
    voiceToggle.textContent = "Disable Voice";
    wakeRecognition.start();
    statusBox.textContent = "Voice: on · Waiting for wake word";
  } else {
    voiceEnabled = false;
    voiceToggle.textContent = "Enable Voice";
    wakeRecognition.stop();
    statusBox.textContent = "Voice: off";
  }
};

wakeDemo.onclick = () => {
  pushBubble("user","Hey PICO (demo)");
  wakeDetected();
  setTimeout(()=> handleQuestionText("who made you"), 800);
};

sendBtn.onclick = () => {
  const t = userInput.value.trim();
  if(!t) return;
  userInput.value = "";
  if(normalize(t).includes("hey pico")){
    wakeDetected();
    return;
  }
  handleQuestionText(t);
};

speakBtn.onclick = async () =>{
  if(!SpeechRecognition){
    alert("Voice not supported here.");
    return;
  }
  try{
    await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){
    alert("Mic permission needed.");
    return;
  }

  const one = new SpeechRecognition();
  one.onresult = e => {
    const text = Array.from(e.results).map(r=>r[0].transcript).join(" ");
    handleQuestionText(text);
  };
  one.start();
};

// Enter key
userInput.onkeydown = e =>{
  if(e.key==="Enter") sendBtn.click();
};

// Idle eye breathing
let b=0;
setInterval(()=>{
  b=(b+1)%360;
  const s = 1 + Math.sin(b*Math.PI/180)*0.02;
  eyeL.style.transform=`scale(${s})`;
  eyeR.style.transform=`scale(${s})`;
},1200);

// Welcome message
pushBubble("pico","Hello — I am PICO. Say 'Hey PICO' or type a question to start.");