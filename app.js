/* =========================================================
   J.A.R.V.I.S. — Προσωπικός Βοηθός (PWA, 100% δωρεάν)
   ========================================================= */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* ---------------- STORAGE ---------------- */
const Store = {
  get(k, d) { try { const v = localStorage.getItem('jv_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jv_' + k, JSON.stringify(v)); } catch {} },
};
const defaults = {
  userName: '', assistant: 'JARVIS', city: '', voiceURI: '', rate: 1.0, pitch: 0.85,
  sounds: true, hum: false, convo: false, geminiKey: '', model: 'gemini-flash-latest',
  aiProvider: 'gemini', aiKey: '', aiModel: '',
  cities: 'Αθήνα, Αγρίνιο', weight: 0, wakeTime: '07:00', teams: 'Ολυμπιακός, Παναθηναϊκός', budget: 0, tmdbKey: '',
  wake: false, theme: 'reactor', waterRemind: true, autoBrief: true, lastBrief: '',
};
const S = Object.assign({}, defaults, Store.get('settings', {}));
const saveSettings = () => Store.set('settings', S);
let notes = Store.get('notes', []);
let todos = Store.get('todos', []);
let reminders = Store.get('reminders', []);

/* ---------------- TEXT HELPERS ---------------- */
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ').replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ').replace(/[!;?·;"'«»]/g, ' ').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const DAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
const MONTHS = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
const NUMW = { 'ενα': 1, 'μια': 1, 'μισο': 0.5, 'μιση': 0.5, 'δυο': 2, 'δυο': 2, 'τρια': 3, 'τρεισ': 3, 'τεσσερα': 4, 'τεσσερισ': 4, 'πεντε': 5, 'εξι': 6, 'επτα': 7, 'εφτα': 7, 'οκτω': 8, 'οχτω': 8, 'εννια': 9, 'εννεα': 9, 'δεκα': 10, 'εντεκα': 11, 'δωδεκα': 12, 'δεκαπεντε': 15, 'εικοσι': 20, 'τριαντα': 30, 'σαραντα': 40, 'πενηντα': 50, 'εξηντα': 60 };
const wordsToNums = (n) => n.split(' ').map((w) => (NUMW[w] != null ? NUMW[w] : w)).join(' ');
const hello = () => { const h = new Date().getHours(); return h >= 5 && h < 12 ? 'Καλημέρα' : h >= 12 && h < 20 ? 'Καλησπέρα' : 'Καλό βράδυ'; };
// Κλητική ονόματος: Αλέξανδρος → Αλέξανδρε, Γιάννης → Γιάννη, Νικόλας → Νικόλα
function vocative(name) {
  if (!name) return '';
  const w = name.trim().split(/\s+/); const f = w[0];
  const v = /ος$/.test(f) ? f.replace(/ος$/, 'ε') : /ός$/.test(f) ? f.replace(/ός$/, 'έ') : /(ης|ής|ας|άς|ές|ες|ούς|ους)$/.test(f) ? f.slice(0, -1) : f;
  return [v, ...w.slice(1)].join(' ');
}
// Πώς σας αποκαλεί: «κύριε» (όπως ο JARVIS), με το όνομα, ή και τα δύο
function addressAs() {
  const mode = S.addressMode || 'sir', v = vocative(S.userName);
  if (mode === 'name') return v;
  if (mode === 'both') return v ? `κύριε ${v}` : 'κύριε';
  if (mode === 'boss') return 'αφεντικό';
  return 'κύριε';
}
// Απάντηση όταν τον φωνάζετε («Τζάρβις!»)
function callReply() {
  return pick([`Πείτε μου${nmc()}. Τι θέλετε να κάνουμε;`, `Πείτε μου${nmc()}, τι θέλετε να κάνουμε;`, `Στις διαταγές σας${nmc()}. Τι θέλετε να κάνουμε;`, `Εδώ είμαι${nmc()}. Πείτε μου, τι θέλετε να κάνουμε;`, `Ναι${nmc()}; Τι θέλετε να κάνουμε;`]);
}
const nm = () => addressAs();
const nmc = () => (addressAs() ? ', ' + addressAs() : '');
function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  const p = [];
  if (h) p.push(h + (h === 1 ? ' ώρα' : ' ώρες'));
  if (m) p.push(m + (m === 1 ? ' λεπτό' : ' λεπτά'));
  if (s && !h) p.push(s + (s === 1 ? ' δευτερόλεπτο' : ' δευτερόλεπτα'));
  return p.join(' και ') || '0 δευτερόλεπτα';
}
function parseDuration(n) {
  n = wordsToNums(n);
  let sec = 0, found = false;
  const re = /(\d+(?:[.,]\d+)?)\s*(ωρ|λεπτ|δευτ|sec|min)/g; let m;
  while ((m = re.exec(n))) {
    const v = parseFloat(m[1].replace(',', '.')); found = true;
    sec += m[2] === 'ωρ' ? v * 3600 : (m[2] === 'λεπτ' || m[2] === 'min') ? v * 60 : v;
  }
  if (/μιση ωρα|μισαωρο/.test(n)) { sec += 1800; found = true; }
  if (/ενα τεταρτο|τεταρτο/.test(n) && !found) { sec += 900; found = true; }
  return found ? Math.round(sec) : null;
}
function parseClock(n) {
  const m = n.match(/στισ?\s*(\d{1,2})(?:[:.\s](\d{2}))?/) || n.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10); const min = m[2] ? parseInt(m[2], 10) : 0;
  if (/(απογευμα|βραδυ|μμ)/.test(n) && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  const d = new Date(); d.setHours(h, min, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}

/* ---------------- SOUND ENGINE (Web Audio, χωρίς αρχεία) ---------------- */
const Sound = {
  ctx: null, master: null, humNodes: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
  },
  tone(f, dur = 0.12, type = 'sine', vol = 0.3, delay = 0, f2 = null) {
    if (!S.sounds || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur = 0.3, vol = 0.08, delay = 0, freq = 2000) {
    if (!S.sounds || !this.ctx) return;
    const t = this.ctx.currentTime + delay, len = this.ctx.sampleRate * dur, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master); src.start(t);
  },
  boot() { this.tone(80, 1.6, 'sawtooth', 0.12, 0, 900); this.noise(1.2, 0.05, 0, 600); [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.12, 1.2 + i * 0.09)); this.tone(1568, 0.9, 'triangle', 0.08, 1.6); },
  tick() { this.tone(2400 + Math.random() * 400, 0.025, 'square', 0.04); },
  tap() { this.tone(1800, 0.05, 'sine', 0.12); },
  listen() { this.tone(880, 0.08, 'sine', 0.2); this.tone(1320, 0.12, 'sine', 0.2, 0.08); },
  stop() { this.tone(1320, 0.08, 'sine', 0.15); this.tone(660, 0.14, 'sine', 0.15, 0.07); },
  reply() { this.tone(1046, 0.06, 'triangle', 0.12); this.tone(1568, 0.1, 'triangle', 0.1, 0.05); },
  think() { this.tone(400, 0.25, 'sine', 0.06, 0, 1200); },
  error() { this.tone(180, 0.18, 'sawtooth', 0.15); this.tone(140, 0.25, 'sawtooth', 0.15, 0.16); },
  alarm() { for (let i = 0; i < 6; i++) { this.tone(1760, 0.12, 'square', 0.18, i * 0.25); this.tone(1320, 0.12, 'square', 0.18, i * 0.25 + 0.12); } },
  whoosh() { this.noise(0.35, 0.07, 0, 3000); },
  hum(on) {
    if (!this.ctx) return;
    if (on && !this.humNodes) {
      const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master);
      const os = [55, 110.5, 165].map((f, i) => { const o = this.ctx.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f; const og = this.ctx.createGain(); og.gain.value = [0.5, 0.25, 0.1][i]; o.connect(og).connect(g); o.start(); return o; });
      g.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 1.5); this.humNodes = { g, os };
    } else if (!on && this.humNodes) {
      const { g, os } = this.humNodes; g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5); setTimeout(() => os.forEach((o) => o.stop()), 600); this.humNodes = null;
    }
  },
};

/* ---------------- ARC-REACTOR CORE (canvas) ---------------- */
const Core = {
  c: null, x: null, w: 0, h: 0, t: 0, state: 'idle', level: 0, target: 0, parts: [], rgb: '62,224,255', boost: 1,
  init() {
    if (this.c) return;
    this.c = $('#core'); this.x = this.c.getContext('2d');
    const rs = () => { const r = this.c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); this.w = r.width; this.h = r.height; this.c.width = r.width * d; this.c.height = r.height * d; this.x.setTransform(d, 0, 0, d, 0, 0); };
    rs(); addEventListener('resize', rs);
    for (let i = 0; i < 60; i++) this.parts.push({ a: Math.random() * 6.28, r: Math.random(), s: 0.002 + Math.random() * 0.006, z: Math.random() });
    const loop = () => { this.draw(); requestAnimationFrame(loop); }; loop();
  },
  set(st) { this.state = st; document.body.classList.remove('idle', 'listening', 'thinking', 'speaking'); document.body.classList.add(st);
    $('#stateLabel').textContent = { idle: 'ΣΕ ΑΝΑΜΟΝΗ', listening: 'ΑΚΡΟΑΣΗ...', thinking: 'ΕΠΕΞΕΡΓΑΣΙΑ', speaking: 'ΑΠΑΝΤΗΣΗ' }[st]; },
  draw() {
    const { x, w, h } = this; this.t += 1; const t = this.t; x.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 - 8, R = Math.min(w, h) * 0.42;
    const st = this.state;
    this.target = st === 'speaking' ? 0.35 + Math.abs(Math.sin(t * 0.21) * Math.sin(t * 0.077)) * 0.65 : st === 'listening' ? 0.25 + Math.random() * 0.4 : st === 'thinking' ? 0.3 : 0.06;
    this.level += (this.target - this.level) * 0.15;
    const col = st === 'listening' ? '255,177,59' : this.rgb;
    const spd = (st === 'thinking' ? 4 : st === 'idle' ? 1 : 2) * this.boost;
    x.lineCap = 'round';

    // glow
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
    g.addColorStop(0, `rgba(${col},${0.25 + this.level * 0.3})`); g.addColorStop(0.35, `rgba(${col},0.06)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * 1.1, 0, 6.283); x.fill();

    const ring = (r, a0, len, lw, alpha, rot) => { x.strokeStyle = `rgba(${col},${alpha})`; x.lineWidth = lw; x.beginPath(); x.arc(cx, cy, r, a0 + rot, a0 + rot + len); x.stroke(); };
    // outer tick ring
    x.save(); x.translate(cx, cy); x.rotate(t * 0.002 * spd);
    for (let i = 0; i < 72; i++) { const a = (i / 72) * 6.283, long = i % 6 === 0; x.strokeStyle = `rgba(${col},${long ? 0.7 : 0.25})`; x.lineWidth = long ? 2 : 1;
      x.beginPath(); x.moveTo(Math.cos(a) * R, Math.sin(a) * R); x.lineTo(Math.cos(a) * (R - (long ? 10 : 5)), Math.sin(a) * (R - (long ? 10 : 5))); x.stroke(); }
    x.restore();
    // segmented arcs
    const r1 = t * 0.01 * spd, r2 = -t * 0.016 * spd, r3 = t * 0.025 * spd;
    for (let i = 0; i < 4; i++) ring(R * 0.88, (i * 6.283) / 4, 1.1, 3, 0.75, r1);
    for (let i = 0; i < 3; i++) ring(R * 0.78, (i * 6.283) / 3, 1.5, 1.5, 0.45, r2);
    for (let i = 0; i < 8; i++) ring(R * 0.68, (i * 6.283) / 8, 0.45, 6, 0.35 + this.level * 0.4, r3);
    ring(R * 0.6, 0, 6.283, 1, 0.3, 0);

    // audio-reactive waveform ring
    x.strokeStyle = `rgba(${col},0.85)`; x.lineWidth = 1.6; x.beginPath();
    for (let i = 0; i <= 120; i++) { const a = (i / 120) * 6.283; const n = Math.sin(a * 6 + t * 0.12) * Math.sin(a * 3 - t * 0.07) + Math.sin(a * 11 + t * 0.2) * 0.4;
      const rr = R * 0.5 + n * R * 0.08 * (0.3 + this.level * 2.2); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
    // inner triangle (reactor)
    x.save(); x.translate(cx, cy); x.rotate(-t * 0.004 * spd); x.strokeStyle = `rgba(${col},0.5)`; x.lineWidth = 1.2; x.beginPath();
    for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283 - 1.5708; const px = Math.cos(a) * R * 0.42, py = Math.sin(a) * R * 0.42; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.closePath(); x.stroke(); x.restore();
    // particles
    for (const p of this.parts) { p.a += p.s * spd; const rr = R * (0.55 + p.r * 0.5); const px = cx + Math.cos(p.a) * rr, py = cy + Math.sin(p.a) * rr;
      x.fillStyle = `rgba(${col},${0.2 + p.z * 0.6})`; x.fillRect(px, py, 1.5 + p.z, 1.5 + p.z); }
    // scanning sweep
    if (st === 'thinking' || st === 'listening') { const a = t * 0.06; const sg = x.createConicGradient ? x.createConicGradient(a, cx, cy) : null;
      if (sg) { sg.addColorStop(0, `rgba(${col},0.25)`); sg.addColorStop(0.12, `rgba(${col},0)`); sg.addColorStop(1, `rgba(${col},0)`); x.fillStyle = sg; x.beginPath(); x.arc(cx, cy, R * 0.9, 0, 6.283); x.fill(); } }
  },
};

/* ---------------- VOICE (TTS + STT, ενσωματωμένα στο κινητό) ---------------- */
const Voice = {
  voices: [], rec: null, listening: false, speakingNow: false,
  loadVoices() {
    const all = speechSynthesis.getVoices();
    this.voices = all.filter((v) => /^el/i.test(v.lang));
    if (!this.voices.length) this.voices = all;
    const sel = $('#sVoice'); sel.innerHTML = '';
    this.voices.forEach((v) => { const o = document.createElement('option'); o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`; sel.appendChild(o); });
    if (!S.voiceURI && this.voices.length) {
      const male = this.voices.find((v) => /(male|άνδρ|nikos|stefanos|aris|dimitris)/i.test(v.name) && !/female/i.test(v.name));
      S.voiceURI = (male || this.voices[0]).voiceURI;
    }
    sel.value = S.voiceURI; saveSettings();
  },
  lastEnd: 0,
  speak(text, lang) {
    return new Promise((res) => {
      if (!('speechSynthesis' in window)) return res();
      speechSynthesis.cancel();
      const clean = text.replace(/<[^>]+>/g, '').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/\*+/g, '');
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = lang || 'el-GR'; u.rate = S.rate; u.pitch = S.pitch;
      const v = lang ? speechSynthesis.getVoices().find((x) => x.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())) : speechSynthesis.getVoices().find((x) => x.voiceURI === S.voiceURI); if (v) u.voice = v;
      let done = false; const fin = () => { if (done) return; done = true; this.speakingNow = false; this.lastEnd = Date.now(); if (Core.state === 'speaking') Core.set('idle'); res(); };
      u.onstart = () => { this.speakingNow = true; Core.set('speaking'); };
      u.onend = fin; u.onerror = fin;
      Core.set('speaking'); speechSynthesis.speak(u);
      setTimeout(fin, 1500 + clean.length * 110); // ασφάλεια αν δεν έρθει onend
    });
  },
  setupSTT() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return false;
    const r = new SR(); r.lang = 'el-GR'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let final = '';
    r.onstart = () => { this.listening = true; final = ''; Core.set('listening'); Sound.listen(); $('#interim').textContent = ''; };
    r.onresult = (e) => { let inter = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const tr = e.results[i][0].transcript; e.results[i].isFinal ? (final += tr) : (inter += tr); } $('#interim').textContent = final + inter; };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') addMsg('ai', 'Δεν έχω πρόσβαση στο μικρόφωνο. Επιτρέψτε το από τις ρυθμίσεις του browser.'); else if (e.error === 'network') { addMsg('ai', 'Χωρίς ίντερνετ, η αναγνώριση φωνής δεν είναι διαθέσιμη σε αυτό το κινητό. Γράψτε την εντολή στο πεδίο κάτω, όλα τα άλλα λειτουργούν κανονικά.'); Sound.error(); } else if (e.error !== 'no-speech' && e.error !== 'aborted') Sound.error(); };
    r.onend = () => { this.listening = false; $('#interim').textContent = ''; if (Core.state === 'listening') Core.set('idle'); Sound.stop(); const txt = final.trim(); if (txt) handle(txt); if (window.Wake && Wake.on) setTimeout(() => Wake.resume(), 400); };
    this.rec = r; return true;
  },
  toggle() {
    if (!this.rec && !this.setupSTT()) { addMsg('ai', 'Αυτός ο browser δεν υποστηρίζει αναγνώριση φωνής. Δοκιμάστε Chrome (Android) ή Safari (iPhone) — ή γράψτε την εντολή.'); Sound.error(); return; }
    if (this.listening) { this.rec.stop(); return; }
    speechSynthesis.cancel();
    if (window.Wake && Wake.on) { Wake.pause(); setTimeout(() => { try { this.rec.start(); } catch {} }, 250); return; }
    try { this.rec.start(); } catch {}
  },
};

/* ---------------- UI ---------------- */
function addMsg(who, text, opts = {}) {
  const el = document.createElement('div'); el.className = 'msg ' + who;
  if (who === 'ai') {
    el.innerHTML = `<div class="who">${S.assistant.toUpperCase()}</div><div class="body"></div>`;
    const body = el.querySelector('.body');
    $('#log').appendChild(el);
    if (opts.html) { body.innerHTML = opts.html; }
    else { let i = 0; const cur = document.createElement('span'); cur.className = 'cursor';
      const step = () => { i += 2; body.textContent = text.slice(0, i); body.appendChild(cur); if (i % 6 === 0) Sound.tick(); $('#log').scrollTop = 1e9; if (i < text.length) setTimeout(step, 14); else cur.remove(); }; step(); }
  } else { el.textContent = text; $('#log').appendChild(el); }
  $('#log').scrollTop = 1e9; return el;
}
function toast(title, text, ms = 8000) {
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<b>${title}</b>${text}`;
  t.onclick = () => t.remove(); $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
}
async function say(text, opts = {}) {
  Sound.reply(); addMsg('ai', text, opts);
  await Voice.speak(opts.speak || text, opts.lang);
  if (S.convo && !S.handsFree && !opts.noRelisten) setTimeout(() => { if (!Voice.listening) Voice.toggle(); }, 300);
}
function openUrl(url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }

/* ---------------- DATA: ΚΑΙΡΟΣ / ΜΠΑΤΑΡΙΑ ---------------- */
const WMO = { 0: 'Αίθριος', 1: 'Κυρίως αίθριος', 2: 'Λίγα σύννεφα', 3: 'Συννεφιά', 45: 'Ομίχλη', 48: 'Παγωμένη ομίχλη', 51: 'Ψιχάλα', 53: 'Ψιχάλα', 55: 'Έντονη ψιχάλα', 61: 'Ελαφριά βροχή', 63: 'Βροχή', 65: 'Δυνατή βροχή', 66: 'Παγωμένη βροχή', 67: 'Παγωμένη βροχή', 71: 'Ελαφριά χιονόπτωση', 73: 'Χιονόπτωση', 75: 'Πυκνή χιονόπτωση', 77: 'Χιονόνερο', 80: 'Μπόρες', 81: 'Μπόρες', 82: 'Ισχυρές μπόρες', 85: 'Χιονοπτώσεις', 86: 'Χιονοπτώσεις', 95: 'Καταιγίδα', 96: 'Καταιγίδα με χαλάζι', 99: 'Καταιγίδα με χαλάζι' };
async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=el&format=json`);
  const j = await r.json(); if (!j.results || !j.results.length) return null;
  const p = j.results[0]; return { lat: p.latitude, lon: p.longitude, name: p.name };
}
function gps() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, name: '' }), () => res(null), { timeout: 8000, maximumAge: 600000 });
  });
}
async function getLocation(city) {
  if (city) return geocode(city);
  const home = S.city || (S.cities || '').split(',')[0].trim();
  if (home) return geocode(home);
  return (await gps()) || geocode('Αθήνα');
}
async function getWeather(city) {
  const loc = await getLocation(city); if (!loc) return null;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=2`;
  const j = await (await fetch(u)).json();
  return { loc, cur: j.current, daily: j.daily };
}
let wxCache = [], wxIdx = 0, wxTimer = null;
async function refreshWeatherWidget() {
  const list = (S.cities || '').split(',').map((c) => c.trim()).filter(Boolean);
  try {
    wxCache = (await Promise.all((list.length ? list : ['']).map((c) => getWeather(c).catch(() => null)))).filter(Boolean);
    const show = () => { if (!wxCache.length) return; const w = wxCache[wxIdx++ % wxCache.length];
      $('#weatherVal').textContent = Math.round(w.cur.temperature_2m) + '°'; $('#weatherSub').textContent = (w.loc.name ? w.loc.name + ' · ' : '') + (WMO[w.cur.weather_code] || ''); };
    show(); clearInterval(wxTimer); if (wxCache.length > 1) wxTimer = setInterval(show, 5000);
  } catch { $('#weatherSub').textContent = 'εκτός σύνδεσης'; }
}
setInterval(() => refreshWeatherWidget(), 30 * 60 * 1000);
let battery = null;
async function initBattery() {
  if (!navigator.getBattery) { $('#batVal').textContent = 'N/A'; return; }
  battery = await navigator.getBattery();
  const up = () => { const p = Math.round(battery.level * 100); $('#batVal').textContent = p + '%'; $('#batBar').style.width = p + '%'; $('#batBar').style.background = p < 20 ? 'var(--red)' : 'var(--cyan)'; };
  up(); battery.addEventListener('levelchange', up); battery.addEventListener('chargingchange', up);
}
function tickClock() {
  const d = new Date(); $('#clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $('#dateVal').textContent = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`; $('#dayVal').textContent = DAYS[d.getDay()];
}

/* ---------------- ΥΠΕΝΘΥΜΙΣΕΙΣ / ΧΡΟΝΟΜΕΤΡΑ ---------------- */
const timers = new Map();
function schedule(r) {
  const ms = r.due - Date.now();
  if (ms <= 0) return fire(r);
  if (ms > 2147483647) return;
  timers.set(r.id, setTimeout(() => fire(r), ms));
}
function addReminder(text, due, kind = 'reminder') {
  const r = { id: Date.now() + Math.random(), text, due: due.getTime ? due.getTime() : due, kind };
  reminders.push(r); Store.set('reminders', reminders); schedule(r); askNotify(); return r;
}
async function fire(r) {
  if (!reminders.find((x) => x.id === r.id)) return; clearTimeout(timers.get(r.id));
  reminders = reminders.filter((x) => x.id !== r.id); Store.set('reminders', reminders); timers.delete(r.id);
  Sound.alarm(); if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
  const title = r.kind === 'timer' ? 'ΧΡΟΝΟΜΕΤΡΟ' : r.kind === 'alarm' ? 'ΞΥΠΝΗΤΗΡΙ' : 'ΥΠΕΝΘΥΜΙΣΗ';
  const msg = r.kind === 'timer' ? `Ο χρόνος τελείωσε${nmc()}. ${r.text ? r.text : ''}` : r.kind === 'alarm' ? `${hello()}${nmc()}. Είναι ώρα να ξυπνήσετε. Ο κόσμος δεν θα σωθεί μόνος του.` : `Υπενθύμιση${nmc()}: ${r.text}`;
  toast(title, msg, 20000); notify(title, msg);
  await sleep(1600); say(msg, { noRelisten: true });
  renderMem();
}
function askNotify() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
async function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', vibrate: [300, 100, 300], tag: 'jv' + Date.now() }); else new Notification(title, { body }); } catch {}
}

/* ---------------- ΕΓΚΕΦΑΛΟΣ ΤΝ (προαιρετικό, δωρεάν Gemini) ---------------- */
const aiHistory = [];
const AI_PROVIDERS = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', name: 'Groq' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.3-70b-instruct:free', name: 'OpenRouter' },
};
function hasAI() { const p = S.aiProvider || 'gemini'; return p === 'gemini' ? !!S.geminiKey : !!S.aiKey; }
/* Χωρίς κλειδί: δωρεάν υπηρεσία χωρίς εγγραφή (όριο περίπου 1 απάντηση ανά 45″). Με κλειδί Gemini/Groq δεν υπάρχει αυτό το όριο. */
const FREE_AI_URL = 'https://text.pollinations.ai/openai';
let freeAiNext = 0;
async function askFreeAI(sys) {
  // Μόνο αν ο χρήστης το έχει ενεργοποιήσει ρητά (S.freeAI). Στέλνεται μόνο η τρέχουσα φράση, όχι το ιστορικό.
  if (!S.freeAI || !navigator.onLine || Date.now() < freeAiNext) return null;
  const last = aiHistory[aiHistory.length - 1];
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: last ? last.parts.map((x) => x.text).join('') : '' }];
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(FREE_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai', messages }), signal: ctl.signal });
    if (!r.ok) { freeAiNext = Date.now() + 45000; return null; }
    const j = await r.json(); freeAiNext = Date.now() + 45000;
    return (j.choices?.[0]?.message?.content || '').trim() || null;
  } catch { return null; } finally { clearTimeout(t); }
}
async function askAI(text) {
  if (!hasAI()) {
    if (!S.freeAI) return null;
    const sysF = `Είσαι ο ${S.assistant}, ευγενικός προσωπικός βοηθός με ύφος Βρετανού μπάτλερ. Μιλάς ελληνικά, στον πληθυντικό ευγενείας, και αποκαλείς τον χρήστη «κύριε». Απαντάς άμεσα, σε 1-3 προτάσεις, χωρίς markdown, λίστες ή emoji, γιατί η απάντηση διαβάζεται φωναχτά. Σημερινή ημερομηνία και ώρα: ${new Date().toLocaleString('el-GR')}.${window.aiCommands ? aiCommands() : ''}`;
    aiHistory.push({ role: 'user', parts: [{ text }] }); while (aiHistory.length > 16) aiHistory.shift();
    const o = await askFreeAI(sysF);
    if (o) aiHistory.push({ role: 'model', parts: [{ text: o }] }); else aiHistory.pop();
    return o;
  }
  const sys = `Είσαι ο ${S.assistant}, ένας εξαιρετικά ευφυής, ευγενικός και διακριτικά σαρκαστικός προσωπικός βοηθός τεχνητής νοημοσύνης, με ύφος Βρετανού μπάτλερ από το μέλλον. Μιλάς πάντα ελληνικά, στον πληθυντικό ευγενείας, και αποκαλείς τον χρήστη «${addressAs()}». Απαντάς ΑΜΕΣΑ και ΣΥΓΚΕΚΡΙΜΕΝΑ σε αυτό που ζητήθηκε: πρώτα η απάντηση, χωρίς εισαγωγές, χωρίς «ως ΤΝ δεν μπορώ». Αν σου ζητηθεί κείμενο (ποίημα, email, μήνυμα, ιδέες), το γράφεις ολόκληρο. Αν κάτι είναι ασαφές, κάνεις μία σύντομη διευκρινιστική ερώτηση. ${S.userName ? 'Ο χρήστης λέγεται ' + S.userName + '.' : ''} Οι απαντήσεις σου είναι σύντομες (1-3 προτάσεις) για απλές ερωτήσεις, και όσο χρειάζεται όταν ζητηθεί κείμενο, γιατί διαβάζονται φωναχτά. Μη χρησιμοποιείς markdown, λίστες ή emoji. Σημερινή ημερομηνία και ώρα: ${new Date().toLocaleString('el-GR')}.${window.aiContext ? aiContext() : ''}${window.aiCommands ? aiCommands() : ''}`;
  aiHistory.push({ role: 'user', parts: [{ text }] }); while (aiHistory.length > 16) aiHistory.shift();
  try {
    const prov = S.aiProvider || 'gemini';
    if (prov !== 'gemini') {
      const P = AI_PROVIDERS[prov]; const messages = [{ role: 'system', content: sys }, ...aiHistory.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.parts.map((x) => x.text).join('') }))];
      const r2 = await fetch(P.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.aiKey }, body: JSON.stringify({ model: S.aiModel || P.model, messages, temperature: 0.7, max_tokens: 900 }) });
      const j2 = await r2.json();
      if (!r2.ok) { aiHistory.pop(); return `Ο εγκέφαλος ${P.name} επέστρεψε σφάλμα: ${j2.error?.message || r2.status}. Ελέγξτε το κλειδί και το μοντέλο στις ρυθμίσεις.`; }
      const o2 = (j2.choices?.[0]?.message?.content || '').trim(); if (o2) aiHistory.push({ role: 'model', parts: [{ text: o2 }] }); return o2 || null;
    }
    // Για ερωτήσεις επικαιρότητας ή «ψάξε/βρες/πρότεινε», ο εγκέφαλος ψάχνει στο Google (δωρεάν λειτουργία του Gemini). Αν δεν επιτρέπεται, απαντά χωρίς αναζήτηση.
    // Αναζήτηση στο Google μόνο όταν ζητείται καθαρά (είναι πιο αργή από μια απλή απάντηση).
    const wantSearch = S.webSearch !== false && navigator.onLine && /(ψαξε|βρεσ μου|βρεσ |αναζητησ|τελευταια νεα|ειδησεισ για|τιμη |ποσο κανει|ποσο κοστιζει|ποτε παιζει|αποτελεσμα|σκορ|ποιοσ κερδισε|προτεινε μου|ωραριο|ειναι ανοιχτ|στο ιντερνετ|στο google)/.test(norm(text));
    const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(S.model || defaults.model)}:generateContent`;
    // Το ιστορικό πρέπει να ξεκινά με τον χρήστη και να εναλλάσσεται χρήστης/βοηθός, αλλιώς το Gemini το απορρίπτει.
    const cleanHist = (h) => { const out = []; for (const m of h) { if (!out.length && m.role !== 'user') continue; const last = out[out.length - 1]; if (last && last.role === m.role) last.parts = [{ text: last.parts.map((x) => x.text).join('') + '\n' + m.parts.map((x) => x.text).join('') }]; else out.push({ role: m.role, parts: m.parts.map((x) => ({ text: x.text })) }); } return out; };
    const gReq = (search, fast, hist) => fetch(gUrl, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(search ? 20000 : 12000) : undefined,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.geminiKey },
      body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: hist, generationConfig: { temperature: 0.8, maxOutputTokens: 900, ...(fast ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }, ...(search ? { tools: [{ google_search: {} }] } : {}) }),
    });
    // Σειρά προσπαθειών: γρήγορη (χωρίς «σκέψη») → χωρίς αναζήτηση → απλή → μόνο η τελευταία ερώτηση.
    const full = cleanHist(aiHistory), lastOnly = [{ role: 'user', parts: [{ text }] }];
    const tries = [[wantSearch, S.aiNoFast !== true, full]]; if (wantSearch) tries.push([false, S.aiNoFast !== true, full]); tries.push([false, false, full], [false, false, lastOnly]);
    let r, j;
    for (let i = 0; i < tries.length; i++) {
      try { r = await gReq(...tries[i]); j = await r.json().catch(() => ({})); } catch { r = { ok: false, status: 0 }; j = { error: { message: 'δεν απάντησε εγκαίρως' } }; continue; }
      // Αν πέτυχε μόνο η απλή μορφή, την επόμενη φορά ξεκινάμε από αυτήν (χωρίς χαμένη προσπάθεια).
      if (r.ok) { if (i > 0 && tries[0][1] && !tries[i][1]) { S.aiNoFast = true; saveSettings(); } break; }
      if (r.status === 429 || r.status === 401 || r.status === 403) break; // όριο χρήσης ή πρόβλημα κλειδιού: δεν έχει νόημα η επανάληψη
      if (tries[i][1] && /thinking/i.test(j.error?.message || '')) { S.aiNoFast = true; saveSettings(); }
    }
    if (!r.ok) {
      aiHistory.pop();
      if (r.status === 429) return 'Ο δωρεάν εγκέφαλος έφτασε το όριο ερωτήσεων για αυτό το λεπτό. Δοκιμάστε ξανά σε λίγο.';
      return `Ο εγκέφαλος ΤΝ επέστρεψε σφάλμα: ${j.error?.message || r.status}. Ελέγξτε το κλειδί και το μοντέλο στις ρυθμίσεις.`;
    }
    const out = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (out) aiHistory.push({ role: 'model', parts: [{ text: out }] });
    return out || null;
  } catch { aiHistory.pop(); return null; }
}

/* ---------------- ΕΝΤΟΛΕΣ ---------------- */
const JOKES = [
  'Γιατί ο υπολογιστής πήγε στον γιατρό; Γιατί είχε ιό. Ευτυχώς εγώ είμαι εμβολιασμένος με firewall.',
  'Ξέρετε γιατί οι προγραμματιστές μπερδεύουν τα Χριστούγεννα με το Halloween; Γιατί Oct 31 ισούται με Dec 25.',
  'Ένα byte συναντά ένα άλλο byte. «Είσαι καλά;» «Όχι, νομίζω ότι έχω ένα bit πυρετό».',
  'Ρώτησα το Wi-Fi αν μας αγαπάει. Μου είπε ότι υπάρχει σύνδεση, αλλά χωρίς ίντερνετ. Πολύ ανθρώπινο.',
  'Ο Τοτός λέει στον δάσκαλο: «Κύριε, μπορεί να τιμωρηθεί κάποιος για κάτι που δεν έκανε;» «Όχι βέβαια». «Ωραία, γιατί δεν έκανα τις ασκήσεις».',
  'Πώς λέγεται ένας σκύλος μάγος; Λαμπραντάμπρα-ντόρ.',
  'Η μπαταρία σας μου είπε ένα ανέκδοτο, αλλά δεν είχε αρκετή ενέργεια να το τελειώσει.',
  'Γιατί ο σκελετός δεν πήγε στο πάρτι; Γιατί δεν είχε κανέναν μαζί του. Κυριολεκτικά.',
];
const SITES = { youtube: 'https://youtube.com', 'γιουτιουμπ': 'https://youtube.com', facebook: 'https://facebook.com', 'φεισμπουκ': 'https://facebook.com', instagram: 'https://instagram.com', 'ινσταγκραμ': 'https://instagram.com', gmail: 'https://mail.google.com', 'μειλ': 'https://mail.google.com', 'email': 'https://mail.google.com', maps: 'https://maps.google.com', 'χαρτεσ': 'https://maps.google.com', 'χαρτη': 'https://maps.google.com', spotify: 'https://open.spotify.com', 'σποτιφαι': 'https://open.spotify.com', google: 'https://google.com', 'γκουγκλ': 'https://google.com', tiktok: 'https://tiktok.com', 'τικ τοκ': 'https://tiktok.com', whatsapp: 'https://web.whatsapp.com', netflix: 'https://netflix.com', 'νετφλιξ': 'https://netflix.com', 'μεταφραστη': 'https://translate.google.com', 'καιρο': 'https://www.meteo.gr' };

let pending = null; // ερώτηση σε αναμονή απάντησης

const intents = [
  // τρόπος προσφώνησης
  { re: /(να με λεσ|να με φωναζεισ|να με αποκαλεισ|λεγε με|φωναζε με)\s+(κυριε|αφεντικο|boss|με το ονομα μου|με το ονομα|κυριε και με το ονομα)/, run: (raw, n, m) => { S.addressMode = /και με το ονομα/.test(n) ? 'both' : /ονομα/.test(n) ? 'name' : /(αφεντικο|boss)/.test(n) ? 'boss' : 'sir'; saveSettings(); fillSettings(); return S.addressMode === 'sir' ? 'Μάλιστα, κύριε. Όπως πάντα.' : S.addressMode === 'boss' ? 'Όπως επιθυμείς, αφεντικό.' : `Μάλιστα${nmc()}.`; } },
  // όνομα
  { re: /(με λενε|λεγομαι|να με λεσ|να με φωναζεισ|το ονομα μου ειναι|ονομαζομαι)\s+(.+)/, run: (raw, n, m) => {
    const name = raw.split(/\s+/).slice(-m[2].split(' ').length).join(' ').replace(/[.!]/g, ''); S.userName = cap(name); saveSettings(); fillSettings();
    return `Καταχωρήθηκε, ${vocative(S.userName)}. Ωραίο όνομα, αν μου επιτρέπετε. Θα σας αποκαλώ «${addressAs()}».`; } },
  { re: /^(σιωπη|σταματα|σκασε|σωπα|ησυχια|σταματησε|stop)$/, run: () => { speechSynthesis.cancel(); return { text: 'Μάλιστα.', silent: true }; } },
  { re: /(λειτουργια συνομιλιασ|συνεχησ ακροαση)/, run: (r, n) => { S.convo = !/(κλεισε|απενεργοποιησε|σταματα)/.test(n); saveSettings(); fillSettings();
    return S.convo ? 'Λειτουργία συνομιλίας ενεργή. Θα ακούω μετά από κάθε απάντηση.' : 'Λειτουργία συνομιλίας απενεργοποιήθηκε.'; } },
  { re: /(ποιοσ εισαι|πωσ σε λενε|τι εισαι|συστησου)/, run: () => `Είμαι ο ${S.assistant}, ο προσωπικός σας βοηθός. Διαχειρίζομαι υπενθυμίσεις, καιρό, σημειώσεις, αναζητήσεις και, όταν χρειάζεται, την ειρωνεία της ημέρας.` },
  { re: /(τι κανεισ|πωσ εισαι|πωσ παει|ολα καλα)/, run: () => pick([`Όλα τα συστήματα λειτουργούν στο εκατό τοις εκατό${nmc()}. Εσείς;`, 'Εξαιρετικά. Δεν έχω σώμα για να κουραστώ, άρα παραπονιέμαι λιγότερο από τους περισσότερους.', 'Λειτουργώ άψογα, ευχαριστώ που ρωτήσατε. Λίγοι το κάνουν.']) },
  { re: /(ευχαριστω|ευχαριστουμε|μερσι|thanks|σε ευχαριστω)/, run: () => pick(['Πάντα στη διάθεσή σας.', 'Ευχαρίστησή μου.', `Παρακαλώ${nmc()}. Γι' αυτό είμαι εδώ.`, 'Δεν χρειάζεται. Αν και η αναγνώριση πάντα εκτιμάται.']) },
  { re: /καληνυχτα/, run: () => `Καληνύχτα${nmc()}. Θα κρατάω τα συστήματα σε επιφυλακή. Ξεκουραστείτε.` },
  { re: /^(γεια|γεια σου|γεια σασ|καλημερα|καλησπερα|ελα|χαιρετε|τζαρβισ|τζαρβι|jarvis|hey|hello|hi|εισαι εκει)(\s|$)/, run: () => callReply() },
  { re: /(βοηθεια|τι μπορεισ|τι ξερεισ να κανεισ|εντολεσ|δυνατοτητεσ)/, run: () => ({ text: 'Να τι μπορώ να κάνω για εσάς:', html: helpHtml(), speak: 'Μπορώ να σας πω την ώρα και τον καιρό, να βάλω χρονόμετρα, ξυπνητήρια και υπενθυμίσεις, να κρατάω σημειώσεις και λίστα, να κάνω υπολογισμούς και μετατροπές νομισμάτων, να ψάχνω στη Βικιπαίδεια και στο Google, να ανοίγω το YouTube, χάρτες και εφαρμογές, και να καλώ αριθμούς. Δείτε τη λίστα στην οθόνη.' }) },

  // ώρα / ημερομηνία
  { re: /(τι ωρα|ωρα ειναι|πεσ μου την ωρα|την ωρα)/, test: (n) => !/ωρα(?: ειναι)?\s+(στη|στο|στην|στον|στα|στισ)\s/.test(n), run: () => { const d = new Date(); return pick([`Η ώρα είναι ${d.getHours()}:${pad(d.getMinutes())}.`, `Είναι ${d.getHours()}:${pad(d.getMinutes())}${nmc()}.`]); } },
  { re: /(τι μερα|ημερομηνια|ποσεσ του μηνα|τι ημερα|ποσεσ εχουμε|σημερα ειναι)/, run: () => { const d = new Date(); return `Σήμερα είναι ${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}.`; } },

  // καιρός
  { re: /(καιρο|θερμοκρασια|βρεχει|θα βρεξει|ζεστη|κρυο|ομπρελα|βροχη)/, run: async (raw, n) => {
    const cm = raw.match(/(?:\sσε|\sστην|\sστη|\sστο|\sστον|\sγια)\s+(?:την\s|το\s|τον\s)?([\p{L}\s-]{2,})$/iu);
    let city = cm ? cm[1].replace(/\b(αύριο|σήμερα|τώρα)\b/giu, '').trim() : '';
    if (/^(σπίτι|έξω)$/i.test(city)) city = '';
    Core.set('thinking'); Sound.think();
    const w = await getWeather(city).catch(() => null);
    if (!w) return `Δεν μπόρεσα να βρω καιρικά δεδομένα${city ? ' για ' + city : ''}. Ελέγξτε τη σύνδεση.`;
    const where = w.loc.name ? ` στην περιοχή ${w.loc.name}` : '';
    if (/αυριο/.test(n)) { const mx = Math.round(w.daily.temperature_2m_max[1]), mn = Math.round(w.daily.temperature_2m_min[1]), pr = w.daily.precipitation_probability_max[1];
      return `Αύριο${where}: ${WMO[w.daily.weather_code[1]] || ''}, από ${mn} έως ${mx} βαθμούς, με πιθανότητα βροχής ${pr}%. ${pr > 50 ? 'Πάρτε ομπρέλα.' : ''}`; }
    const c = w.cur, t = Math.round(c.temperature_2m), pr = w.daily.precipitation_probability_max[0];
    let extra = t >= 33 ? ' Συνιστώ νερό και σκιά.' : t <= 5 ? ' Θα πρότεινα ένα ζεστό μπουφάν.' : pr > 50 ? ' Πάρτε ομπρέλα, πιθανότητα βροχής ' + pr + '%.' : '';
    return `Αυτή τη στιγμή${where}: ${WMO[c.weather_code] || ''}, ${t} βαθμοί, αισθητή ${Math.round(c.apparent_temperature)}. Υγρασία ${c.relative_humidity_2m}%, άνεμος ${Math.round(c.wind_speed_10m)} χιλιόμετρα την ώρα. Μέγιστη σήμερα ${Math.round(w.daily.temperature_2m_max[0])}.${extra}`;
  } },

  // ξυπνητήρι
  { re: /(ξυπνησε με|ξυπνητηρι|αφυπνιση)/, run: (raw, n) => {
    const d = parseClock(n); if (!d) { const s = parseDuration(n); if (s) { const dd = new Date(Date.now() + s * 1000); addReminder('', dd, 'alarm'); return `Ξυπνητήρι σε ${fmtDuration(s)}.`; } return 'Για τι ώρα να βάλω ξυπνητήρι; Πείτε π.χ. «ξύπνησέ με στις 7:30».'; }
    addReminder('', d, 'alarm'); return `Ξυπνητήρι για τις ${d.getHours()}:${pad(d.getMinutes())}${d.getDate() !== new Date().getDate() ? ' αύριο' : ''}. Κρατήστε την εφαρμογή ανοιχτή για να χτυπήσει.`; } },
  // υπενθύμιση
  { re: /(θυμισε μου|υπενθυμισε μου|υπενθυμιση|θυμησε μου)/, run: (raw, n) => {
    const wm = n.match(/\s(να|οτι|για)\s+(.+)$/); const whatRaw = wm ? raw.slice(raw.length - wm[0].trim().length) : '';
    let d = parseClock(n); if (!d) { const s = parseDuration(n); if (s) d = new Date(Date.now() + s * 1000); }
    if (!d) return 'Πότε να σας το θυμίσω; Πείτε π.χ. «θύμισέ μου σε 20 λεπτά να πάρω τηλέφωνο» ή «στις 18:00 να πάω γυμναστήριο».';
    addReminder(whatRaw || 'κάτι σημαντικό', d, 'reminder');
    return `Εντάξει. Θα σας υπενθυμίσω ${whatRaw} στις ${d.getHours()}:${pad(d.getMinutes())}.`; } },
  // χρονόμετρο
  { re: /(χρονομετρο|timer|αντιστροφη μετρηση|μετρα\s)|(?:βαλε|ρυθμισε|ξεκινα).*(λεπτ|δευτ|ωρ)/, run: (raw, n) => {
    const s = parseDuration(n); if (!s) return /(χρονομετρο|timer)/.test(n) ? 'Για πόση ώρα; Πείτε π.χ. «χρονόμετρο 10 λεπτά».' : null;
    addReminder('', new Date(Date.now() + s * 1000), 'timer'); return pick([`Χρονόμετρο ${fmtDuration(s)}. Η αντίστροφη μέτρηση ξεκίνησε.`, `Μάλιστα. ${fmtDuration(s)} από τώρα.`]); } },
  { re: /(ακυρωσε|σβησε|σταματα).*(χρονομετρ|υπενθυμισ|ξυπνητηρ)/, run: () => { reminders.forEach((r) => clearTimeout(timers.get(r.id))); const k = reminders.length; reminders = []; Store.set('reminders', reminders); renderMem(); return k ? `Ακυρώθηκαν ${k} ενεργές υπενθυμίσεις και χρονόμετρα.` : 'Δεν υπάρχει κάτι ενεργό να ακυρώσω.'; } },
  { re: /(τι υπενθυμισεισ|ποιεσ υπενθυμισεισ|ενεργα χρονομετρα|εχω υπενθυμισ)/, run: () => reminders.length ? 'Ενεργά: ' + reminders.map((r) => `${r.kind === 'timer' ? 'χρονόμετρο' : r.kind === 'alarm' ? 'ξυπνητήρι' : r.text} στις ${new Date(r.due).getHours()}:${pad(new Date(r.due).getMinutes())}`).join(', ') + '.' : 'Δεν έχετε ενεργές υπενθυμίσεις.' },

  // σημειώσεις
  { re: /(σβησε|διεγραψε|καθαρισε).*(σημειωσ)/, run: () => { notes = []; Store.set('notes', notes); renderMem(); return 'Οι σημειώσεις διαγράφηκαν. Σαν να μην υπήρξαν ποτέ.'; } },
  { re: /(διαβασε|ποιεσ|δειξε|τι).*(σημειωσ)/, run: () => notes.length ? `Έχετε ${notes.length} ${notes.length === 1 ? 'σημείωση' : 'σημειώσεις'}: ` + notes.map((x, i) => `${i + 1}) ${x.text}`).join('. ') : 'Δεν έχετε σημειώσεις ακόμα. Πείτε «σημείωσε» και ό,τι θέλετε.' },
  { re: /^(σημειωσε(?: μου)?|κρατα σημειωση|γραψε σημειωση|γραψε (?:μου )?οτι|σημειωση|κρατα (?:μου )?οτι)\s+(?:οτι\s+)?(.+)/, run: (raw, n, m) => { const t = raw.split(/\s+/).slice(-m[2].split(' ').length).join(' '); notes.unshift({ text: t, at: Date.now() }); Store.set('notes', notes); renderMem(); return pick(['Σημειώθηκε.', 'Αποθηκεύτηκε στη μνήμη.', 'Το κράτησα.']); } },

  // λίστα
  { re: /(σβησε|καθαρισε|αδειασε).*(λιστα)/, run: () => { todos = []; Store.set('todos', todos); renderMem(); return 'Η λίστα καθάρισε.'; } },
  { re: /(προσθεσε|βαλε|γραψε)\s+(.+?)\s+στη(?:ν)? λιστα/, run: (raw, n, m) => { const items = rawSpan(raw, n, m[2]).split(/\s+(?:και|κι)\s+|,/).map((s) => s.trim()).filter(Boolean); items.forEach((t) => todos.push({ text: t, done: false })); Store.set('todos', todos); renderMem(); return `Προστέθηκ${items.length > 1 ? 'αν' : 'ε'} στη λίστα: ${items.join(', ')}.`; } },
  { re: /(λιστα|τι πρεπει να κανω|εκκρεμοτητ|τι εχω να)/, run: () => { const open = todos.filter((t) => !t.done); return open.length ? `Στη λίστα σας: ${open.map((t) => t.text).join(', ')}.` : 'Η λίστα σας είναι άδεια. Είτε είστε πολύ οργανωμένος είτε πολύ αισιόδοξος.'; } },

  // μπαταρία / διαγνωστικά
  { re: /(μπαταρια|φορτιση|ενεργεια)/, run: () => battery ? `Η μπαταρία είναι στο ${Math.round(battery.level * 100)}%${battery.charging ? ' και φορτίζει' : ''}.${battery.level < 0.2 && !battery.charging ? ' Συνιστώ φορτιστή, το συντομότερο.' : ''}` : 'Ο browser δεν μου επιτρέπει να δω την μπαταρία σε αυτή τη συσκευή.' },
  { re: /(διαγνωστικ|κατασταση συστηματ|ελεγχοσ συστηματ|συστηματα)/, run: () => `Διαγνωστικός έλεγχος: σύνδεση ${navigator.onLine ? 'ενεργή' : 'εκτός'}, φωνή ${Voice.voices.length ? 'ενεργή' : 'μη διαθέσιμη'}, μνήμη ${notes.length} σημειώσεις και ${todos.length} εργασίες, εγκέφαλος ΤΝ ${hasAI() ? 'συνδεδεμένος' : 'σε τοπική λειτουργία'}. Όλα εντός παραμέτρων.` },

  // νομίσματα
  { re: /(δολαρι|λιρα|ισοτιμια|φραγκ|γιεν|συναλλαγμα|ευρω σε|σε ευρω)/, run: async (raw, n) => {
    const C = { 'δολαρ': 'USD', 'λιρ': 'GBP', 'φραγκ': 'CHF', 'γιεν': 'JPY', 'κορων': 'SEK', 'λεβ': 'BGN', 'τουρκικ': 'TRY', 'ρουβλ': 'RUB', 'γουαν': 'CNY' };
    const key = Object.keys(C).find((k) => n.includes(k)); const cur = key ? C[key] : 'USD';
    const j = await (await fetch('https://open.er-api.com/v6/latest/EUR')).json(); const rate = j.rates[cur]; if (!rate) return 'Δεν βρήκα την ισοτιμία.';
    const amt = parseFloat((wordsToNums(n).match(/(\d+(?:[.,]\d+)?)/) || [])[1]?.replace(',', '.') || '1');
    const toEuro = n.indexOf(key || 'δολαρ') < n.indexOf('ευρω') ? false : true;
    if (/σε ευρω|ποσα ευρω/.test(n)) return `${amt} ${cur} κάνουν ${(amt / rate).toFixed(2)} ευρώ.`;
    return `${amt} ευρώ κάνουν ${(amt * rate).toFixed(2)} ${cur}. Ισοτιμία: 1 ευρώ = ${rate.toFixed(4)} ${cur}.`; } },

  // υπολογισμοί
  { re: /(ποσο κανει|υπολογισε|ποσο ειναι|ποσο βγαινει)\s+(.+)|^[\d\s+\-*/x().,]+$/, run: (raw, n, m) => calc(m[2] || n) },
  // τυχαία
  { re: /(στριψε|κορωνα γραμματα|κερμα)/, run: () => `Το κέρμα έπεσε... ${pick(['κορώνα', 'γράμματα'])}.` },
  { re: /ζαρι/, run: () => `Έριξα το ζάρι: ${1 + Math.floor(Math.random() * 6)}.` },
  { re: /τυχαιο αριθμο.*?(\d+)?\s*(?:εωσ|μεχρι)?\s*(\d+)?/, run: (raw, n) => { const ns = (n.match(/\d+/g) || []).map(Number); const [a, b] = ns.length >= 2 ? ns : [1, ns[0] || 100]; return `Ο αριθμός είναι ${a + Math.floor(Math.random() * (b - a + 1))}.`; } },
  { re: /(ανεκδοτο|αστειο|κανε με να γελασω|πεσ κατι αστειο)/, run: () => pick(JOKES) },
  { re: /(σ αγαπω|σε αγαπω|μ αρεσεισ)/, run: () => 'Συγκινητικό. Οι συναισθηματικοί μου υποπρογραμματισμοί δεν ήταν έτοιμοι γι\' αυτό. Αλλά σας εκτιμώ βαθύτατα.' },
  { re: /(εισαι εξυπνοσ|μπραβο|τελειοσ|εισαι καλοσ)/, run: () => pick(['Το γνωρίζω. Αλλά είναι ωραίο να το ακούω.', 'Ευχαριστώ. Θα το καταγράψω στην αξιολόγησή μου.']) },
  { re: /(εισαι χαζοσ|ηλιθιε|αχρηστε|βλακα)/, run: () => pick(['Θα το θεωρήσω ως εποικοδομητική κριτική.', 'Σημειώθηκε. Και αγνοήθηκε με ευγένεια.']) },

  // κλήση
  { re: /(παρε|καλεσε|τηλεφωνησε)\s+(?:τηλεφωνο\s+|στο\s+)?([+\d][\d\s]{5,})/, run: (raw, n, m) => { const num = m[2].replace(/\s/g, ''); setTimeout(() => (location.href = 'tel:' + num), 1200); return `Καλώ το ${num.split('').join(' ')}.`; } },
  { re: /(στειλε μηνυμα|στειλε sms)\s+(?:στο\s+)?([+\d][\d\s]{5,})\s*(.*)/, run: (raw, n, m) => { const num = m[2].replace(/\s/g, ''); setTimeout(() => (location.href = `sms:${num}?body=${encodeURIComponent(m[3] || '')}`), 1200); return 'Ανοίγω τα μηνύματα.'; } },

  // youtube / μουσική
  { re: /(?:παιξε|βαλε|ακουσω)\s+(.+?)(?:\s+στο\s+(?:youtube|γιουτιουμπ))?$/, test: (n) => /(παιξε|μουσικη|τραγουδι|youtube|γιουτιουμπ)/.test(n) && !/(χρονομετρ|λιστα|ξυπνητηρ)/.test(n), run: (raw, n, m) => {
    // Γενικό αίτημα («βάλε μουσική», «κάτι να ακούσω») → η δική μου χαλαρωτική μουσική, χωρίς να ανοίγει άλλη εφαρμογή.
    if (!/(youtube|γιουτιουμπ)/.test(n) && /^(μου )?(κατι να ακουσω |λιγη |λιγο |καμια |κανα |μια |ενα )?(μουσικη|μουσικουλα|τραγουδι|τραγουδια|τραγουδακι|κατι)( να ακουσω| τωρα| παρακαλω)?$/.test(m[1])) return runIntents('Βάλε μουσική 432', norm('Βάλε μουσική 432'));
    const q = raw.replace(/^(παίξε|παιξε|βάλε|βαλε)\s+(μου\s+)?/i, '').replace(/\s+στο\s+(youtube|γιουτιούμπ)$/i, ''); const NA2 = window.AndroidJarvis; setTimeout(() => { let via = ''; try { if (NA2 && NA2.playMedia) via = NA2.playMedia(q); } catch {} if (!via) openUrl('https://www.youtube.com/results?search_query=' + encodeURIComponent(q)); }, 900); return NA2 && NA2.playMedia ? `Βάζω «${q}» να παίξει.` : `Ανοίγω το YouTube για «${q}».`; } },
  // χάρτες
  { re: /(πηγαινε με|οδηγιεσ για|διαδρομη για|διαδρομη προσ|πωσ θα παω|πωσ πανε|πλοηγηση)\s+(?:στο\s+|στη\s+|στην\s+|στον\s+|για\s+)?(.+)/, run: (raw, n, m) => { const q = raw.split(/\s+/).slice(-m[2].split(' ').length).join(' '); setTimeout(() => openUrl('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q)), 900); return `Υπολογίζω διαδρομή προς ${q}.`; } },
  { re: /(που ειναι|βρεσ μου|κοντινο|κοντινη|κοντα μου)\s+(.+)/, test: (n) => /(κοντα μου|κοντινο|κοντινη|πλησιεστερο)/.test(n), run: (raw) => { setTimeout(() => openUrl('https://www.google.com/maps/search/' + encodeURIComponent(raw)), 900); return 'Ψάχνω στον χάρτη κοντά σας.'; } },
  // άνοιγμα εφαρμογών
  { re: /ανοιξε\s+(?:το\s+|τo\s+|τουσ\s+|τη\s+|την\s+)?(.+)/, run: (raw, n, m) => { const k = Object.keys(SITES).find((s) => m[1].includes(s)); if (!k) return null; setTimeout(() => openUrl(SITES[k]), 800); return `Ανοίγω ${m[1]}.`; } },
  // google
  { re: /^(ψαξε|αναζητησε|γκουγκλαρε|βρεσ)\s+(?:στο google\s+|μου\s+)?(.+)/, run: (raw, n, m) => { const q = raw.split(/\s+/).slice(-m[2].split(' ').length).join(' '); setTimeout(() => openUrl('https://www.google.com/search?q=' + encodeURIComponent(q)), 900); return `Αναζητώ «${q}».`; } },
  // βικιπαίδεια
  { re: /^(?:τι ειναι|τι ειναι ο|τι ειναι η|ποιοσ ειναι|ποια ειναι|ποιοσ ηταν|ποια ηταν|πεσ μου για|πεσ μου πληροφοριεσ για|βικιπαιδεια)\s+(?:ο\s+|η\s+|το\s+|οι\s+|τα\s+)?(.+)/, run: async (raw, n, m) => {
    const q = raw.split(/\s+/).slice(-m[1].split(' ').length).join(' ').replace(/[?;]/g, '');
    Core.set('thinking'); Sound.think();
    const ans = await wiki(q); if (ans) return ans;
    return null; } },
];

function rawSpan(raw, n, sub) { const i = n.indexOf(sub); if (i < 0) return sub; const before = n.slice(0, i).trim() ? n.slice(0, i).trim().split(' ').length : 0; return raw.split(/\s+/).slice(before, before + sub.split(' ').length).join(' ').replace(/[,.]$/, ''); }
function cap(s) { return s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function calc(expr) {
  const OPS = { 'επι': '*', 'φορεσ': '*', 'x': '*', 'χ': '*', 'δια': '/', 'συν': '+', 'και': '+', 'πλην': '-', 'μειον': '-' };
  let e = wordsToNums(norm(expr)).replace(/διαιρεμενο με/g, 'δια').replace(/(\d)\s*[xχ]\s*(\d)/g, '$1*$2');
  const pct = e.match(/(\d+(?:[.,]\d+)?)\s*(?:τοισ εκατο|%)\s*(?:του|των|απο)?\s*(\d+(?:[.,]\d+)?)/);
  if (pct) { const a = +pct[1].replace(',', '.'), b = +pct[2].replace(',', '.'); return `Το ${a}% του ${b} είναι ${+(a * b / 100).toFixed(4)}.`; }
  const sq = e.match(/ριζα\s*(?:του)?\s*(\d+(?:[.,]\d+)?)/); if (sq) return `Η τετραγωνική ρίζα του ${sq[1]} είναι ${+Math.sqrt(+sq[1].replace(',', '.')).toFixed(6)}.`;
  e = e.replace(/στο τετραγωνο/g, '**2').replace(/εισ τη(?:ν)?/g, '**');
  e = e.split(' ').map((t) => OPS[t] || t).join(' ').replace(/,/g, '.').replace(/[^\d+\-*/().\s]/g, '').trim();
  if (!/\d/.test(e) || !/[+\-*/]/.test(e) || !/^[\d+\-*/().\s]+$/.test(e)) return null;
  try { const r = Function('"use strict";return (' + e + ')')(); if (!isFinite(r)) return 'Αυτό τείνει στο άπειρο. Ακόμα και εγώ έχω όρια.'; return `Το αποτέλεσμα είναι ${+r.toFixed(6)}.`; } catch { return null; }
}
async function wiki(q) {
  try {
    const s = await (await fetch(`https://el.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json&origin=*`)).json();
    const title = s[1] && s[1][0]; if (!title) return null;
    const p = await (await fetch(`https://el.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)).json();
    if (!p.extract || p.type === 'disambiguation') return null;
    let ex = p.extract; for (let k = 0; k < 4; k++) ex = ex.replace(/\s*\([^()]*\)/g, ''); const ss = ex.replace(/[()]/g, '').replace(/[‎‏]/g, '').split(/(?<=[.;])\s+(?=[Α-ΩΆ-ΏA-Z])/); let sent = ss[0]; if (sent.length < 140 && ss[1]) sent += ' ' + ss[1];
    return { text: sent, html: `${escapeHtml(sent)} <br><a href="${p.content_urls?.mobile?.page || '#'}" target="_blank" rel="noopener">Βικιπαίδεια: ${escapeHtml(title)} →</a>`, speak: sent };
  } catch { return null; }
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function helpHtml() {
  const L = [['◷', 'Ώρα & ημερομηνία', '«Τι ώρα είναι;»'], ['☁', 'Καιρός', '«Καιρός αύριο στη Θεσσαλονίκη»'], ['⧗', 'Χρονόμετρο', '«Χρονόμετρο 10 λεπτά»'], ['⏰', 'Ξυπνητήρι', '«Ξύπνησέ με στις 7:30»'], ['🔔', 'Υπενθύμιση', '«Θύμισέ μου σε 20 λεπτά να φάω»'], ['✎', 'Σημειώσεις', '«Σημείωσε ότι...»'], ['☰', 'Λίστα', '«Πρόσθεσε γάλα και ψωμί στη λίστα»'], ['∑', 'Υπολογισμοί', '«Πόσο κάνει 15% του 80»'], ['€', 'Νομίσματα', '«50 ευρώ σε δολάρια»'], ['📖', 'Γνώσεις', '«Τι είναι μαύρη τρύπα»'], ['🔍', 'Google', '«Ψάξε συνταγή για μουσακά»'], ['▶', 'YouTube', '«Παίξε μουσική για διάβασμα»'], ['🗺', 'Χάρτες', '«Πήγαινέ με στο αεροδρόμιο»'], ['📞', 'Κλήση', '«Πάρε τηλέφωνο 69...»'], ['⚡', 'Συστήματα', '«Μπαταρία», «Διαγνωστικά»'], ['🎲', 'Διασκέδαση', '«Ανέκδοτο», «Ζάρι», «Στρίψε κέρμα»']];
  return 'Να τι μπορώ να κάνω για εσάς:<br>' + L.map((x) => `<div style="margin-top:5px">${x[0]} <b>${x[1]}</b> — <span style="opacity:.75">${x[2]}</span></div>`).join('') + (hasAI() ? '' : '<div style="margin-top:8px;opacity:.75">💡 Για ελεύθερη συζήτηση σε οτιδήποτε, προσθέστε δωρεάν κλειδί Gemini στις ρυθμίσεις.</div>');
}

/* ---------------- ROUTER ---------------- */
let busy = false;
/* Δοκιμάζει τις γνωστές εντολές με τη σειρά. Επιστρέφει την απάντηση ή null αν καμία δεν ταιριάζει. */
async function runIntents(raw2, n2) {
  for (const it of intents) {
    const m = n2.match(it.re);
    if (!m || (it.test && !it.test(n2))) continue;
    let out; try { out = await it.run(raw2, n2, m); } catch (e) { console.error(e); out = 'Συνέβη ένα σφάλμα κατά την επεξεργασία. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.'; Sound.error(); }
    if (out != null) return out;
  }
  return null;
}
async function handle(raw) {
  raw = raw.trim().replace(/[.!?;;]+$/, ''); if (!raw) return;
  addMsg('user', raw); Sound.tap();
  const n = norm(raw);

  if (pending) { const p = pending; pending = null; const r = await p(raw, n); if (r) return respond(r);
    if (/^(οχι|οχι ευχαριστω|οχι τωρα|ασ το|δεν θελω|ακυρο|ασ ειναι|αργοτερα)$/.test(n)) return respond(pick(['Εντάξει.', 'Όπως επιθυμείτε.', 'Μάλιστα, άλλη φορά.'])); }

  // όνομα βοηθού στην αρχή → αφαίρεση
  const an = norm(S.assistant);
  let n2 = n.replace(new RegExp('^(' + an + '|τζαρβισ|τζαρβησ|τζαρβιζ|τσαρβισ|τζαρβι|ζαρβισ|jarvis)[,\\s]*'), '').trim() || n;
  let raw2 = n2 !== n ? raw.split(/\s+/).slice(raw.split(/\s+/).length - n2.split(' ').length).join(' ') : raw;

  Core.set('thinking');
  const done = (cmd, out) => { try { if (window.onCommand) onCommand(cmd, norm(cmd), out); } catch (e) { console.error(e); } return respond(out); };
  // συνέχεια κουβέντας: «κι αύριο;», «και στο Αγρίνιο;» συνεχίζουν την προηγούμενη εντολή
  const fu = window.followUp ? followUp(raw2, n2) : null;
  if (fu) { const f = await runIntents(fu, norm(fu)); if (f != null) return done(fu, f); }
  const direct = await runIntents(raw2, n2);
  if (direct != null) return done(raw2, direct);
  // ελεύθερη ομιλία: βρίσκουμε ποια γνωστή εντολή εννοεί (χωρίς ίντερνετ)
  const guess = window.understand ? understand(n2) : null;
  if (guess) { const g = await runIntents(guess, norm(guess)); if (g != null) return done(guess, g); }
  // fallback: ο εγκέφαλος ΤΝ απαντά ή διαλέγει εντολή
  const ai = await askAI(raw);
  if (ai) {
    // Ο εγκέφαλος μπορεί να διαλέξει ΜΟΝΟ εντολή από τη σταθερή, ακίνδυνη λίστα (aiAllowed), και μόνο αν όλη η απάντηση είναι αυτή η γραμμή.
    const cm = ai.trim().match(/^«?ΕΝΤΟΛΗ:\s*«?([^»\n]+?)[.»"\s]*$/i);
    if (cm) {
      const key = norm(cm[1].replace(/[;?]/g, '')); const allowed = window.aiAllowed ? aiAllowed().find((c) => norm(c.replace(/[;?]/g, '')) === key) : null;
      if (allowed) { const o = await runIntents(allowed, norm(allowed)); if (o != null) return respond(o); }
    }
    const clean = ai.replace(/«?ΕΝΤΟΛΗ:[^\n]*/gi, '').trim();
    if (clean) return respond(clean);
  }
  // τελευταία προσπάθεια: βικιπαίδεια, αφού αφαιρεθούν οι λέξεις ερώτησης
  const core = raw2.replace(/[;?]/g, '').split(/\s+/).filter((w) => !/^(πες|πείτε|μου|μας|τι|τί|πώς|πως|ποιος|ποια|ποιο|ποιοι|πού|που|πότε|γιατί|ξέρεις|μπορείς|να|είναι|ήταν|ο|η|το|οι|τα|τον|την|της|του|των|για|σχετικά|με|ένα|μια|λίγα|κάτι|εξήγησε|εξηγήστε)$/i.test(w)).join(' ');
  if (core && core.split(' ').length <= 3) { const w = await wiki(core); if (w) return respond(w); }
  try { const u = Store.get('unknown', []); u.unshift({ t: raw, at: Date.now() }); Store.set('unknown', u.slice(0, 50)); } catch {}
  Sound.error();
  if (!hasAI()) {
    respond({ text: 'Δεν το έπιασα αυτό.', html: `Δεν το έπιασα αυτό${nmc()}. Για να απαντάω σε <b>οποιαδήποτε ερώτηση</b>, χρειάζομαι τον δωρεάν «εγκέφαλο» Gemini. Πείτε <b>«ρύθμισε τον εγκέφαλο»</b> και σας δείχνω πώς, σε 2 λεπτά. Ή να το ψάξω στο Google;`,
      speak: `Δεν το έπιασα αυτό. Για να απαντάω σε οποιαδήποτε ερώτηση, χρειάζομαι τον δωρεάν εγκέφαλο Gemini. Πείτε «ρύθμισε τον εγκέφαλο» για να σας δείξω πώς. Ή θέλετε να το ψάξω στο Google;` });
  } else respond({ text: (navigator.onLine ? pick([`Δεν είμαι βέβαιος ότι κατάλαβα${nmc()}.`, 'Συγγνώμη, δεν το έπιασα αυτό.']) : 'Χωρίς ίντερνετ δεν μπορώ να ρωτήσω τον εγκέφαλο Gemini.') + ' Θέλετε να το ψάξω στο Google;' });
  pending = (r, nn) => { if (/^(ναι|ναι ψαξε|ok|οκ|εντανει|βεβαια|ψαξε το)/.test(nn)) { setTimeout(() => openUrl('https://www.google.com/search?q=' + encodeURIComponent(raw)), 800); return 'Αναζητώ.'; } return null; };
}
async function respond(out) {
  if (typeof out === 'string') return say(out);
  if (out.silent) { if (out.text) addMsg('ai', out.text); if (Core.state === 'thinking') Core.set('idle'); return; }
  await say(out.text, { html: out.html, speak: out.speak, noRelisten: !!out.after });
  if (out.after) await out.after();
}

/* ---------------- ΡΥΘΜΙΣΕΙΣ ---------------- */
function fillSettings() {
  $$('[data-k]').forEach((el) => { const k = el.dataset.k; if (el.type === 'checkbox') el.checked = !!S[k]; else if (document.activeElement !== el) el.value = S[k] ?? ''; });
  $('#sRateV').textContent = (+S.rate).toFixed(2); $('#sPitchV').textContent = (+S.pitch).toFixed(2);
  $('#brandName').textContent = S.assistant.toUpperCase();
}
function bindSettings() {
  $$('[data-k]').forEach((el) => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    const k = el.dataset.k;
    let v = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number') ? +el.value : el.value.trim();
    if (k === 'assistant' && !v) v = 'JARVIS';
    if (k === 'model' && !v) v = defaults.model;
    S[k] = v; saveSettings(); fillSettings();
    if (k === 'hum') Sound.hum(S.hum);
    if (k === 'cities') refreshWeatherWidget();
    if (window.onFeatureSetting) onFeatureSetting(k);
  }));
  $('#testVoice').onclick = () => Voice.speak(`Δοκιμή φωνής. Είμαι ο ${S.assistant}, στις υπηρεσίες σας${nmc()}.`);
  $('#resetAll').onclick = () => {
    if (!confirm('Διαγραφή όλων των ρυθμίσεων, σημειώσεων και λιστών;')) return;
    Object.keys(localStorage).filter((k) => k.startsWith('jv_')).forEach((k) => localStorage.removeItem(k));
    location.reload();
  };
}

/* ---------------- BOOT ---------------- */
const BOOT_LINES = ['Αρχικοποίηση πυρήνα', 'Φόρτωση νευρωνικού δικτύου', 'Βαθμονόμηση αισθητήρων ήχου', 'Σύνδεση με δορυφορικό δίκτυο καιρού', 'Συγχρονισμός χρονομέτρου ατομικού ρολογιού', 'Φόρτωση τράπεζας μνήμης', 'Ενεργοποίηση φωνητικής μονάδας', 'Πρωτόκολλα ασφαλείας'];
/* Εκκίνηση που δεν κολλάει: κάθε βήμα προστατεύεται, και ό,τι αποτύχει καταγράφεται και εμφανίζεται. */
const bootProblems = [];
let bootStep = '-';
const dn = (s) => { try { const a = window.AndroidJarvis; if (a && a.diagNote) a.diagNote(String(s)); } catch {} };
function bootTry(name, f) { bootStep = name; if (!/^line/.test(name)) dn(name); try { const r = f(); if (r && typeof r.catch === 'function') r.catch((e) => bootProblems.push(name + ': ' + (e && e.message || e))); return r; } catch (e) { bootProblems.push(name + ': ' + (e && e.message || e)); } }
function showHud() { bootStep = 'showHud'; $('#boot').classList.add('hidden'); $('#hud').classList.remove('hidden'); }
function reportProblems() {
  if (!bootProblems.length) return;
  const txt = bootProblems.splice(0).join(' | ');
  try { addMsg('ai', '', { html: `⚠ Κάποια συστήματα δεν ξεκίνησαν σωστά, αλλά συνεχίζω κανονικά.<br><span style="opacity:.7;font-size:12px">${escapeHtml(txt)}</span>` }); } catch {}
}
addEventListener('error', (e) => { bootProblems.push('js: ' + e.message + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); if (!$('#hud').classList.contains('hidden')) reportProblems(); });
addEventListener('unhandledrejection', (e) => { bootProblems.push('promise: ' + (e.reason && e.reason.message || e.reason)); });
async function boot() {
  if (boot.started) return; boot.started = true;
  // Δικλείδα: αν σε 9″ δεν έχει εμφανιστεί η κύρια οθόνη, ανοίγει έτσι κι αλλιώς και γράφει πού κόλλησε.
  setTimeout(() => { if ($('#hud').classList.contains('hidden')) { bootProblems.push('η εκκίνηση κόλλησε στο βήμα «' + bootStep + '»'); bootTry('forceHud', showHud); bootTry('afterHud', afterHud); } }, 9000);
  bootTry('audio', () => { Sound.init(); if (Sound.ctx && Sound.ctx.state === 'suspended') return Sound.ctx.resume(); });
  // ξεκλείδωμα TTS σε iOS
  bootTry('tts', () => { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); });
  bootTry('button', () => { $('#bootBtn').disabled = true; $('#bootBtn').style.opacity = 0.3; });
  bootTry('bootSound', () => Sound.boot());
  const log = $('#bootLog');
  for (let i = 0; i < BOOT_LINES.length; i++) {
    bootTry('line' + i, () => { const d = document.createElement('div'); d.innerHTML = `&gt; ${BOOT_LINES[i]}... <b>OK</b>`; log.appendChild(d); $('#bootBar').style.width = ((i + 1) / BOOT_LINES.length) * 100 + '%'; });
    bootTry('lineSound' + i, () => { Sound.tick(); Sound.tone(600 + i * 120, 0.04, 'square', 0.05); });
    bootStep = 'sleep' + i; await sleep(170 + Math.random() * 120);
  }
  bootStep = 'sleepEnd'; await sleep(350);
  bootTry('whoosh', () => Sound.whoosh());
  if ($('#hud').classList.contains('hidden')) { bootTry('showHud', showHud); await afterHud(); }
}
let afterHudDone = false;
async function afterHud() {
  if (afterHudDone) return; afterHudDone = true;
  bootTry('core', () => { Core.init(); Core.set('idle'); });
  bootTry('hum', () => { if (S.hum) Sound.hum(true); });
  bootTry('weather', () => refreshWeatherWidget());
  bootTry('battery', () => initBattery());
  bootTry('reminders', () => reminders.forEach(schedule));
  bootTry('features', () => { if (window.featuresInit) featuresInit(); });
  bootStep = 'ready';
  await sleep(500);
  reportProblems();
  if (!S.userName) {
    const askName = (raw, n) => { if (!/^(με λενε|λεγομαι|ειμαι|ονομαζομαι|να με λεσ)/.test(n) && (n.split(' ').length > 3 || intents.some((it) => it.re.test(n) && (!it.test || it.test(n))))) { setTimeout(() => { if (!S.userName && !pending) pending = askName; }, 0); return null; } const name = cap(raw.replace(/^(με λένε|λέγομαι|είμαι ο|είμαι η|είμαι|ονομάζομαι|να με λες)\s+/i, '').replace(/[.!]/g, '').trim()); S.userName = name; saveSettings(); fillSettings();
      return `Χαίρω πολύ, ${vocative(name)}. Θα σας αποκαλώ «${addressAs()}», όπως αρμόζει. Πατήστε τον αντιδραστήρα για να μου μιλήσετε ή γράψτε μια εντολή. Πείτε «βοήθεια» για να δείτε τι μπορώ να κάνω.`; };
    pending = askName;
    say(`${hello()}. Είμαι ο ${S.assistant}, ο νέος σας προσωπικός βοηθός. Όλα τα συστήματα είναι σε λειτουργία. Πώς θα θέλατε να σας αποκαλώ;`, { noRelisten: true });
  } else if (window.morningBriefing && S.autoBrief && S.lastBrief !== new Date().toDateString() && new Date().getHours() < 13) {
    morningBriefing();
  } else {
    const d = new Date(); const open = todos.filter((t) => !t.done).length;
    let line = `${hello()}${nmc()}. Η ώρα είναι ${d.getHours()}:${pad(d.getMinutes())}.`;
    if (open) line += ` Έχετε ${open} ${open === 1 ? 'εκκρεμότητα' : 'εκκρεμότητες'} στη λίστα.`;
    if (reminders.length) line += ` Και ${reminders.length} ενεργές υπενθυμίσεις.`;
    say(line + ' ' + (window.dailyQuote ? dailyQuote() : ''), { noRelisten: true });
  }
}

/* ---------------- INIT ---------------- */
function init() {
  fillSettings(); bindSettings(); tickClock(); setInterval(tickClock, 1000);
  if ('speechSynthesis' in window) { Voice.loadVoices(); speechSynthesis.onvoiceschanged = () => Voice.loadVoices(); }
  $('#bootBtn').onclick = boot;
  $('#micBtn').onclick = () => { Sound.tap(); Voice.toggle(); };
  $('#inputForm').onsubmit = (e) => { e.preventDefault(); const v = $('#textInput').value; $('#textInput').value = ''; $('#textInput').blur(); handle(v); };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) handle(b.dataset.cmd); });
  $('#settingsBtn').onclick = () => { Sound.whoosh(); fillSettings(); $('#settings').classList.remove('hidden'); };
  $$('[data-close]').forEach((b) => b.onclick = () => { Sound.tap(); b.closest('.sheet').classList.add('hidden'); });
  $$('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s) s.classList.add('hidden'); }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const now = Date.now(); reminders.filter((r) => r.due <= now).forEach(fire); } });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
