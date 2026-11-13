/* =========================================================
   J.A.R.V.I.S. — Επεκτάσεις: ενημέρωση, υγεία, εξέλιξη,
   οικονομικά, αθλητικά, σινεμά, Iron Man, φωνητική αφύπνιση
   ========================================================= */
'use strict';

/* ---------------- ΔΕΔΟΜΕΝΑ ---------------- */
let agenda = Store.get('agenda', []);       // {id, day:'*'|'0'..'6', time:'HH:MM', text}
let birthdays = Store.get('birthdays', []); // {id, name, d, m}
let contacts = Store.get('contacts', []);   // {id, name, phone}
let expenses = Store.get('expenses', []);   // {id, amount, cat, note, at}
let journal = Store.get('journal', []);     // {id, text, at, kind}
let water = Store.get('water', { date: '', ml: 0 });
let stats = Store.get('stats', { meditations: 0, workouts: 0, breaths: 0, pomodoros: 0, days: 0, lastDay: '' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const todayKey = () => new Date().toDateString();
const hm = (d) => `${d.getHours()}:${pad(d.getMinutes())}`;
const toks = (raw) => raw.trim().split(/\s+/).map((r) => ({ r, n: norm(r) }));
const fetchJSON = async (u, opts, tries = 2) => { for (let i = 0; i < tries; i++) { try { const r = await fetch(u, opts); if (r.ok) return await r.json(); } catch {} await sleep(500); } return null; };
const DAY_STEMS = ['κυριακ', 'δευτερ', 'τριτη', 'τεταρτη', 'πεμπτ', 'παρασκευ', 'σαββατ'];
const MONTH_STEMS = ['ιανουαρ', 'φεβρουαρ', 'μαρτ', 'απριλ', 'μαι', 'ιουν', 'ιουλ', 'αυγουστ', 'σεπτεμβρ', 'οκτωβρ', 'νοεμβρ', 'δεκεμβρ'];
const dayOfToken = (t) => DAY_STEMS.findIndex((s) => t.startsWith(s));
const monthOfToken = (t) => (t.length >= 3 ? MONTH_STEMS.findIndex((s) => t.startsWith(s) && !(s === 'μαι' && t.startsWith('μαιμ'))) : -1);
function touchDay() { if (stats.lastDay !== todayKey()) { stats.days++; stats.lastDay = todayKey(); Store.set('stats', stats); } }
function nameMatch(a, b) { a = norm(a); b = norm(b); if (a === b) return true; const k = Math.min(a.length, b.length) - 1; return k >= 3 && a.slice(0, k) === b.slice(0, k); }

/* ---------------- ΕΟΡΤΟΛΟΓΙΟ ---------------- */
const NAMEDAYS = {
  '1-1': 'Βασίλειος, Βασίλης, Βασιλική, Βάσω', '1-6': 'Φώτης, Φωτεινή, Θεοφάνης, Θεοφανώ, Ιορδάνης', '1-7': 'Ιωάννης, Γιάννης, Ιωάννα, Γιάννα',
  '1-11': 'Θεοδόσιος, Θεοδοσία', '1-17': 'Αντώνιος, Αντώνης, Αντωνία', '1-18': 'Αθανάσιος, Θανάσης, Αθανασία, Νάσος', '1-20': 'Ευθύμιος, Θύμιος, Ευθυμία',
  '1-22': 'Αναστάσιος, Τάσος', '1-25': 'Γρηγόριος, Γρηγόρης', '2-1': 'Τρύφων', '2-10': 'Χαράλαμπος, Χάρης, Μπάμπης, Χαραλαμπία', '2-11': 'Βλάσιος, Βλάσης',
  '3-25': 'Ευάγγελος, Βαγγέλης, Ευαγγελία, Βαγγελιώ', '4-25': 'Μάρκος', '5-5': 'Ειρήνη', '5-21': 'Κωνσταντίνος, Κώστας, Ντίνος, Κωνσταντίνα, Ντίνα, Ελένη, Λένα',
  '6-11': 'Βαρθολομαίος, Βαρνάβας', '6-29': 'Πέτρος, Παύλος, Πετρούλα, Παυλίνα', '6-30': 'Απόστολος, Τόλης, Αποστολία', '7-1': 'Κοσμάς, Δαμιανός, Ανάργυρος',
  '7-7': 'Κυριακή, Κική', '7-17': 'Μαρίνα', '7-20': 'Ηλίας, Ηλιάνα', '7-22': 'Μαγδαληνή', '7-24': 'Χριστίνα', '7-26': 'Παρασκευή, Βούλα, Εύη',
  '7-27': 'Παντελεήμων, Παντελής', '8-6': 'Σωτήρης, Σωτηρία', '8-15': 'Μαρία, Μαίρη, Μαρίτσα, Παναγιώτης, Πάνος, Παναγιώτα, Γιώτα, Δέσποινα', '8-25': 'Τίτος',
  '8-30': 'Αλέξανδρος, Αλέξης, Αλέκος, Αλεξάνδρα', '9-14': 'Σταύρος, Σταυρούλα', '9-17': 'Σοφία, Πίστη, Ελπίδα, Αγάπη', '10-3': 'Διονύσιος, Διονύσης',
  '10-7': 'Σέργιος', '10-18': 'Λουκάς', '10-20': 'Γεράσιμος, Αρτέμιος, Αρτέμης', '10-26': 'Δημήτριος, Δημήτρης, Μήτσος, Δήμος, Δήμητρα',
  '11-1': 'Κοσμάς, Δαμιανός, Ανάργυρος', '11-8': 'Μιχαήλ, Μιχάλης, Γαβριήλ, Άγγελος, Αγγελική, Ραφαήλ', '11-9': 'Νεκτάριος, Νεκταρία', '11-11': 'Μηνάς, Βίκτωρ',
  '11-13': 'Χρυσόστομος', '11-14': 'Φίλιππος', '11-16': 'Ματθαίος', '11-25': 'Αικατερίνη, Κατερίνα, Κατίνα', '11-26': 'Στυλιανός, Στέλιος, Στυλιανή, Στέλλα',
  '11-30': 'Ανδρέας, Αντρέας, Ανδριάνα', '12-4': 'Βαρβάρα', '12-5': 'Σάββας', '12-6': 'Νικόλαος, Νίκος, Νικόλας, Νικολέτα', '12-9': 'Άννα',
  '12-12': 'Σπυρίδων, Σπύρος, Σπυριδούλα', '12-13': 'Ευστράτιος, Στράτος, Λουκία', '12-15': 'Ελευθέριος, Λευτέρης, Ελευθερία', '12-17': 'Διονύσιος, Διονύσης, Δανιήλ',
  '12-22': 'Αναστασία', '12-25': 'Χρήστος, Χριστίνα, Εμμανουήλ, Μανώλης, Μανόλης', '12-27': 'Στέφανος, Στεφανία',
};
function orthodoxEaster(y) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const m = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return new Date(y, m - 1, day + 13);
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function movableNamedays(y) {
  const E = orthodoxEaster(y), g = new Date(y, 3, 23);
  return [
    [addDays(E, -43), 'Θεόδωρος, Θοδωρής'], [addDays(E, -42), 'Θεοδώρα, Δώρα'], [E, 'Λάμπρος, Λαμπρινή, Αναστάσιος, Αναστασία'],
    [g < E ? addDays(E, 1) : g, 'Γεώργιος, Γιώργος, Γεωργία'], [addDays(E, 5), 'Ζωή, Ζήσης'], [addDays(E, 7), 'Θωμάς, Θωμαΐς'],
  ];
}
function namedaysOn(d) {
  const out = []; const f = NAMEDAYS[`${d.getMonth() + 1}-${d.getDate()}`]; if (f) out.push(...f.split(', '));
  movableNamedays(d.getFullYear()).forEach(([dd, n]) => { if (sameDay(dd, d)) out.push(...n.split(', ')); });
  return [...new Set(out)];
}
function whenNameday(name) {
  const q = norm(name), y = new Date().getFullYear(), res = [];
  Object.entries(NAMEDAYS).forEach(([k, v]) => { if (v.split(', ').some((x) => nameMatch(x, q))) { const [m, d] = k.split('-').map(Number); res.push(new Date(y, m - 1, d)); } });
  movableNamedays(y).forEach(([dd, v]) => { if (v.split(', ').some((x) => nameMatch(x, q))) res.push(dd); });
  return res;
}
function celebratingContacts(d) {
  const names = namedaysOn(d);
  const people = [...contacts.map((c) => c.name), ...birthdays.map((b) => b.name)];
  return [...new Set(people.filter((p) => names.some((n) => nameMatch(p.split(' ')[0], n))))];
}
const fmtDate = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/* ---------------- ΕΞΕΛΙΞΗ: ΜΗΝΥΜΑΤΑ & ΠΡΟΚΛΗΣΕΙΣ ---------------- */
const QUOTES = [
  'Κάθε μέρα είναι μια νέα ευκαιρία να γίνετε λίγο καλύτερος από χθες. Μόνο λίγο αρκεί.',
  'Δεν χρειάζεται να είναι τέλεια η μέρα. Χρειάζεται μόνο να κάνετε το επόμενο σωστό βήμα.',
  'Τα πάντα ρει, έλεγε ο Ηράκλειτος. Ό,τι σας βαραίνει σήμερα, δεν θα σας βαραίνει για πάντα.',
  'Η πειθαρχία είναι να θυμάστε τι θέλετε πραγματικά, ακόμα και όταν δεν έχετε όρεξη.',
  'Οι μεγάλες αλλαγές είναι απλώς μικρές συνήθειες που δεν σταμάτησαν ποτέ.',
  'Χαμογελάστε. Τα συστήματά μου δείχνουν ότι σήμερα έχετε 100% πιθανότητες να τα καταφέρετε.',
  'Η ενέργεια ακολουθεί την προσοχή. Εστιάστε σε ό,τι θέλετε να μεγαλώσει.',
  'Μην συγκρίνετε το κεφάλαιο ένα της ζωής σας με το κεφάλαιο είκοσι κάποιου άλλου.',
  'Ο σοφός δεν είναι αυτός που ξέρει πολλά, αλλά αυτός που ξέρει τα χρήσιμα. Σήμερα μάθετε κάτι χρήσιμο.',
  'Το σώμα πετυχαίνει ό,τι πιστεύει το μυαλό. Ξεκινήστε με μια καλή σκέψη.',
  'Η ευγνωμοσύνη μετατρέπει αυτό που έχουμε σε αρκετό.',
  'Ένα ταξίδι χιλίων μιλίων ξεκινά με ένα βήμα. Ποιο είναι το δικό σας βήμα σήμερα;',
  'Δεν ελέγχετε τον άνεμο, αλλά ελέγχετε τα πανιά σας.',
  'Η καλύτερη στιγμή να φυτέψετε ένα δέντρο ήταν πριν από είκοσι χρόνια. Η δεύτερη καλύτερη είναι σήμερα.',
  'Να είστε ευγενικός με τον εαυτό σας. Μιλάτε μαζί του όλη μέρα.',
  'Η πρόοδος, όχι η τελειότητα. Αυτό είναι το πρωτόκολλο της ημέρας.',
  'Ό,τι κάνετε σήμερα μπορεί να βελτιώσει όλα τα αύριο σας.',
  'Η ηρεμία δεν είναι η απουσία καταιγίδας, αλλά η γαλήνη μέσα σε αυτήν.',
  'Είστε πιο δυνατός απ\' όσο νομίζετε και πιο ικανός απ\' όσο φαντάζεστε.',
  'Σήμερα, αντί για «πρέπει», δοκιμάστε το «επιλέγω». Αλλάζει τα πάντα.',
  'Κάθε ειδικός ήταν κάποτε αρχάριος. Συνεχίστε.',
  'Η ποιότητα της ζωής σας είναι η ποιότητα των συνηθειών σας.',
  'Αναπνεύστε βαθιά. Έχετε ήδη ξεπεράσει το 100% των δύσκολων ημερών σας.',
  'Μην περιμένετε το κίνητρο. Η δράση το δημιουργεί.',
  'Όποιος έχει ένα «γιατί», αντέχει σχεδόν κάθε «πώς».',
];
const CHALLENGES = [
  'Πρόκληση ημέρας: στείλτε ένα μήνυμα σε κάποιον που έχετε καιρό να μιλήσετε.',
  'Πρόκληση ημέρας: δέκα λεπτά περπάτημα χωρίς κινητό.',
  'Πρόκληση ημέρας: γράψτε τρία πράγματα για τα οποία είστε ευγνώμων.',
  'Πρόκληση ημέρας: διαβάστε δέκα σελίδες από ένα βιβλίο.',
  'Πρόκληση ημέρας: πείτε ένα ειλικρινές κομπλιμέντο σε κάποιον.',
  'Πρόκληση ημέρας: μία ώρα χωρίς social media.',
  'Πρόκληση ημέρας: πιείτε όλο το νερό του στόχου σας.',
  'Πρόκληση ημέρας: τελειώστε πρώτα την πιο δύσκολη εργασία σας.',
  'Πρόκληση ημέρας: πέντε λεπτά διαλογισμός ή αναπνοές.',
  'Πρόκληση ημέρας: μάθετε μια καινούργια λέξη σε ξένη γλώσσα.',
  'Πρόκληση ημέρας: τακτοποιήστε έναν χώρο για δέκα λεπτά.',
  'Πρόκληση ημέρας: κάντε κάτι καλό για κάποιον χωρίς να το μάθει.',
  'Πρόκληση ημέρας: κοιμηθείτε μισή ώρα νωρίτερα απόψε.',
  'Πρόκληση ημέρας: είκοσι καθίσματα και δέκα κάμψεις, όπου κι αν βρίσκεστε.',
  'Πρόκληση ημέρας: ακούστε κάποιον χωρίς να τον διακόψετε ούτε μία φορά.',
];
const dayIndex = () => Math.floor(Date.now() / 86400000);
function dailyQuote() { return QUOTES[dayIndex() % QUOTES.length]; }
function dailyChallenge() { return CHALLENGES[(dayIndex() * 7) % CHALLENGES.length]; }

/* ---------------- ΝΕΡΟ ---------------- */
const waterGoal = () => (S.weight ? Math.round((S.weight * 33) / 50) * 50 : 2000);
function waterToday() { if (water.date !== todayKey()) { water = { date: todayKey(), ml: 0 }; Store.set('water', water); } return water.ml; }
function addWater(ml) { waterToday(); water.ml = Math.max(0, water.ml + ml); Store.set('water', water); updateWaterWidget(); }
function updateWaterWidget() {
  const ml = waterToday(), g = waterGoal(), p = Math.min(100, Math.round((ml / g) * 100));
  $('#waterVal').textContent = (ml / 1000).toFixed(1) + 'L'; $('#waterBar').style.width = p + '%';
}
function parseWaterMl(n) {
  n = wordsToNums(n);
  const num = parseFloat((n.match(/(\d+(?:[.,]\d+)?)/) || [])[1]?.replace(',', '.') || '1');
  if (/ml|μιλιλιτρ/.test(n)) return num;
  if (/μισο λιτρο|μισο μπουκαλι/.test(n)) return 500;
  if (/λιτρ/.test(n)) return num * 1000;
  if (/μπουκαλ/.test(n)) return num * 500;
  return num * 250;
}

/* ---------------- ΥΠΝΟΣ ---------------- */
function parseHM(str) { const [h, m] = (str || '07:00').split(':').map(Number); return { h, m }; }
function bedtimesFor(wake) { return [6, 5, 4].map((c) => ({ c, t: new Date(wake.getTime() - (c * 90 + 15) * 60000) })); }
function wakeDateFrom(n) {
  const d = parseClock(n); if (d) return d;
  const { h, m } = parseHM(S.wakeTime); const w = new Date(); w.setHours(h, m, 0, 0); if (w <= new Date()) w.setDate(w.getDate() + 1); return w;
}

/* ---------------- ΕΞΟΔΑ ---------------- */
const CATS = {
  'Φαγητό & έξοδος': ['καφε', 'καφεσ', 'φρεντο', 'μπαρ', 'ποτο', 'ποτα', 'εστιατοριο', 'φαγητο', 'σουβλακ', 'πιτσα', 'delivery', 'ντελιβερ', 'ταβερν', 'burger', 'μπεργκερ', 'γλυκ', 'κρεπα', 'efood'],
  'Σούπερ μάρκετ': ['σουπερ', 'μαρκετ', 'ψωνια', 'φουρνο', 'λαικη', 'μπακαλ', 'κρεοπωλ', 'μαναβ'],
  'Μεταφορές': ['βενζιν', 'καυσιμ', 'ταξι', 'εισιτηρι', 'λεωφορει', 'μετρο', 'διοδια', 'παρκινγκ', 'σερβις', 'ktel', 'κτελ'],
  'Λογαριασμοί': ['ρευμα', 'δεη', 'νερου', 'ευδαπ', 'τηλεφων', 'ιντερνετ', 'ενοικι', 'λογαριασμ', 'κοινοχρηστ', 'ασφαλ', 'cosmote', 'vodafone', 'nova'],
  'Ψώνια': ['ρουχ', 'παπουτσ', 'κινητο', 'ηλεκτρονικ', 'δωρο', 'καλλυντικ', 'αρωμα', 'amazon', 'skroutz'],
  'Υγεία & άθληση': ['φαρμακ', 'γιατρ', 'γυμναστηρι', 'οδοντιατρ', 'βιταμιν', 'συμπληρωμ'],
  'Διασκέδαση': ['σινεμα', 'κινηματογραφ', 'συναυλι', 'παιχνιδ', 'netflix', 'spotify', 'βιβλι', 'θεατρο', 'εκδρομ'],
};
function guessCat(note) { const n = norm(note || ''); for (const [c, keys] of Object.entries(CATS)) if (keys.some((k) => n.includes(k))) return c; return 'Άλλα'; }
function spentSince(from) { return expenses.filter((e) => e.at >= from.getTime()); }
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const sum = (arr) => arr.reduce((a, e) => a + e.amount, 0);
const eur = (x) => x.toFixed(2).replace('.', ',') + ' €';
function expenseSummary(list, label) {
  if (!list.length) return `Δεν έχετε καταγράψει έξοδα ${label}.`;
  const by = {}; list.forEach((e) => (by[e.cat] = (by[e.cat] || 0) + e.amount));
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, v]) => `${c} ${eur(v)}`).join(', ');
  let s = `${label.charAt(0).toUpperCase() + label.slice(1)} ξοδέψατε συνολικά ${eur(sum(list))}. Κατανομή: ${top}.`;
  if (S.budget && label.includes('μήνα')) { const left = S.budget - sum(list); s += left >= 0 ? ` Απομένουν ${eur(left)} από τον προϋπολογισμό.` : ` Έχετε ξεπεράσει τον προϋπολογισμό κατά ${eur(-left)}.`; }
  return s;
}

/* ---------------- MUSIC: γεννήτρια χαλαρωτικής μουσικής 432Hz ---------------- */
const CHAKRAS = [
  { n: 'Ριζικό', s: 'Μουλαντάρα', f: 396, rgb: '255,60,60', where: 'στη βάση της σπονδυλικής στήλης', q: 'σταθερότητα, ασφάλεια και γείωση' },
  { n: 'Ιερό', s: 'Σβαντιστάνα', f: 417, rgb: '255,140,40', where: 'λίγο κάτω από τον αφαλό', q: 'δημιουργικότητα, χαρά και ροή' },
  { n: 'Ηλιακό πλέγμα', s: 'Μανιπούρα', f: 528, rgb: '255,220,60', where: 'στο στομάχι', q: 'αυτοπεποίθηση, δύναμη και θέληση' },
  { n: 'Καρδιάς', s: 'Ανάχατα', f: 639, rgb: '70,230,120', where: 'στο κέντρο του στήθους', q: 'αγάπη, συμπόνια και συγχώρεση' },
  { n: 'Λαιμού', s: 'Βισούντα', f: 741, rgb: '60,190,255', where: 'στον λαιμό', q: 'ειλικρίνεια και ελεύθερη έκφραση' },
  { n: 'Τρίτου ματιού', s: 'Άτζνα', f: 852, rgb: '90,90,255', where: 'ανάμεσα στα φρύδια', q: 'διαίσθηση, καθαρότητα και σοφία' },
  { n: 'Στέμματος', s: 'Σαχασράρα', f: 963, rgb: '200,110,255', where: 'στην κορυφή του κεφαλιού', q: 'σύνδεση, γαλήνη και ενότητα' },
];
const Music = {
  n: null, label: '', fadeT: null,
  reverb(ctx) {
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
    const cv = ctx.createConvolver(); cv.buffer = buf; return cv;
  },
  start(kind = '432', minutes = 0) {
    Sound.init(); const ctx = Sound.ctx; if (!ctx) return; if (ctx.state === 'suspended') ctx.resume();
    this.stop(0.1);
    const out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
    const rv = this.reverb(ctx), wet = ctx.createGain(); wet.gain.value = 0.7; rv.connect(wet).connect(out);
    const dry = ctx.createGain(); dry.gain.value = 0.5; dry.connect(out);
    const nodes = { out, oscs: [], timers: [] };
    const chakra = typeof kind === 'number' ? CHAKRAS[kind] : null;
    const base = chakra ? chakra.f / 4 : kind === 'sleep' ? 54 : kind === 'focus' ? 108 : 108; // A=432 → 108Hz δύο οκτάβες κάτω
    const pad = (f, g, type = 'sine', det = 0) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = det; og.gain.value = g;
      o.connect(og); og.connect(dry); og.connect(rv); o.start(); nodes.oscs.push(o);
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.05 + Math.random() * 0.08; lg.gain.value = g * 0.6; l.connect(lg).connect(og.gain); l.start(); nodes.oscs.push(l);
    };
    pad(base, 0.16); pad(base * 1.5, 0.07, 'sine', 4); pad(base * 2, 0.06, 'triangle', -5); pad(base * 3, 0.025, 'sine', 3);
    if (chakra) pad(chakra.f, 0.035);
    // binaural (ακουστικά): θήτα 6Hz για χαλάρωση, βήτα 14Hz για συγκέντρωση
    const beat = kind === 'focus' ? 14 : kind === 'sleep' ? 3 : 6;
    if (ctx.createChannelMerger) {
      const mg = ctx.createChannelMerger(2), bg = ctx.createGain(); bg.gain.value = 0.05; mg.connect(bg).connect(out);
      [[base * 2, 0], [base * 2 + beat, 1]].forEach(([f, ch]) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(mg, 0, ch); o.start(); nodes.oscs.push(o); });
    }
    // κύματα (φιλτραρισμένος θόρυβος)
    const len = ctx.sampleRate * 4, nb = ctx.createBuffer(1, len, ctx.sampleRate), nd = nb.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = last * 3.5; }
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = kind === 'focus' ? 600 : 900;
    const ng = ctx.createGain(); ng.gain.value = 0.15; const wl = ctx.createOscillator(), wlg = ctx.createGain(); wl.frequency.value = 0.09; wlg.gain.value = 0.12; wl.connect(wlg).connect(ng.gain); wl.start();
    ns.connect(nf).connect(ng).connect(out); ns.start(); nodes.oscs.push(ns, wl);
    // καμπανάκια σε πεντατονική κλίμακα με A=432
    const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2].map((r) => 216 * r);
    const bell = () => {
      if (this.n !== nodes) return;
      const t = ctx.currentTime, f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 2 : 1);
      [1, 2.01, 3.98].forEach((h, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * h; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime([0.06, 0.02, 0.008][i], t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 5); o.connect(g); g.connect(rv); g.connect(dry); o.start(t); o.stop(t + 5.2); });
      nodes.timers.push(setTimeout(bell, (kind === 'sleep' ? 5000 : 2500) + Math.random() * 5000));
    };
    nodes.timers.push(setTimeout(bell, 1500));
    out.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 3);
    this.n = nodes;
    this.label = chakra ? `${chakra.f}Hz · Τσάκρα ${chakra.n}` : kind === 'sleep' ? '432Hz · Ύπνος' : kind === 'focus' ? '432Hz · Συγκέντρωση' : '432Hz · Αρμονία';
    Banner.set('music', '♪ ' + this.label, () => this.stop());
    if ('mediaSession' in navigator) try { navigator.mediaSession.metadata = new MediaMetadata({ title: this.label, artist: S.assistant }); } catch {}
    clearTimeout(this.fadeT); if (minutes) this.fadeT = setTimeout(() => this.stop(8), minutes * 60000);
  },
  stop(fade = 2) {
    const n = this.n; if (!n) return; this.n = null; Banner.clear('music'); clearTimeout(this.fadeT);
    const ctx = Sound.ctx; n.timers.forEach(clearTimeout);
    n.out.gain.cancelScheduledValues(ctx.currentTime); n.out.gain.setValueAtTime(n.out.gain.value, ctx.currentTime); n.out.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    setTimeout(() => n.oscs.forEach((o) => { try { o.stop(); } catch {} }), fade * 1000 + 200);
  },
};

/* ---------------- BANNERS (μουσική, pomodoro) ---------------- */
const Banner = {
  set(id, text, onClose) {
    let el = document.getElementById('bn-' + id);
    if (!el) { el = document.createElement('div'); el.className = 'banner'; el.id = 'bn-' + id; el.innerHTML = '<span></span><button aria-label="Τέλος">✕</button>'; $('#banners').appendChild(el); }
    el.querySelector('span').textContent = text; el.querySelector('button').onclick = () => { Sound.tap(); onClose && onClose(); };
  },
  clear(id) { document.getElementById('bn-' + id)?.remove(); },
};

/* ---------------- SESSION (αναπνοές, διαλογισμός, γυμναστική) ---------------- */
const Session = {
  token: 0, active: false, onEnd: null,
  open(title) { this.active = true; $('#session').classList.remove('hidden'); $('#sessTitle').textContent = title; $('#sessBar').style.width = '0%'; },
  release() { this.released = true; },
  close() { this.active = false; $('#sessAct').classList.add('hidden'); $('#session').classList.add('hidden'); $('#sessCircle').style.transform = 'scale(.45)'; applyTheme(S.theme); },
  stop() { this.token++; this.lastStopped = true; speechSynthesis.cancel(); this.close(); if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(true); } },
  async run(title, steps, { onEnd, music } = {}) {
    if (this.active) this.stop();
    const tk = ++this.token; this.lastStopped = false; this.onEnd = onEnd; this.open(title);
    const startedMusic = music != null && !Music.n; if (startedMusic) Music.start(music);
    const total = steps.reduce((a, s) => a + s.sec, 0); let done = 0;
    for (const st of steps) {
      if (tk !== this.token) return;
      $('#sessPhase').textContent = st.phase || ''; $('#sessSub').textContent = st.sub || '';
      if (st.rgb) setThemeRGB(st.rgb);
      const c = $('#sessCircle'); c.style.transitionDuration = (st.ease ?? st.sec) + 's'; c.style.transform = `scale(${st.scale ?? 0.7})`;
      if (st.tone) Sound.tone(st.tone, 1.2, 'sine', 0.12); else if (st.beep !== false) Sound.tone(660, 0.15, 'sine', 0.08);
      if (st.say) Voice.speak(st.say);
      if (st.hold) {
        this.released = false; const act = $('#sessAct'); act.textContent = st.btn || 'ΑΝΑΣΑ ΤΩΡΑ'; act.classList.remove('hidden'); let t = 0;
        while (!this.released && t < (st.max || 300) && tk === this.token) { $('#sessCount').textContent = `${Math.floor(t / 60)}:${pad(t % 60)}`; if (st.cues && st.cues[t]) Voice.speak(st.cues[t]); await sleep(1000); t++; }
        act.classList.add('hidden'); if (tk !== this.token) return; done += st.sec; $('#sessBar').style.width = (done / total) * 100 + '%'; if (st.onHold) st.onHold(t); continue;
      }
      for (let i = st.sec; i > 0; i--) {
        if (st.cues && st.cues[st.sec - i]) Voice.speak(st.cues[st.sec - i]);
        if (tk !== this.token) return;
        $('#sessCount').textContent = st.hideCount ? '' : i;
        if (st.countdown && i <= 3) Sound.tone(880, 0.08, 'square', 0.1);
        if (st.half && i === Math.floor(st.sec / 2) && st.sec >= 20) Voice.speak('Μισό ακόμα');
        await sleep(1000); done++; $('#sessBar').style.width = (done / total) * 100 + '%';
      }
    }
    if (tk !== this.token) return;
    Sound.reply(); this.close(); if (startedMusic) Music.stop(4);
    const f = this.onEnd; this.onEnd = null; if (f) f(false);
  },
};

const BREATHS = {
  '478': { name: 'Αναπνοή 4-7-8', why: 'για χαλάρωση και καλύτερο ύπνο', seq: [['Εισπνοή από τη μύτη', 4, 1], ['Κρατήστε', 7, 1], ['Εκπνοή από το στόμα', 8, 0.45]], cycles: 4 },
  box: { name: 'Τετράγωνη αναπνοή', why: 'για ηρεμία και συγκέντρωση', seq: [['Εισπνοή', 4, 1], ['Κρατήστε', 4, 1], ['Εκπνοή', 4, 0.45], ['Κρατήστε', 4, 0.45]], cycles: 6 },
  calm: { name: 'Αναπνοή συνοχής', why: 'για ισορροπία καρδιάς και μυαλού', seq: [['Εισπνοή', 5, 1], ['Εκπνοή', 5, 0.45]], cycles: 12 },
  energy: { name: 'Ενεργειακή αναπνοή', why: 'για ξύπνημα και ενέργεια', seq: [['Βαθιά εισπνοή', 2, 1], ['Δυνατή εκπνοή', 2, 0.45]], cycles: 15 },
};
function startBreathing(key = 'box') {
  const b = BREATHS[key] || BREATHS.box; const steps = [{ phase: 'Προετοιμασία', sub: 'Καθίστε άνετα, ώμοι χαλαροί', sec: 5, scale: 0.6, say: `${b.name}, ${b.why}. Καθίστε άνετα και χαλαρώστε τους ώμους.` }];
  for (let c = 0; c < b.cycles; c++) b.seq.forEach(([p, s, sc]) => steps.push({ phase: p, sub: `Κύκλος ${c + 1} από ${b.cycles}`, sec: s, scale: sc, say: c < 2 || b.cycles <= 6 ? p : '', beep: true }));
  steps.push({ phase: 'Ολοκληρώθηκε', sub: 'Παρατηρήστε πώς νιώθετε', sec: 4, scale: 0.7, say: 'Πολύ ωραία. Παρατηρήστε πώς νιώθετε τώρα.' });
  return Session.run(b.name, steps, { music: key === 'energy' ? null : '432', onEnd: (stopped) => { if (!stopped) { stats.breaths++; Store.set('stats', stats); } } });
}
const MEDS = {
  body: { name: 'Σάρωση σώματος', min: 5, lines: [
    ['Κλείστε τα μάτια σας. Πάρτε τρεις βαθιές αναπνοές και αφήστε το σώμα να βαρύνει.', 20], ['Φέρτε την προσοχή σας στα πέλματα. Νιώστε την επαφή τους με το έδαφος.', 25],
    ['Ανεβείτε στις γάμπες και στα γόνατα. Αν υπάρχει ένταση, απλώς παρατηρήστε την και αφήστε την να λιώσει.', 30], ['Οι μηροί και η λεκάνη χαλαρώνουν. Κάθε εκπνοή σας βυθίζει λίγο πιο βαθιά.', 30],
    ['Νιώστε την κοιλιά να ανεβαίνει και να κατεβαίνει με την αναπνοή. Χωρίς προσπάθεια.', 30], ['Η πλάτη και οι ώμοι. Αφήστε τους ώμους να πέσουν μακριά από τα αυτιά.', 30],
    ['Τα χέρια, οι παλάμες, τα δάχτυλα. Νιώστε μια απαλή ζεστασιά.', 25], ['Ο λαιμός, το σαγόνι, το μέτωπο. Χαλαρώστε κάθε μικρό μυ του προσώπου.', 30],
    ['Τώρα νιώστε ολόκληρο το σώμα σας μαζί, ήρεμο και ασφαλές. Μείνετε εδώ για λίγο.', 45], ['Σιγά σιγά κουνήστε τα δάχτυλα. Όταν είστε έτοιμος, ανοίξτε τα μάτια.', 15]] },
  morning: { name: 'Πρωινή πρόθεση', min: 4, lines: [
    ['Καλημέρα. Καθίστε με ίσια πλάτη και κλείστε τα μάτια. Πάρτε μια βαθιά ανάσα.', 15], ['Νιώστε την ενέργεια της νέας μέρας να μπαίνει με κάθε εισπνοή.', 25],
    ['Σκεφτείτε ένα πράγμα για το οποίο είστε ευγνώμων σήμερα. Κρατήστε το στην καρδιά σας.', 35], ['Τώρα επιλέξτε μια πρόθεση για σήμερα. Μια λέξη. Ηρεμία, δύναμη, υπομονή, χαρά.', 35],
    ['Φανταστείτε τη μέρα σας να κυλάει με αυτή την πρόθεση. Δείτε τον εαυτό σας να τα καταφέρνει.', 45], ['Επαναλάβετε νοερά: Είμαι έτοιμος. Είμαι ικανός. Σήμερα είναι μια καλή μέρα.', 25],
    ['Πάρτε μια τελευταία βαθιά ανάσα και ανοίξτε τα μάτια. Πάμε.', 10]] },
  sleep: { name: 'Χαλάρωση για ύπνο', min: 6, lines: [
    ['Ξαπλώστε αναπαυτικά. Κλείστε τα μάτια. Η μέρα τελείωσε, δεν χρειάζεται να κάνετε τίποτα άλλο.', 25], ['Εισπνεύστε αργά σε τέσσερα, και εκπνεύστε ακόμα πιο αργά σε έξι.', 40],
    ['Φανταστείτε ότι βρίσκεστε σε μια ήσυχη παραλία τη νύχτα. Τα κύματα έρχονται και φεύγουν.', 45], ['Με κάθε κύμα, μια σκέψη της ημέρας απομακρύνεται. Δεν τη χρειάζεστε απόψε.', 45],
    ['Το σώμα σας βαραίνει και ζεσταίνεται. Τα βλέφαρα, οι ώμοι, τα χέρια, τα πόδια.', 45], ['Είστε ασφαλής. Είστε ήρεμος. Αφεθείτε στον ύπνο.', 60]] },
  gratitude: { name: 'Ευγνωμοσύνη', min: 3, lines: [
    ['Κλείστε τα μάτια και χαμογελάστε ελαφρά. Πάρτε μια βαθιά ανάσα.', 15], ['Σκεφτείτε έναν άνθρωπο που σας αγαπάει. Νιώστε την ευγνωμοσύνη για αυτόν.', 35],
    ['Σκεφτείτε κάτι απλό που έχετε και συχνά ξεχνάτε. Την υγεία, ένα σπίτι, ένα ζεστό φαγητό.', 35], ['Σκεφτείτε μια δυσκολία που σας έκανε πιο δυνατό. Ευχαριστήστε την.', 35],
    ['Αφήστε αυτό το συναίσθημα να γεμίσει όλο το στήθος σας. Ανοίξτε τα μάτια όταν είστε έτοιμος.', 20]] },
};
function startMeditation(key = 'body') {
  if (key === 'chakra') return startChakra();
  const m = MEDS[key] || MEDS.body;
  const steps = m.lines.map(([t, s], i) => ({ phase: m.name, sub: '', sec: s, scale: i % 2 ? 0.85 : 0.6, ease: 6, say: t, hideCount: true, beep: false }));
  return Session.run(m.name, steps, { music: key === 'sleep' ? 'sleep' : '432', onEnd: (stopped) => { if (!stopped) { stats.meditations++; Store.set('stats', stats); say(pick(['Ο διαλογισμός ολοκληρώθηκε. Μπράβο σας.', 'Ολοκληρώθηκε. Κάθε λεπτό ηρεμίας είναι επένδυση.']), { noRelisten: true }); } } });
}
function startChakra() {
  const steps = [{ phase: 'Διαλογισμός τσάκρα', sub: 'Καθίστε με ίσια πλάτη', sec: 15, scale: 0.6, say: 'Διαλογισμός των επτά τσάκρα. Καθίστε με ίσια πλάτη, κλείστε τα μάτια και αναπνεύστε βαθιά.', hideCount: true }];
  CHAKRAS.forEach((c, i) => steps.push({ phase: `${i + 1}. ${c.n}`, sub: `${c.s} · ${c.f}Hz`, rgb: c.rgb, tone: c.f, sec: 45, scale: 0.6 + i * 0.05, ease: 8, hideCount: true,
    say: `Τσάκρα ${c.n}, ${c.s}, ${c.where}. Φανταστείτε ένα φως να περιστρέφεται εκεί. Νιώστε ${c.q}.` }));
  steps.push({ phase: 'Ενότητα', sub: 'Όλα τα κέντρα σε ισορροπία', rgb: '255,255,255', sec: 25, scale: 1, ease: 10, hideCount: true, say: 'Τώρα νιώστε και τα επτά κέντρα να λάμπουν μαζί, σε τέλεια ισορροπία. Όταν είστε έτοιμος, ανοίξτε τα μάτια.' });
  return Session.run('Διαλογισμός τσάκρα', steps, { music: '432', onEnd: (stopped) => { if (!stopped) { stats.meditations++; Store.set('stats', stats); } } });
}
function meditationProgram() {
  const n = stats.meditations + stats.breaths, day = (n % 21) + 1, h = new Date().getHours();
  let plan, start;
  if (day <= 7) { plan = 'Εβδομάδα 1: θεμέλια. Σήμερα τετράγωνη αναπνοή, περίπου 2 λεπτά.'; start = () => startBreathing('box'); }
  else if (day <= 14) { plan = h < 12 ? 'Εβδομάδα 2: επίγνωση. Σήμερα πρωινή πρόθεση, 4 λεπτά.' : 'Εβδομάδα 2: επίγνωση. Σήμερα σάρωση σώματος, 5 λεπτά.'; start = () => startMeditation(h < 12 ? 'morning' : 'body'); }
  else { plan = 'Εβδομάδα 3: βάθος. Σήμερα διαλογισμός των επτά τσάκρα, περίπου 6 λεπτά.'; start = () => startChakra(); }
  if (h >= 21) { plan = 'Είναι βράδυ, οπότε απόψε προτείνω χαλάρωση για ύπνο με αναπνοή 4-7-8.'; start = () => startMeditation('sleep'); }
  pending = (r, nn) => (/^(ναι|οκ|ok|παμε|ξεκινα|εντα|βεβαια|ναι παμε)/.test(nn) ? (start(), 'Ξεκινάμε. Κλείστε τα μάτια.') : null);
  return `Πρόγραμμα 21 ημερών, μέρα ${day}. ${plan} Έχετε ολοκληρώσει ${stats.meditations} διαλογισμούς και ${stats.breaths} ασκήσεις αναπνοής. Να ξεκινήσουμε;`;
}

/* ---------------- ΓΥΜΝΑΣΤΙΚΗ ---------------- */
const WORKOUTS = {
  full: { name: 'Πλήρες σώμα', rounds: 2, rest: 15, ex: [['Jumping jacks', 40, 'Ανοίξτε χέρια και πόδια ρυθμικά'], ['Καθίσματα', 40, 'Πλάτη ίσια, βάρος στις φτέρνες'], ['Κάμψεις', 30, 'Αν χρειάζεται, στηριχτείτε στα γόνατα'], ['Προβολές', 40, 'Εναλλάξ πόδια, κορμός όρθιος'], ['Σανίδα', 30, 'Κοιλιά σφιχτή, σώμα σε ευθεία'], ['Γέφυρα γλουτών', 40, 'Σηκώστε τη λεκάνη και σφίξτε']] },
  abs: { name: 'Κοιλιακοί', rounds: 2, rest: 15, ex: [['Crunches', 40, 'Ανεβείτε με την κοιλιά, όχι με τον λαιμό'], ['Ποδήλατο', 40, 'Αγκώνας προς αντίθετο γόνατο'], ['Σανίδα', 40, 'Μην πέφτει η μέση'], ['Ανυψώσεις ποδιών', 30, 'Αργά και ελεγχόμενα'], ['Mountain climbers', 30, 'Γρήγορα γόνατα προς το στήθος'], ['Πλάγια σανίδα δεξιά', 25, 'Γοφοί ψηλά'], ['Πλάγια σανίδα αριστερά', 25, 'Γοφοί ψηλά']] },
  stretch: { name: 'Διατάσεις & κινητικότητα', rounds: 1, rest: 5, ex: [['Περιστροφές αυχένα', 30, 'Αργά, χωρίς πόνο'], ['Κύκλοι ώμων', 30, 'Μπρος και πίσω'], ['Διάταση στήθους', 30, 'Χέρια πίσω, ανοίξτε το στήθος'], ['Κάμψη προς τα εμπρός', 40, 'Αφήστε το κεφάλι να κρέμεται'], ['Διάταση τετρακεφάλου δεξί', 30, 'Φτέρνα προς γλουτό'], ['Διάταση τετρακεφάλου αριστερό', 30, 'Φτέρνα προς γλουτό'], ['Γάτα και αγελάδα', 40, 'Καμπουριάστε και κοιλώστε την πλάτη'], ['Στάση του παιδιού', 45, 'Αναπνεύστε βαθιά'], ['Περιστροφή σπονδυλικής', 40, 'Ξαπλωμένος, γόνατα στο πλάι']] },
  hiit: { name: 'HIIT καύσης', rounds: 3, rest: 20, ex: [['Burpees', 30, 'Δώστε τα πάντα'], ['Άλματα από κάθισμα', 30, 'Προσγείωση με λυγισμένα γόνατα'], ['High knees', 30, 'Γόνατα ψηλά, γρήγορα'], ['Mountain climbers', 30, 'Σταθερός κορμός'], ['Κάμψεις', 30, 'Όσες μπορείτε']] },
  legs: { name: 'Πόδια & γλουτοί', rounds: 2, rest: 15, ex: [['Καθίσματα', 45, 'Βαθιά, πλάτη ίσια'], ['Προβολές προς τα πίσω', 40, 'Εναλλάξ'], ['Καθίσματα σούμο', 40, 'Πόδια ανοιχτά, μύτες έξω'], ['Ανυψώσεις γάμπας', 40, 'Ανεβείτε στις μύτες'], ['Καρέκλα στον τοίχο', 40, 'Γόνατα σε ορθή γωνία'], ['Γέφυρα γλουτών', 40, 'Σφίξτε στην κορυφή']] },
};
const WEEK_PLAN = { 1: 'full', 2: 'stretch', 3: 'abs', 4: 'legs', 5: 'hiit', 6: 'stretch', 0: null };
function workoutSummary(k) { const w = WORKOUTS[k]; const sec = w.rounds * w.ex.reduce((a, e) => a + e[1] + w.rest, 0); return `${w.name}, ${w.rounds} γύροι, περίπου ${Math.round(sec / 60)} λεπτά: ${w.ex.map((e) => e[0]).join(', ')}.`; }
function startWorkout(k) {
  const w = WORKOUTS[k] || WORKOUTS.full; const steps = [{ phase: 'Ετοιμαστείτε', sub: w.ex[0][0], sec: 10, scale: 0.6, say: `Προπόνηση ${w.name}. Πρώτη άσκηση: ${w.ex[0][0]}. Ετοιμαστείτε.`, countdown: true }];
  for (let r = 0; r < w.rounds; r++) w.ex.forEach(([n, s, tip], i) => {
    steps.push({ phase: n, sub: `${tip} · γύρος ${r + 1}/${w.rounds}`, sec: s, scale: 1, ease: 0.6, say: n, countdown: true, half: true });
    const next = w.ex[i + 1] ? w.ex[i + 1][0] : r + 1 < w.rounds ? w.ex[0][0] : null;
    if (next) steps.push({ phase: 'Διάλειμμα', sub: 'Επόμενο: ' + next, sec: w.rest, scale: 0.5, ease: 1, say: `Διάλειμμα. Επόμενο: ${next}.`, countdown: true });
  });
  return Session.run('Γυμναστική · ' + w.name, steps, { onEnd: (stopped) => { if (!stopped) { stats.workouts++; Store.set('stats', stats); say(`Μπράβο${nmc()}! Ολοκληρώσατε την προπόνηση. Σύνολο προπονήσεων: ${stats.workouts}. Πιείτε ένα ποτήρι νερό.`, { noRelisten: true }); } } });
}

/* ---------------- POMODORO ---------------- */
const Pomo = {
  t: null, end: 0, phase: 'work', round: 0, work: 25, brk: 5,
  start(work = 25, brk = 5) { this.stop(true); this.work = work; this.brk = brk; this.round = 1; this.go('work'); },
  go(phase) {
    this.phase = phase; const min = phase === 'work' ? this.work : phase === 'long' ? 15 : this.brk; this.end = Date.now() + min * 60000;
    clearInterval(this.t); this.t = setInterval(() => this.tick(), 1000); this.tick();
  },
  tick() {
    const left = Math.max(0, this.end - Date.now()), m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    Banner.set('pomo', `${this.phase === 'work' ? '◉ ΣΥΓΚΕΝΤΡΩΣΗ' : '☕ ΔΙΑΛΕΙΜΜΑ'} ${pad(m)}:${pad(s)} · ${this.round}/4`, () => this.stop());
    if (left > 0) return;
    Sound.alarm(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (this.phase === 'work') { stats.pomodoros++; Store.set('stats', stats); const long = this.round % 4 === 0; notify('Pomodoro', 'Ώρα για διάλειμμα'); say(long ? 'Τέσσερις κύκλοι! Μεγάλο διάλειμμα 15 λεπτών. Σηκωθείτε και κινηθείτε.' : `Μπράβο. Διάλειμμα ${this.brk} λεπτών. Τεντωθείτε και πιείτε νερό.`, { noRelisten: true }); this.go(long ? 'long' : 'break'); }
    else { this.round++; notify('Pomodoro', 'Πίσω στη δουλειά'); say(`Το διάλειμμα τελείωσε. Κύκλος ${this.round}. Πίσω στη συγκέντρωση.`, { noRelisten: true }); this.go('work'); }
  },
  stop(silent) { if (!this.t) return; clearInterval(this.t); this.t = null; Banner.clear('pomo'); if (!silent) say('Το Pomodoro σταμάτησε.', { noRelisten: true }); },
};
const STUDY_TIPS = [
  'Χρησιμοποιήστε ενεργή ανάκληση: κλείστε το βιβλίο και προσπαθήστε να εξηγήσετε όσα διαβάσατε με δικά σας λόγια.',
  'Επαναλάβετε την ύλη σε αυξανόμενα διαστήματα: σήμερα, σε τρεις μέρες, σε μια εβδομάδα. Η μνήμη στερεώνεται.',
  'Βάλτε το κινητό σε άλλο δωμάτιο. Η απλή παρουσία του μειώνει τη συγκέντρωση.',
  'Ξεκινήστε από το πιο δύσκολο θέμα, όσο ο εγκέφαλος είναι ξεκούραστος.',
  'Διδάξτε κάποιον άλλον. Αν μπορείτε να το εξηγήσετε απλά, το έχετε καταλάβει.',
  'Ο ύπνος είναι μέρος του διαβάσματος. Εκεί ο εγκέφαλος αποθηκεύει όσα μάθατε.',
  'Χωρίστε τη μεγάλη εργασία σε μικρά κομμάτια των 25 λεπτών. Λέτε «ξεκίνα pomodoro» και αναλαμβάνω εγώ.',
];
const MONEY_TIPS = [
  'Κανόνας 50-30-20: 50% για ανάγκες, 30% για επιθυμίες, 20% για αποταμίευση.',
  'Πριν από κάθε μη απαραίτητη αγορά, περιμένετε 24 ώρες. Οι μισές επιθυμίες εξαφανίζονται.',
  'Πληρώστε πρώτα τον εαυτό σας: βάλτε ένα ποσό στην άκρη μόλις πληρωθείτε.',
  'Οι μικροί καθημερινοί καφέδες αθροίζονται. Λέτε «πόσα ξόδεψα αυτόν τον μήνα» για να δείτε την εικόνα.',
  'Φτιάξτε ένα ταμείο έκτακτης ανάγκης με έξοδα τριών μηνών. Είναι η καλύτερη ασπίδα σας.',
];

/* ---------------- ΚΟΥΙΖ ---------------- */
const QUIZ_GEN = [
  ['Ποια είναι η πρωτεύουσα της Αυστραλίας;', ['Καμπέρα']], ['Πόσα κόκαλα έχει περίπου το ανθρώπινο σώμα ενός ενήλικα;', ['206', 'διακοσια εξι']],
  ['Ποιος πλανήτης είναι γνωστός ως ο κόκκινος πλανήτης;', ['Άρης']], ['Σε ποια χρονιά έγινε η Ελληνική Επανάσταση;', ['1821']],
  ['Ποιο είναι το μεγαλύτερο ωκεανό της Γης;', ['Ειρηνικός', 'ειρηνικ']], ['Ποιο είναι το χημικό σύμβολο του χρυσού;', ['Au', 'α υ', 'αου']],
  ['Ποιος έγραψε την Οδύσσεια;', ['Όμηρος', 'ομηρ']], ['Ποιο είναι το ψηλότερο βουνό της Ελλάδας;', ['Όλυμπος', 'ολυμπ']],
  ['Πόσες πλευρές έχει ένα εξάγωνο;', ['6', 'εξι']], ['Ποια είναι η πρωτεύουσα της Ιαπωνίας;', ['Τόκιο']],
  ['Ποιο ζώο είναι το μεγαλύτερο θηλαστικό στον κόσμο;', ['Γαλάζια φάλαινα', 'φαλαινα']], ['Σε ποια πόλη έγιναν οι πρώτοι σύγχρονοι Ολυμπιακοί Αγώνες;', ['Αθήνα']],
  ['Ποιο αέριο χρειάζονται τα φυτά για τη φωτοσύνθεση;', ['Διοξείδιο του άνθρακα', 'διοξειδιο', 'co2']], ['Ποιος ζωγράφισε τη Μόνα Λίζα;', ['Λεονάρντο ντα Βίντσι', 'λεοναρντο', 'βιντσι']],
  ['Πόσα λεπτά έχει μία ώρα και μισή;', ['90', 'ενενηντα']], ['Ποιο είναι το μεγαλύτερο νησί της Ελλάδας;', ['Κρήτη']],
  ['Ποιος διατύπωσε τη θεωρία της σχετικότητας;', ['Αϊνστάιν', 'αινσταιν']], ['Ποια είναι η πρωτεύουσα του Καναδά;', ['Οττάβα', 'οταβα']],
  ['Πόσοι είναι οι παίκτες μιας ομάδας μπάσκετ στο γήπεδο;', ['5', 'πεντε']], ['Ποιο είναι το πιο γρήγορο χερσαίο ζώο;', ['Τσίτα', 'γατοπαρδ']],
];
const QUIZ_EN = [
  ['Πώς λέγεται στα αγγλικά το «παράθυρο»;', ['window']], ['Πώς λέγεται στα αγγλικά η «γνώση»;', ['knowledge']], ['Πώς λέγεται στα αγγλικά το «ταξίδι»;', ['journey', 'trip', 'travel']],
  ['Πώς λέγεται στα αγγλικά η «ευκαιρία»;', ['opportunity', 'chance']], ['Πώς λέγεται στα αγγλικά το «σύννεφο»;', ['cloud']], ['Πώς λέγεται στα αγγλικά η «υπομονή»;', ['patience']],
  ['Πώς λέγεται στα αγγλικά το «κλειδί»;', ['key']], ['Πώς λέγεται στα αγγλικά η «εμπιστοσύνη»;', ['trust', 'confidence']], ['Τι σημαίνει στα ελληνικά η λέξη «brave»;', ['γενναίος', 'γενναι', 'θαρραλε']],
  ['Τι σημαίνει στα ελληνικά η λέξη «achieve»;', ['πετυχαίνω', 'πετυχαιν', 'επιτυγχαν', 'καταφερν']], ['Τι σημαίνει στα ελληνικά η λέξη «improve»;', ['βελτιώνω', 'βελτιων']], ['Τι σημαίνει στα ελληνικά η λέξη «grateful»;', ['ευγνώμων', 'ευγνωμ']],
  ['Πώς λέγεται στα αγγλικά το «μαχαίρι»;', ['knife']], ['Πώς λέγεται στα αγγλικά η «πεταλούδα»;', ['butterfly']], ['Τι σημαίνει στα ελληνικά η λέξη «although»;', ['αν και', 'παρότι', 'μολονότι']],
  ['Πώς λέγεται στα αγγλικά η «υγεία»;', ['health']], ['Πώς λέγεται στα αγγλικά το «πρωινό» φαγητό;', ['breakfast']], ['Τι σημαίνει στα ελληνικά η λέξη «weather»;', ['καιρός', 'καιρ']],
];
const Quiz = {
  start(kind) {
    const bank = kind === 'en' ? QUIZ_EN : QUIZ_GEN; this.qs = [...bank].sort(() => Math.random() - 0.5).slice(0, 5); this.i = 0; this.score = 0;
    return 'Κουίζ πέντε ερωτήσεων. Πείτε «πάσο» αν δεν ξέρετε. ' + this.ask();
  },
  ask() {
    const q = this.qs[this.i];
    pending = (raw, nn) => {
      if (/^(σταματα|τελοσ|φτανει|αρκετα|εξοδοσ)/.test(nn)) return `Κουίζ τερματίστηκε. Σκορ: ${this.score} από ${this.i}.`;
      const ok = q[1].some((a) => nn.includes(norm(a)));
      if (ok) this.score++;
      const fb = ok ? pick(['Σωστό!', 'Ακριβώς!', 'Εξαιρετικά, σωστό!']) : `${/πασο|δεν ξερω/.test(nn) ? '' : 'Όχι ακριβώς. '}Η σωστή απάντηση: ${q[1][0]}.`;
      this.i++;
      if (this.i >= this.qs.length) return `${fb} Τέλος! Σκορ: ${this.score} από ${this.qs.length}. ${this.score >= 4 ? 'Εντυπωσιακό.' : this.score >= 2 ? 'Καλή προσπάθεια.' : 'Η επόμενη φορά θα είναι καλύτερη.'}`;
      return `${fb} Ερώτηση ${this.i + 1}: ${this.ask()}`;
    };
    return q[0];
  },
};

/* ---------------- ΕΙΔΗΣΕΙΣ ΤΕΧΝΟΛΟΓΙΑΣ ---------------- */
const TECH_FEEDS = ['https://www.techgear.gr/feed', 'https://unboxholics.com/feed'];
let lastNews = [];
async function rss(url) { const ck = Store.get('rss_' + url, null); if (ck && Date.now() - ck.t < 1800000) return ck.items.map((i) => ({ ...i, date: new Date(i.date) }));
  const res = await rssFetch(url); if (res.length) Store.set('rss_' + url, { t: Date.now(), items: res }); else if (ck) return ck.items.map((i) => ({ ...i, date: new Date(i.date) })); return res; }
async function rssFetch(url) { const j = await fetchJSON('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url)); return j && j.status === 'ok' ? j.items.map((i) => ({ title: i.title.trim(), link: i.link, date: new Date(i.pubDate.replace(' ', 'T')), src: j.feed.title.split(/[-–|]/)[0].trim() })) : []; }
async function techNews() {
  Core.set('thinking'); Sound.think();
  const all = (await Promise.all(TECH_FEEDS.map(rss))).flat().sort((a, b) => b.date - a.date);
  if (!all.length) return 'Δεν μπόρεσα να φέρω ειδήσεις αυτή τη στιγμή. Ελέγξτε τη σύνδεση.';
  lastNews = all.slice(0, 6);
  return { text: 'Τίτλοι τεχνολογίας', html: '<b>Τίτλοι τεχνολογίας</b>' + lastNews.map((n, i) => `<div style="margin-top:6px">${i + 1}. <a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a> <span style="opacity:.6">· ${escapeHtml(n.src)}</span></div>`).join('') + '<div style="margin-top:6px;opacity:.7">Πείτε «άνοιξε το 2» για να διαβάσετε ένα άρθρο.</div>',
    speak: 'Οι τίτλοι τεχνολογίας: ' + lastNews.map((n, i) => `${i + 1}. ${n.title}.`).join(' ') + ' Θέλετε να ανοίξω κάποιο;' };
}

/* ---------------- ΑΘΛΗΤΙΚΑ ---------------- */
const TEAMS_GR = [
  ['ολυμπιακ', 'Olympiacos', 'OLY', 'Ολυμπιακός'], ['παναθηναικ', 'Panathinaikos', 'PAN', 'Παναθηναϊκός'], ['παο', 'Panathinaikos', 'PAN', 'Παναθηναϊκός'],
  ['αεκ', 'AEK', null, 'ΑΕΚ'], ['παοκ', 'PAOK', null, 'ΠΑΟΚ'], ['αρησ', 'Aris', null, 'Άρης'], ['αρη', 'Aris', null, 'Άρης'], ['ατρομητ', 'Atromitos', null, 'Ατρόμητος'],
  ['αστερα', 'Asteras', null, 'Αστέρας Τρίπολης'], ['οφη', 'OFI', null, 'ΟΦΗ'], ['βολο', 'Volos', null, 'Βόλος'], ['λεβαδειακ', 'Levadiakos', null, 'Λεβαδειακός'],
  ['πανσερραικ', 'Panserraikos', null, 'Πανσερραϊκός'], ['λαμια', 'Lamia', null, 'Λαμία'], ['ηρακλη', 'Iraklis', null, 'Ηρακλής'], ['καλαματα', 'Kalamata', null, 'Καλαμάτα'],
  ['παναιτωλικ', 'Panetolikos', null, 'Παναιτωλικός'], ['κηφισια', 'Kifisia', null, 'Κηφισιά'], ['ρεαλ', 'Real Madrid', 'MAD', 'Ρεάλ Μαδρίτης'], ['μπαρτσελον', 'Barcelona', 'BAR', 'Μπαρτσελόνα'],
  ['φενερ', 'Fenerbahce', 'ULK', 'Φενερμπαχτσέ'], ['εφεσ', 'Efes', 'IST', 'Εφές'], ['μακαμπι', 'Maccabi', 'TEL', 'Μακάμπι'], ['παρτιζαν', 'Partizan', 'PAR', 'Παρτιζάν'],
  ['ερυθροσ αστερασ', 'Crvena', 'RED', 'Ερυθρός Αστέρας'], ['ζαλγκιρισ', 'Zalgiris', 'ZAL', 'Ζάλγκιρις'], ['μοναχου', 'Bayern', 'MUN', 'Μπάγερν'], ['μπαγερν', 'Bayern', 'MUN', 'Μπάγερν'],
];
function grName(en) { const t = TEAMS_GR.find((x) => en.toLowerCase().includes(x[1].toLowerCase())); return t ? t[3] : en; }
const teamHit = (w, k) => (k.length <= 4 ? w === k || w === k + 'σ' : w.startsWith(k));
function findTeams(n) { const out = []; TEAMS_GR.forEach((t) => { if ((t[0].includes(' ') ? n.includes(t[0]) : n.split(' ').some((w) => teamHit(w, t[0])))) if (!out.some((o) => o[3] === t[3])) out.push(t); }); return out; }
const FOOT_LEAGUES = [['gre.1', 'Super League'], ['uefa.champions', 'Champions League'], ['uefa.europa', 'Europa League'], ['uefa.europa.conf', 'Conference League']];
const espn = (sport, lg, what = 'scoreboard') => fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${lg}/${what}`);
function fmtEspn(ev) {
  const c = ev.competitions[0], st = ev.status.type.state, home = c.competitors.find((x) => x.homeAway === 'home'), away = c.competitors.find((x) => x.homeAway === 'away');
  const d = new Date(ev.date);
  if (st === 'pre') return `${grName(home.team.displayName)} - ${grName(away.team.displayName)}, ${fmtDate(d)} στις ${hm(d)}`;
  return `${grName(home.team.displayName)} ${home.score} - ${away.score} ${grName(away.team.displayName)}${st === 'in' ? ' (σε εξέλιξη)' : ''}`;
}
async function footballResults(team) {
  Core.set('thinking'); Sound.think();
  const boards = await Promise.all(FOOT_LEAGUES.map(([lg]) => espn('soccer', lg)));
  if (team) {
    const lines = [];
    boards.forEach((b, i) => (b?.events || []).forEach((ev) => { if (ev.name.toLowerCase().includes(team[1].toLowerCase())) lines.push(`${FOOT_LEAGUES[i][1]}: ${fmtEspn(ev)}`); }));
    return lines.length ? `${team[3]} στο ποδόσφαιρο: ${lines.join('. ')}.` : `Δεν βρήκα πρόσφατο ή επόμενο αγώνα ποδοσφαίρου για ${team[3]} αυτή την αγωνιστική.`;
  }
  const gre = boards[0]?.events || [];
  if (!gre.length) return 'Δεν βρήκα αποτελέσματα της Super League αυτή τη στιγμή.';
  const lines = gre.map(fmtEspn);
  return { text: 'Super League', html: '<b>Super League · τρέχουσα αγωνιστική</b>' + lines.map((l) => `<div style="margin-top:4px">${escapeHtml(l)}</div>`).join(''), speak: 'Super League, τρέχουσα αγωνιστική: ' + lines.join('. ') + '.' };
}
async function standings() {
  Core.set('thinking'); Sound.think();
  const j = await fetchJSON('https://site.api.espn.com/apis/v2/sports/soccer/gre.1/standings');
  const e = j?.children?.[0]?.standings?.entries; if (!e) return 'Δεν βρήκα τη βαθμολογία αυτή τη στιγμή.';
  const pts = (x) => x.stats.find((s) => s.name === 'points')?.value ?? 0;
  const sorted = [...e].sort((a, b) => pts(b) - pts(a));
  const lines = sorted.map((x, i) => `${i + 1}. ${grName(x.team.displayName)} ${pts(x)}`);
  return { text: 'Βαθμολογία', html: '<b>Βαθμολογία Super League</b>' + lines.map((l) => `<div>${escapeHtml(l)}</div>`).join(''), speak: 'Βαθμολογία Super League: ' + lines.slice(0, 5).join(', ') + ' βαθμοί.' };
}
async function euroleague(code, label) {
  const j = await fetchJSON(`https://api-live.euroleague.net/v2/competitions/E/seasons/E${new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1}/games?teamCode=${code}`, null, 3);
  if (!j?.data) return null;
  const now = Date.now(), d = j.data.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const last = d.filter((x) => new Date(x.utcDate) < now && (x.local.score || x.road.score)).pop(), next = d.find((x) => new Date(x.utcDate) > now);
  let s = `${label} στη Euroleague: `;
  if (last) s += `τελευταίος αγώνας ${grName(last.local.club.name)} ${last.local.score} - ${last.road.score} ${grName(last.road.club.name)}. `;
  if (next) { const nd = new Date(next.utcDate); s += `Επόμενος: ${grName(next.local.club.name)} - ${grName(next.road.club.name)}, ${fmtDate(nd)} στις ${hm(nd)}.`; }
  return s;
}
async function basketResults(teams) {
  Core.set('thinking'); Sound.think();
  const list = teams && teams.length ? teams.filter((t) => t[2]) : [TEAMS_GR[0], TEAMS_GR[1]];
  if (!list.length) return 'Για αυτή την ομάδα δεν έχω πηγή μπάσκετ. Έχω Euroleague και NBA.';
  const res = []; for (const t of list) { const r = await euroleague(t[2], t[3]); if (r) res.push(r); }
  return res.length ? res.join(' ') : 'Η πηγή της Euroleague δεν απάντησε. Δοκιμάστε ξανά σε λίγο.';
}
async function nbaResults() {
  Core.set('thinking'); const j = await espn('basketball', 'nba'); const ev = j?.events || [];
  if (!ev.length) return 'Δεν βρήκα αγώνες NBA σήμερα.';
  const lines = ev.slice(0, 8).map(fmtEspn);
  return { text: 'NBA', html: '<b>NBA</b>' + lines.map((l) => `<div>${escapeHtml(l)}</div>`).join(''), speak: 'NBA: ' + lines.slice(0, 5).join('. ') + '.' };
}

/* ---------------- ΣΙΝΕΜΑ ---------------- */
async function cinema(kind = 'now') {
  Core.set('thinking'); Sound.think();
  if (S.tmdbKey) {
    const ep = kind === 'upcoming' ? 'upcoming' : 'now_playing';
    const j = await fetchJSON(`https://api.themoviedb.org/3/movie/${ep}?api_key=${encodeURIComponent(S.tmdbKey)}&language=el-GR&region=GR&page=1`);
    if (j?.results?.length) {
      const m = j.results.slice(0, 10);
      return { text: 'Ταινίες', html: `<b>${kind === 'upcoming' ? 'Έρχονται στους κινηματογράφους' : 'Παίζονται τώρα στους κινηματογράφους'}</b>` + m.map((x) => `<div style="margin-top:4px">🎬 ${escapeHtml(x.title)} <span style="opacity:.6">★ ${x.vote_average?.toFixed(1) || '-'}</span></div>`).join('') + '<div style="margin-top:6px"><a href="https://www.athinorama.gr/cinema/" target="_blank" rel="noopener">Αίθουσες και ώρες προβολής →</a></div>',
        speak: (kind === 'upcoming' ? 'Έρχονται σύντομα: ' : 'Στους κινηματογράφους παίζονται: ') + m.slice(0, 7).map((x) => x.title).join(', ') + '.' };
    }
    if (j === null) return 'Το κλειδί TMDB δεν δούλεψε. Ελέγξτε το στις ρυθμίσεις.';
  }
  const news = await rss('https://www.cinemagazine.gr/feed/');
  const html = '<b>Νέα από τον κόσμο του σινεμά</b>' + news.slice(0, 5).map((n) => `<div style="margin-top:4px">🎬 <a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></div>`).join('') +
    '<div style="margin-top:6px"><a href="https://www.athinorama.gr/cinema/" target="_blank" rel="noopener">Τι παίζεται στις αίθουσες (Athinorama) →</a></div><div style="margin-top:6px;opacity:.7">💡 Για τη λίστα με τις ταινίες στις αίθουσες, προσθέστε δωρεάν κλειδί TMDB στις ρυθμίσεις.</div>';
  return { text: 'Σινεμά', html, speak: news.length ? 'Δεν έχω ακόμα κλειδί TMDB για το πρόγραμμα των αιθουσών, οπότε σας λέω τα νέα του σινεμά: ' + news.slice(0, 4).map((n) => n.title).join('. ') + '.' : 'Δεν βρήκα νέα σινεμά. Πατήστε τον σύνδεσμο για το πρόγραμμα των αιθουσών.' };
}

/* ---------------- ΜΕΤΑΦΡΑΣΗ ---------------- */
const LANGS = { αγγλικ: ['en', 'en-US', 'αγγλικά'], γαλλικ: ['fr', 'fr-FR', 'γαλλικά'], γερμανικ: ['de', 'de-DE', 'γερμανικά'], ιταλικ: ['it', 'it-IT', 'ιταλικά'], ισπανικ: ['es', 'es-ES', 'ισπανικά'],
  πορτογαλικ: ['pt', 'pt-PT', 'πορτογαλικά'], ρωσικ: ['ru', 'ru-RU', 'ρωσικά'], τουρκικ: ['tr', 'tr-TR', 'τουρκικά'], αλβανικ: ['sq', 'sq-AL', 'αλβανικά'], βουλγαρικ: ['bg', 'bg-BG', 'βουλγαρικά'],
  ολλανδικ: ['nl', 'nl-NL', 'ολλανδικά'], κινεζικ: ['zh', 'zh-CN', 'κινέζικα'], ιαπωνικ: ['ja', 'ja-JP', 'ιαπωνικά'], αραβικ: ['ar', 'ar-SA', 'αραβικά'], ελληνικ: ['el', 'el-GR', 'ελληνικά'] };
async function translate(text, target) {
  const src = /[a-z]/i.test(text) && !/[α-ω]/i.test(text) ? 'en' : 'el';
  const j = await fetchJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${target}`);
  return j?.responseData?.translatedText || null;
}

/* ---------------- IRON MAN: ΘΕΜΑΤΑ, ΠΡΩΤΟΚΟΛΛΑ, ΣΑΡΩΣΗ ---------------- */
const THEMES = { reactor: ['62,224,255', 'Arc Reactor'], mark: ['255,72,60', 'Mark κόκκινο-χρυσό'], gold: ['255,196,60', 'Χρυσό'], stealth: ['215,232,245', 'Stealth'], vibranium: ['176,110,255', 'Vibranium'], emerald: ['60,240,150', 'Σμαραγδί'] };
function setThemeRGB(rgb) {
  const r = document.documentElement.style;
  r.setProperty('--cyan', `rgb(${rgb})`); r.setProperty('--cyan-dim', `rgba(${rgb},.14)`); r.setProperty('--line', `rgba(${rgb},.28)`);
  r.setProperty('--glow', `0 0 12px rgba(${rgb},.55),0 0 30px rgba(${rgb},.2)`); r.setProperty('--bgglow', `rgba(${rgb},.16)`);
  Core.rgb = rgb; document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#02070d');
}
function applyTheme(k) { if (Party.on) return; setThemeRGB((THEMES[k] || THEMES.reactor)[0]); }
const Party = {
  on: false, t: null, beat: null, step: 0,
  start() {
    if (this.on) return; this.on = true; Sound.init(); const ctx = Sound.ctx; let h = 0; Core.boost = 3; document.body.classList.add('party');
    this.t = setInterval(() => { h = (h + 7) % 360; const c = hsl(h); setThemeRGB(c); }, 90);
    const bpm = 124, sp = 60 / bpm / 2; let next = ctx.currentTime + 0.1;
    const bass = [55, 55, 65.4, 55, 73.4, 55, 65.4, 82.4];
    this.beat = setInterval(() => {
      while (next < ctx.currentTime + 0.2) {
        const s = this.step++ % 16, t = next;
        if (s % 4 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g).connect(Sound.master); o.start(t); o.stop(t + 0.25); }
        if (s % 2 === 1) Sound.noise(0.05, 0.05, t - ctx.currentTime, 8000);
        if (s % 8 === 4) Sound.noise(0.15, 0.12, t - ctx.currentTime, 1800);
        { const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = bass[s % 8]; f.type = 'lowpass'; f.frequency.value = 500 + (s % 4) * 200; g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + sp * 0.9); o.connect(f).connect(g).connect(Sound.master); o.start(t); o.stop(t + sp); }
        if (s % 4 === 2) Sound.tone([440, 523, 659, 784][Math.floor(Math.random() * 4)], 0.12, 'square', 0.04, t - ctx.currentTime);
        next += sp;
      }
    }, 50);
    Banner.set('party', '🎉 ΠΡΩΤΟΚΟΛΛΟ ΠΑΡΤΙ', () => this.stop());
  },
  stop() { if (!this.on) return; this.on = false; clearInterval(this.t); clearInterval(this.beat); Core.boost = 1; document.body.classList.remove('party'); Banner.clear('party'); applyTheme(S.theme); },
};
function hsl(h) { const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.55 - 0.45 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return `${f(0)},${f(8)},${f(4)}`; }
async function redAlert() {
  document.body.classList.add('alert'); setThemeRGB('255,40,50'); Core.boost = 2.5;
  for (let i = 0; i < 4; i++) Sound.tone(600, 0.5, 'sawtooth', 0.12, i * 0.6, 1200);
  await say('Προσοχή. Κόκκινος συναγερμός. Ενεργοποίηση αμυντικών συστημάτων. Σάρωση για απειλές.', { noRelisten: true });
  await sleep(1500); document.body.classList.remove('alert'); Core.boost = 1; applyTheme(S.theme);
  return pick(['Ψευδής συναγερμός. Η μόνη απειλή που εντοπίστηκε ήταν τα άπλυτα πιάτα.', 'Η περίμετρος είναι ασφαλής. Κανένας εισβολέας, μόνο ένα κουνούπι που έχει ήδη εξουδετερωθεί.', 'Όλα καθαρά. Μάλλον ήταν ο λογαριασμός του ρεύματος.']);
}
async function deviceScan() {
  document.body.classList.add('scanning'); Sound.think(); Core.boost = 3;
  for (let i = 0; i < 8; i++) { Sound.tone(800 + i * 150, 0.05, 'square', 0.05, i * 0.18); }
  await sleep(2200); document.body.classList.remove('scanning'); Core.boost = 1;
  const c = navigator.connection, parts = [];
  if (battery) parts.push(`ενέργεια ${Math.round(battery.level * 100)}%${battery.charging ? ', σε φόρτιση' : ''}`);
  parts.push(`σύνδεση ${navigator.onLine ? (c?.effectiveType ? c.effectiveType.toUpperCase() : 'ενεργή') : 'εκτός'}`);
  if (navigator.hardwareConcurrency) parts.push(`${navigator.hardwareConcurrency} πυρήνες επεξεργαστή`);
  if (navigator.deviceMemory) parts.push(`περίπου ${navigator.deviceMemory} GB μνήμη`);
  parts.push(`οθόνη ${screen.width} επί ${screen.height}`);
  parts.push(`νερό σήμερα ${(waterToday() / 1000).toFixed(1)} λίτρα από ${(waterGoal() / 1000).toFixed(1)}`);
  return `Σάρωση ολοκληρώθηκε: ${parts.join(', ')}. ${waterToday() < waterGoal() / 2 && new Date().getHours() > 14 ? 'Σημείωση: τα επίπεδα ενυδάτωσης του χειριστή είναι χαμηλά.' : 'Όλα τα συστήματα εντός ορίων.'}`;
}

/* ---------------- ΦΩΝΗΤΙΚΗ ΑΦΥΠΝΙΣΗ («Τζάρβις…») & ΣΥΝΕΧΗΣ ΑΚΡΟΑΣΗ ---------------- */
if (S.handsFree === undefined) { S.handsFree = true; saveSettings(); }
const Wake = {
  on: false, rec: null, armed: false, paused: false, lock: null, armT: null,
  SR: () => window.SpeechRecognition || window.webkitSpeechRecognition,
  start() {
    if (!this.SR()) { addMsg('ai', 'Αυτός ο browser δεν υποστηρίζει συνεχή ακρόαση. Δοκιμάστε Chrome σε Android.'); return false; }
    this.on = true; this.paused = false; this.loop(); this.keepAwake();
    Banner.set('wake', S.handsFree ? '🎙 Σας ακούω, απλώς μιλήστε' : `🎙 Πείτε «${S.assistant}» για να με καλέσετε`, () => { S.wake = false; S.handsFree = false; saveSettings(); fillSettings(); this.stop(); }); return true;
  },
  stop() { this.on = false; this.disarm(); try { this.rec && this.rec.abort(); } catch {} this.rec = null; try { this.lock && this.lock.release(); } catch {} this.lock = null; Banner.clear('wake'); },
  pause() { this.paused = true; try { this.rec && this.rec.abort(); } catch {} this.rec = null; },
  resume() { this.paused = false; this.loop(); },
  async keepAwake() { try { if ('wakeLock' in navigator) this.lock = await navigator.wakeLock.request('screen'); } catch {} },
  re() { const names = [norm(S.assistant), 'τζαρβισ', 'τζαρβι', 'τζαρβεσ', 'jarvis', 'ζαρβισ', 'τσαρβισ', 'τζαρμπισ'].filter(Boolean); return new RegExp('(^|\\s)(' + [...new Set(names)].join('|') + ')(\\s|$)'); },
  loop() {
    if (!this.on || this.paused || this.rec || Voice.listening || document.hidden) return;
    const r = new (this.SR())(); r.lang = 'el-GR'; r.continuous = true; r.interimResults = true;
    if ('processLocally' in r) { try { r.processLocally = !navigator.onLine; } catch {} }
    r.onresult = (e) => {
      if (Voice.speakingNow || Date.now() - Voice.lastEnd < 800) { $('#interim').textContent = ''; return; }
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], t = res[0].transcript;
        if (S.handsFree && !this.armed) {
          // Συνεχής ακρόαση: ό,τι λέτε είναι εντολή, χωρίς κουμπί και χωρίς όνομα
          if (!res.isFinal) { $('#interim').textContent = t; if (Core.state === 'idle') Core.set('listening'); continue; }
          $('#interim').textContent = ''; if (Core.state === 'listening') Core.set('idle');
          let cmd = t.trim(); const m = norm(cmd).match(this.re()); if (m && m.index === 0) { const w = cmd.split(/\s+/); cmd = w.slice(m[0].trim().split(' ').length).join(' ').trim(); }
          if (norm(cmd).length < 2) { if (m) this.arm(); continue; }
          Sound.tap(); handle(cmd); continue;
        }
        if (this.armed) { $('#interim').textContent = t; if (res.isFinal) { this.disarm(); handle(t); } continue; }
        if (!res.isFinal) continue;
        const n = norm(t), m = n.match(this.re()); if (!m) continue;
        const restN = n.slice(m.index + m[0].length).trim();
        if (restN.length > 2) { const w = t.trim().split(/\s+/); handle(w.slice(w.length - restN.split(' ').length).join(' ')); }
        else this.arm();
      }
    };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { S.wake = false; saveSettings(); fillSettings(); this.stop(); addMsg('ai', 'Δεν επιτράπηκε η χρήση μικροφώνου για τη φωνητική ενεργοποίηση.'); } };
    r.onend = () => { this.rec = null; if (this.on && !this.paused) setTimeout(() => this.loop(), 300); };
    this.rec = r; try { r.start(); } catch { this.rec = null; setTimeout(() => this.loop(), 1500); }
  },
  arm() {
    this.armed = true; Sound.listen(); $('#interim').textContent = 'Σας ακούω...'; clearTimeout(this.armT); this.armT = setTimeout(() => this.disarm(), 20000);
    const line = callReply(); addMsg('ai', line); if (window.Standby) Standby.flash(line);
    Voice.speak(line).then(() => { if (!this.armed) return; Core.set('listening'); $('#interim').textContent = 'Σας ακούω...'; clearTimeout(this.armT); this.armT = setTimeout(() => this.disarm(), 10000); });
  },
  disarm() { this.armed = false; clearTimeout(this.armT); $('#interim').textContent = ''; if (Core.state === 'listening' && !Voice.listening) Core.set('idle'); },
};
window.Wake = Wake;
document.addEventListener('visibilitychange', () => { if (!document.hidden && Wake.on) { Wake.keepAwake(); Wake.loop(); } });

/* ---------------- ΕΠΑΦΕΣ / ΚΛΗΣΕΙΣ ---------------- */
const STOP_WORDS = new Set(['τον', 'την', 'τη', 'το', 'τα', 'του', 'της', 'των', 'στον', 'στην', 'στη', 'στο', 'ο', 'η', 'οι', 'σε', 'με', 'για', 'ειναι', 'εχει', 'και', 'μου', 'τηλεφωνο', 'αριθμο', 'αριθμοσ', 'κινητο', 'επαφη', 'επαφεσ', 'νεα', 'προσθεσε', 'αποθηκευσε', 'καταχωρησε', 'γραψε', 'θυμησου', 'οτι', 'γενεθλια', 'στισ', 'στιs', 'αυτο', 'ηταν', 'κανει', 'γεννηθηκε'].map((w) => norm(w)));
function findContact(q) { const n = norm(q).split(' ').filter((w) => !STOP_WORDS.has(w)).join(' '); if (!n) return null; return contacts.find((c) => norm(c.name) === n) || contacts.find((c) => nameMatch(c.name, n)) || contacts.find((c) => norm(c.name).split(' ').some((w) => nameMatch(w, n))); }
function cleanPhone(p) { return p.replace(/[^\d+]/g, ''); }
function intlPhone(p) { p = cleanPhone(p); if (p.startsWith('+')) return p.slice(1); if (p.startsWith('00')) return p.slice(2); if (p.length === 10 && /^[26]/.test(p)) return '30' + p; return p; }
async function importContacts() {
  if (!('contacts' in navigator && 'ContactsManager' in window)) { toast('ΕΠΑΦΕΣ', 'Η εισαγωγή επαφών υποστηρίζεται μόνο σε Chrome για Android. Προσθέστε τις χειροκίνητα ή με τη φωνή.'); return; }
  try {
    const sel = await navigator.contacts.select(['name', 'tel'], { multiple: true }); let k = 0;
    sel.forEach((c) => { const name = (c.name && c.name[0]) || '', tel = c.tel && c.tel[0]; if (name && tel && !contacts.some((x) => cleanPhone(x.phone) === cleanPhone(tel))) { contacts.push({ id: uid(), name, phone: tel }); k++; } });
    Store.set('contacts', contacts); renderMem(); toast('ΕΠΑΦΕΣ', `Εισήχθησαν ${k} επαφές.`);
  } catch {}
}

/* ---------------- ΠΡΩΙΝΗ ΕΝΗΜΕΡΩΣΗ ---------------- */
function agendaOn(d) { const wd = String(d.getDay()); return agenda.filter((a) => a.day === '*' || a.day === wd).sort((a, b) => a.time.localeCompare(b.time)); }
function birthdaysOn(d) { return birthdays.filter((b) => b.d === d.getDate() && b.m === d.getMonth() + 1); }
async function morningBriefing(opts = {}) {
  S.lastBrief = todayKey(); saveSettings(); touchDay();
  const d = new Date(), html = [], sp = [];
  const add = (icon, text) => { html.push(`<div style="margin-top:5px">${icon} ${escapeHtml(text)}</div>`); sp.push(text); };
  const head = `${d.getHours() < 12 ? 'Καλημέρα' : hello()}${nmc()}. Σήμερα είναι ${fmtDate(d)} ${d.getFullYear()}, και η ώρα ${hm(d)}.`;
  Core.set('thinking'); Sound.think();
  const cities = (S.cities || '').split(',').map((c) => c.trim()).filter(Boolean);
  const ws = await Promise.all(cities.map((c) => getWeather(c).catch(() => null)));
  ws.forEach((w, i) => { if (!w) return; const pr = w.daily.precipitation_probability_max[0];
    add('☁', `${cities[i]}: ${(WMO[w.cur.weather_code] || '').toLowerCase()}, ${Math.round(w.cur.temperature_2m)} βαθμοί τώρα, μέγιστη ${Math.round(w.daily.temperature_2m_max[0])}${pr > 40 ? `, πιθανότητα βροχής ${pr}%` : ''}.`); });
  const nd = namedaysOn(d); if (nd.length) add('🎉', `Γιορτάζουν σήμερα: ${nd.join(', ')}.`);
  const cel = celebratingContacts(d); if (cel.length) add('📞', `Από τους δικούς σας γιορτάζει: ${cel.join(', ')}. Μην ξεχάσετε να ευχηθείτε!`);
  const bd = birthdaysOn(d); if (bd.length) add('🎂', `Σήμερα έχει γενέθλια: ${bd.map((b) => b.name).join(', ')}!`);
  const bdT = birthdaysOn(addDays(d, 1)); if (bdT.length) add('🎁', `Αύριο έχει γενέθλια: ${bdT.map((b) => b.name).join(', ')}. Ίσως χρειάζεται δώρο.`);
  const ag = agendaOn(d); if (ag.length) add('🗓', `Το πρόγραμμά σας σήμερα: ${ag.map((a) => `${a.time} ${a.text}`).join(', ')}.`);
  const open = todos.filter((t) => !t.done); if (open.length) add('☰', `Εκκρεμότητες: ${open.slice(0, 5).map((t) => t.text).join(', ')}${open.length > 5 ? ` και άλλες ${open.length - 5}` : ''}.`);
  const rem = reminders.filter((r) => sameDay(new Date(r.due), d)); if (rem.length) add('🔔', `Υπενθυμίσεις σήμερα: ${rem.map((r) => `${r.kind === 'alarm' ? 'ξυπνητήρι' : r.kind === 'timer' ? 'χρονόμετρο' : r.text} στις ${hm(new Date(r.due))}`).join(', ')}.`);
  if (window.briefingExtras) { try { await briefingExtras(add, d); } catch {} }
  add('💧', `Στόχος νερού σήμερα: ${(waterGoal() / 1000).toFixed(1)} λίτρα, περίπου ${Math.round(waterGoal() / 250)} ποτήρια.`);
  add('✨', dailyQuote());
  add('🎯', dailyChallenge());
  await say(head, { html: `<b>${escapeHtml(head)}</b>` + html.join(''), speak: head + ' ' + sp.join(' '), noRelisten: true });
  if (opts.noAsk) return;
  pending = (r, nn) => (/^(ναι|οκ|ok|βεβαια|πεσ|διαβασε|παμε)/.test(nn) ? techNews() : /^(οχι|οχι ευχαριστω|οχι τωρα|ασ ειναι)/.test(nn) ? 'Εντάξει. Καλή και δημιουργική μέρα!' : null);
  say('Θέλετε να ακούσετε τους τίτλους τεχνολογίας;');
}

/* ---------------- ΠΕΡΙΟΔΙΚΟΙ ΕΛΕΓΧΟΙ ---------------- */
const fired = Store.get('fired', {});
function once(key) { if (fired[key]) return false; fired[key] = 1; Object.keys(fired).forEach((k) => { if (!k.includes(todayKey())) delete fired[k]; }); Store.set('fired', fired); return true; }
function tickFeatures() {
  const d = new Date(), now = hm(d), day = todayKey(), mins = d.getHours() * 60 + d.getMinutes();
  // πρόγραμμα: ειδοποίηση 10 λεπτά πριν
  agendaOn(d).forEach((a) => { const [h, m] = a.time.split(':').map(Number); if (mins === h * 60 + m - 10 && once(`ag-${a.id}-${day}`)) { const msg = `Σε 10 λεπτά: ${a.text}.`; toast('ΠΡΟΓΡΑΜΜΑ', msg); notify('Πρόγραμμα', msg); Sound.alarm(); say(msg, { noRelisten: true }); } });
  // νερό: κάθε 2 ώρες 10:00-21:00 αν είστε πίσω
  if (S.waterRemind && d.getHours() >= 10 && d.getHours() <= 21 && d.getMinutes() === 0 && d.getHours() % 2 === 0) {
    const expect = waterGoal() * ((mins - 8 * 60) / (14 * 60));
    if (waterToday() < expect && once(`water-${d.getHours()}-${day}`)) { const msg = `Ώρα για ένα ποτήρι νερό${nmc()}. Έχετε πιει ${(waterToday() / 1000).toFixed(1)} από ${(waterGoal() / 1000).toFixed(1)} λίτρα.`; toast('ΕΝΥΔΑΤΩΣΗ', msg); notify('Νερό', msg); say(msg, { noRelisten: true }); }
  }
  // ύπνος: υπενθύμιση 30' πριν την ιδανική ώρα (5 κύκλοι)
  const { h, m } = parseHM(S.wakeTime); const w = new Date(); w.setHours(h, m, 0, 0); if (w < d) w.setDate(w.getDate() + 1);
  const bed = new Date(w.getTime() - (5 * 90 + 15) * 60000), nudge = new Date(bed.getTime() - 30 * 60000);
  if (hm(nudge) === now && once(`bed-${day}`)) { const msg = `Σε μισή ώρα, στις ${hm(bed)}, είναι η ιδανική ώρα ύπνου για να ξυπνήσετε ξεκούραστος στις ${S.wakeTime}. Ώρα να κλείσουν οι οθόνες.`; toast('ΥΠΝΟΣ', msg); notify('Ύπνος', msg); say(msg, { noRelisten: true }); }
  updateWaterWidget();
}

/* ---------------- ΚΕΝΤΡΟ ΔΕΔΟΜΕΝΩΝ (καρτέλες) ---------------- */
const DAY_OPTS = [['*', 'Καθημερινά'], ['1', 'Δευτέρα'], ['2', 'Τρίτη'], ['3', 'Τετάρτη'], ['4', 'Πέμπτη'], ['5', 'Παρασκευή'], ['6', 'Σάββατο'], ['0', 'Κυριακή']];
const dayLabel = (k) => (DAY_OPTS.find((x) => x[0] === k) || ['', ''])[1];
const TABS = [
  { k: 'todos', label: 'ΛΙΣΤΑ', get: () => todos, set: (v) => { todos = v; }, fields: [{ n: 'text', ph: 'Νέα εργασία ή ψώνι...' }], make: (f) => ({ text: f.text, done: false }), line: (it) => [it.text, ''], toggle: true },
  { k: 'agenda', label: 'ΠΡΟΓΡΑΜΜΑ', get: () => agenda, set: (v) => { agenda = v; }, fields: [{ n: 'day', type: 'select', opts: DAY_OPTS }, { n: 'time', type: 'time', val: '09:00' }, { n: 'text', ph: 'π.χ. Μάθημα αγγλικών' }],
    make: (f) => ({ id: uid(), day: f.day, time: f.time, text: f.text }), line: (it) => [it.text, `${dayLabel(it.day)} · ${it.time}`], sort: (a, b) => (a.day === '*' ? -1 : +a.day || 7) - (b.day === '*' ? -1 : +b.day || 7) || a.time.localeCompare(b.time) },
  { k: 'birthdays', label: 'ΓΕΝΕΘΛΙΑ', get: () => birthdays, set: (v) => { birthdays = v; }, fields: [{ n: 'name', ph: 'Όνομα' }, { n: 'date', type: 'date' }],
    make: (f) => { const d = new Date(f.date); return isNaN(d) ? null : { id: uid(), name: f.name, d: d.getDate(), m: d.getMonth() + 1 }; }, line: (it) => [it.name, `${it.d} ${MONTHS[it.m - 1]}`], sort: (a, b) => a.m - b.m || a.d - b.d },
  { k: 'contacts', label: 'ΕΠΑΦΕΣ', get: () => contacts, set: (v) => { contacts = v; }, fields: [{ n: 'name', ph: 'Όνομα (π.χ. Μαμά)' }, { n: 'phone', type: 'tel', ph: 'Τηλέφωνο' }],
    make: (f) => ({ id: uid(), name: f.name, phone: f.phone }), line: (it) => [it.name, it.phone], call: true, extra: true, sort: (a, b) => a.name.localeCompare(b.name, 'el') },
  { k: 'expenses', label: 'ΕΞΟΔΑ', get: () => expenses, set: (v) => { expenses = v; }, fields: [{ n: 'amount', type: 'number', ph: '€', step: '0.01' }, { n: 'note', ph: 'π.χ. καφές, βενζίνη' }],
    make: (f) => (+f.amount > 0 ? { id: uid(), amount: +f.amount, note: f.note, cat: guessCat(f.note), at: Date.now() } : null), line: (it) => [`${eur(it.amount)} · ${it.note || it.cat}`, `${it.cat} · ${new Date(it.at).toLocaleDateString('el-GR')}`], sort: (a, b) => b.at - a.at,
    head: () => { const m = sum(spentSince(monthStart())); return `Μήνας: <b>${eur(m)}</b>${S.budget ? ` / ${eur(S.budget)}` : ''} · Εβδομάδα: ${eur(sum(spentSince(weekStart())))}`; } },
  { k: 'journal', label: 'ΗΜΕΡΟΛΟΓΙΟ', get: () => journal, set: (v) => { journal = v; }, fields: [{ n: 'text', ph: 'Σήμερα είμαι ευγνώμων για...' }], make: (f) => ({ id: uid(), text: f.text, at: Date.now(), kind: 'note' }),
    line: (it) => [it.text, new Date(it.at).toLocaleString('el-GR')], sort: (a, b) => b.at - a.at,
    head: () => `Διαλογισμοί: <b>${stats.meditations}</b> · Αναπνοές: <b>${stats.breaths}</b> · Προπονήσεις: <b>${stats.workouts}</b> · Pomodoro: <b>${stats.pomodoros}</b> · Μέρες: <b>${stats.days}</b>` },
  { k: 'notes', label: 'ΣΗΜΕΙΩΣΕΙΣ', get: () => notes, set: (v) => { notes = v; }, fields: [{ n: 'text', ph: 'Νέα σημείωση...' }], make: (f) => ({ text: f.text, at: Date.now() }), line: (it) => [it.text, new Date(it.at).toLocaleString('el-GR')], unshift: true },
  { k: 'reminders', label: 'ΥΠΕΝΘΥΜΙΣΕΙΣ', get: () => reminders, set: (v) => { reminders = v; }, line: (it) => [it.kind === 'timer' ? 'Χρονόμετρο' : it.kind === 'alarm' ? 'Ξυπνητήρι' : it.text, new Date(it.due).toLocaleString('el-GR')], onDel: (it) => clearTimeout(timers.get(it.id)),
    head: () => 'Προσθέστε με τη φωνή: «θύμισέ μου σε 20 λεπτά να...» ή «ξύπνησέ με στις 7».' },
];
let memTab = 'todos';
function renderMem() {
  if (!$('#memTabs')) return;
  const tab = TABS.find((t) => t.k === memTab);
  $('#memTabs').innerHTML = TABS.map((t) => `<button class="tab${t.k === memTab ? ' active' : ''}" data-tab="${t.k}">${t.label}</button>`).join('');
  $$('#memTabs .tab').forEach((b) => (b.onclick = () => { Sound.tap(); memTab = b.dataset.tab; renderMem(); }));
  $('#memTabs .active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  $('#memHead').innerHTML = tab.head ? tab.head() : '';
  const form = $('#memForm'); form.innerHTML = '';
  if (tab.fields) {
    tab.fields.forEach((f) => {
      let el; if (f.type === 'select') { el = document.createElement('select'); f.opts.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; el.appendChild(o); }); }
      else { el = document.createElement('input'); el.type = f.type || 'text'; if (f.ph) el.placeholder = f.ph; if (f.val) el.value = f.val; if (f.step) el.step = f.step; if (f.type === 'number') el.inputMode = 'decimal'; }
      el.name = f.n; form.appendChild(el);
    });
    const b = document.createElement('button'); b.type = 'submit'; b.textContent = '+'; form.appendChild(b);
    form.onsubmit = (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(form)); if (tab.fields.some((x) => x.type !== 'select' && !(tab.opt || []).includes(x.n) && !String(f[x.n] || '').trim())) { Sound.error(); return; }
      const it = tab.make(f); if (it === false) { Sound.reply(); renderMem(); return; } if (!it) { Sound.error(); return; } const list = tab.get(); tab.unshift ? list.unshift(it) : list.push(it); Store.set(tab.k, list); Sound.reply(); renderMem(); };
  }
  if (tab.extra) { const b = document.createElement('button'); b.type = 'button'; b.className = 'wide'; b.textContent = '⇩ ΕΙΣΑΓΩΓΗ ΑΠΟ ΤΙΣ ΕΠΑΦΕΣ ΤΟΥ ΚΙΝΗΤΟΥ'; b.onclick = importContacts; form.appendChild(b); }
  const ul = $('#memList'); ul.innerHTML = '';
  if (tab.render) { tab.render(ul); return; }
  let list = tab.get(); const view = tab.sort ? [...list].sort(tab.sort) : list;
  if (!view.length) { ul.innerHTML = '<li class="empty">— κενό —</li>'; return; }
  view.forEach((it) => {
    const li = document.createElement('li'); const [a, b] = tab.line(it);
    if (tab.toggle) li.className = it.done ? 'done' : '';
    li.innerHTML = `${tab.toggle ? `<button data-a="t">${it.done ? '✓' : ''}</button>` : ''}<span></span>${tab.call ? '<button data-a="c">✆</button>' : ''}<button data-a="d">✕</button>`;
    li.querySelector('span').innerHTML = escapeHtml(a) + (b ? `<small>${escapeHtml(b)}</small>` : '');
    li.querySelectorAll('button').forEach((btn) => (btn.onclick = () => {
      Sound.tap(); const act = btn.dataset.a;
      if (act === 't') it.done = !it.done;
      else if (act === 'c') { location.href = 'tel:' + cleanPhone(it.phone); return; }
      else { tab.onDel && tab.onDel(it); list = list.filter((x) => x !== it); tab.set(list); }
      Store.set(tab.k, tab.get()); renderMem();
    }));
    ul.appendChild(li);
  });
}

/* ---------------- ΒΟΗΘΕΙΑ ---------------- */
function helpHtml() {
  const G = [
    ['☀ Ξεκίνημα μέρας', ['«Καλημέρα» (καιρός, γιορτές, πρόγραμμα, κίνητρο)', '«Ποιος γιορτάζει σήμερα;»', '«Δώσε μου μια πρόκληση»']],
    ['🗓 Οργάνωση', ['«Τι έχω αύριο;»', '«Πρόσθεσε στο πρόγραμμα κάθε Δευτέρα στις 18:00 γυμναστήριο»', '«Τα γενέθλια της Μαρίας είναι στις 5 Μαρτίου»', '«Θύμισέ μου σε 20 λεπτά να...»', '«Ξύπνησέ με στις 7:30»']],
    ['📞 Επικοινωνία', ['«Πρόσθεσε επαφή Μαμά 6912345678»', '«Πάρε τη μαμά»', '«Στείλε μήνυμα στον Γιώργο ότι αργώ»', '«Στείλε WhatsApp στη Μαρία»']],
    ['🧘 Ευεξία', ['«Κάνε μου αναπνοές» / «Αναπνοή 4-7-8»', '«Διαλογισμός τσάκρα» / «Σάρωση σώματος»', '«Πρόγραμμα διαλογισμού»', '«Βάλε μουσική 432» / «Μουσική για το τσάκρα της καρδιάς»', '«Μουσική για ύπνο 30 λεπτά»']],
    ['💪 Σώμα', ['«Ήπια ένα ποτήρι νερό» / «Πόσο νερό ήπια;»', '«Πρόγραμμα γυμναστικής» / «Ξεκίνα γυμναστική κοιλιακών»', '«Πότε να κοιμηθώ;» / «Αν κοιμηθώ τώρα πότε να ξυπνήσω;»']],
    ['💶 Χρήματα', ['«Ξόδεψα 4,50 σε καφέ»', '«Πόσα ξόδεψα αυτόν τον μήνα;»', '«Βάλε προϋπολογισμό 600 ευρώ»', '«Οικονομική συμβουλή»']],
    ['📚 Μελέτη & δουλειά', ['«Ξεκίνα pomodoro»', '«Πώς λέγεται παράθυρο στα αγγλικά;»', '«Κάνε μου κουίζ» / «Κουίζ αγγλικών»', '«Συμβουλή για διάβασμα»']],
    ['⚽ Αθλητικά & σινεμά', ['«Αποτελέσματα ποδοσφαίρου» / «Βαθμολογία»', '«Πώς τα πήγε ο Ολυμπιακός;»', '«Αποτελέσματα μπάσκετ» / «NBA»', '«Τι ταινίες παίζουν στους κινηματογράφους;»', '«Ειδήσεις τεχνολογίας»']],
    ['🦾 Iron Man', ['«Πρωτόκολλο πάρτι» / «Τέλος πάρτι»', '«Κόκκινος συναγερμός»', '«Κάνε σάρωση»', '«Θέμα κόκκινο / χρυσό / stealth / vibranium»', 'Φωνητική ενεργοποίηση: πείτε «Τζάρβις...»']],
    ['🛠 Βασικά', ['Ώρα, καιρός, χρονόμετρα, σημειώσεις, λίστα, πράξεις, νομίσματα, Βικιπαίδεια, Google, YouTube, χάρτες']],
  ];
  return '<b>Να τι μπορώ να κάνω για εσάς:</b>' + G.map(([h, l]) => `<div style="margin-top:8px"><b>${h}</b>${l.map((x) => `<div style="opacity:.8;margin-left:6px">${x}</div>`).join('')}</div>`).join('') + (hasAI() ? '' : '<div style="margin-top:8px;opacity:.75">💡 Για ελεύθερη συζήτηση σε οτιδήποτε, προσθέστε δωρεάν κλειδί Gemini στις ρυθμίσεις.</div>');
}

/* ---------------- ΕΝΤΟΛΕΣ (προηγούνται των βασικών) ---------------- */
const yes = (nn) => /^(ναι|οκ|ok|βεβαια|εντα|παμε|σιγουρα|ναι παμε|ξεκινα)/.test(nn);
const F = [
  // διακοπή όλων
  { re: /^(σταματα|σταματησε|stop|τελοσ|σιωπη|σκασε|σωπα|ησυχια|αρκετα|φτανει)$/, run: () => { speechSynthesis.cancel(); if (Session.active) Session.stop(); Music.stop(2); Party.stop(); return { silent: true, text: '■' }; } },
  // βοήθεια
  { re: /(βοηθεια|τι μπορεισ|τι ξερεισ να κανεισ|εντολεσ|δυνατοτητεσ)/, run: () => ({ text: 'Βοήθεια', html: helpHtml(), speak: 'Μπορώ να σας ενημερώνω κάθε πρωί, να οργανώνω το πρόγραμμα, τα γενέθλια και τις επαφές σας, να σας καθοδηγώ σε αναπνοές, διαλογισμό και γυμναστική, να μετράω νερό και έξοδα, να σας λέω αθλητικά, ειδήσεις και ταινίες, και πολλά ακόμα. Δείτε τη λίστα στην οθόνη.' }) },

  // πρωινή ενημέρωση
  { re: /^(καλημερα|ενημερωσε με|πρωινη ενημερωση|τι νεα|briefing)/, run: () => { morningBriefing(); return { silent: true, text: '' }; } },
  { re: /(ποιοσ γιορταζει|ποιοι γιορταζουν|γιορτεσ σημερα|εορτολογιο|ποια γιορτη)/, run: (raw, n) => {
    const d = /αυριο/.test(n) ? addDays(new Date(), 1) : new Date(); const nd = namedaysOn(d), cel = celebratingContacts(d);
    return nd.length ? `${/αυριο/.test(n) ? 'Αύριο' : 'Σήμερα'} γιορτάζουν: ${nd.join(', ')}.${cel.length ? ' Από τους δικούς σας: ' + cel.join(', ') + '.' : ''}` : `${/αυριο/.test(n) ? 'Αύριο' : 'Σήμερα'} δεν έχω καταγεγραμμένη κάποια μεγάλη γιορτή.`; } },
  { re: /ποτε γιορταζει\s+(?:ο|η|το)?\s*(.+)/, run: (raw, n, m) => { const q = m[1].split(' ')[0]; const qr = cap(rawSpan(raw, n, q)); const ds = whenNameday(q); return ds.length ? `${qr}: γιορτάζει ${ds.map(fmtDate).join(' και ')}.` : `Δεν βρήκα το όνομα ${qr} στο εορτολόγιό μου.`; } },
  { re: /(πεσ μου κατι (αισιοδοξο|ομορφο|εμπνευστικο|θετικο|ενθαρρυντικο)|αισιοδοξο μηνυμα|θετικο μηνυμα|ρητο|εμπνευσ|κινητρο|ενθαρρυν|δωσε μου δυναμη)/, test: (n) => !/(στειλε|γραψε)/.test(n), run: () => pick(QUOTES) },
  { re: /(προκληση|challenge)/, run: () => dailyChallenge() },
  { re: /(ειμαι ευγνωμων|ευγνωμονω)\s+(?:για\s+)?(.+)/, run: (raw, n, m) => { journal.push({ id: uid(), text: rawSpan(raw, n, m[2]), at: Date.now(), kind: 'gratitude' }); Store.set('journal', journal); return 'Καταγράφηκε στο ημερολόγιο ευγνωμοσύνης. Η ευγνωμοσύνη είναι καύσιμο για τον εγκέφαλο.'; } },
  { re: /(ειμαι|νιωθω)\s+(λυπημεν|στεναχωρημεν|αγχωμεν|στρεσαρισμεν|κουρασμεν|θυμωμεν|χαλια|ασχημα|μονοσ|μονη|πεσμεν|αγχοσ)/, run: (raw, n) => {
    const tired = /κουρασμεν/.test(n); pending = (r, nn) => (yes(nn) ? (tired ? startBreathing('energy') : startBreathing('478'), 'Ξεκινάμε. Ακολουθήστε τον κύκλο.') : null);
    return pick(['Λυπάμαι που νιώθετε έτσι. Τα συναισθήματα είναι σαν τον καιρό: περνάνε.', 'Είμαι εδώ. Δεν χρειάζεται να τα έχετε όλα λυμένα σήμερα.', 'Σας ακούω. Ακόμα και οι πιο δυνατοί άνθρωποι έχουν τέτοιες μέρες.']) + (tired ? ' Θέλετε μια σύντομη ενεργειακή αναπνοή για να πάρετε μπρος;' : ' Θέλετε να κάνουμε μαζί δύο λεπτά αναπνοές για να ηρεμήσει το σώμα;'); } },
  { re: /(στατιστικα|προοδοσ μου|πωσ παω|πρωτοκολλο εξελιξησ)/, run: () => `Η πρόοδός σας: ${stats.days} μέρες μαζί, ${stats.meditations} διαλογισμοί, ${stats.breaths} ασκήσεις αναπνοής, ${stats.workouts} προπονήσεις, ${stats.pomodoros} κύκλοι συγκέντρωσης, ${journal.length} καταγραφές στο ημερολόγιο. Συνεχίστε έτσι.` },

  // καληνύχτα: αναστοχασμός + ύπνος
  { re: /^(καληνυχτα|πεφτω για υπνο|παω για υπνο|θα κοιμηθω)/, run: () => {
    const w = new Date(Date.now() + (5 * 90 + 15) * 60000), w6 = new Date(Date.now() + (6 * 90 + 15) * 60000);
    pending = (raw, nn) => { if (/^(οχι|τιποτα|δεν ξερω)/.test(nn)) return 'Δεν πειράζει. Αύριο είναι μια νέα μέρα. Καληνύχτα.'; journal.push({ id: uid(), text: raw, at: Date.now(), kind: 'reflection' }); Store.set('journal', journal); return 'Καταγράφηκε στο ημερολόγιο. Να είστε περήφανος για τη σημερινή μέρα. Καληνύχτα.'; };
    return `Καληνύχτα${nmc()}. Αν κοιμηθείτε τώρα, ιδανική ώρα αφύπνισης είναι ${hm(w)} ή ${hm(w6)}, στο τέλος ενός κύκλου ύπνου. Πριν κλείσετε τα μάτια, πείτε μου ένα πράγμα που πήγε καλά σήμερα.`; } },

  // ύπνος
  { re: /(ποτε (να|πρεπει να) κοιμηθω|τι ωρα (να|πρεπει να) κοιμηθω|ωρα για υπνο)/, run: (raw, n) => { const w = wakeDateFrom(n); const b = bedtimesFor(w);
    return `Για να ξυπνήσετε ξεκούραστος στις ${hm(w)}, κοιμηθείτε στις ${hm(b[1].t)} για πέντε κύκλους, δηλαδή επτάμισι ώρες, ή στις ${hm(b[0].t)} για έξι κύκλους, εννέα ώρες. Το ${hm(b[2].t)} είναι το αργότερο, με έξι ώρες ύπνο. Υπολογίζω δεκαπέντε λεπτά για να σας πάρει ο ύπνος.`; } },
  { re: /(ποτε να ξυπνησω|αν κοιμηθω τωρα|ποτε πρεπει να ξυπνησω)/, run: () => { const t = [4, 5, 6].map((c) => new Date(Date.now() + (c * 90 + 15) * 60000));
    pending = (raw, nn) => (yes(nn) ? (addReminder('', t[1], 'alarm'), `Ξυπνητήρι για τις ${hm(t[1])}. Καληνύχτα.`) : null);
    return `Αν κοιμηθείτε τώρα, ξυπνήστε στις ${hm(t[1])} για πέντε κύκλους ή στις ${hm(t[2])} για έξι. Το ${hm(t[0])} είναι πιο σύντομο, τέσσερις κύκλοι. Να βάλω ξυπνητήρι για τις ${hm(t[1])};`; } },
  { re: /(ξυπναω|ξυπνω|θελω να ξυπναω) (καθε μερα |συνηθωσ )?στισ/, run: (raw, n) => { const d = parseClock(n); if (!d) return null; S.wakeTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`; saveSettings(); fillSettings(); const b = bedtimesFor(d); return `Καταχωρήθηκε: ξυπνάτε στις ${hm(d)}. Θα σας υπενθυμίζω κάθε βράδυ να κοιμηθείτε κατά τις ${hm(b[1].t)}.`; } },

  // νερό
  { re: /(ηπια|επια|πηρα)\s.*(νερο|ποτηρ|μπουκαλ|λιτρ)/, run: (raw, n) => { const ml = parseWaterMl(n); addWater(ml); const t = waterToday(), g = waterGoal();
    return t >= g ? `Μπράβο! Πετύχατε τον στόχο των ${(g / 1000).toFixed(1)} λίτρων. Τα κύτταρά σας σάς ευχαριστούν.` : `Καταγράφηκαν ${ml} ml. Σύνολο ${(t / 1000).toFixed(2).replace('.', ',')} λίτρα, απομένουν ${Math.ceil((g - t) / 250)} ποτήρια.`; } },
  { re: /(ποσο νερο ηπια|ποσο νερο εχω πιει|νερο σημερα)/, run: () => { const t = waterToday(), g = waterGoal(); return `Σήμερα έχετε πιει ${(t / 1000).toFixed(2).replace('.', ',')} λίτρα από τα ${(g / 1000).toFixed(1)}, δηλαδή ${Math.round((t / g) * 100)}%.`; } },
  { re: /(ποσο νερο (να|πρεπει)|στοχοσ νερου|ποσα ποτηρια)/, run: () => S.weight ? `Με βάρος ${S.weight} κιλά, ο στόχος σας είναι περίπου ${(waterGoal() / 1000).toFixed(1)} λίτρα την ημέρα, δηλαδή ${Math.round(waterGoal() / 250)} ποτήρια. Περισσότερο αν γυμνάζεστε ή κάνει ζέστη.` :
    'Ο γενικός στόχος είναι περίπου 2 λίτρα, 8 ποτήρια την ημέρα. Πείτε μου «ζυγίζω 75 κιλά» για εξατομικευμένο στόχο.' },
  { re: /(ζυγιζω|το βαροσ μου ειναι|ειμαι)\s+(\d{2,3})\s*(κιλα|κιλ)/, run: (raw, n, m) => { S.weight = +m[2]; saveSettings(); fillSettings(); updateWaterWidget(); return `Καταχωρήθηκε. Με ${S.weight} κιλά ο ημερήσιος στόχος νερού σας είναι ${(waterGoal() / 1000).toFixed(1)} λίτρα.`; } },

  // αναπνοές / διαλογισμός
  { re: /(προγραμμα διαλογισμου|πλανο διαλογισμου)/, run: () => meditationProgram() },
  { re: /(αναπνοη|αναπνοεσ|ανασεσ|ανασα)/, test: (n) => !/(δεν μπορω να ανασανω|δυσπνοια)/.test(n), run: (raw, n) => {
    const k = /(4\s*-?\s*7\s*-?\s*8|τεσσερα επτα οκτω|υπνο)/.test(n) ? '478' : /(τετραγων|box)/.test(n) ? 'box' : /(ενεργει|ξυπνημα|ξυπνησω)/.test(n) ? 'energy' : /(συνοχη|ισορροπ)/.test(n) ? 'calm' : (new Date().getHours() >= 21 ? '478' : 'box');
    setTimeout(() => startBreathing(k), 300); return { silent: true, text: `▶ ${BREATHS[k].name}` }; } },
  { re: /(διαλογισμ|meditat|χαλαρωσ(η|ε με)|ηρεμησε με|σαρωση σωματοσ|τσακρα)/, test: (n) => !/(μουσικ|τραγουδ)/.test(n), run: (raw, n) => {
    const k = /τσακρα/.test(n) ? 'chakra' : /(υπνο|κοιμηθω|βραδ)/.test(n) ? 'sleep' : /(πρωι|προθεσ)/.test(n) ? 'morning' : /ευγνωμ/.test(n) ? 'gratitude' : /σαρωση/.test(n) ? 'body' : (new Date().getHours() < 11 ? 'morning' : new Date().getHours() >= 21 ? 'sleep' : 'body');
    setTimeout(() => startMeditation(k), 300); return { silent: true, text: `▶ ${k === 'chakra' ? 'Διαλογισμός τσάκρα' : MEDS[k].name}` }; } },

  // μουσική 432Hz
  { re: /(σταματα|σβησε|κλεισε|σταματησε).*(μουσικ|ηχο)/, run: () => { if (Party.on) Party.stop(); Music.stop(3); return 'Η μουσική σταμάτησε.'; } },
  { re: /((?:^|\s)432(?:\s|$|hz)|χαλαρωτικ|τσακρα|διαλογισμου|ηρεμη μουσικ|μουσικη για υπνο|μουσικη για διαβασμα|μουσικη για συγκεντρωση|μουσικη για χαλαρωσ|solfeggio|σολφεζ|binaural)/, test: (n) => /(μουσικ|βαλε|παιξε|ηχο|432|hz|χερτζ)/.test(n), run: (raw, n) => {
    if (/(youtube|γιουτιουμπ)/.test(n)) { const q = /τσακρα/.test(n) ? '432Hz chakra healing meditation music' : '432Hz relaxing healing music'; setTimeout(() => openUrl('https://www.youtube.com/results?search_query=' + encodeURIComponent(q)), 800); return 'Ανοίγω μουσική 432 Hz στο YouTube.'; }
    const ci = CHAKRAS.findIndex((c) => n.includes(norm(c.n).split(' ')[0].slice(0, 5)));
    const kind = ci >= 0 ? ci : /(υπνο|κοιμηθω)/.test(n) ? 'sleep' : /(διαβασμα|συγκεντρωσ|δουλεια|μελετη)/.test(n) ? 'focus' : '432';
    const mins = parseDuration(n) ? Math.round(parseDuration(n) / 60) : kind === 'sleep' ? 30 : 0;
    Music.start(kind, mins);
    return `Μουσική ${Music.label}${mins ? `, για ${mins} λεπτά` : ''}. ${kind === 'focus' || kind === 'sleep' ? 'Με ακουστικά θα νιώσετε και τους διωτικούς παλμούς.' : 'Χαλαρώστε.'}`; } },

  // γυμναστική
  { re: /(προγραμμα γυμναστικ|προγραμμα προπονησ|πλανο γυμναστικ|τι γυμναστικη|^γυμναστικη$)/, run: () => {
    const k = WEEK_PLAN[new Date().getDay()]; const week = [1, 2, 3, 4, 5, 6, 0].map((d) => `${DAYS[d]}: ${WEEK_PLAN[d] ? WORKOUTS[WEEK_PLAN[d]].name : 'ξεκούραση'}`).join(', ');
    if (k) pending = (r, nn) => (yes(nn) ? (startWorkout(k), 'Πάμε!') : null);
    return { text: 'Πρόγραμμα γυμναστικής', html: `<b>Εβδομαδιαίο πρόγραμμα</b><div>${week.split(', ').join('<br>')}</div><div style="margin-top:6px">Σήμερα: ${k ? workoutSummary(k) : 'ξεκούραση και ένα χαλαρό περπάτημα.'}</div>`,
      speak: `Το εβδομαδιαίο πρόγραμμα: ${week}. Σήμερα: ${k ? workoutSummary(k) + ' Να ξεκινήσουμε;' : 'ξεκούραση και ένα χαλαρό περπάτημα.'}` }; } },
  { re: /(ξεκινα|παμε|ξεκινησε|κανε μου|θελω).*(γυμναστικ|προπονησ|ασκησεισ|κοιλιακ|διατασ|hiit|ποδια|γλουτ)/, run: (raw, n) => {
    const k = /κοιλιακ/.test(n) ? 'abs' : /(διατασ|stretch|κινητικοτ)/.test(n) ? 'stretch' : /(hiit|καυσ|λιπο)/.test(n) ? 'hiit' : /(ποδια|γλουτ)/.test(n) ? 'legs' : /(ολο το σωμα|πληρεσ)/.test(n) ? 'full' : (WEEK_PLAN[new Date().getDay()] || 'stretch');
    setTimeout(() => startWorkout(k), 300); return { silent: true, text: '▶ ' + WORKOUTS[k].name }; } },

  // pomodoro / μελέτη
  { re: /(pomodoro|πομοντορο|ξεκινα διαβασμα|ωρα για διαβασμα|συγκεντρωσ(η|ου)$|λειτουργια συγκεντρωσησ)/, run: (raw, n) => { if (/(σταματα|τελοσ|ακυρωσε)/.test(n)) { Pomo.stop(); return { silent: true, text: '■ Pomodoro' }; } const s = parseDuration(n); Pomo.start(s ? Math.round(s / 60) : 25, 5);
    return `Pomodoro ξεκίνησε: ${Pomo.work} λεπτά απόλυτης συγκέντρωσης. Αφήστε το κινητό μακριά. Θα σας ειδοποιήσω για το διάλειμμα.`; } },
  { re: /(συμβουλη για διαβασμα|πωσ να διαβαζω|πωσ να συγκεντρωθω|tips για διαβασμα)/, run: () => pick(STUDY_TIPS) },
  { re: /(κουιζ|quiz|ρωτα με|εξετασε με)/, run: (raw, n) => Quiz.start(/(αγγλικ|λεξιλογ|english)/.test(n) ? 'en' : 'gen') },
  { re: /(πωσ λεγεται|πωσ λεμε|μεταφρασε|μεταφραση|τι σημαινει)\s+(?:το\s+|η\s+|ο\s+|τη λεξη\s+)?(.+?)\s+(?:στα|σε|στη)\s+([α-ω]+)$/, run: async (raw, n, m) => {
    const lk = Object.keys(LANGS).find((k) => m[3].startsWith(k)); if (!lk) return null; const [code, voice, label] = LANGS[lk];
    const phrase = rawSpan(raw, n, m[2]).replace(/[«»"]/g, '');
    Core.set('thinking'); const tr = await translate(phrase, code); if (!tr) return 'Η υπηρεσία μετάφρασης δεν απάντησε. Δοκιμάστε ξανά.';
    return { text: `«${phrase}» στα ${label}: «${tr}»`, speak: `Στα ${label}:`, after: () => Voice.speak(tr, voice) }; } },

  // χρήματα
  { re: /(ξοδεψα|πληρωσα|εδωσα|χαλασα)\s+(.+)/, test: (n) => !/(ποσα|ποσο|τι) (ξοδεψα|εχω ξοδεψει|χαλασα|πληρωσα)/.test(n), run: (raw, n) => {
    const am = wordsToNums(n).match(/(\d+(?:[.,]\d+)?)/); if (!am) return 'Πόσα ξοδέψατε; Πείτε π.χ. «ξόδεψα 5 ευρώ σε καφέ».';
    const amount = parseFloat(am[1].replace(',', '.')); const nm2 = n.match(/(?:σε|για|στο|στη|στον|στην)\s+(.+)$/); const note = nm2 ? rawSpan(raw, n, nm2[1]) : '';
    const e = { id: uid(), amount, note, cat: guessCat(note), at: Date.now() }; expenses.push(e); Store.set('expenses', expenses);
    let msg = `Καταγράφηκαν ${eur(amount)} στην κατηγορία ${e.cat}.`;
    if (S.budget) { const m2 = sum(spentSince(monthStart())), p = m2 / S.budget; if (p >= 1) msg += ` Προσοχή: ξεπεράσατε τον μηνιαίο προϋπολογισμό, ${eur(m2)} από ${eur(S.budget)}.`; else if (p >= 0.8) msg += ` Έχετε χρησιμοποιήσει το ${Math.round(p * 100)}% του προϋπολογισμού.`; }
    return msg; } },
  { re: /(ποσα ξοδεψα|ποσα εχω ξοδεψει|εξοδα μου|ποσα χαλασα)/, run: (raw, n) => /(σημερα)/.test(n) ? expenseSummary(spentSince(dayStart()), 'σήμερα') : /(εβδομαδα)/.test(n) ? expenseSummary(spentSince(weekStart()), 'αυτή την εβδομάδα') : expenseSummary(spentSince(monthStart()), 'αυτόν τον μήνα') },
  { re: /(προυπολογισμο|budget|οριο εξοδων)\s*(?:σε|στα|των)?\s*(\d+)/, run: (raw, n, m) => { S.budget = +m[2]; saveSettings(); fillSettings(); return `Μηνιαίος προϋπολογισμός: ${eur(S.budget)}. Θα σας ειδοποιώ στο 80% και στο 100%.`; } },
  { re: /(σβησε|ακυρωσε).*(τελευταιο εξοδο|τελευταια αγορα)/, run: () => { const e = expenses.pop(); Store.set('expenses', expenses); return e ? `Διαγράφηκε το έξοδο των ${eur(e.amount)}.` : 'Δεν υπάρχουν έξοδα.'; } },
  { re: /(οικονομικη συμβουλη|συμβουλη για χρηματα|πωσ να αποταμιευσω|πωσ να μαζεψω λεφτα)/, run: () => pick(MONEY_TIPS) },

  // πρόγραμμα / ωράριο
  { re: /(προσθεσε|βαλε|γραψε|καταχωρησε).*(στο προγραμμα|στο ωραριο|στο ημερολογιο)/, run: (raw) => {
    const T = toks(raw); let day = null, time = null;
    const d = parseClock(norm(raw)); if (d) time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    T.forEach((t) => { const di = dayOfToken(t.n); if (di >= 0) day = String(di); if (/^(καθημεριν|καθε μερα)/.test(t.n)) day = '*'; if (t.n === 'σημερα') day = String(new Date().getDay()); if (t.n === 'αυριο') day = String((new Date().getDay() + 1) % 7); });
    if (/καθε μερα|καθημεριν/.test(norm(raw))) day = '*';
    const skip = /^(προσθεσε|βαλε|γραψε|καταχωρησε|στο|προγραμμα|ωραριο|ημερολογιο|καθε|καθημερινα|σημερα|αυριο|στισ|την|τη|το|μου|μερα|ωρα|απο|πρωι|απογευμα|βραδυ|μεσημερι|πμ|μμ)$/;
    const text = T.filter((t) => !skip.test(t.n) && dayOfToken(t.n) < 0 && !/^\d{1,2}([:.]\d{2})?$/.test(t.n) && !/^(πμ|μμ|το πρωι|απογευμα|βραδυ)$/.test(t.n)).map((t) => t.r).join(' ').replace(/^[,.\s]+|[,.\s]+$/g, '');
    if (!time || !text) return 'Πείτε π.χ. «πρόσθεσε στο πρόγραμμα κάθε Δευτέρα στις 18:00 γυμναστήριο». Ή χρησιμοποιήστε την καρτέλα Πρόγραμμα στη Μνήμη.';
    day = day ?? String(new Date().getDay());
    agenda.push({ id: uid(), day, time, text }); Store.set('agenda', agenda); renderMem();
    return `Προστέθηκε στο πρόγραμμα: ${text}, ${day === '*' ? 'κάθε μέρα' : 'κάθε ' + DAYS[+day]} στις ${time}. Θα σας ειδοποιώ δέκα λεπτά πριν.`; } },
  { re: /(τι εχω|το προγραμμα μου|ωραριο|τι κανω|προγραμμα)\s*(σημερα|αυριο|μεθαυριο|την|τη|το|για)?/, test: (n) => /(τι εχω (σημερα|αυριο|μεθαυριο|την|τη|το)|προγραμμα|ωραριο|τι κανω (σημερα|αυριο))/.test(n) && !/(γυμναστικ|διαλογισ|προγραμμα τηλεορασ)/.test(n), run: (raw, n) => {
    let d = new Date(), label = 'σήμερα';
    if (/μεθαυριο/.test(n)) { d = addDays(d, 2); label = 'μεθαύριο'; } else if (/αυριο/.test(n)) { d = addDays(d, 1); label = 'αύριο'; }
    else { const di = n.split(' ').map(dayOfToken).find((x) => x >= 0); if (di != null && di >= 0) { const diff = (di - d.getDay() + 7) % 7; d = addDays(d, diff); label = 'την ' + DAYS[di]; } }
    if (/(εβδομαδα|ολο το)/.test(n)) { if (!agenda.length) return 'Το πρόγραμμά σας είναι άδειο.'; return 'Το εβδομαδιαίο πρόγραμμα: ' + [1, 2, 3, 4, 5, 6, 0].map((x) => { const a = agendaOn(addDays(new Date(), (x - new Date().getDay() + 7) % 7)); return a.length ? `${DAYS[x]}: ${a.map((y) => y.time + ' ' + y.text).join(', ')}` : ''; }).filter(Boolean).join('. ') + '.'; }
    const a = agendaOn(d), bd = birthdaysOn(d), rem = reminders.filter((r) => sameDay(new Date(r.due), d));
    const parts = []; if (a.length) parts.push(a.map((x) => `${x.time} ${x.text}`).join(', ')); if (rem.length) parts.push('υπενθυμίσεις: ' + rem.map((r) => `${r.kind === 'alarm' ? 'ξυπνητήρι' : r.text} στις ${hm(new Date(r.due))}`).join(', ')); if (bd.length) parts.push('γενέθλια: ' + bd.map((b) => b.name).join(', '));
    return parts.length ? `Πρόγραμμα για ${label}: ${parts.join('. ')}.` : `Για ${label} δεν έχετε τίποτα στο πρόγραμμα. Ελεύθερος χρόνος, που πρέπει κι αυτός να προγραμματίζεται.`; } },

  // γενέθλια
  { re: /(γενεθλια)/, test: (n) => /\d/.test(n) || MONTH_STEMS.some((s) => n.split(' ').some((w) => w.startsWith(s) && w.length > 3)), run: (raw, n) => {
    const T = toks(raw); let d = null, m = null;
    const dm = n.match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})/); if (dm) { d = +dm[1]; m = +dm[2]; }
    else { T.forEach((t, i) => { const mi = monthOfToken(t.n); if (mi >= 0 && i > 0 && /^\d{1,2}$/.test(T[i - 1].n)) { d = +T[i - 1].n; m = mi + 1; } }); }
    if (!d || !m || m > 12 || d > 31) return 'Πείτε π.χ. «τα γενέθλια της Μαρίας είναι στις 5 Μαρτίου».';
    const name = T.filter((t) => !STOP_WORDS.has(t.n) && !/\d/.test(t.n) && monthOfToken(t.n) < 0).map((t) => t.r).join(' ').replace(/[,.]/g, '');
    if (!name) return 'Ποιανού είναι τα γενέθλια;';
    const gen = T.some((t) => t.n === 'του' || t.n === 'τησ');
    const nmF = cap(gen ? name.replace(/(ου|ας|ης)$/i, (x) => ({ ου: 'ος', ας: 'α', ης: 'η' }[x.toLowerCase()] || x)) : name);
    birthdays.push({ id: uid(), name: nmF, d, m }); Store.set('birthdays', birthdays); renderMem();
    return `Καταχωρήθηκε: γενέθλια ${nmF}, ${d} ${MONTHS[m - 1]}. Θα σας το θυμίσω στην πρωινή ενημέρωση.`; } },
  { re: /(ποιοσ εχει γενεθλια|ποιοι εχουν γενεθλια|επομενα γενεθλια|γενεθλια αυτο το μηνα)/, run: () => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const up = birthdays.map((b) => { let dt = new Date(now.getFullYear(), b.m - 1, b.d); if (dt < now) dt = new Date(now.getFullYear() + 1, b.m - 1, b.d); return { b, dt }; }).sort((a, b) => a.dt - b.dt).slice(0, 5);
    return up.length ? 'Επόμενα γενέθλια: ' + up.map((x) => `${x.b.name} ${sameDay(x.dt, now) ? 'σήμερα!' : fmtDate(x.dt)}`).join(', ') + '.' : 'Δεν έχετε καταχωρήσει γενέθλια. Πείτε π.χ. «τα γενέθλια της Μαρίας είναι στις 5 Μαρτίου».'; } },
  { re: /ποτε εχει γενεθλια\s+(?:ο|η)?\s*(.+)/, run: (raw, n, m) => { const b = birthdays.find((x) => nameMatch(x.name, m[1])); return b ? `${b.name} έχει γενέθλια στις ${b.d} ${MONTHS[b.m - 1]}.` : 'Δεν το έχω καταχωρημένο.'; } },

  // επαφές & κλήσεις
  { re: /(προσθεσε|αποθηκευσε|καταχωρησε|νεα).*(επαφη|τηλεφωνο|αριθμο|κινητο)/, test: (n) => /\d{6,}/.test(n.replace(/\s/g, '')), run: (raw) => {
    const phone = (raw.match(/(\+?\d[\d\s]{5,}\d)/) || [])[1]; const T = toks(raw.replace(phone, ' '));
    const name = T.filter((t) => !STOP_WORDS.has(t.n)).map((t) => t.r).join(' ').replace(/[,.:]/g, '').trim();
    if (!name) return 'Ποιο όνομα να δώσω στην επαφή;';
    contacts.push({ id: uid(), name: cap(name), phone: cleanPhone(phone) }); Store.set('contacts', contacts); renderMem();
    return `Η επαφή ${cap(name)} αποθηκεύτηκε. Πείτε «πάρε ${cap(name)}» για να καλέσω.`; } },
  { re: /^(παρε|καλεσε|τηλεφωνησε|καλεσε τον|καλεσε την)\s+(?:τηλεφωνο\s+)?(.+)/, test: (n) => !/\d{5,}/.test(n.replace(/\s/g, '')), run: (raw, n, m) => {
    const c = findContact(m[2]); if (!c) return `Δεν βρήκα «${rawSpan(raw, n, m[2])}» στις επαφές. Πείτε «πρόσθεσε επαφή όνομα και αριθμό» ή κάντε εισαγωγή από τη Μνήμη, καρτέλα Επαφές.`;
    setTimeout(() => (location.href = 'tel:' + cleanPhone(c.phone)), 1300); return `Καλώ ${c.name}.`; } },
  { re: /στειλε\s+(μηνυμα|sms|μνμ|whatsapp|γουατσαπ|viber|βαιμπερ)\s+(?:στον|στην|στη|στο|σε)?\s*(.+)/, test: (n) => !/\d{6,}/.test(n.replace(/\s/g, '')), run: (raw, n, m) => {
    const parts = m[2].split(/\s+(?:οτι|να|πωσ|:)\s+/); const c = findContact(parts[0].split(' ').slice(0, 2).join(' ')) || findContact(parts[0].split(' ')[0]);
    if (!c) return 'Δεν βρήκα αυτή την επαφή. Προσθέστε την πρώτα στις επαφές.';
    const body = parts[1] ? rawSpan(raw, n, parts.slice(1).join(' ')) : '';
    const wa = /(whatsapp|γουατσαπ)/.test(m[1]), vb = /(viber|βαιμπερ)/.test(m[1]);
    const url = wa ? `https://wa.me/${intlPhone(c.phone)}${body ? '?text=' + encodeURIComponent(body) : ''}` : vb ? `viber://chat?number=%2B${intlPhone(c.phone)}` : `sms:${cleanPhone(c.phone)}${body ? '?body=' + encodeURIComponent(body) : ''}`;
    setTimeout(() => (wa ? openUrl(url) : (location.href = url)), 1200); return `Ανοίγω ${wa ? 'το WhatsApp' : vb ? 'το Viber' : 'τα μηνύματα'} για ${c.name}${body ? ' με το κείμενο: ' + body : ''}. Πατήστε αποστολή όταν είστε έτοιμος.`; } },

  // ειδήσεις
  { re: /(ειδησεισ|νεα|τιτλουσ|τιτλοι).*(τεχνολογ|tech|τεχ)|(τεχνολογικ)/, run: () => techNews() },
  { re: /^(ειδησεισ|τι νεα υπαρχουν|διαβασε ειδησεισ)$/, run: () => techNews() },
  { re: /(ανοιξε|διαβασε)\s+(?:το\s+)?(?:αρθρο\s+)?(\d|πρωτο|δευτερο|τριτο|τεταρτο|πεμπτο|εκτο)$/, test: () => lastNews.length > 0, run: (raw, n, m) => {
    const map = { πρωτο: 1, δευτερο: 2, τριτο: 3, τεταρτο: 4, πεμπτο: 5, εκτο: 6 }; const i = (+m[2] || map[m[2]]) - 1; const a = lastNews[i]; if (!a) return null;
    setTimeout(() => openUrl(a.link), 800); return `Ανοίγω: ${a.title}`; } },

  // αθλητικά
  { re: /(βαθμολογια)/, run: () => standings() },
  { re: /\bnba\b|εν μπι ει/, run: () => nbaResults() },
  { re: /(αποτελεσματα|σκορ|αγωνεσ|ματσ|αθλητικα|τι εκανε|πωσ τα πηγε|πωσ πηγε|ποτε παιζει|επομενο ματσ|επομενοσ αγωνασ|εχει ματσ|κερδισε|εχασε)/, test: (n) => findTeams(n).length > 0 || /(αποτελεσματα|σκορ|ματσ|αγων|αθλητικα|μπασκετ|ποδοσφαιρ|euroleague)/.test(n), run: async (raw, n) => {
    const teams = findTeams(n); const basket = /(μπασκετ|euroleague|ευρωλιγκ|μπασκ)/.test(n), foot = /(ποδοσφαιρ|super league|σουπερ λιγκ|γκολ)/.test(n);
    if (basket && !teams.length) return basketResults();
    if (foot && !teams.length) return footballResults();
    if (teams.length) {
      const out = [];
      for (const t of teams) { if (!basket) out.push(await footballResults(t)); if (!foot && t[2]) out.push(await basketResults([t])); }
      return out.join(' ');
    }
    if (/αθλητικα/.test(n) || !teams.length) { const fav = findTeams(norm(S.teams || '')); if (fav.length) { const out = []; for (const t of fav) { out.push(await footballResults(t)); if (t[2]) out.push(await basketResults([t])); } return out.join(' '); } return footballResults(); }
    return null; } },

  // σινεμά
  { re: /(σινεμα|κινηματογραφ|ταινιεσ|ταινια|cinema)/, run: (raw, n) => {
    if (/(προτεινε|προταση|τι να δω)/.test(n) && !/(σινεμα|κινηματογραφ)/.test(n)) return null;
    return cinema(/(ερχονται|επομεν|προσεχωσ|νεεσ ταινιεσ που)/.test(n) ? 'upcoming' : 'now'); } },

  // Iron Man
  { re: /(πρωτοκολλο παρτι|ωρα για παρτι|party mode|παρτι)/, test: (n) => !/(τελοσ|σταματα|κλεισε)/.test(n), run: () => { Party.start(); return 'Ενεργοποίηση πρωτοκόλλου πάρτι. Όλα τα συστήματα σε λειτουργία διασκέδασης!'; } },
  { re: /(τελοσ (του )?παρτι|σταματα το παρτι|κλεισε το παρτι)/, run: () => { Party.stop(); return 'Το πάρτι τελείωσε. Επαναφορά σε κανονική λειτουργία.'; } },
  { re: /(κοκκινοσ συναγερμοσ|συναγερμοσ|red alert)/, run: () => redAlert() },
  { re: /(κανε σαρωση|σαρωσε|σαρωση συσκευησ|σαρωση συστηματοσ)/, run: () => deviceScan() },
  { re: /(πρωτοκολλο ησυχιασ|σιωπηλη λειτουργια|stealth mode)/, run: () => { S.sounds = false; S.theme = 'stealth'; saveSettings(); fillSettings(); applyTheme('stealth'); return 'Πρωτόκολλο ησυχίας ενεργό. Ήχοι απενεργοποιημένοι.'; } },
  { re: /(κανονικη λειτουργια|πρωτοκολλο κανονικο|επαναφορα)/, run: () => { S.sounds = true; S.theme = 'reactor'; saveSettings(); fillSettings(); Party.stop(); applyTheme('reactor'); return 'Επαναφορά σε κανονική λειτουργία.'; } },
  { re: /(θεμα|χρωμα|εμφανιση|στολη|πανοπλια|mark)/, test: (n) => /(κοκκιν|χρυσ|λευκ|ασπρ|stealth|μπλε|γαλαζ|μωβ|vibranium|πρασιν|σμαραγδ|mark|reactor)/.test(n), run: (raw, n) => {
    const k = /(κοκκιν|mark)/.test(n) ? 'mark' : /χρυσ/.test(n) ? 'gold' : /(λευκ|ασπρ|stealth)/.test(n) ? 'stealth' : /(μωβ|vibranium)/.test(n) ? 'vibranium' : /(πρασιν|σμαραγδ)/.test(n) ? 'emerald' : 'reactor';
    S.theme = k; saveSettings(); fillSettings(); Sound.whoosh(); applyTheme(k); return `Θέμα ${THEMES[k][1]} ενεργό.`; } },
  { re: /(φωνητικη ενεργοποιηση|ακουσε με συνεχεια|wake word|λεξη αφυπνισησ)/, run: (raw, n) => { const off = /(κλεισε|απενεργοποιησε|σταματα|οχι)/.test(n); S.wake = !off; saveSettings(); fillSettings(); if (off) { Wake.stop(); return 'Φωνητική ενεργοποίηση ανενεργή.'; } Wake.start(); return `Φωνητική ενεργοποίηση ενεργή. Πείτε «${S.assistant}» και την εντολή σας. Η οθόνη θα μένει αναμμένη όσο είναι ανοιχτή η εφαρμογή.`; } },
];
intents.unshift(...F);

/* ---------------- ΣΥΝΔΕΣΕΙΣ ΜΕ ΤΟΝ ΠΥΡΗΝΑ ---------------- */
window.morningBriefing = morningBriefing;
window.dailyQuote = dailyQuote;
window.aiContext = () => { const d = new Date(), a = agendaOn(d); return ` Πρόγραμμα χρήστη σήμερα: ${a.map((x) => x.time + ' ' + x.text).join(', ') || 'κενό'}. Εκκρεμότητες: ${todos.filter((t) => !t.done).map((t) => t.text).join(', ') || 'καμία'}. Νερό σήμερα: ${waterToday()}ml από ${waterGoal()}ml. Ο βοηθός ενθαρρύνει την προσωπική εξέλιξη του χρήστη.`; };
window.onFeatureSetting = (k) => {
  if (k === 'theme') applyTheme(S.theme);
  if (k === 'weight') updateWaterWidget();
  if (k === 'wake' || k === 'handsFree') { Wake.stop(); if (S.wake || S.handsFree) Wake.start(); }
};
function featuresInit() {
  touchDay(); applyTheme(S.theme); updateWaterWidget(); setInterval(tickFeatures, 30000); tickFeatures();
  $('#memBtn').onclick = () => { Sound.whoosh(); renderMem(); $('#memory').classList.remove('hidden'); };
  $('#sessStop').onclick = () => { Sound.tap(); Session.stop(); };
  if (S.wake || S.handsFree) Wake.start();
}
window.featuresInit = featuresInit;
applyTheme(S.theme);
