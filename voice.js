/* =========================================================
   J.A.R.V.I.S. — Φωνή: ανδρική, βαθιά, ύφος μπάτλερ
   ========================================================= */
'use strict';

const MALE_HINT = /(male|άνδρ|ανδρ|stefanos|στέφανος|nestoras|νέστορας|nikos|giorgos|dimitris|aris|kostas)/i;
const FEMALE_HINT = /(female|γυναικ|melina|μελίνα|athina|αθηνά|maria|eleni|ελένη)/i;
// Στο κινητό (Android) η ελληνική φωνή είναι γυναικεία, οπότε τη χαμηλώνουμε περισσότερο για να ακούγεται ανδρική.
const JARVIS_PITCH = window.AndroidJarvis ? 0.55 : 0.72, JARVIS_RATE = window.AndroidJarvis ? 1.0 : 0.95;
const greekVoices = () => speechSynthesis.getVoices().filter((v) => /^el/i.test(v.lang));
function isMale(v) { return MALE_HINT.test(v.name) && !FEMALE_HINT.test(v.name); }
function voiceLabel(v, i) { return `${isMale(v) ? '♂ ' : FEMALE_HINT.test(v.name) ? '♀ ' : ''}${v.name}${v.localService ? '' : ' (online)'}`; }

// Στη λίστα ρυθμίσεων: ένδειξη φύλου όπου φαίνεται
const baseLoadVoices = Voice.loadVoices.bind(Voice);
Voice.loadVoices = function () {
  baseLoadVoices();
  const sel = $('#sVoice'); if (!sel) return;
  [...sel.options].forEach((o) => { const v = speechSynthesis.getVoices().find((x) => x.voiceURI === o.value); if (v) o.textContent = voiceLabel(v); });
};

function applyJarvisVoice(announce = true) {
  const gv = greekVoices(); const male = gv.find(isMale);
  if (male) S.voiceURI = male.voiceURI; else if (gv.length && !gv.some((v) => v.voiceURI === S.voiceURI)) S.voiceURI = gv[0].voiceURI;
  S.pitch = JARVIS_PITCH; S.rate = JARVIS_RATE; S.jarvisVoice = true; saveSettings(); fillSettings(); Voice.loadVoices();
  if (!announce) return male;
  const line = male
    ? `Φωνή JARVIS ενεργή. Ανδρική, βαθιά και ήρεμη, στις υπηρεσίες σας${nmc()}.`
    : `Φωνή JARVIS ενεργή. Το κινητό σας δεν έχει ανδρική ελληνική φωνή, οπότε έκανα την υπάρχουσα όσο πιο βαθιά γίνεται. Πείτε «δοκίμασε φωνές» για να ακούσετε όλες τις επιλογές.`;
  say(line, { noRelisten: true });
  return male;
}

// Δοκιμή φωνών μία-μία: «αυτή» για να την κρατήσετε, «επόμενη» για την επόμενη
const VoiceTour = {
  list: [], i: 0,
  start() {
    this.list = greekVoices(); this.i = 0;
    if (!this.list.length) return 'Το κινητό σας δεν έχει εγκατεστημένη ελληνική φωνή. Ρυθμίσεις κινητού → Μετατροπή κειμένου σε ομιλία → Εγκατάσταση φωνητικών δεδομένων → Ελληνικά.';
    if (this.list.length === 1) return `Το κινητό σας έχει μόνο μία ελληνική φωνή, την «${this.list[0].name}». Μπορώ να την κάνω πιο βαθιά: πείτε «φωνή JARVIS». Για περισσότερες φωνές δείτε τις οδηγίες.`;
    this.play(); return { silent: true, text: `🎧 Δοκιμή ${this.list.length} ελληνικών φωνών` };
  },
  async play() {
    const v = this.list[this.i]; S.voiceURI = v.voiceURI; saveSettings();
    const text = `Φωνή ${this.i + 1} από ${this.list.length}. Καλησπέρα${nmc()}. Είμαι ο ${S.assistant}, στις υπηρεσίες σας. Πείτε «αυτή» για να την κρατήσω ή «επόμενη».`;
    addMsg('ai', `${voiceLabel(v)}: «${text}»`); await Voice.speak(text);
    pending = (raw, nn) => {
      if (/^(αυτη|αυτη εδω|κρατα την|αυτη μου αρεσει|ναι|οκ|ok|τελεια)/.test(nn)) { S.pitch = S.jarvisVoice ? JARVIS_PITCH : S.pitch; saveSettings(); fillSettings(); Voice.loadVoices(); return `Κράτησα τη φωνή «${v.name}».`; }
      if (/^(επομενη|αλλη|οχι|παρακατω|επομενο)/.test(nn)) { this.i = (this.i + 1) % this.list.length; this.play(); return { silent: true, text: '' }; }
      if (/^(προηγουμενη|πισω)/.test(nn)) { this.i = (this.i - 1 + this.list.length) % this.list.length; this.play(); return { silent: true, text: '' }; }
      return null;
    };
  },
};

intents.unshift(
  { re: /(φωνη jarvis|φωνη τζαρβισ|ανδρικη φωνη|αντρικη φωνη|πιο βαθια φωνη|βαθια φωνη|φωνη σαν τον jarvis|φωνη σαν τον τζαρβισ|αλλαξε τη φωνη σε ανδρικη)/, run: () => { applyJarvisVoice(true); return { silent: true, text: '' }; } },
  { re: /(δοκιμασε φωνεσ|ακουσε φωνεσ|ολεσ τισ φωνεσ|αλλαξε φωνη|αλλη φωνη|διαλεξε φωνη)/, run: () => VoiceTour.start() },
  { re: /(μιλα πιο αργα|πιο αργα)/, run: () => { S.rate = Math.max(0.7, +(S.rate - 0.1).toFixed(2)); saveSettings(); fillSettings(); return 'Μάλιστα, πιο αργά.'; } },
  { re: /(μιλα πιο γρηγορα|πιο γρηγορα)/, run: () => { S.rate = Math.min(1.4, +(S.rate + 0.1).toFixed(2)); saveSettings(); fillSettings(); return 'Μάλιστα, πιο γρήγορα.'; } },
);

// Πρώτη φορά: ενεργοποίηση της φωνής JARVIS αυτόματα (μία φορά)
function initJarvisVoice() {
  if (S.jarvisVoiceInit) return; S.jarvisVoiceInit = true; saveSettings();
  const go = () => applyJarvisVoice(false); if (speechSynthesis.getVoices().length) go(); else speechSynthesis.addEventListener('voiceschanged', go, { once: true });
}
const baseFIv = featuresInit;
// Συντομεύσεις εικονιδίου (π.χ. ?cmd=Καλημέρα): η εντολή τρέχει μόλις ενεργοποιηθεί
const launchCmd = new URLSearchParams(location.search).get('cmd');
if (launchCmd) { const b = $('#bootBtn'); if (b) b.textContent = 'ΕΝΕΡΓΟΠΟΙΗΣΗ · ' + launchCmd.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); history.replaceState(null, '', location.pathname); }
window.featuresInit = function () { baseFIv(); initJarvisVoice(); if (launchCmd) { S.lastBrief = todayKey(); saveSettings(); setTimeout(() => handle(launchCmd), 1800); } };
const jb = $('#jarvisVoiceBtn'); if (jb) jb.onclick = () => { Sound.tap(); applyJarvisVoice(true); };
const tb = $('#voiceTourBtn'); if (tb) tb.onclick = () => { Sound.tap(); $('#settings').classList.add('hidden'); const r = VoiceTour.start(); if (typeof r === 'string') say(r); };
