/* =========================================================
   J.A.R.V.I.S. — Σύνδεση με την εφαρμογή Android
   (φωνή & μικρόφωνο του κινητού, αφύπνιση με «Τζάρβις»)
   Ενεργό μόνο όταν τρέχει μέσα στην εφαρμογή Android.
   ========================================================= */
'use strict';

const A = window.AndroidJarvis;
if (A) {
  document.body.classList.add('native');
  // Η ελληνική φωνή του κινητού είναι γυναικεία: χαμηλότερος τόνος για να ακούγεται ανδρική (μία φορά, για όσους είχαν την παλιά ρύθμιση).
  try { if (S.jarvisVoice !== false && !S.deepVoiceV2) { S.deepVoiceV2 = true; S.pitch = 0.55; S.rate = 1; S.jarvisVoice = true; saveSettings(); } } catch {}
  // Πιο αργή, καθαρή εκφορά (μία φορά).
  try { if (!S.slowVoiceV1) { S.slowVoiceV1 = true; if (S.rate >= 0.95) S.rate = 0.88; saveSettings(); } } catch {}

  /* ---------- Φωνές: η λίστα έρχεται από το κινητό ---------- */
  // Μόνο η έτοιμη λίστα (voicesCached): η παλιά κλήση voices() περίμενε τη μηχανή ομιλίας και μπορούσε να παγώσει τη σελίδα.
  const nativeVoices = () => { try { return JSON.parse(A.voicesCached ? A.voicesCached() : '[]').map((v) => ({ name: v.name, voiceURI: v.name, lang: 'el-GR', localService: v.local, default: false })); } catch { return []; } };
  let speakToken = 0;
  const shim = { speaking: false, pending: false, paused: false, onvoiceschanged: null, getVoices: nativeVoices, speak() {}, cancel() { speakToken++; Voice.speakingNow = false; A.stopSpeak(); if (window.__nativeTtsDone) window.__nativeTtsDone(); }, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {} };
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
  // Μιλάει πρόταση-πρόταση με μικρή παύση ανάμεσα, για να μην ακούγονται όλα «μαζεμένα».
  const speakOne = (part) => new Promise((res) => {
    ttsDone = res; A.speak(part, +S.rate || 1, +S.pitch || 1, S.voiceURI || '');
    clearTimeout(ttsSafety); ttsSafety = setTimeout(() => window.__nativeTtsDone(), 2500 + part.length * 120);
  });
  const splitSentences = (t) => {
    const raw = t.split(/(?<=[.!;?…:])\s+|\n+/).map((x) => x.trim()).filter(Boolean), out = [];
    for (const p of raw) { if (out.length && out[out.length - 1].length < 14) out[out.length - 1] += ' ' + p; else out.push(p); }
    return out;
  };
  Voice.speak = async function (text) {
    const clean = String(text).replace(/<[^>]+>/g, '').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/\*+/g, '').trim();
    if (!clean) return;
    const my = ++speakToken;
    if (ttsDone) { const f = ttsDone; ttsDone = null; f(); }
    Voice.speakingNow = true; Core.set('speaking');
    const parts = splitSentences(clean);
    for (let i = 0; i < parts.length; i++) {
      if (my !== speakToken) return;
      await speakOne(parts[i]);
      if (my !== speakToken) return;
      if (i < parts.length - 1) await sleep(/[:,]$/.test(parts[i]) ? 180 : 380);
    }
    if (my !== speakToken) return;
    Voice.speakingNow = false; Voice.lastEnd = Date.now(); if (Core.state === 'speaking') Core.set('idle');
  };

  /* ---------- Ακρόαση ---------- */
  let finalText = '', partialText = '', lastVoiceCmd = 0, missCount = 0;
  window.__nativeSttStart = () => { Voice.listening = true; finalText = ''; partialText = ''; Core.set('listening'); Sound.listen(); $('#interim').textContent = ''; };
  window.__nativeStt = (t, fin) => { $('#interim').textContent = t; if (fin) finalText = t; else if (t) partialText = t; };
  let sttHelpShown = 0;
  window.__nativeSttError = (code) => {
    // 100+: η διαδικτυακή αναγνώριση απέτυχε και απέτυχε και η δεύτερη προσπάθεια πάνω στο κινητό.
    if (code >= 100) {
      const c = code - 100;
      if (c === 6 || c === 7) code = c;
      else {
        if (Date.now() - sttHelpShown > 60000) { sttHelpShown = Date.now(); addMsg('ai', '', { html: `Η αναγνώριση φωνής του κινητού δεν απάντησε (κωδικός ${c}). Δεν φταίει ο εγκέφαλος Gemini.<br>Δοκιμάστε: 1) ελέγξτε ότι έχετε ίντερνετ, 2) Ρυθμίσεις κινητού → Εφαρμογές → <b>Google</b> → επιτρέψτε δεδομένα κινητής/Wi-Fi και μικρόφωνο, και βγάλτε τον περιορισμό μπαταρίας, 3) ενημερώστε την εφαρμογή Google από το Play Store. Στο μεταξύ μπορείτε να γράφετε τις εντολές.` }); }
        else toast('ΑΚΡΟΑΣΗ', 'Η αναγνώριση φωνής δεν απάντησε. Δοκιμάστε ξανά ή γράψτε την εντολή.', 4000);
        return;
      }
    }
    // 6/7: δεν ακούστηκε ή δεν αναγνωρίστηκε ομιλία. Αν δεν υπάρχει ούτε μισή φράση, το λέμε (όχι συνέχεια).
    if ((code === 6 || code === 7) && !partialText && ++missCount <= 2) { toast('ΑΚΡΟΑΣΗ', 'Δεν σας άκουσα καθαρά. Πατήστε τον αντιδραστήρα και μιλήστε μόλις ακουστεί ο ήχος.', 4000); }
    if (code === 9) addMsg('ai', 'Χρειάζομαι άδεια για το μικρόφωνο. Πατήστε «Να επιτρέπεται» όταν σας ρωτήσει το κινητό.');
    else if (code === 2 || code === 1) addMsg('ai', 'Χωρίς ίντερνετ η αναγνώριση φωνής δεν είναι διαθέσιμη. Γράψτε την εντολή.');
    else if (code === -1) addMsg('ai', 'Δεν βρέθηκε υπηρεσία αναγνώρισης φωνής. Εγκαταστήστε ή ενημερώστε την εφαρμογή Google.');
  };
  window.__nativeSttEnd = () => {
    Voice.listening = false; $('#interim').textContent = ''; if (Core.state === 'listening') Core.set('idle'); Sound.stop();
    // Αν το κινητό δεν έδωσε τελικό κείμενο, κρατάμε ό,τι είχε ακούσει ως εκείνη τη στιγμή.
    const t = (finalText || partialText).trim(); finalText = ''; partialText = '';
    if (t) { missCount = 0; lastVoiceCmd = Date.now(); handle(t); } else A.wakeDone();
  };
  Voice.setupSTT = () => true;
  Voice.toggle = function () {
    if (this.listening) { A.stopListen(); return; }
    // Διακοπή: σταματά αμέσως ό,τι λέει (και τις επόμενες προτάσεις) και ακούει τη νέα εντολή.
    speechSynthesis.cancel();
    if (typeof Standby !== 'undefined' && Standby.on) Standby.hide(); lastVoiceCmd = Date.now(); setTimeout(() => A.listen(), 150);
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
    if (typeof Standby !== 'undefined' && Standby.on) Standby.hide();
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

  /* ---------- Άνοιγμα συνδέσμων: το κινητό τους ανοίγει στην κατάλληλη εφαρμογή (YouTube, Chrome, τηλέφωνο) ---------- */
  // Μόνο ασφαλή είδη συνδέσμων: ποτέ javascript:, data: ή άλλα που θα εκτελούσαν κώδικα μέσα στην εφαρμογή.
  const SAFE_SCHEMES = ['https:', 'http:', 'tel:', 'sms:', 'mailto:', 'geo:', 'viber:', 'whatsapp:'];
  openUrl = function (url) { try { const u = new URL(String(url), location.href); if (!SAFE_SCHEMES.includes(u.protocol)) return; location.href = u.href; } catch {} };

  /* ---------- Ειδοποιήσεις & αρχεία μέσω του κινητού ---------- */
  notify = async function (title, body) { try { A.notify(String(title), String(body)); } catch {} };
  exportBackup = async function () {
    const json = JSON.stringify(collectData(), null, 1); const p = A.saveFile(backupName(), json);
    if (!p) { toast('ΑΝΤΙΓΡΑΦΟ ΑΣΦΑΛΕΙΑΣ', 'Η αποθήκευση απέτυχε.', 6000); return 'cancel'; }
    markBackup(); toast('ΑΝΤΙΓΡΑΦΟ ΑΣΦΑΛΕΙΑΣ', `Αποθηκεύτηκε: ${p}. Ανεβάστε το και στο Google Drive.`, 9000); return 'downloaded';
  };

  /* ---------- Εκκίνηση χωρίς πάτημα κουμπιού ---------- */
  const wantWake = new URLSearchParams(location.search).get('wake') === '1';
  const wantMorning = new URLSearchParams(location.search).get('morning') === '1';
  if (wantMorning) history.replaceState(null, '', location.pathname);
  /* Πρωινό ξύπνημα από το ξυπνητήρι του Android (δουλεύει και με κλειστή εφαρμογή). */
  const runMorning = () => { if (typeof Proactive !== 'undefined' && once('wakeup-' + todayKey())) Proactive.morning(); };
  window.__nativeMorning = () => { if (!booted()) setTimeout(window.__nativeMorning, 800); else runMorning(); };
  let alarmSynced = '';
  const syncAlarm = () => { if (!A.setMorningAlarm) return; const key = (S.wakeTime || '07:00') + '|' + (S.morningWake !== false); if (key === alarmSynced) return; alarmSynced = key; const [h, m] = (S.wakeTime || '07:00').split(':').map(Number); try { A.setMorningAlarm(h || 0, m || 0, S.morningWake !== false); } catch {} };
  setInterval(syncAlarm, 15000);
  /* Υπενθυμίσεις: αντίγραφο στο ξυπνητήρι του Android, για να χτυπούν και με κλειστή εφαρμογή. */
  let remSynced = null;
  const syncReminders = () => { if (!A.syncReminders) return; const list = reminders.filter((r) => r.due > Date.now()).map((r) => ({ id: String(r.id), at: r.due, text: r.kind === 'timer' ? 'Ο χρόνος τελείωσε. ' + (r.text || '') : r.kind === 'alarm' ? 'Ώρα να ξυπνήσετε.' : r.text })); const key = JSON.stringify(list); if (key === remSynced) return; remSynced = key; try { A.syncReminders(key); } catch {} };
  setInterval(syncReminders, 4000);
  if (wantWake) history.replaceState(null, '', location.pathname);
  const baseFIn = featuresInit;
  window.featuresInit = function () { baseFIn(); dn('fi native'); if (S.wake || S.handsFree) Wake.start(); else Wake.stop(); if (wantWake) setTimeout(onWake, 900); syncAlarm(); if (wantMorning) setTimeout(runMorning, 1500); };
  setTimeout(() => { if (!booted()) boot(); }, 400);

  intents.unshift({ re: /(αδειεσ jarvis|αδειεσ εφαρμογησ|ρυθμισεισ κινητου για jarvis|δεν ανοιγει με τζαρβισ|δεν ξυπναει)/, run: () => { A.openAppSettings(); return 'Άνοιξα τις ρυθμίσεις της εφαρμογής. Ελέγξτε ότι επιτρέπονται: μικρόφωνο, ειδοποιήσεις, «εμφάνιση πάνω από άλλες εφαρμογές», και ότι η μπαταρία δεν περιορίζεται.'; } });
}
