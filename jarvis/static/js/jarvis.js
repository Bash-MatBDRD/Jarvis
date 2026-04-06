/* ── JARVIS — Interface frontend ─────────────────────────────────────────── */

const socket = io();

// ── État ──────────────────────────────────────────────────────────────────
let state      = 'idle';   // idle | listening | thinking | speaking
let recognizer = null;
let audioCtx   = null;
let analyser   = null;
let micStream  = null;
let waveAnim   = null;
let voices     = [];

// ── Éléments DOM ─────────────────────────────────────────────────────────
const micBtn    = document.getElementById('mic-btn');
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
    n.getHours().toString().padStart(2,'0') + ':' +
    n.getMinutes().toString().padStart(2,'0');
}
updateClock();
setInterval(updateClock, 1000);

// ── Fond animé (particules) ───────────────────────────────────────────────
const bgCanvas = document.getElementById('bg-canvas');
const bgCtx    = bgCanvas.getContext('2d');
let particles  = [];

function resizeBg() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
}
resizeBg();
window.addEventListener('resize', resizeBg);

function initParticles(n = 60) {
  particles = Array.from({length: n}, () => ({
    x: Math.random() * bgCanvas.width,
    y: Math.random() * bgCanvas.height,
    vx: (Math.random() - .5) * .3,
    vy: (Math.random() - .5) * .3,
    r: Math.random() * 1.5 + .5,
  }));
}
initParticles();

function drawBg() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  // Connexions
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const d  = Math.sqrt(dx*dx + dy*dy);
      if (d < 130) {
        bgCtx.beginPath();
        bgCtx.moveTo(particles[i].x, particles[i].y);
        bgCtx.lineTo(particles[j].x, particles[j].y);
        bgCtx.strokeStyle = `rgba(0,180,220,${.12 * (1 - d/130)})`;
        bgCtx.lineWidth = .5;
        bgCtx.stroke();
      }
    }
  }
  // Points
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = bgCanvas.width;
    if (p.x > bgCanvas.width) p.x = 0;
    if (p.y < 0) p.y = bgCanvas.height;
    if (p.y > bgCanvas.height) p.y = 0;
    bgCtx.beginPath();
    bgCtx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    bgCtx.fillStyle = 'rgba(0,200,255,.5)';
    bgCtx.fill();
  });
  requestAnimationFrame(drawBg);
}
drawBg();

// ── Visualiseur de forme d'onde ───────────────────────────────────────────
function drawWave(dataArray) {
  wCtx.clearRect(0, 0, 160, 40);
  wCtx.beginPath();
  const step = 160 / dataArray.length;
  for (let i = 0; i < dataArray.length; i++) {
    const v = (dataArray[i] / 128) - 1;
    const y = 20 + v * 16;
    i === 0 ? wCtx.moveTo(0, y) : wCtx.lineTo(i * step, y);
  }
  wCtx.strokeStyle = state === 'listening' ? '#00ff88' :
                     state === 'speaking'  ? '#00d4ff' : 'rgba(0,212,255,.4)';
  wCtx.lineWidth  = 1.5;
  wCtx.stroke();
}

function idleWave() {
  const t = Date.now() / 600;
  const d = Array.from({length: 32}, (_,i) => 128 + Math.sin(t + i*.4) * 8);
  drawWave(d);
}
setInterval(() => { if (state !== 'listening') idleWave(); }, 50);

// ── Changer d'état ────────────────────────────────────────────────────────
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

// ── Afficher un message dans le journal ───────────────────────────────────
function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<span class="msg-role">${role === 'user' ? 'VOUS' : 'JARVIS'}</span>
                   <div class="msg-bubble"></div>`;
  const bubble = div.querySelector('.msg-bubble');

  if (role === 'jarvis') {
    // Effet machine à écrire
    bubble.classList.add('typing-cursor');
    let i = 0;
    const interval = setInterval(() => {
      bubble.textContent += text[i++];
      if (i >= text.length) {
        clearInterval(interval);
        bubble.classList.remove('typing-cursor');
      }
    }, 18);
  } else {
    bubble.textContent = text;
  }

  convLog.appendChild(div);
  convLog.scrollTop = convLog.scrollHeight;
}

// ── Synthèse vocale (voix JARVIS) ─────────────────────────────────────────
window.speechSynthesis.onvoiceschanged = () => {
  voices = window.speechSynthesis.getVoices();
};

function speak(text) {
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = 'fr-FR';
  utt.rate   = 1.0;
  utt.pitch  = 0.85;
  utt.volume = 1;

  // Cherche une voix française
  const frVoice = voices.find(v => v.lang.startsWith('fr') && v.name.toLowerCase().includes('thomas')) ||
                  voices.find(v => v.lang.startsWith('fr'));
  if (frVoice) utt.voice = frVoice;

  utt.onstart = () => setState('speaking');
  utt.onend   = ()  => setState('idle');
  utt.onerror = ()  => setState('idle');

  window.speechSynthesis.speak(utt);
}

// ── Reconnaissance vocale (Web Speech API) ────────────────────────────────
let silenceTimer = null;
const SILENCE_TIMEOUT_MS = 2000; // coupe après 2s de silence

function stopListening() {
  clearTimeout(silenceTimer);
  if (recognizer) { try { recognizer.stop(); } catch(_) {} }
}

function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (state === 'listening') stopListening();
  }, SILENCE_TIMEOUT_MS);
}

function setupRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Reconnaissance vocale non supportée. Utilisez Chrome ou Edge.');
    return null;
  }
  const r = new SR();
  r.lang            = 'fr-FR';
  r.continuous      = false;
  r.interimResults  = true;
  r.maxAlternatives = 1;

  r.onresult = e => {
    resetSilenceTimer();
    const last = e.results[e.results.length - 1];
    if (last.isFinal) {
      clearTimeout(silenceTimer);
      sendMessage(last[0].transcript);
    }
  };
  r.onspeechstart = () => resetSilenceTimer();
  r.onspeechend   = () => {
    // Lance le timer de silence quand la parole s'arrête
    resetSilenceTimer();
  };
  r.onerror = e => {
    clearTimeout(silenceTimer);
    setState('idle');
    if (e.error !== 'no-speech') showToast(`Erreur micro : ${e.error}`);
  };
  r.onend = () => {
    clearTimeout(silenceTimer);
    if (state === 'listening') setState('idle');
  };
  return r;
}

function startListening() {
  if (state !== 'idle') { window.speechSynthesis.cancel(); setState('idle'); return; }
  recognizer = setupRecognizer();
  if (!recognizer) return;
  setState('listening');
  recognizer.start();
  resetSilenceTimer();
}

micBtn.addEventListener('click', startListening);

// ── Détection de clap (AudioContext) ─────────────────────────────────────
let clapCooldown = 0;
let clapReady    = false;

async function initClapDetection() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream = stream;
    audioCtx  = new AudioContext();
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);

    // Reprendre le contexte audio si suspendu par le navigateur
    const resumeCtx = () => {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    };
    document.addEventListener('click',    resumeCtx, { once: false });
    document.addEventListener('keydown',  resumeCtx, { once: false });
    document.addEventListener('touchend', resumeCtx, { once: false });

    const buf = new Uint8Array(analyser.frequencyBinCount);
    let prevRms = 0;

    function check() {
      if (audioCtx.state === 'running') {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += ((buf[i]/128)-1) ** 2;
        const rms = Math.sqrt(sum / buf.length);

        // Mettre à jour le visu
        if (state === 'listening') drawWave(buf);

        const now = Date.now();
        // Seuil abaissé à 0.3 (était 0.45) et transition rapide < 0.15 (était 0.1)
        if (rms > 0.3 && prevRms < 0.15 && now > clapCooldown) {
          clapCooldown = now + 1500;
          if (state === 'idle') {
            showToast('Clap détecté ✓');
            startListening();
          }
        }
        prevRms = rms;
      }
      requestAnimationFrame(check);
    }
    check();
    clapReady = true;
  } catch {
    showToast('Accès micro refusé — clic sur le bouton uniquement.');
  }
}
initClapDetection();

// ── Envoi d'un message ────────────────────────────────────────────────────
function sendMessage(text) {
  text = text.trim();
  if (!text) return;
  addMessage('user', text);
  setState('thinking');
  socket.emit('user_message', { text });
}

sendBtn.addEventListener('click', () => {
  sendMessage(textInput.value);
  textInput.value = '';
});
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
    const label = data.provider === 'groq' ? 'GROQ IA — GRATUIT' : 'OPENAI IA';
    modeBadge.textContent       = label;
    modeBadge.style.color       = '#00d4ff';
    modeBadge.style.borderColor = 'rgba(0,212,255,.5)';
  }
  addMessage('jarvis', 'Systèmes en ligne. Je suis prêt à vous assister. Clap ou clic pour parler.');
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
  document.getElementById('s-cpu').textContent  = data.cpu  || '-';
  document.getElementById('s-ram').textContent  = (data.ram || '-').split('/')[0].trim();
  document.getElementById('s-disk').textContent = data.disk ? data.disk.split('%')[0].split('(')[1] + '%' : '-';
  document.getElementById('s-bat').textContent  = data.battery || '-';
});

// Rafraîchir les stats système toutes les 10s
setInterval(() => socket.emit('get_system_status'), 10000);

socket.on('disconnect', () => showToast('Connexion perdue…'));
socket.on('connect',    () => showToast('JARVIS connecté'));
