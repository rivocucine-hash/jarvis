/* =========================================================
   J.A.R.V.I.S. — Εβδομαδιαία αναφορά
   ========================================================= */
'use strict';

Object.entries({ weeklyReport: true, reportTime: '20:00' }).forEach(([k, v]) => { if (S[k] === undefined) S[k] = v; });
saveSettings();
let waterHist = Store.get('waterHist', {});   // {YYYY-MM-DD: ml}
let weekSnap = Store.get('weekSnap', null);   // {week: 'YYYY-MM-DD', s: {...stats}}
let reports = Store.get('reports', []);       // {id, week, score, summary, at}
const ACT_KEYS = ['meditations', 'breaths', 'workouts', 'yoga', 'cold', 'wim', 'pomodoros', 'routines'];
const weekKey = () => dkey(weekStart());

function trackWeek() {
  waterHist[dkey()] = waterToday();
  Object.keys(waterHist).forEach((k) => { if (k < dkey(addDays(new Date(), -60))) delete waterHist[k]; });
  Store.set('waterHist', waterHist);
  if (!weekSnap || weekSnap.week !== weekKey()) { weekSnap = { week: weekKey(), s: Object.fromEntries(ACT_KEYS.map((k) => [k, stats[k] || 0])) }; Store.set('weekSnap', weekSnap); }
}

function buildReport() {
  trackWeek();
  const end = new Date(), from = addDays(dayStart(), -6), days = [...Array(7)].map((_, i) => dkey(addDays(from, i)));
  const fromMs = from.getTime(), prevFrom = addDays(from, -7).getTime();
  const R = { parts: [], html: [], scoreParts: [] };
  const sec = (icon, title, body) => { R.html.push(`<div class="rep-sec"><b>${icon} ${title}</b>${body}</div>`); };
  const bar = (label, val, max, suffix = '') => { const p = max ? Math.min(100, Math.round((val / max) * 100)) : 0; return `<div class="rep-row"><span>${escapeHtml(label)}</span><div class="rep-bar"><div style="width:${p}%"></div></div><em>${val}${suffix}</em></div>`; };

  // Συνήθειες
  if (habits.length) {
    const rows = habits.map((h) => ({ h, n: days.filter((d) => h.log[d]).length, s: habitStreak(h) }));
    const pct = Math.round((rows.reduce((a, r) => a + r.n, 0) / (habits.length * 7)) * 100); R.scoreParts.push(pct);
    const best = [...rows].sort((a, b) => b.n - a.n)[0], worst = [...rows].sort((a, b) => a.n - b.n)[0];
    sec('🔥', `Συνήθειες · ${pct}%`, rows.map((r) => bar(`${r.h.name}${r.s >= 3 ? ` 🔥${r.s}` : ''}`, r.n, 7, '/7')).join(''));
    R.parts.push(`Συνήθειες στο ${pct}%. Καλύτερη: ${best.h.name}, ${best.n} από 7 μέρες.${worst.n < 4 ? ` Χρειάζεται προσοχή: ${worst.h.name}, μόνο ${worst.n}.` : ''}`);
    R.weak = worst.n < 4 ? worst.h.name : null;
  }
  // Δραστηριότητα
  const act = weekSnap && weekSnap.week === weekKey() ? Object.fromEntries(ACT_KEYS.map((k) => [k, Math.max(0, (stats[k] || 0) - (weekSnap.s[k] || 0))])) : null;
  if (act) {
    const items = [['Διαλογισμοί', act.meditations], ['Αναπνοές', act.breaths + act.wim], ['Προπονήσεις', act.workouts], ['Γιόγκα', act.yoga], ['Κρύο ντους', act.cold], ['Pomodoro', act.pomodoros]].filter((x) => x[1] > 0);
    const total = items.reduce((a, x) => a + x[1], 0); R.scoreParts.push(Math.min(100, total * 10));
    if (items.length) { sec('💪', 'Δραστηριότητα', items.map(([l, v]) => bar(l, v, Math.max(...items.map((x) => x[1])))).join('')); R.parts.push(`Δραστηριότητα: ${items.map(([l, v]) => `${v} ${l.toLowerCase()}`).join(', ')}.`); }
    else R.parts.push('Αυτή την εβδομάδα δεν καταγράφηκαν προπονήσεις ή διαλογισμοί.');
  }
  // Νερό
  const wv = days.map((d) => waterHist[d] || 0).filter((x) => x > 0);
  if (wv.length) { const avg = Math.round(wv.reduce((a, b) => a + b, 0) / wv.length), p = Math.round((avg / waterGoal()) * 100); R.scoreParts.push(Math.min(100, p));
    sec('💧', 'Νερό', bar('Μέσος όρος/μέρα', (avg / 1000).toFixed(1).replace('.', ','), (waterGoal() / 1000).toFixed(1), ' λ') + `<div class="rep-note">${p}% του στόχου</div>`); R.parts.push(`Νερό: κατά μέσο όρο ${(avg / 1000).toFixed(1).replace('.', ',')} λίτρα τη μέρα, ${p}% του στόχου.`); }
  // Διάθεση
  const mw = moods.filter((m) => days.includes(m.date));
  if (mw.length) { const avg = mw.reduce((a, m) => a + m.score, 0) / mw.length; R.scoreParts.push(Math.round((avg / 5) * 100)); const bestM = [...mw].sort((a, b) => b.score - a.score)[0];
    sec('🙂', `Διάθεση · ${avg.toFixed(1).replace('.', ',')}/5 ${MOOD_EMO[Math.round(avg)]}`, moodChart(7)); R.parts.push(`Διάθεση: μέσος όρος ${avg.toFixed(1).replace('.', ',')} στα 5, καλύτερη μέρα ${DAYS[new Date(bestM.date).getDay()]}.`); R.lowMood = avg < 3; }
  // Δουλειά
  if (typeof work !== 'undefined' && work.length) {
    const done = work.filter((w) => w.done && w.doneAt >= fromMs).length, open = openWork().length, od = overdue().length;
    if (done + open) R.scoreParts.push(Math.round((done / (done + open)) * 100));
    sec('💼', 'Δουλειά', `<div>Ολοκληρώθηκαν <b>${done}</b> · Ανοιχτές <b>${open}</b>${od ? ` · <span style="color:var(--red)">Εκπρόθεσμες ${od}</span>` : ''}</div>`);
    R.parts.push(`Δουλειά: ολοκληρώσατε ${done} ${done === 1 ? 'εργασία' : 'εργασίες'}, απομένουν ${open}${od ? `, εκ των οποίων ${od} εκπρόθεσμες` : ''}.`); R.overdue = od;
  }
  // Έξοδα
  const ew = expenses.filter((e) => e.at >= fromMs), ep = expenses.filter((e) => e.at >= prevFrom && e.at < fromMs);
  if (ew.length) { const tw = sum(ew), tp = sum(ep), by = {}; ew.forEach((e) => (by[e.cat] = (by[e.cat] || 0) + e.amount)); const top = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const diff = tp ? Math.round(((tw - tp) / tp) * 100) : null;
    sec('💶', `Έξοδα · ${eur(tw)}${diff != null ? ` (${diff > 0 ? '+' : ''}${diff}% από την προηγούμενη)` : ''}`, top.slice(0, 5).map(([c, v]) => bar(c, Math.round(v), Math.round(top[0][1]), ' €')).join(''));
    R.parts.push(`Έξοδα: ${eur(tw)}${diff != null ? `, ${diff > 0 ? 'αυξημένα' : 'μειωμένα'} κατά ${Math.abs(diff)}% σε σχέση με την προηγούμενη εβδομάδα` : ''}. Περισσότερα σε: ${top[0][0]}.`); R.spendUp = diff != null && diff > 20 ? top[0][0] : null; }
  // Στόχοι
  if (goals.length) { sec('🎯', 'Στόχοι', goals.map((g) => bar(g.title, goalPct(g), 100, '%')).join('')); R.parts.push(`Στόχοι: ${goals.map((g) => `${g.title} στο ${goalPct(g)}%`).join(', ')}.`); }
  // Ημερολόγιο
  const jw = journal.filter((j) => j.at >= fromMs).length; if (jw) R.parts.push(`Γράψατε ${jw} ${jw === 1 ? 'καταγραφή' : 'καταγραφές'} στο ημερολόγιο.`);

  const score = R.scoreParts.length ? Math.round(R.scoreParts.reduce((a, b) => a + b, 0) / R.scoreParts.length) : 0;
  const grade = score >= 85 ? 'Εβδομάδα Iron Man 🦾' : score >= 70 ? 'Πολύ δυνατή εβδομάδα' : score >= 50 ? 'Καλή εβδομάδα, με περιθώρια' : 'Εβδομάδα επανεκκίνησης';
  // Πρόταση για την επόμενη εβδομάδα
  const focus = R.weak ? `Εστίαση της επόμενης εβδομάδας: «${R.weak}». Στόχος τουλάχιστον 5 μέρες.` : R.overdue ? `Εστίαση: κλείστε πρώτα τις ${R.overdue} εκπρόθεσμες εργασίες.` : R.lowMood ? 'Εστίαση: περισσότερος ύπνος, κίνηση και χρόνος με ανθρώπους που αγαπάτε.' : R.spendUp ? `Εστίαση: λίγο φρένο στα έξοδα για ${R.spendUp}.` : 'Εστίαση: συνεχίστε ακριβώς έτσι και ανεβάστε έναν στόχο ένα σκαλί.';
  const head = `Εβδομαδιαία αναφορά${nmc()}: ${score}/100, ${grade}.`;
  const range = `${from.getDate()} ${MONTHS[from.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
  const html = `<div class="rep"><div class="rep-head"><div><b>📊 Εβδομαδιαία αναφορά</b><div class="rep-note">${range}</div></div><div class="rep-score" style="--p:${score}"><span>${score}</span></div></div><div class="rep-grade">${grade}</div>${R.html.join('') || '<div class="rep-note">Δεν υπάρχουν ακόμα αρκετά δεδομένα. Χρησιμοποιήστε τις συνήθειες, τη διάθεση και τα έξοδα για μια πλήρη αναφορά.</div>'}<div class="rep-sec">🧭 ${escapeHtml(focus)}</div></div>`;
  return { score, grade, focus, head, html, speak: `${head} ${R.parts.join(' ')} ${focus}`, range };
}
async function weeklyReport(save) {
  const r = buildReport();
  if (save) { reports = reports.filter((x) => x.week !== weekKey()); reports.unshift({ id: uid(), week: weekKey(), score: r.score, summary: `${r.grade} · ${r.focus}`, range: r.range, at: Date.now() }); reports = reports.slice(0, 26); Store.set('reports', reports); }
  if (r.score >= 85) celebrate(true);
  await say(r.head, { html: r.html, speak: r.speak, noRelisten: true });
  pending = (raw, nn) => { if (/^(οχι|τιποτα)/.test(nn)) return 'Εντάξει. Καλή εβδομάδα!'; journal.push({ id: uid(), text: 'Πρόθεση εβδομάδας: ' + raw, at: Date.now(), kind: 'plan' }); Store.set('journal', journal); return 'Καταγράφηκε. Θα το δούμε μαζί στην επόμενη αναφορά. Καλή εβδομάδα!'; };
  say('Ποια είναι η μία πρόθεσή σας για την επόμενη εβδομάδα;', { noRelisten: true });
}

function tickReport() {
  trackWeek();
  const d = new Date(), now = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (S.weeklyReport && d.getDay() === 0 && now === S.reportTime && once(`rep-${todayKey()}`)) { notify('Εβδομαδιαία αναφορά', 'Η αναφορά της εβδομάδας σας είναι έτοιμη.'); weeklyReport(true); }
}

TABS.push({ k: 'reports', label: 'ΑΝΑΦΟΡΕΣ', get: () => reports, set: (v) => { reports = v; },
  head: () => 'Κάθε Κυριακή αποθηκεύεται η αναφορά της εβδομάδας. Πείτε «εβδομαδιαία αναφορά» οποτεδήποτε.',
  line: (r) => [`${r.score}/100 · ${r.range}`, r.summary], sort: (a, b) => b.at - a.at });

const baseHelpR = helpHtml;
helpHtml = function () { return baseHelpR() + '<div style="margin-top:8px"><b>📊 Εβδομαδιαία αναφορά</b><div style="opacity:.8;margin-left:6px">«Εβδομαδιαία αναφορά»: συνήθειες, δραστηριότητα, νερό, διάθεση, δουλειά, έξοδα, στόχοι, βαθμός και εστίαση</div><div style="opacity:.8;margin-left:6px">Αυτόματα κάθε Κυριακή στις 20:00</div></div>'; };

intents.unshift({ re: /(εβδομαδιαια αναφορα|αναφορα εβδομαδασ|πωσ πηγε η εβδομαδα|απολογισμοσ εβδομαδασ|weekly report|αναφορα τησ εβδομαδασ)/, run: () => { weeklyReport(new Date().getDay() === 0); return { silent: true, text: '' }; } });

const baseFIr = featuresInit;
window.featuresInit = function () { baseFIr(); setInterval(tickReport, 30000); tickReport(); };
fillSettings();
