/* ══ JARVIS — Interface JS ══════════════════════════════════════════════ */

const socket = io();

// ── État global ──────────────────────────────────────────────────────────
let state        = 'idle';
let recognizer   = null;
let audioCtx     = null;
let analyser     = null;
let micStream    = null;
let currentAudio = null;
let safetyTimer  = null;
let clapCooldown = 0;
let selectedMicId = '';
let selectedOutId = '';

// ── DOM ──────────────────────────────────────────────────────────────────
const micBtn    = document.getElementById('mic-btn');
const micLbl    = document.getElementById('mic-lbl');
const stateLbl  = document.getElementById('state-lbl');
const convLog   = document.getElementById('conv-log');
const textInput = document.getElementById('text-input');
const sendBtn   = document.getElementById('send-btn');
const clearBtn  = document.getElementById('clear-btn');
const waveCv    = document.getElementById('wave-cv');
const wCtx      = waveCv.getContext('2d');
const modeBadge = document.getElementById('mode-badge');
const micSel    = document.getElementById('mic-select');
const outSel    = document.getElementById('out-select');

/* ══════════════════════════════════════════════════════════════════════
   HORLOGE
══════════════════════════════════════════════════════════════════════ */
function updateClock() {
  const n = new Date();
  document.getElementById('s-time').textContent =
    String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
}
updateClock(); setInterval(updateClock, 1000);

/* ══════════════════════════════════════════════════════════════════════
   FOND HEXAGONAL
══════════════════════════════════════════════════════════════════════ */
const bgCv  = document.getElementById('bg-canvas');
const bgCtx = bgCv.getContext('2d');

function drawHexGrid() {
  bgCv.width  = window.innerWidth;
  bgCv.height = window.innerHeight;
  bgCtx.clearRect(0, 0, bgCv.width, bgCv.height);
  const size = 34, h = size * Math.sqrt(3);
  bgCtx.strokeStyle = 'rgba(79,195,247,0.04)';
  bgCtx.lineWidth   = .6;
  const cols = Math.ceil(bgCv.width  / (size * 1.5)) + 2;
  const rows = Math.ceil(bgCv.height / h) + 2;
  for (let col = -1; col < cols; col++) {
    for (let row = -1; row < rows; row++) {
      const cx = col * size * 1.5;
      const cy = row * h + (col % 2 === 0 ? 0 : h / 2);
      bgCtx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i - Math.PI / 6;
        const px = cx + size * Math.cos(a), py = cy + size * Math.sin(a);
        i === 0 ? bgCtx.moveTo(px, py) : bgCtx.lineTo(px, py);
      }
      bgCtx.closePath(); bgCtx.stroke();
    }
  }
}
drawHexGrid(); window.addEventListener('resize', drawHexGrid);

/* ══════════════════════════════════════════════════════════════════════
   SVG — TICK MARKS
══════════════════════════════════════════════════════════════════════ */
(function buildTicks() {
  const g = document.getElementById('ticks');
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
    const r1 = 130, r2 = i % 3 === 0 ? 122 : 126;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 140 + r1 * Math.cos(a));
    line.setAttribute('y1', 140 + r1 * Math.sin(a));
    line.setAttribute('x2', 140 + r2 * Math.cos(a));
    line.setAttribute('y2', 140 + r2 * Math.sin(a));
    line.setAttribute('stroke', 'rgba(79,195,247,.4)');
    line.setAttribute('stroke-width', i % 3 === 0 ? '1.4' : '.7');
    g.appendChild(line);
  }
})();

/* ══════════════════════════════════════════════════════════════════════
   VISUALISEUR FORME D'ONDE
══════════════════════════════════════════════════════════════════════ */
function drawWave(buf) {
  wCtx.clearRect(0, 0, 96, 24);
  wCtx.beginPath();
  const step = 96 / buf.length;
  for (let i = 0; i < buf.length; i++) {
    const y = 12 + ((buf[i] / 128) - 1) * 10;
    i === 0 ? wCtx.moveTo(0, y) : wCtx.lineTo(i * step, y);
  }
  wCtx.strokeStyle = state === 'listening' ? '#00e676' :
                     state === 'speaking'  ? '#4fc3f7' : 'rgba(79,195,247,.3)';
  wCtx.lineWidth = 1.4; wCtx.stroke();
}
function idleWave() {
  const t = Date.now() / 700;
  drawWave(Array.from({length: 32}, (_, i) => 128 + Math.sin(t + i * .4) * 5));
}
setInterval(() => { if (state !== 'listening') idleWave(); }, 50);

/* ══════════════════════════════════════════════════════════════════════
   ÉTAT
══════════════════════════════════════════════════════════════════════ */
const STATE_LABELS = { idle: 'EN ATTENTE', listening: 'ÉCOUTE', thinking: 'TRAITEMENT', speaking: 'RÉPONSE' };
function setState(s) {
  state = s;
  document.body.className = s !== 'idle' ? s : '';
  stateLbl.textContent = STATE_LABELS[s] || s.toUpperCase();
  micLbl.textContent   = s === 'listening' ? 'STOPPER' : 'PARLER';
}

/* ══════════════════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════════════════ */
const toastEl = document.getElementById('toast');
let toastTm;
function showToast(msg, dur = 3000) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTm); toastTm = setTimeout(() => toastEl.classList.remove('show'), dur);
}

/* ══════════════════════════════════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════════════════════════════════ */
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
    }, 15);
  } else {
    bubble.textContent = text;
  }
  convLog.appendChild(div);
  convLog.scrollTop = convLog.scrollHeight;
}

/* ══════════════════════════════════════════════════════════════════════
   VOIX JARVIS — OpenAI TTS "onyx" (grave, masculin)
══════════════════════════════════════════════════════════════════════ */
function stopAudio() {
  if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; }
}

async function speak(text) {
  if (!text) return;
  stopAudio(); setState('speaking');
  try {
    const res = await fetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) { fallbackSpeak(text); return; }
    const blob  = await res.blob();
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    // Appliquer la sortie audio sélectionnée si supporté
    if (selectedOutId && typeof audio.setSinkId === 'function') {
      try { await audio.setSinkId(selectedOutId); } catch(_) {}
    }

    audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; setState('idle'); };
    audio.onerror = () => { setState('idle'); };
    audio.play().catch(() => setState('idle'));
  } catch { fallbackSpeak(text); }
}

function fallbackSpeak(text) {
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'fr-FR'; utt.rate = 1.0; utt.pitch = 0.8;
  const v = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('fr'));
  if (v) utt.voice = v;
  utt.onend = utt.onerror = () => setState('idle');
  window.speechSynthesis.speak(utt);
}

/* ══════════════════════════════════════════════════════════════════════
   SÉLECTION DES DEVICES AUDIO
══════════════════════════════════════════════════════════════════════ */
async function loadAudioDevices() {
  try {
    // Demander la permission micro d'abord pour avoir les labels
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
    const devices = await navigator.mediaDevices.enumerateDevices();

    const inputs  = devices.filter(d => d.kind === 'audioinput');
    const outputs = devices.filter(d => d.kind === 'audiooutput');

    micSel.innerHTML = '';
    inputs.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${i + 1}`;
      micSel.appendChild(opt);
    });

    outSel.innerHTML = '<option value="">Par défaut</option>';
    outputs.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Sortie ${i + 1}`;
      outSel.appendChild(opt);
    });
  } catch(e) {
    console.warn('Erreur enumération devices:', e);
  }
}

micSel.addEventListener('change', () => {
  selectedMicId = micSel.value;
  // Relancer la détection de clap avec le nouveau micro
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioCtx)  { audioCtx.close().catch(() => {}); audioCtx = null; analyser = null; }
  initClapDetection();
  showToast(`Micro : ${micSel.options[micSel.selectedIndex].text}`);
});

outSel.addEventListener('change', () => {
  selectedOutId = outSel.value;
  showToast(`Sortie : ${outSel.options[outSel.selectedIndex].text}`);
});

/* ══════════════════════════════════════════════════════════════════════
   RECONNAISSANCE VOCALE
══════════════════════════════════════════════════════════════════════ */
function stopListening() {
  clearTimeout(safetyTimer);
  if (recognizer) { try { recognizer.stop(); } catch(_) {} }
}

function setupRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Recon. vocale non supportée — utilisez Chrome/Edge.'); return null; }
  const r = new SR();
  r.lang = 'fr-FR'; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;
  r.onresult = e => { clearTimeout(safetyTimer); sendMessage(e.results[0][0].transcript); };
  r.onerror  = e => { clearTimeout(safetyTimer); setState('idle'); if (e.error !== 'no-speech') showToast(`Erreur micro : ${e.error}`); };
  r.onend    = () => { clearTimeout(safetyTimer); if (state === 'listening') setState('idle'); };
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

/* ══════════════════════════════════════════════════════════════════════
   DÉTECTION DE CLAP
══════════════════════════════════════════════════════════════════════ */
async function initClapDetection() {
  try {
    const constraints = { audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    micStream = stream;
    audioCtx  = new AudioContext();
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    const buf = new Uint8Array(analyser.frequencyBinCount);
    let prevRms = 0;

    function check() {
      requestAnimationFrame(check);
      if (audioCtx.state === 'suspended') { audioCtx.resume(); return; }
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += ((buf[i] / 128) - 1) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      if (state === 'listening') drawWave(buf);
      const now = Date.now();
      if (rms > 0.28 && prevRms < 0.12 && now > clapCooldown) {
        clapCooldown = now + 1500;
        if (state === 'idle') { showToast('Clap détecté ✓'); startListening(); }
      }
      prevRms = rms;
    }
    check();
  } catch(e) {
    console.warn('Clap detection:', e);
    showToast('Accès micro refusé — clic uniquement.');
  }
}
initClapDetection();
loadAudioDevices();

/* ══════════════════════════════════════════════════════════════════════
   ENVOI DE MESSAGE
══════════════════════════════════════════════════════════════════════ */
function sendMessage(text) {
  text = text.trim(); if (!text) return;
  addMessage('user', text); setState('thinking');
  socket.emit('user_message', { text });
}
sendBtn.addEventListener('click', () => { sendMessage(textInput.value); textInput.value = ''; });
textInput.addEventListener('keydown', e => { if (e.key === 'Enter') { sendMessage(textInput.value); textInput.value = ''; } });
clearBtn.addEventListener('click', () => { socket.emit('clear_history'); convLog.innerHTML = ''; });

/* ══════════════════════════════════════════════════════════════════════
   ONGLETS
══════════════════════════════════════════════════════════════════════ */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const pane = document.getElementById('tab-' + btn.dataset.tab);
    if (pane) pane.classList.add('active');
  });
});

/* ══════════════════════════════════════════════════════════════════════
   UTILITAIRES UI
══════════════════════════════════════════════════════════════════════ */
function fmtGb(gb) { return gb >= 1 ? `${gb} Go` : `${Math.round(gb * 1024)} Mo`; }
function fmtMb(mb) { return mb >= 1000 ? `${(mb/1000).toFixed(1)} Go` : `${mb} Mo`; }

function makeBigBar(id, pct, cls = '') {
  const el = document.getElementById(id);
  if (el) { el.style.width = pct + '%'; if (cls) el.className = `big-bar-fill ${cls}`; }
}
function setVal(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function colorBar(pct) {
  if (pct >= 85) return 'fill-orange';
  if (pct >= 60) return 'fill-purple';
  return 'fill-blue';
}

/* ══════════════════════════════════════════════════════════════════════
   RENDU — DONNÉES SYSTÈME DÉTAILLÉES
══════════════════════════════════════════════════════════════════════ */
function renderDetailed(d) {
  // ── CPU ──────────────────────────────────────────────────────────────
  const cpu = d.cpu;
  setVal('cpu-model', cpu.model || '—');
  setVal('cpu-phy',   cpu.cores_phy + ' cœurs physiques');
  setVal('cpu-log',   cpu.cores_log + ' cœurs logiques');
  setVal('cpu-freq',  cpu.freq_mhz ? `${cpu.freq_mhz} MHz / ${cpu.freq_max} MHz max` : '—');
  makeBigBar('cpu-bar-total', cpu.total, colorBar(cpu.total));
  setVal('cpu-pct-total', cpu.total + '%');

  // Barres par cœur
  const coreCnt = document.getElementById('core-bars');
  if (coreCnt) {
    coreCnt.innerHTML = '';
    cpu.per_core.forEach((v, i) => {
      const clr = v >= 85 ? '#ff6d00' : v >= 60 ? '#ce93d8' : '#4fc3f7';
      coreCnt.innerHTML += `
        <div class="core-item">
          <span class="core-lbl">C${i}</span>
          <div class="core-bar-w"><div class="core-bar-f" style="width:${v}%;background:${clr}"></div></div>
          <span class="core-val">${v}%</span>
        </div>`;
    });
  }

  // Températures
  const tempEl = document.getElementById('temp-list');
  if (tempEl && d.temps && Object.keys(d.temps).length > 0) {
    tempEl.innerHTML = Object.entries(d.temps).map(([k, v]) => {
      const cls = v >= 80 ? 'temp-hot' : v >= 65 ? 'temp-warm' : '';
      return `<div class="temp-item ${cls}">${k.split('/')[1] || k}: ${v}°C</div>`;
    }).join('');
  }

  // ── RAM ──────────────────────────────────────────────────────────────
  const ram = d.ram;
  setVal('ram-total', fmtGb(ram.total_gb));
  setVal('ram-used',  fmtGb(ram.used_gb));
  setVal('ram-free',  fmtGb(ram.free_gb));
  makeBigBar('ram-bar', ram.percent, colorBar(ram.percent));
  setVal('ram-pct', ram.percent + '%');

  const segEl = document.getElementById('ram-segments');
  if (segEl && ram.total_gb > 0) {
    const usedPct = Math.round(ram.used_gb / ram.total_gb * 100);
    const freePct = 100 - usedPct;
    segEl.innerHTML = `<div class="ram-seg fill-blue" style="width:${usedPct}%;background:#0277bd;border-radius:2px 0 0 2px"></div>
                       <div class="ram-seg" style="width:${freePct}%;background:rgba(79,195,247,.08);border-radius:0 2px 2px 0"></div>`;
  }

  setVal('swap-total', fmtGb(ram.swap_total_gb));
  setVal('swap-used',  fmtGb(ram.swap_used_gb));
  makeBigBar('swap-bar', ram.swap_percent, 'fill-purple');
  setVal('swap-pct', ram.swap_percent + '%');

  // ── STOCKAGE ─────────────────────────────────────────────────────────
  const diskList = document.getElementById('disk-list');
  if (diskList && d.disks) {
    diskList.innerHTML = d.disks.map(dk => {
      const clr = dk.percent >= 85 ? 'fill-orange' : dk.percent >= 60 ? 'fill-purple' : 'fill-blue';
      const fillClasses = { 'fill-orange': 'background:linear-gradient(90deg,#bf360c,#ff6d00)', 'fill-purple': 'background:linear-gradient(90deg,#7b1fa2,#ce93d8)', 'fill-blue': 'background:linear-gradient(90deg,#0277bd,#4fc3f7)' };
      return `<div class="disk-item">
        <div class="disk-top">
          <span class="disk-dev">${dk.device} <span style="opacity:.5">(${dk.mountpoint})</span></span>
          <span class="disk-meta">${dk.fstype} — ${fmtGb(dk.free_gb)} libre / ${fmtGb(dk.total_gb)}</span>
        </div>
        <div class="disk-bar-w"><div class="disk-bar-f" style="width:${dk.percent}%;${fillClasses[clr]}"></div></div>
        <div style="font-size:.55rem;color:var(--txt2);margin-top:3px">${fmtGb(dk.used_gb)} utilisés — ${dk.percent}%</div>
      </div>`;
    }).join('');
  }

  if (d.disk_io) {
    setVal('io-read',  fmtMb(d.disk_io.read_mb));
    setVal('io-write', fmtMb(d.disk_io.write_mb));
  }

  // ── RÉSEAU ───────────────────────────────────────────────────────────
  if (d.network) {
    setVal('net-sent', fmtMb(d.network.sent_mb));
    setVal('net-recv', fmtMb(d.network.recv_mb));

    // Topbar
    setVal('s-net-up',   fmtMb(d.network.sent_mb));
    setVal('s-net-down', fmtMb(d.network.recv_mb));

    const ifaceEl = document.getElementById('net-ifaces');
    if (ifaceEl) {
      const ifaces = d.network.interfaces || {};
      const up     = d.network.up || {};
      ifaceEl.innerHTML = Object.entries(ifaces).map(([name, ip]) =>
        `<div class="iface-row">
          <div class="iface-dot ${up[name] ? 'iface-up' : 'iface-down'}"></div>
          <span class="iface-name">${name}</span>
          <span class="iface-ip">${ip}</span>
          <span style="font-size:.52rem;color:${up[name] ? 'var(--green)' : 'var(--red)'}">${up[name] ? 'UP' : 'DOWN'}</span>
        </div>`
      ).join('') || '<span class="dim">Aucune interface détectée</span>';
    }
  }

  // ── PROCESSUS ────────────────────────────────────────────────────────
  const tbody = document.getElementById('proc-tbody');
  if (tbody && d.processes) {
    tbody.innerHTML = d.processes.map(p =>
      `<tr>
        <td style="color:var(--txt2)">${p.pid}</td>
        <td class="proc-name">${p.name}</td>
        <td class="proc-cpu">${p.cpu}%</td>
        <td class="proc-mem">${p.mem.toFixed(1)}%</td>
        <td style="color:var(--txt2);font-size:.55rem">${p.status}</td>
      </tr>`
    ).join('');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SOCKET.IO
══════════════════════════════════════════════════════════════════════ */
socket.on('jarvis_ready', data => {
  if (data.mode === 'ai') {
    const lbl = data.provider === 'openai' ? 'OPENAI · ONYX' : 'GROQ IA';
    modeBadge.textContent = lbl;
    modeBadge.style.cssText = 'color:#4fc3f7;border-color:rgba(79,195,247,.45)';
  }
  addMessage('jarvis', 'Systèmes en ligne. Je suis prêt à vous assister. Clap ou clic pour parler.');
  speak('Systèmes en ligne. Je suis prêt à vous assister.');
  socket.emit('get_detailed_status');
});

socket.on('jarvis_response', data => {
  addMessage('jarvis', data.text);
  speak(data.text);
});

socket.on('status_change', data => {
  if (data.state === 'thinking') setState('thinking');
});

socket.on('system_update', data => {
  setVal('s-cpu',  data.cpu   || '--');
  setVal('s-ram',  (data.ram  || '--').split('/')[0].trim());
  setVal('s-disk', data.disk ? data.disk.match(/\((\d+)%\)/)?.[1] + '%' || '--' : '--');
  setVal('s-bat',  data.battery || '--');
});

socket.on('detailed_update', renderDetailed);

socket.on('disconnect', () => { showToast('Connexion perdue…'); document.getElementById('conn-badge').textContent = 'HORS LIGNE'; document.getElementById('conn-badge').style.cssText = 'color:rgba(255,82,82,.7);border-color:rgba(255,82,82,.3)'; });
socket.on('connect',    () => { showToast('JARVIS en ligne'); document.getElementById('conn-badge').textContent = 'EN LIGNE'; document.getElementById('conn-badge').style.cssText = ''; });

// Rafraîchir topbar + dashboard en continu
setInterval(() => socket.emit('get_system_status'),   5000);
setInterval(() => socket.emit('get_detailed_status'), 3000);
