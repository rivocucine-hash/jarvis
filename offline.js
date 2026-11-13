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

const baseFIoff = featuresInit;
window.featuresInit = function () { baseFIoff(); Net.update(false); prepareLocalSpeech(); Standby.arm(); };
