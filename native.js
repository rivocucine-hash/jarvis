/* =========================================================
   J.A.R.V.I.S. — Σύνδεση με την εφαρμογή Android
   (φωνή & μικρόφωνο του κινητού, αφύπνιση με «Τζάρβις»)
   Ενεργό μόνο όταν τρέχει μέσα στην εφαρμογή Android.
   ========================================================= */
'use strict';

const A = window.AndroidJarvis;
if (A) {
  document.body.classList.add('native');

  /* ---------- Φωνές: η λίστα έρχεται από το κινητό ---------- */
  const nativeVoices = () => { try { return JSON.parse(A.voices()).map((v) => ({ name: v.name, voiceURI: v.name, lang: 'el-GR', localService: v.local, default: false })); } catch { return []; } };
  const shim = { speaking: false, pending: false, paused: false, onvoiceschanged: null, getVoices: nativeVoices, speak() {}, cancel() { A.stopSpeak(); }, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {} };
  try { Object.defineProperty(window, 'speechSynthesis', { value: shim, configurable: true }); } catch { window.speechSynthesis = shim; }
  if (!window.SpeechSynthesisUtterance) window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.__nativeTtsReady = () => {
    try { Voice.loadVoices(); if (!S.nativeVoiceInit && typeof applyJarvisVoice === 'function') { S.nativeVoiceInit = true; saveSettings(); applyJarvisVoice(false); } } catch {}
  };

  /* ---------- Ομιλία ---------- */
  let ttsDone = null, ttsSafety = null;
  window.__nativeTtsStart = () => { Voice.speakingNow = true; Core.set('speaking'); };
  window.__nativeTtsDone = () => { clearTimeout(ttsSafety); const f = ttsDone; ttsDone = null; if (f) f(); };
  Voice.speak = function (text) {
    return new Promise((res) => {
      const clean = String(text).replace(/<[^>]+>/g, '').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/\*+/g, '').trim();
      if (!clean) return res();
      if (ttsDone) { const f = ttsDone; ttsDone = null; f(); }
      ttsDone = () => { Voice.speakingNow = false; Voice.lastEnd = Date.now(); if (Core.state === 'speaking') Core.set('idle'); res(); };
      Core.set('speaking'); A.speak(clean, +S.rate || 1, +S.pitch || 1, S.voiceURI || '');
      ttsSafety = setTimeout(() => window.__nativeTtsDone(), 2500 + clean.length * 120);
    });
  };

  /* ---------- Ακρόαση ---------- */
  let finalText = '', lastVoiceCmd = 0;
  window.__nativeSttStart = () => { Voice.listening = true; finalText = ''; Core.set('listening'); Sound.listen(); $('#interim').textContent = ''; };
  window.__nativeStt = (t, fin) => { $('#interim').textContent = t; if (fin) finalText = t; };
  window.__nativeSttError = (code) => {
    if (code === 9) addMsg('ai', 'Χρειάζομαι άδεια για το μικρόφωνο. Πατήστε «Να επιτρέπεται» όταν σας ρωτήσει το κινητό.');
    else if (code === 2 || code === 1) addMsg('ai', 'Χωρίς ίντερνετ η αναγνώριση φωνής δεν είναι διαθέσιμη. Γράψτε την εντολή.');
    else if (code === -1) addMsg('ai', 'Δεν βρέθηκε υπηρεσία αναγνώρισης φωνής. Εγκαταστήστε ή ενημερώστε την εφαρμογή Google.');
  };
  window.__nativeSttEnd = () => {
    Voice.listening = false; $('#interim').textContent = ''; if (Core.state === 'listening') Core.set('idle'); Sound.stop();
    const t = finalText.trim(); finalText = '';
    if (t) { lastVoiceCmd = Date.now(); handle(t); } else A.wakeDone();
  };
  Voice.setupSTT = () => true;
  Voice.toggle = function () {
    if (this.listening) { A.stopListen(); return; }
    A.stopSpeak(); if (window.Standby && Standby.on) Standby.hide(); A.listen();
  };

  /* ---------- Συνέχεια συζήτησης: μετά από φωνητική εντολή, ακούει ξανά μία φορά ---------- */
  const baseSayN = say;
  say = async function (text, opts = {}) {
    const r = await baseSayN(text, opts);
    if (!opts.noRelisten && Date.now() - lastVoiceCmd < 30000 && !Voice.listening && !Session.active) setTimeout(() => { if (!Voice.listening && !Voice.speakingNow) A.listen(); }, 350);
    else if (!Voice.listening) A.wakeDone();
    return r;
  };

  /* ---------- Αφύπνιση από «Τζάρβις» ---------- */
  const booted = () => !$('#hud').classList.contains('hidden');
  async function onWake() {
    if (!booted()) { await boot(); await sleep(600); }
    if (window.Standby && Standby.on) Standby.hide();
    if (Session.active) return A.wakeDone();
    const line = callReply(); Sound.listen(); addMsg('ai', line);
    await Voice.speak(line);
    lastVoiceCmd = Date.now(); A.listen();
  }
  window.__nativeWake = () => { onWake(); };

  /* ---------- Η συνεχής ακρόαση γίνεται από την υπηρεσία του κινητού ---------- */
  const wakeBlocked = () => { try { return !!(A.isWakeBlocked && A.isWakeBlocked()); } catch { return false; } };
  intents.unshift({ re: /(δοκιμασε ξανα την ακροαση|ξαναδοκιμασε την ακροαση|ενεργοποιησε την ακροαση τζαρβισ)/, run: () => { if (A.retryWake) A.retryWake(); Banner.clear('wake'); return 'Δοκιμάζω ξανά την ακρόαση «Τζάρβις». Αν η εφαρμογή κλείσει, ανοίξτε την ξανά και θα απενεργοποιηθεί μόνη της.'; } });
  Wake.start = function () {
    if (wakeBlocked()) { this.on = false; Banner.set('wake', '⚠ Η ακρόαση «Τζάρβις» δεν λειτουργεί ακόμα σε αυτό το κινητό. Πατήστε το μικρόφωνο.', () => Banner.clear('wake')); return false; }
    this.on = true; A.setWakeEnabled(true); Banner.set('wake', '🎙 Πείτε «Τζάρβις» οποιαδήποτε στιγμή', () => { S.wake = false; S.handsFree = false; saveSettings(); fillSettings(); this.stop(); }); return true; };
  Wake.stop = function () { this.on = false; A.setWakeEnabled(false); Banner.clear('wake'); };
  Wake.pause = () => {}; Wake.resume = () => {}; Wake.loop = () => {}; Wake.keepAwake = async () => {};

  /* ---------- Ειδοποιήσεις & αρχεία μέσω του κινητού ---------- */
  notify = async function (title, body) { try { A.notify(String(title), String(body)); } catch {} };
  exportBackup = async function () {
    const json = JSON.stringify(collectData(), null, 1); const p = A.saveFile(backupName(), json);
    if (!p) { toast('ΑΝΤΙΓΡΑΦΟ ΑΣΦΑΛΕΙΑΣ', 'Η αποθήκευση απέτυχε.', 6000); return 'cancel'; }
    markBackup(); toast('ΑΝΤΙΓΡΑΦΟ ΑΣΦΑΛΕΙΑΣ', `Αποθηκεύτηκε: ${p}. Ανεβάστε το και στο Google Drive.`, 9000); return 'downloaded';
  };

  /* ---------- Εκκίνηση χωρίς πάτημα κουμπιού ---------- */
  const wantWake = new URLSearchParams(location.search).get('wake') === '1';
  if (wantWake) history.replaceState(null, '', location.pathname);
  const baseFIn = featuresInit;
  window.featuresInit = function () { baseFIn(); if (S.wake || S.handsFree) Wake.start(); else Wake.stop(); if (wantWake) setTimeout(onWake, 900); };
  setTimeout(() => { if (!booted()) boot(); }, 400);

  intents.unshift({ re: /(αδειεσ jarvis|αδειεσ εφαρμογησ|ρυθμισεισ κινητου για jarvis|δεν ανοιγει με τζαρβισ|δεν ξυπναει)/, run: () => { A.openAppSettings(); return 'Άνοιξα τις ρυθμίσεις της εφαρμογής. Ελέγξτε ότι επιτρέπονται: μικρόφωνο, ειδοποιήσεις, «εμφάνιση πάνω από άλλες εφαρμογές», και ότι η μπαταρία δεν περιορίζεται.'; } });
}
