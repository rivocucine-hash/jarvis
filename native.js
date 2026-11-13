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
  // Μόνο η έτοιμη λίστα (voicesCached): η παλιά κλήση voices() περίμενε τη μηχανή ομιλίας και μπορούσε να παγώσει τη σελίδα.
  const nativeVoices = () => { try { return JSON.parse(A.voicesCached ? A.voicesCached() : '[]').map((v) => ({ name: v.name, voiceURI: v.name, lang: 'el-GR', localService: v.local, default: false })); } catch { return []; } };
  const shim = { speaking: false, pending: false, paused: false, onvoiceschanged: null, getVoices: nativeVoices, speak() {}, cancel() { A.stopSpeak(); }, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {} };
  try { Object.defineProperty(window, 'speechSynthesis', { value: shim, configurable: true }); } catch { window.speechSynthesis = shim; }
  if (!window.SpeechSynthesisUtterance) window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  // Η λίστα φωνών ζητείται από το κινητό μόνο αφού ανοίξει η κύρια οθόνη, για να μην καθυστερεί την εκκίνηση.
  let ttsReadyTries = 0;
  window.__nativeTtsReady = () => {
    if ($('#hud').classList.contains('hidden') && ttsReadyTries++ < 40) return setTimeout(window.__nativeTtsReady, 500);
    setTimeout(() => { try { Voice.loadVoices(); if (!S.nativeVoiceInit && typeof applyJarvisVoice === 'function') { S.nativeVoiceInit = true; saveSettings(); applyJarvisVoice(false); } } catch {} }, 1500);
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
  // Η ακρόαση τρέχει σε ξεχωριστή διεργασία. Ξεκινάει αυτόματα μόνο αφού αποδειχθεί σταθερή σε αυτό το κινητό.
  const wakeProven = () => { try { return A.isWakeProven ? !!A.isWakeProven() : true; } catch { return true; } };
  const WakeTest = {
    el: null, t: null, n: 0,
    render(final) {
      const log = (A.wakeLog ? A.wakeLog(!!final) : '') || '(κενό: η υπηρεσία δεν έγραψε ακόμα τίποτα)';
      if (!this.el || !document.body.contains(this.el)) { const m = addMsg('ai', '', { html: '<b>🎙 Δοκιμή ακρόασης «Τζάρβις»</b><pre class="wakelog"></pre><button class="wakecopy" type="button">ΑΝΤΙΓΡΑΦΗ ΑΝΑΦΟΡΑΣ</button>' }); this.el = m.querySelector('.wakelog'); m.querySelector('.wakecopy').onclick = () => A.copyText(A.wakeLog(true)); }
      this.el.textContent = log; $('#log').scrollTop = 1e9; return log;
    },
    start() {
      if (!A.testWake) return 'Αυτή η έκδοση της εφαρμογής δεν έχει δοκιμή ακρόασης. Εγκαταστήστε τη νεότερη.';
      clearInterval(this.t); this.el = null; this.n = 0; A.testWake();
      this.t = setInterval(() => { this.n++; const log = this.render(false); if (/10 ΣΤΑΘΕΡΗ/.test(log)) this.done(true); else if (this.n > 60) this.done(false); }, 700);
      return { silent: true, text: '' };
    },
    done(ok) {
      clearInterval(this.t); this.t = null; this.render(true);
      if (ok) { celebrate(true); say('Η ακρόαση λειτουργεί σε αυτό το κινητό! Από εδώ και πέρα ξεκινάει μόνη της. Κλειδώστε το κινητό και πείτε «Τζάρβις».', { noRelisten: true }); Wake.start(); }
      else say('Η ακρόαση σταμάτησε. Εγώ συνεχίζω να δουλεύω κανονικά. Πατήστε «Αντιγραφή αναφοράς» και στείλτε τη στον δημιουργό σας.', { noRelisten: true });
    },
  };
  window.__nativeWakeState = (st) => { if (st === 'died' && WakeTest.t) setTimeout(() => WakeTest.done(false), 600); else if (st === 'died') { Banner.clear('wake'); toast('ΑΚΡΟΑΣΗ', 'Η ακρόαση «Τζάρβις» τερματίστηκε από το κινητό. Γράψτε «αναφορά ακρόασης» για λεπτομέρειες.', 9000); } };
  intents.unshift(
    { re: /(δοκιμη ακροασησ|δοκιμασε (ξανα )?την ακροαση|ξαναδοκιμασε την ακροαση|ενεργοποιησε την ακροαση τζαρβισ|τεστ ακροασησ)/, run: () => WakeTest.start() },
    { re: /(αναφορα ακροασησ|τι εγινε με την ακροαση|log ακροασησ)/, run: () => { WakeTest.el = null; WakeTest.render(true); return { silent: true, text: '' }; } },
  );
  Wake.start = function () {
    if (!wakeProven()) { this.on = false; Banner.set('wake', '⚠ Η ακρόαση «Τζάρβις» δεν έχει δοκιμαστεί. Γράψτε «δοκιμή ακρόασης».', () => Banner.clear('wake')); return false; }
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
  window.featuresInit = function () { baseFIn(); dn('fi native'); if (S.wake || S.handsFree) Wake.start(); else Wake.stop(); if (wantWake) setTimeout(onWake, 900); };
  setTimeout(() => { if (!booted()) boot(); }, 400);

  intents.unshift({ re: /(αδειεσ jarvis|αδειεσ εφαρμογησ|ρυθμισεισ κινητου για jarvis|δεν ανοιγει με τζαρβισ|δεν ξυπναει)/, run: () => { A.openAppSettings(); return 'Άνοιξα τις ρυθμίσεις της εφαρμογής. Ελέγξτε ότι επιτρέπονται: μικρόφωνο, ειδοποιήσεις, «εμφάνιση πάνω από άλλες εφαρμογές», και ότι η μπαταρία δεν περιορίζεται.'; } });
}
