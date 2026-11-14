/* =========================================================
   J.A.R.V.I.S. — Λειτουργία χωρίς ίντερνετ
   ========================================================= */
'use strict';

const Net = {
  el: null,
  update(announce) {
    const on = navigator.onLine; this.el = this.el || $('#netState');
    if (this.el) { this.el.textContent = on ? 'v7 · ONLINE' : 'v7 · OFFLINE'; this.el.classList.toggle('off', !on); }
    document.body.classList.toggle('offline', !on);
    if (!announce) return;
    if (on) { toast('ΣΥΝΔΕΣΗ', 'Επανασύνδεση. Ενημερώνω καιρό και δεδομένα.', 5000); Sound.reply(); refreshWeatherWidget(); }
    else { toast('ΕΚΤΟΣ ΣΥΝΔΕΣΗΣ', 'Λειτουργώ τοπικά. Καιρός, νέα και αθλητικά είναι από την τελευταία σύνδεση.', 7000); Sound.tone(440, 0.15, 'sine', 0.12); Sound.tone(330, 0.2, 'sine', 0.12, 0.12); }
  },
};
addEventListener('online', () => Net.update(true));
addEventListener('offline', () => Net.update(true));

/* Αναγνώριση φωνής στη συσκευή (όπου το υποστηρίζει ο browser) */
const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition;
async function prepareLocalSpeech() {
  try {
    // Μέσα στην εφαρμογή Android (WebView) αυτή η λειτουργία του Chrome δεν υποστηρίζεται και τερμάτιζε τη σελίδα.
    if (window.AndroidJarvis) return;
    if (!SRClass || !SRClass.available || !SRClass.install || !navigator.onLine) return;
    const st = await SRClass.available({ langs: ['el-GR'], processLocally: true });
    if (st === 'downloadable') { const ok = await SRClass.install({ langs: ['el-GR'], processLocally: true }); if (ok) toast('ΦΩΝΗ', 'Κατέβηκε η ελληνική αναγνώριση φωνής για χρήση χωρίς ίντερνετ.', 6000); }
  } catch {}
}
// Πριν από κάθε ακρόαση: τοπική επεξεργασία όταν δεν υπάρχει σύνδεση
const baseToggle = Voice.toggle.bind(Voice);
Voice.toggle = function () {
  if (!this.rec) this.setupSTT();
  if (this.rec && 'processLocally' in this.rec) { try { this.rec.processLocally = !navigator.onLine; } catch {} }
  return baseToggle();
};

/* Καιρός και ενημέρωση: σημείωση όταν τα στοιχεία είναι από την τελευταία σύνδεση */
const baseRespond = respond;
respond = async function (out) {
  if (!navigator.onLine && out && typeof out === 'string' && /(βαθμοι|βαθμούς|αποτελεσμα|Euroleague|Super League|τιτλοι|Τίτλοι)/i.test(out)) out = 'Εκτός σύνδεσης, με τα τελευταία γνωστά στοιχεία: ' + out;
  return baseRespond(out);
};
const baseExtrasOff = window.briefingExtras;
window.briefingExtras = async (add, d) => {
  if (baseExtrasOff) await baseExtrasOff(add, d);
  if (!navigator.onLine) add('📴', 'Είστε εκτός σύνδεσης: καιρός και νέα είναι από την τελευταία σύνδεση. Όλα τα υπόλοιπα λειτουργούν κανονικά.');
};

intents.unshift({ re: /(εχω ιντερνετ|εισαι online|εισαι συνδεδεμενοσ|λειτουργεισ χωρισ ιντερνετ|offline|χωρισ ιντερνετ)/, run: () => navigator.onLine
  ? 'Είμαι συνδεδεμένος. Ακόμα και χωρίς ίντερνετ όμως λειτουργούν οι εντολές, οι υπενθυμίσεις, οι σημειώσεις, οι συνήθειες, οι αναπνοές, η γιόγκα, η μουσική 432, οι συνταγές και οι οδηγοί. Καιρός, νέα και αθλητικά δείχνουν τα τελευταία γνωστά στοιχεία.'
  : 'Είμαι εκτός σύνδεσης, αλλά λειτουργώ τοπικά. Καιρός, νέα και αθλητικά είναι από την τελευταία σύνδεση. Η ελεύθερη συζήτηση μέσω Gemini θα επιστρέψει όταν συνδεθείτε.' });

/* ---------- Οθόνη αναμονής: μαύρη σαν σβηστή, αλλά ακούει ---------- */
if (S.standbyAuto === undefined) { S.standbyAuto = true; saveSettings(); }
if (!S.standbyMin) { S.standbyMin = 2; saveSettings(); }
const Standby = {
  on: false, t: null, clk: null, msgT: null,
  show() {
    if (this.on) return; this.on = true; $('#standby').classList.remove('hidden'); $('#sbText').textContent = '';
    Wake.keepAwake(); const tick = () => { const d = new Date(); $('#sbClock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; }; tick(); this.clk = setInterval(tick, 10000);
    if (!(S.wake || S.handsFree)) $('#sbHint').textContent = 'Η ακρόαση είναι κλειστή · αγγίξτε για έξοδο'; else $('#sbHint').textContent = 'Σας ακούω · αγγίξτε για έξοδο';
  },
  hide() { if (!this.on) return; this.on = false; clearInterval(this.clk); $('#standby').classList.add('hidden'); this.arm(); },
  arm() { clearTimeout(this.t); if (S.standbyAuto && (S.handsFree || S.wake) && !Session.active) this.t = setTimeout(() => { if (!Session.active && !document.querySelector('.sheet:not(.hidden)')) this.show(); else this.arm(); }, (S.standbyMin || 2) * 60000); },
  flash(text) { if (!this.on) return; const el = $('#sbText'); el.textContent = text.length > 160 ? text.slice(0, 157) + '…' : text; el.classList.add('show'); clearTimeout(this.msgT); this.msgT = setTimeout(() => el.classList.remove('show'), 25000); },
};
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (Standby.on) Standby.hide(); else Standby.arm(); }, true));
const baseSaySb = say;
say = async function (text, opts = {}) { Standby.flash(opts.speak || text); if (!Standby.on) Standby.arm(); return baseSaySb(text, opts); };
intents.unshift({ re: /(λειτουργια αναμονησ|κλεισε την οθονη|σβησε την οθονη|μαυρη οθονη|σκοτεινιασε την οθονη|αναμονη)/, run: () => { setTimeout(() => Standby.show(), 2500); return S.handsFree || S.wake ? 'Οθόνη αναμονής. Συνεχίζω να σας ακούω. Αγγίξτε την οθόνη για να επιστρέψετε.' : 'Οθόνη αναμονής. Ενεργοποιήστε τη συνεχή ακρόαση για να με καλείτε με τη φωνή.'; } });

/* ---------- Εγκέφαλος Gemini: οδηγός ρύθμισης & έλεγχος κλειδιού ---------- */
const GEMINI_URL = 'https://aistudio.google.com/apikey';
function openKeyField() { $('#settings').classList.remove('hidden'); fillSettings(); setTimeout(() => { const el = document.querySelector('[data-k="geminiKey"]'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } }, 300); }
async function testGemini() {
  if (!hasAI()) return;
  toast('ΕΓΚΕΦΑΛΟΣ', 'Δοκιμή κλειδιού Gemini...', 3000);
  const out = await askAI('Απάντησε μόνο με μία σύντομη πρόταση: ποιος είσαι;');
  if (out && !/σφάλμα|Ελέγξτε το κλειδί/.test(out)) { celebrate(false); say(`Ο εγκέφαλος συνδέθηκε. ${out} Τώρα μπορείτε να με ρωτάτε οτιδήποτε.`, { noRelisten: true }); }
  else { Sound.error(); say(out || 'Δεν μπόρεσα να συνδεθώ με το Gemini. Ελέγξτε ότι αντιγράψατε ολόκληρο το κλειδί και ότι έχετε ίντερνετ.', { noRelisten: true }); }
}
const baseFeatSet = window.onFeatureSetting;
window.onFeatureSetting = (k) => { if (baseFeatSet) baseFeatSet(k); if (['geminiKey', 'aiKey', 'aiProvider', 'aiModel'].includes(k) && hasAI()) { $('#settings').classList.add('hidden'); testGemini(); } };
intents.unshift(
  { re: /(ρυθμισε τον εγκεφαλο|βαλε εγκεφαλο|εγκεφαλο gemini|κλειδι gemini|πωσ βαζω (το )?(κλειδι|gemini)|ρυθμιση gemini|συνδεσε το gemini|gemini)/, run: () => {
    if (hasAI()) { testGemini(); return { silent: true, text: '' }; }
    return { text: 'Ρύθμιση εγκεφάλου', html: `<b>🧠 Δωρεάν εγκέφαλος Gemini, σε 4 βήματα</b>
      <div style="margin-top:6px">1. Πατήστε εδώ: <a href="${GEMINI_URL}" target="_blank" rel="noopener">aistudio.google.com/apikey →</a></div>
      <div>2. Συνδεθείτε με τον λογαριασμό σας Google (το Gmail σας).</div>
      <div>3. Πατήστε <b>Create API key</b> (Δημιουργία κλειδιού) και μετά <b>Copy</b>.</div>
      <div>4. Γυρίστε εδώ, πατήστε <b>⚙ → Κλειδί Gemini API</b> και κάντε επικόλληση. Θα το δοκιμάσω αμέσως.</div>
      <div style="margin-top:6px;opacity:.75">Είναι δωρεάν και δεν ζητάει κάρτα. Το κλειδί μένει μόνο στο κινητό σας.</div>`,
      speak: 'Σε τέσσερα βήματα. Ένα: πατήστε τον σύνδεσμο στην οθόνη. Δύο: συνδεθείτε με το Google σας. Τρία: πατήστε Create API key και μετά Copy. Τέσσερα: γυρίστε εδώ, ανοίξτε τις ρυθμίσεις και κάντε επικόλληση στο Κλειδί Gemini. Θα το δοκιμάσω αμέσως.' }; } },
  { re: /(ρυθμισε το (chatgpt|τσατ ?τζι ?πι ?τι|gpt)|βαλε (το )?(chatgpt|τσατ ?τζι ?πι ?τι)|chatgpt|τσατ ?τζι ?πι ?τι|openrouter)/, run: () => {
    setTimeout(() => { $('#settings').classList.remove('hidden'); fillSettings(); const el = document.querySelector('[data-k="gptKey"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 8000);
    return { text: 'Ρύθμιση ChatGPT', html: `<b>🤖 Δωρεάν εφεδρικός ChatGPT, σε 4 βήματα</b>
      <div style="margin-top:6px">1. Πατήστε εδώ: <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys →</a></div>
      <div>2. Πατήστε <b>Sign in</b> και συνδεθείτε με το Google σας.</div>
      <div>3. Πατήστε <b>Create API Key</b>, δώστε όνομα JARVIS, και μετά <b>Copy</b>.</div>
      <div>4. Γυρίστε εδώ, ⚙ → <b>Εφεδρικός ChatGPT</b>, και κάντε επικόλληση.</div>
      <div style="margin-top:6px;opacity:.75">Δωρεάν, χωρίς κάρτα. Χρησιμοποιείται μόνο όταν τελειώνει το δωρεάν όριο του Gemini.</div>`,
      speak: 'Σε τέσσερα βήματα. Ένα: πατήστε τον σύνδεσμο στην οθόνη. Δύο: συνδεθείτε με το Google σας. Τρία: πατήστε Create API Key και μετά Copy. Τέσσερα: γυρίστε εδώ, στις ρυθμίσεις, στο Εφεδρικός ChatGPT, και κάντε επικόλληση.' }; } },
  { re: /(τι δεν καταλαβεσ|τι δεν καταλαβαινεισ|αγνωστεσ εντολεσ|εντολεσ που δεν καταλαβεσ)/, run: () => { const u = Store.get('unknown', []); return u.length ? 'Οι τελευταίες φράσεις που δεν κατάλαβα: ' + u.slice(0, 8).map((x) => `«${x.t}»`).join(', ') + '. Θα τις βρείτε και στα Δεδομένα, καρτέλα «ΔΕΝ ΚΑΤΑΛΑΒΑ».' : 'Δεν υπάρχει κάτι που να μην κατάλαβα. Προς το παρόν!'; } },
);
TABS.push({ k: 'unknown', label: 'ΔΕΝ ΚΑΤΑΛΑΒΑ', get: () => Store.get('unknown', []), set: (v) => Store.set('unknown', v),
  head: () => 'Φράσεις που δεν κατάλαβα. Πείτε τες στον δημιουργό σας για να τις μάθω, ή βάλτε τον εγκέφαλο Gemini (πείτε «ρύθμισε τον εγκέφαλο»).',
  line: (x) => [x.t, new Date(x.at).toLocaleString('el-GR')] });

const baseFIoff = featuresInit;
window.featuresInit = function () { baseFIoff(); dn('fi net'); Net.update(false); dn('fi localSpeech'); prepareLocalSpeech(); dn('fi standby'); Standby.arm(); dn('fi done'); };
