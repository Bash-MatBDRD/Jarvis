/* ── JARVIS — Interface ───────────────────────────────────────────────── */

const socket = io();

let state      = 'idle';
let recognizer = null;
let audioCtx   = null;
let analyser   = null;
let micStream  = null;
let currentAudio = null;
let safetyTimer  = null;
let clapCooldown = 0;

// ── DOM ───────────────────────────────────────────────────────────────────
const micBtn    = document.getElementById('mic-btn');
const micLabel  = document.getElementById('mic-label');
const stateLabel= document.getElementById('state-label');
const convLog   = document.getElementById('conv-log');
const textInput = document.getElementById('text-input');
const sendBtn   = document.getElementById('send-btn');
const clearBtn  = document.getElementById('clear-btn');
const waveCanvas= document.getElementById('wave-canvas');
const wCtx      = waveCanvas.getContext('2d');
const modeBadge = document.getElementById('mode-badge');

// ── Horloge ───────────────────────────────────────────────────────────────
function updateClock() {
  const n = new Date();
  document.getElementById('s-time').textContent =
    String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
}
updateClock();
setInterval(updateClock, 1000);

// ── Fond hexagonal ────────────────────────────────────────────────────────
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx    = bgCanvas.getContext('2d');

function resizeBg() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
}
resizeBg();
window.addEventListener('resize', resizeBg);

function drawHexGrid() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  const size = 36, h = size * Math.sqrt(3);
  const cols = Math.ceil(bgCanvas.width  / (size * 1.5)) + 2;
  const rows = Math.ceil(bgCanvas.height / h) + 2;
  bgCtx.strokeStyle = 'rgba(79,195,247,0.045)';
  bgCtx.lineWidth   = .7;

  for (let col = -1; col < cols; col++) {
    for (let row = -1; row < rows; row++) {
      const x = col * size * 1.5;
      const y = row * h + (col % 2 === 0 ? 0 : h / 2);
      bgCtx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        const px = x + size * Math.cos(a);
        const py = y + size * Math.sin(a);
        i === 0 ? bgCtx.moveTo(px, py) : bgCtx.lineTo(px, py);
      }
      bgCtx.closePath();
      bgCtx.stroke();
    }
  }
}
drawHexGrid();
window.addEventListener('resize', drawHexGrid);

// ── SVG tick marks ────────────────────────────────────────────────────────
(function buildTicks() {
  const g = document.getElementById('ticks');
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
    const r1 = 148, r2 = i % 3 === 0 ? 138 : 143;
    const x1 = 160 + r1 * Math.cos(a), y1 = 160 + r1 * Math.sin(a);
    const x2 = 160 + r2 * Math.cos(a), y2 = 160 + r2 * Math.sin(a);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', 'rgba(79,195,247,.45)');
    line.setAttribute('stroke-width', i % 3 === 0 ? '1.5' : '0.8');
    g.appendChild(line);
  }
})();

// ── Visualiseur de forme d'onde ───────────────────────────────────────────
function drawWave(dataArray) {
  wCtx.clearRect(0, 0, 110, 28);
  wCtx.beginPath();
  const step = 110 / dataArray.length;
  for (let i = 0; i < dataArray.length; i++) {
    const v = (dataArray[i] / 128) - 1;
    const y = 14 + v * 11;
    i === 0 ? wCtx.moveTo(0, y) : wCtx.lineTo(i * step, y);
  }
  wCtx.strokeStyle = state === 'listening' ? '#00e676' :
                     state === 'speaking'  ? '#4fc3f7' : 'rgba(79,195,247,.35)';
  wCtx.lineWidth = 1.5;
  wCtx.stroke();
}

function idleWave() {
  const t = Date.now() / 700;
  const d = Array.from({length: 32}, (_, i) => 128 + Math.sin(t + i * .4) * 6);
  drawWave(d);
}
setInterval(() => { if (state !== 'listening') idleWave(); }, 50);

// ── État ─────────────────────────────────────────────────────────────────
const STATE_LABELS = {
  idle:      'EN ATTENTE',
  listening: 'ÉCOUTE',
  thinking:  'TRAITEMENT',
  speaking:  'RÉPONSE',
};
function setState(s) {
  state = s;
  document.body.className = s !== 'idle' ? s : '';
  stateLabel.textContent = STATE_LABELS[s] || s.toUpperCase();
  micLabel.textContent   = s === 'listening' ? 'STOPPER' : 'PARLER';
}

// ── Toast ─────────────────────────────────────────────────────────────────
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg, dur = 3000) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), dur);
}

// ── Messages ──────────────────────────────────────────────────────────────
function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<span class="msg-role">${role === 'user' ? 'VOUS' : 'J.A.R.V.I.S'}</span><div class="msg-bubble"></div>`;
  const bubble = div.querySelector('.msg-bubble');

  if (role === 'jarvis') {
    bubble.classList.add('typing-cursor');
    let i = 0;
    const iv = setInterval(() => {
      bubble.textContent += text[i++];
      if (i >= text.length) { clearInterval(iv); bubble.classList.remove('typing-cursor'); }
    }, 16);
  } else {
    bubble.textContent = text;
  }
  convLog.appendChild(div);
  convLog.scrollTop = convLog.scrollHeight;
}

// ── Voix JARVIS (OpenAI TTS — voix "onyx") ───────────────────────────────
function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

async function speak(text) {
  if (!text) return;
  stopAudio();
  setState('speaking');

  try {
    const res = await fetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      // Fallback : synthèse navigateur si pas de clé OpenAI
      fallbackSpeak(text);
      return;
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; setState('idle'); };
    audio.onerror = () => { setState('idle'); };
    audio.play();
  } catch {
    fallbackSpeak(text);
  }
}

function fallbackSpeak(text) {
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang  = 'fr-FR'; utt.rate = 1.0; utt.pitch = 0.8;
  const frVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('fr'));
  if (frVoice) utt.voice = frVoice;
  utt.onend = utt.onerror = () => setState('idle');
  window.speechSynthesis.speak(utt);
}

// ── Reconnaissance vocale ─────────────────────────────────────────────────
function stopListening() {
  clearTimeout(safetyTimer);
  if (recognizer) { try { recognizer.stop(); } catch(_) {} }
}

function setupRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Reconnaisance vocale non supportée. Utilisez Chrome ou Edge.'); return null; }
  const r = new SR();
  r.lang = 'fr-FR'; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;

  r.onresult = e => {
    clearTimeout(safetyTimer);
    sendMessage(e.results[0][0].transcript);
  };
  r.onerror = e => {
    clearTimeout(safetyTimer);
    setState('idle');
    if (e.error !== 'no-speech') showToast(`Erreur micro : ${e.error}`);
  };
  r.onend = () => {
    clearTimeout(safetyTimer);
    if (state === 'listening') setState('idle');
  };
  return r;
}

function startListening() {
  if (state === 'speaking') { stopAudio(); setState('idle'); return; }
  if (state !== 'idle') { stopListening(); setState('idle'); return; }
  recognizer = setupRecognizer();
  if (!recognizer) return;
  setState('listening');
  recognizer.start();
  safetyTimer = setTimeout(() => stopListening(), 12000);
}

micBtn.addEventListener('click', startListening);

// ── Détection de clap ─────────────────────────────────────────────────────
async function initClapDetection() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream = stream;
    audioCtx  = new AudioContext();
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    const buf = new Uint8Array(analyser.frequencyBinCount);
    let prevRms = 0;

    function check() {
      requestAnimationFrame(check); // toujours relancer, même si suspendu

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
        return;
      }

      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += ((buf[i] / 128) - 1) ** 2;
      const rms = Math.sqrt(sum / buf.length);

      if (state === 'listening') drawWave(buf);

      const now = Date.now();
      if (rms > 0.28 && prevRms < 0.12 && now > clapCooldown) {
        clapCooldown = now + 1500;
        if (state === 'idle') {
          showToast('Clap détecté ✓');
          startListening();
        }
      }
      prevRms = rms;
    }
    check();
  } catch(e) {
    console.warn('Clap detection:', e);
    showToast('Accès micro refusé — clic sur le bouton uniquement.');
  }
}
initClapDetection();

// ── Envoi de message ──────────────────────────────────────────────────────
function sendMessage(text) {
  text = text.trim();
  if (!text) return;
  addMessage('user', text);
  setState('thinking');
  socket.emit('user_message', { text });
}

sendBtn.addEventListener('click', () => { sendMessage(textInput.value); textInput.value = ''; });
textInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { sendMessage(textInput.value); textInput.value = ''; }
});
clearBtn.addEventListener('click', () => {
  socket.emit('clear_history');
  convLog.innerHTML = '';
});

// ── Socket.IO ─────────────────────────────────────────────────────────────
socket.on('jarvis_ready', data => {
  if (data.mode === 'ai') {
    const label = data.provider === 'openai' ? 'OPENAI · ONYX' : 'GROQ IA';
    modeBadge.textContent = label;
    modeBadge.style.color = '#4fc3f7';
    modeBadge.style.borderColor = 'rgba(79,195,247,.5)';
  }
  addMessage('jarvis', 'Systèmes en ligne. Prêt à vous assister. Clap ou clic pour parler.');
  speak('Systèmes en ligne. Je suis prêt à vous assister.');
});

socket.on('jarvis_response', data => {
  addMessage('jarvis', data.text);
  speak(data.text);
});

socket.on('status_change', data => {
  if (data.state === 'thinking') setState('thinking');
});

socket.on('system_update', data => {
  document.getElementById('s-cpu').textContent  = data.cpu   || '--';
  document.getElementById('s-ram').textContent  = (data.ram  || '--').split('/')[0].trim();
  document.getElementById('s-disk').textContent = data.disk  ? data.disk.split('%')[0].split('(')[1] + '%' : '--';
  document.getElementById('s-bat').textContent  = data.battery || '--';
});

setInterval(() => socket.emit('get_system_status'), 10000);

socket.on('disconnect', () => showToast('Connexion perdue…'));
socket.on('connect',    () => showToast('JARVIS en ligne'));
