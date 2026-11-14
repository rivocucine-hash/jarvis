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
  const shim = { speaking: false, pending: false, paused: false, onvoiceschanged: null, getVoices: nativeVoices, speak() {}, cancel() { speakToken++; Voice.speakingNow = false; try { if (A.bargeStop) A.bargeStop(); } catch {} A.stopSpeak(); if (window.__nativeTtsDone) window.__nativeTtsDone(); }, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {} };
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
    if (Session.active && (Voice.listening || Date.now() - sessWakeAt < 9000)) return;
    const clean = String(text).replace(/<[^>]+>/g, '').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/\*+/g, '').trim();
    if (!clean) return;
    const my = ++speakToken;
    if (ttsDone) { const f = ttsDone; ttsDone = null; f(); }
    Voice.speakingNow = true; Core.set('speaking');
    if (tHeard) { T.think = (Date.now() - tHeard) / 1000; T.total = T.listen + T.think; tHeard = 0; if (S.showTimes) toast('ΧΡΟΝΟΙ', `Ακρόαση ${T.listen.toFixed(1)}″ · επεξεργασία ${T.think.toFixed(1)}″`, 5000); }
    bargeOn();
    const parts = splitSentences(clean);
    for (let i = 0; i < parts.length; i++) {
      if (my !== speakToken) return;
      await speakOne(parts[i]);
      if (my !== speakToken) return;
      if (i < parts.length - 1) await sleep(/[:,]$/.test(parts[i]) ? 120 : 260);
    }
    if (my !== speakToken) return;
    bargeOff();
    Voice.speakingNow = false; Voice.lastEnd = Date.now(); if (Core.state === 'speaking') Core.set('idle');
  };

  /* ---------- Διακοπή με τη φωνή: αν μιλήσετε όσο μιλάω, σταματώ και σας ακούω ---------- */
  let bargeAt = 0, bargeFalse = 0;
  // Συνέχεια συζήτησης: πόσες φορές ακόμα ξανακούω αν δεν ακουστεί τίποτα, και πότε άρχισε η αναμονή (χωρίς «Τζάρβις»).
  let followUp = 0, followAt = 0;
  // «Τζάρβις» ενώ παίζει ραδιόφωνο/μουσική: ακούω αμέσως· αν δεν πιάσω λέξη (π.χ. «Τζάρβις σταμάτα» μονορούφι), σταματάω τον ήχο.
  let mediaWakeAt = 0;
  // «Τζάρβις» μέσα σε πρόγραμμα (γιόγκα κ.λπ.): η μουσική χαμηλώνει και οι οδηγίες σωπαίνουν όσο ακούω.
  let sessWakeAt = 0;
  const musicDuck = (on) => { try { const n = Music.n, ctx = Sound.ctx; if (!n || !ctx) return; n.out.gain.cancelScheduledValues(ctx.currentTime); n.out.gain.setTargetAtTime(on ? 0.08 : 0.9, ctx.currentTime, 0.15); } catch {} };
  const mediaOn = () => !!((window.Radio && Radio.on) || Music.n || (typeof Party !== 'undefined' && Party.on));
  // Κλειστή από προεπιλογή: κρατά το μικρόφωνο όσο μιλάω και σε κάποια κινητά καθυστερεί ή μπλοκάρει την επόμενη ακρόαση.
  if (!S.bargeResetV2) { S.bargeResetV2 = true; S.bargeResetV1 = true; S.bargeIn = true; S.bargeSens = 2; saveSettings(); }
  function bargeOn() { if (S.bargeIn !== true || !A.bargeStart) return; try { A.bargeStart(S.bargeSens || 2); } catch {} }
  function bargeOff() { if (!A.bargeStop) return; try { A.bargeStop(); } catch {} }
  window.__nativeBarge = () => {
    if (!Voice.speakingNow) return;
    bargeAt = Date.now(); speechSynthesis.cancel(); Sound.listen();
    // Μικρή αναμονή ώστε το μικρόφωνο να ελευθερωθεί πριν το πάρει η αναγνώριση φωνής.
    lastVoiceCmd = Date.now(); try { A.bargeStop(); } catch {} setTimeout(() => { if (!Voice.listening) A.listen(); }, 450);
  };
  intents.unshift(
    { re: /(ποσο αργησεσ|γιατι αργεισ|ποσο χρονο εκανεσ|δειξε χρονουσ|δειξε μου χρονουσ)/, run: () => { S.showTimes = true; saveSettings(); const t = window.__times; return `Στην τελευταία εντολή: ακρόαση ${t.listen.toFixed(1)} δευτερόλεπτα, επεξεργασία ${t.think.toFixed(1)}. Από εδώ και πέρα θα δείχνω τους χρόνους στην οθόνη μετά από κάθε εντολή. Πείτε «κρύψε χρόνους» για να σταματήσω.`; } },
    { re: /(κρυψε χρονουσ|μη δειχνεισ χρονουσ)/, run: () => { S.showTimes = false; saveSettings(); return 'Δεν θα δείχνω πλέον τους χρόνους.'; } },
    { re: /(μη διακοπτεσαι|μην διακοπτεσαι|μη σταματασ οταν μιλαω|κλεισε τη διακοπη|απενεργοποιησε τη διακοπη)/, run: () => { S.bargeIn = false; saveSettings(); return 'Κατανοητό. Δεν θα σταματώ όταν ακούω φωνή. Για διακοπή πατήστε τον αντιδραστήρα.'; } },
    { re: /(να διακοπτεσαι|σταματα οταν μιλαω|ενεργοποιησε τη διακοπη|ανοιξε τη διακοπη)/, run: () => { S.bargeIn = true; S.bargeSens = 2; saveSettings(); return 'Μάλιστα. Όταν μιλήσετε από πάνω μου, θα σταματώ και θα σας ακούω.'; } },
    { re: /(πιο ευαισθητη διακοπη|δεν με ακουσ οταν μιλασ|δεν σταματασ οταν μιλαω)/, run: () => { S.bargeIn = true; S.bargeSens = Math.min(3, (S.bargeSens || 2) + 1); saveSettings(); return 'Έκανα τη διακοπή πιο ευαίσθητη.'; } },
    { re: /(λιγοτερο ευαισθητη διακοπη|σταματασ μονοσ σου|διακοπτεσαι μονοσ σου|κοβεσαι μονοσ σου)/, run: () => { S.bargeSens = Math.max(1, (S.bargeSens || 2) - 1); saveSettings(); return 'Έκανα τη διακοπή λιγότερο ευαίσθητη.'; } },
  );

  /* ---------- Ακρόαση ---------- */
  let finalText = '', partialText = '', lastVoiceCmd = 0, missCount = 0;
  const T = window.__times = { listen: 0, heard: 0, think: 0, total: 0 };
  let tStart = 0, tHeard = 0;
  window.__nativeSttStart = () => { tStart = Date.now(); Voice.listening = true; finalText = ''; partialText = ''; Core.set('listening'); Sound.listen(); $('#interim').textContent = ''; };
  // Ταχύτητα: μόλις η φράση μείνει ίδια για 0,9″, θεωρούμε ότι τελειώσατε και δεν περιμένουμε το κινητό να το αποφασίσει.
  let quickEnd = null;
  window.__nativeStt = (t, fin) => { $('#interim').textContent = t; clearTimeout(quickEnd); if (fin) finalText = t; else if (t) { partialText = t; quickEnd = setTimeout(() => { if (Voice.listening && partialText === t) { try { A.stopListen(); } catch {} } }, 900); } };
  let sttHelpShown = 0, sttRetryAt = 0;
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
    // 3 (ήχος), 5 (πελάτης), 8 (απασχολημένο): το μικρόφωνο δεν ήταν ελεύθερο. Μία αυτόματη επανάληψη· αν ξανασυμβεί, το λέμε.
    if (code === 3 || code === 5 || code === 8 || code === 103 || code === 105 || code === 108) {
      if (Date.now() - sttRetryAt > 6000) { sttRetryAt = Date.now(); setTimeout(() => { if (!Voice.listening && !Voice.speakingNow) A.listen(); }, 600); }
      else toast('ΑΚΡΟΑΣΗ', `Το μικρόφωνο δεν ήταν διαθέσιμο (κωδικός ${code}). Πατήστε ξανά τον αντιδραστήρα.`, 5000);
      return;
    }
    // 6/7: δεν ακούστηκε ή δεν αναγνωρίστηκε ομιλία. Αν δεν υπάρχει ούτε μισή φράση, το λέμε (όχι συνέχεια).
    if ((code === 6 || code === 7) && !partialText && Date.now() - followAt > 60000 && ++missCount <= 2) { toast('ΑΚΡΟΑΣΗ', 'Δεν σας άκουσα καθαρά. Πατήστε τον αντιδραστήρα και μιλήστε μόλις ακουστεί ο ήχος.', 4000); }
    if (code === 9) addMsg('ai', 'Χρειάζομαι άδεια για το μικρόφωνο. Πατήστε «Να επιτρέπεται» όταν σας ρωτήσει το κινητό.');
    else if (code === 2 || code === 1) addMsg('ai', 'Χωρίς ίντερνετ η αναγνώριση φωνής δεν είναι διαθέσιμη. Γράψτε την εντολή.');
    else if (code === -1) addMsg('ai', 'Δεν βρέθηκε υπηρεσία αναγνώρισης φωνής. Εγκαταστήστε ή ενημερώστε την εφαρμογή Google.');
  };
  window.__nativeSttEnd = () => {
    Voice.listening = false; $('#interim').textContent = ''; if (Core.state === 'listening') Core.set('idle'); Sound.stop();
    // Αν το κινητό δεν έδωσε τελικό κείμενο, κρατάμε ό,τι είχε ακούσει ως εκείνη τη στιγμή.
    const t = (finalText || partialText).trim(); finalText = ''; partialText = '';
    if (t && Date.now() - bargeAt < 8000 && t.split(/\s+/).length === 1 && !/^(ναι|οχι|όχι|οκ|ok|τέλος|τελος|άλλο|αλλο)$/i.test(t)) { bargeFalse = 0; bargeAt = 0; try { closeAll(); } catch {} addMsg('ai', '■ Σταμάτησα.'); A.wakeDone(); }
    else if (t) { const wasSess = !!sessWakeAt; sessWakeAt = 0; missCount = 0; followUp = 0; mediaWakeAt = 0; if (Date.now() - bargeAt < 15000) bargeFalse = 0; lastVoiceCmd = Date.now(); tHeard = Date.now(); T.listen = tStart ? (tHeard - tStart) / 1000 : 0; if (!stopSessionIf(t)) { if (wasSess) musicDuck(false); handle(t); } }
    else {
      // Διακοπή χωρίς λόγια = λάθος συναγερμός (άκουσα τη δική μου φωνή). Μετά από 2, γίνομαι λιγότερο ευαίσθητος· στο ελάχιστο, την κλείνω.
      const barge = Date.now() - bargeAt < 15000;
      // «Τζάρβις σταμάτα» μονορούφι: το «σταμάτα» ειπώθηκε πριν αρχίσω να ακούω. Σιωπή μετά το «Τζάρβις» μέσα σε πρόγραμμα = τέλος.
      if (sessWakeAt && Date.now() - sessWakeAt < 15000 && Session.active) { sessWakeAt = 0; musicDuck(false); stopSessionIf('σταματα'); return; }
      if (sessWakeAt) { sessWakeAt = 0; musicDuck(false); }
      if (mediaWakeAt && Date.now() - mediaWakeAt < 15000 && mediaOn()) { mediaWakeAt = 0; stopSessionIf('σταματα'); return; }
      mediaWakeAt = 0;
      // Σιωπή στη συνέχεια της συζήτησης: ξανακούω (έως 3 φορές, περίπου 20″) πριν γυρίσω στην αναμονή για «Τζάρβις».
      if (!barge && followUp > 0 && !Session.active) { followUp--; setTimeout(() => { if (!Voice.listening && !Voice.speakingNow) A.listen(); else A.wakeDone(); }, 250); return; }
      if (barge && ++bargeFalse >= 2) { bargeFalse = 0; if ((S.bargeSens || 2) > 1) { S.bargeSens = (S.bargeSens || 2) - 1; saveSettings(); } else { S.bargeIn = false; saveSettings(); toast('ΔΙΑΚΟΠΗ', 'Η διακοπή με τη φωνή έκλεισε, γιατί σε αυτό το κινητό άκουγα τη δική μου φωνή. Πείτε «να διακόπτεσαι» για να την ξανανοίξετε.', 9000); } }
      A.wakeDone();
    }
  };
  Voice.setupSTT = () => true;
  Voice.toggle = function () {
    if (this.listening) { A.stopListen(); return; }
    // Διακοπή: σταματά αμέσως ό,τι λέει (και τις επόμενες προτάσεις) και ακούει τη νέα εντολή.
    speechSynthesis.cancel();
    if (typeof Standby !== 'undefined' && Standby.on) Standby.hide(); lastVoiceCmd = Date.now(); setTimeout(() => A.listen(), 150);
  };

  /* ---------- Συνέχεια συζήτησης: μετά από φωνητική εντολή, ακούει ξανά (έως ~20″ σιωπής) χωρίς «Τζάρβις» ---------- */
  const baseSayN = say;
  say = async function (text, opts = {}) {
    const r = await baseSayN(text, opts);
    if (!opts.noRelisten && Date.now() - lastVoiceCmd < 180000 && !Voice.listening && !Session.active) { followUp = 3; followAt = Date.now(); setTimeout(() => { if (!Voice.listening && !Voice.speakingNow) A.listen(); }, 350); }
    else if (!Voice.listening) A.wakeDone();
    return r;
  };

  /* ---------- Αφύπνιση από «Τζάρβις» ---------- */
  const booted = () => !$('#hud').classList.contains('hidden');
  async function onWake() {
    if (!booted()) { await boot(); await sleep(600); }
    if (typeof Standby !== 'undefined' && Standby.on) Standby.hide();
    // Μέσα σε πρόγραμμα (γιόγκα, διαλογισμός, γυμναστική): «Τζάρβις» κόβει τη φωνή και ακούει, π.χ. «σταμάτα». Το πρόγραμμα συνεχίζει αν δεν ειπωθεί κάτι.
    if (!Session.active && mediaOn()) { speechSynthesis.cancel(); Sound.listen(); lastVoiceCmd = Date.now(); followUp = 0; followAt = Date.now(); mediaWakeAt = Date.now(); try { if (window.Radio && Radio.audio) Radio.audio.volume = 0.1; } catch {} setTimeout(() => A.listen(), 60); return; }
    if (Session.active) { sessWakeAt = Date.now(); musicDuck(true); speechSynthesis.cancel(); Sound.listen(); toast('ΠΡΟΓΡΑΜΜΑ', 'Σας ακούω. Πείτε «σταμάτα» για τέλος.', 4000); lastVoiceCmd = Date.now(); followUp = 0; followAt = Date.now(); setTimeout(() => A.listen(), 150); return; }
    const line = callReply(); Sound.listen(); addMsg('ai', line);
    await Voice.speak(line);
    lastVoiceCmd = Date.now(); followUp = 2; followAt = Date.now(); A.listen();
  }
  window.__nativeWake = () => { onWake(); };
  // Μέσα σε πρόγραμμα, κάθε φράση σταματήματος το κλείνει («τέλος γιόγκα», «φτάνει», «κλείσ' το»...), πριν από κάθε άλλη εντολή.
  const SESSION_STOP = /(σταματ|τελοσ|τερματισ|φτανει|αρκετα|κλεισ|stop|ακυρ|σωπα|σιωπη|ησυχια)/;
  // Ό,τι τρέχει: πρόγραμμα (γιόγκα, αναπνοές, διαλογισμός, γυμναστική, κρύο ντους, ρουτίνα), Pomodoro, μουσική/ήχοι ύπνου, πάρτι.
  const running = () => { const r = []; if (Session.active) r.push('το πρόγραμμα'); if (typeof Pomo !== 'undefined' && Pomo.t) r.push('το Pomodoro'); if (Music.n) r.push('τη μουσική'); if (typeof Party !== 'undefined' && Party.on) r.push('το πάρτι'); if (window.Radio && Radio.on) r.push('το ραδιόφωνο'); return r; };
  const stopSessionIf = (t) => {
    const r = running(); if (!r.length || !SESSION_STOP.test(norm(t))) return false;
    if (Session.active) Session.stop(); try { if (Pomo.t) Pomo.stop(true); } catch {} try { Music.stop(2); } catch {} try { if (Party.on) Party.stop(); } catch {} try { if (window.Radio) Radio.stop(); } catch {}
    if (t !== 'σταματα') addMsg('user', t); say(`Σταμάτησα ${r.join(' και ')}.`, { noRelisten: true }); return true;
  };

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
  let wakeRevived = 0;
  window.__nativeWakeState = (st) => {
    if (st === 'died' && WakeTest.t) return setTimeout(() => WakeTest.done(false), 600);
    if (st !== 'died') return;
    // Η υπηρεσία ακρόασης έκλεισε: την ξαναξεκινάμε μόνοι μας (έως μία φορά το λεπτό), αντί να χρειάζεται κλείσιμο της εφαρμογής.
    if (Wake.on && Date.now() - wakeRevived > 60000) { wakeRevived = Date.now(); setTimeout(() => { try { A.setWakeEnabled(true); } catch {} }, 3000); return; }
    Banner.clear('wake'); toast('ΑΚΡΟΑΣΗ', 'Η ακρόαση «Τζάρβις» τερματίστηκε από το κινητό. Κλείστε και ανοίξτε ξανά την εφαρμογή.', 9000);
  };
  // Φύλακας: όταν η εφαρμογή δεν ακούει και δεν μιλάει, ζητάμε κάθε 20″ από την ακρόαση «Τζάρβις» να συνεχίσει.
  // Αν ήδη ακούει, το κινητό το αγνοεί· αν είχε κολλήσει (π.χ. μικρόφωνο απασχολημένο), ξαναρχίζει.
  setInterval(() => {
    try { if (Wake.on && !Voice.listening && !Voice.speakingNow && followUp === 0 && Date.now() - followAt > 25000) A.wakeDone(); } catch {}
  }, 20000);
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
