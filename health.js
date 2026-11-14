/* ---------------- ΒΗΜΑΤΑ & ΥΠΝΟΣ (σαν έξυπνο ρολόι, μόνο με τους αισθητήρες του κινητού) ----------------
   Η εφαρμογή Android κρατά δείγματα: «ώρα s μετρητής» (βήματα) και «ώρα e off|on|unlock» (οθόνη).
   Όλα υπολογίζονται εδώ, στο κινητό· τίποτα δεν στέλνεται πουθενά. */
const Health = {
  ok() { return !!(window.AndroidJarvis && AndroidJarvis.healthLog); },
  info() { try { return JSON.parse(AndroidJarvis.healthInfo()); } catch { return { sensor: false, perm: false }; } },
  parse() {
    const steps = [], ev = [];
    let txt = ''; try { txt = AndroidJarvis.healthLog() || ''; } catch {}
    for (const line of txt.split('\n')) {
      const [ts, k, v] = line.trim().split(' '); const t = +ts; if (!t) continue;
      if (k === 's') steps.push([t, +v]); else if (k === 'e') ev.push([t, v]);
    }
    steps.sort((a, b) => a[0] - b[0]); ev.sort((a, b) => a[0] - b[0]);
    return { steps, ev };
  },
  dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
  // Βήματα ανά ημέρα: η διαφορά του μετρητή ανάμεσα σε διαδοχικά δείγματα (μετά από επανεκκίνηση ο μετρητής ξεκινά από το 0).
  byDay() {
    const { steps } = this.parse(); const out = {}; let first = null;
    for (let i = 1; i < steps.length; i++) {
      const [t, v] = steps[i], p = steps[i - 1][1]; const d = v >= p ? v - p : v;
      if (d > 0 && d < 60000) out[this.dayKey(t)] = (out[this.dayKey(t)] || 0) + d;
    }
    if (steps.length) first = steps[0][0];
    return { days: out, first };
  },
  stepsOn(offset = 0) { const d = new Date(); d.setDate(d.getDate() - offset); return this.byDay().days[this.dayKey(d)] || 0; },
  // Ύπνος: η μεγαλύτερη περίοδος με σβηστή οθόνη (χωρίς ξεκλείδωμα) που τελείωσε σήμερα το πρωί.
  // Αν η οθόνη άναψε για λίγο χωρίς ξεκλείδωμα (ειδοποίηση, ματιά στην ώρα), ο ύπνος συνεχίζεται.
  lastSleep() {
    const { ev } = this.parse(); const per = []; let off = null;
    for (const [t, k] of ev) {
      if (k === 'off') { if (off == null) off = t; }
      else if (k === 'unlock' && off != null) { per.push([off, t]); off = null; }
    }
    const now = new Date(), from = new Date(now); from.setDate(from.getDate() - 1); from.setHours(19, 0, 0, 0);
    const endMin = new Date(now); endMin.setHours(3, 0, 0, 0); const endMax = new Date(now); endMax.setHours(14, 0, 0, 0);
    const c = per.filter(([a, b]) => b - a >= 2 * 3600000 && a >= from.getTime() && b >= endMin.getTime() && b <= endMax.getTime());
    if (!c.length) return null;
    const [a, b] = c.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
    // Πόσες φορές ξεκλειδώσατε μέσα στη νύχτα (μικρά ξυπνήματα): περίοδοι ανάμεσα σε 1 και 2 ώρες δεν μετράνε ως ύπνος.
    return { start: a, end: b, min: Math.round((b - a) / 60000) };
  },
};
window.Health = Health;
const hm2 = (t) => { const d = new Date(t); return `${d.getHours()}:${pad(d.getMinutes())}`; };
const dur = (m) => `${Math.floor(m / 60)} ${Math.floor(m / 60) === 1 ? 'ώρα' : 'ώρες'}${m % 60 ? ` και ${m % 60} λεπτά` : ''}`;
// Κοινός έλεγχος: υπάρχει η νέα εφαρμογή; υπάρχει αισθητήρας; δόθηκε άδεια;
function healthReady(needSteps) {
  if (!Health.ok()) return window.AndroidJarvis ? 'Για βήματα και ύπνο χρειάζεται η νέα έκδοση της εφαρμογής. Πείτε στον δημιουργό σας να σας στείλει το QR.' : 'Τα βήματα και ο ύπνος μετριούνται μόνο από την εφαρμογή JARVIS στο κινητό.';
  if (!needSteps) return null;
  const i = Health.info();
  if (!i.sensor) return 'Αυτό το κινητό δεν έχει μετρητή βημάτων.';
  if (!i.perm) { try { AndroidJarvis.askSteps(); } catch {} return 'Χρειάζομαι άδεια για τη «σωματική δραστηριότητα». Πατήστε «Να επιτρέπεται» και ρωτήστε με ξανά. Μετράω από τη στιγμή που θα τη δώσετε.'; }
  return null;
}
function stepsAnswer(n) {
  const r = healthReady(true); if (r) return r;
  const goal = S.stepGoal || 6000; const { days, first } = Health.byDay();
  if (!first) return 'Ξεκίνησα να μετράω τα βήματά σας. Περπατήστε λίγο και ρωτήστε με ξανά σε μερικά λεπτά.';
  const fresh = Date.now() - first < 86400000 ? ' Μετράω από τις ' + hm2(first) + ', οπότε η πρώτη μέρα δεν είναι πλήρης.' : '';
  if (/εβδομαδα|εβδομαδασ|7 μερεσ|επτα μερεσ/.test(n)) {
    let tot = 0, best = 0, bestD = ''; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); const v = days[Health.dayKey(d)] || 0; tot += v; if (v > best) { best = v; bestD = DAYS[d.getDay()]; } }
    return `Την τελευταία εβδομάδα κάνατε ${tot.toLocaleString('el-GR')} βήματα, περίπου ${Math.round(tot / 7).toLocaleString('el-GR')} τη μέρα.${best ? ` Η καλύτερη μέρα ήταν ${bestD}, με ${best.toLocaleString('el-GR')}.` : ''}${fresh}`;
  }
  if (/χθεσ/.test(n)) { const v = Health.stepsOn(1); return `Χθες κάνατε ${v.toLocaleString('el-GR')} βήματα${v >= goal ? ', πάνω από τον στόχο σας. Μπράβο!' : '.'}`; }
  const v = Health.stepsOn(0), left = goal - v;
  return `Σήμερα έχετε κάνει ${v.toLocaleString('el-GR')} βήματα. ${left > 0 ? `Σας λείπουν ${left.toLocaleString('el-GR')} για τον στόχο των ${goal.toLocaleString('el-GR')}, περίπου ${Math.max(1, Math.round(left / 100))} λεπτά περπάτημα.` : `Ξεπεράσατε τον στόχο των ${goal.toLocaleString('el-GR')}. Μπράβο${nmc()}!`}${fresh}`;
}
function sleepAnswer() {
  const r = healthReady(false); if (r) return r;
  const s = Health.lastSleep();
  if (!s) return 'Δεν έχω ακόμα στοιχεία για τον ύπνο σας. Τον υπολογίζω από το πότε σβήνει η οθόνη το βράδυ και πότε ξεκλειδώνετε το πρωί, οπότε αφήστε την εφαρμογή ανοιχτή στο παρασκήνιο απόψε.';
  const h = s.min / 60;
  const tip = h < 6 ? ' Είναι λίγο. Προσπαθήστε απόψε να ξαπλώσετε νωρίτερα.' : h > 9.5 ? ' Πολύς ύπνος. Αν νιώθετε κουρασμένος, ίσως φταίει η ποιότητα και όχι η διάρκεια.' : ' Καλή διάρκεια.';
  return `Κοιμηθήκατε περίπου ${dur(s.min)}, από τις ${hm2(s.start)} ως τις ${hm2(s.end)}.${tip}`;
}
intents.unshift(
  { re: /(ποσα βηματα|βηματα (σημερα|εκανα|μου|χθεσ|την εβδομαδα|τησ εβδομαδασ)|μετρητησ βηματων|ποσο περπατησα|ποσο εχω περπατησει)/, run: (raw, n) => stepsAnswer(n) },
  { re: /(ποσο κοιμηθηκα|πωσ κοιμηθηκα|ποσεσ ωρεσ κοιμηθηκα|ωρεσ υπνου|ο υπνοσ μου|τον υπνο μου|ποτε κοιμηθηκα|ποτε ξυπνησα|πωσ ηταν ο υπνοσ)/, run: () => sleepAnswer() },
  { re: /στοχο(σ)? (των )?βηματων/, run: (raw, n) => { const m = n.match(/(\d[\d.]*)/); if (!m) return `Ο στόχος σας είναι ${(S.stepGoal || 6000).toLocaleString('el-GR')} βήματα τη μέρα. Πείτε π.χ. «στόχος βημάτων 8000».`; S.stepGoal = Math.max(500, Math.min(50000, +m[1].replace(/\./g, ''))); saveSettings(); return `Νέος στόχος: ${S.stepGoal.toLocaleString('el-GR')} βήματα τη μέρα.`; } },
);
// Βραδινή υπενθύμιση στις 19:00, αν λείπουν πολλά βήματα (μία φορά τη μέρα).
setInterval(() => {
  try {
    if (!Health.ok() || !Health.info().perm) return;
    const d = new Date(); if (d.getHours() !== 19 || d.getMinutes() !== 0 || !once(`steps-${todayKey()}`)) return;
    const goal = S.stepGoal || 6000, v = Health.stepsOn(0); if (!Health.byDay().first || v >= goal * 0.7) return;
    const msg = `Σήμερα έχετε ${v.toLocaleString('el-GR')} βήματα από τα ${goal.toLocaleString('el-GR')}. Μια βόλτα 20 λεπτών θα έκανε τη διαφορά.`;
    toast('ΒΗΜΑΤΑ', msg); notify('Βήματα', msg); say(msg, { noRelisten: true });
  } catch {}
}, 30000);
