/* ---------------- ΗΜΕΡΟΛΟΓΙΟ ----------------
   Ραντεβού για συγκεκριμένη ημερομηνία (όχι κάθε εβδομάδα), με ειδοποίηση μία ώρα πριν.
   Η προβολή ημέρας ενώνει: ραντεβού, εβδομαδιαίο πρόγραμμα, υπενθυμίσεις, γενέθλια και το ημερολόγιο του κινητού. */
let events = Store.get('events', []); // {id, date:'YYYY-MM-DD', time:'HH:MM'|'', text, remId}
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dOf = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const MONTHS_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
const MONTHS_NOM = ['ΙΑΝΟΥΑΡΙΟΣ', 'ΦΕΒΡΟΥΑΡΙΟΣ', 'ΜΑΡΤΙΟΣ', 'ΑΠΡΙΛΙΟΣ', 'ΜΑΪΟΣ', 'ΙΟΥΝΙΟΣ', 'ΙΟΥΛΙΟΣ', 'ΑΥΓΟΥΣΤΟΣ', 'ΣΕΠΤΕΜΒΡΙΟΣ', 'ΟΚΤΩΒΡΙΟΣ', 'ΝΟΕΜΒΡΙΟΣ', 'ΔΕΚΕΜΒΡΙΟΣ'];
const dayName = (d) => { const t = new Date(); t.setHours(0, 0, 0, 0); const k = Math.round((new Date(d).setHours(0, 0, 0, 0) - t.getTime()) / 86400000);
  const full = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; return k === 0 ? `σήμερα, ${full}` : k === 1 ? `αύριο, ${full}` : k === 2 ? `μεθαύριο, ${full}` : full; };
const saveEvents = () => Store.set('events', events);
function eventsOn(d) { const k = dstr(d); return events.filter((e) => e.date === k).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')); }
window.eventsOn = eventsOn;

/* Ειδοποίηση μία ώρα πριν: γίνεται υπενθύμιση του κινητού, ώστε να χτυπάει και με κλειστή την εφαρμογή. */
function dropReminder(id) { if (id == null) return; try { clearTimeout(timers.get(id)); timers.delete(id); } catch {} reminders = reminders.filter((r) => r.id !== id); Store.set('reminders', reminders); }
function remindFor(e) {
  dropReminder(e.remId); e.remId = null;
  if (!e.time) return;
  const [h, m] = e.time.split(':').map(Number); const at = dOf(e.date); at.setHours(h, m, 0, 0);
  const lead = (S.eventLead ?? 60) * 60000, due = new Date(at.getTime() - lead);
  if (due.getTime() <= Date.now() + 30000) return;
  const r = addReminder(`Σε ${S.eventLead && S.eventLead !== 60 ? S.eventLead + ' λεπτά' : 'μία ώρα'}, στις ${e.time}: ${e.text}.`, due); r.ev = e.id; Store.set('reminders', reminders); e.remId = r.id;
}

/* ---- Ανάγνωση ημερομηνίας και ώρας από τη φράση ----
   Επιστρέφει { date: Date|null, time: 'HH:MM'|null, text, weekly } — όσα tokens χρησιμοποιήθηκαν για ημέρα/ώρα αφαιρούνται από το κείμενο. */
const LEAD_SKIP = /^(βαλε|βαλτε|προσθεσε|προσθεστε|γραψε|σημειωσε|καταχωρησε|κλεισε|στο|στην|στη|ημερολογιο|προγραμμα|ατζεντα|εχω|μου|ενα|ενα|ραντεβου:?)$/;
const FILL = /^(την|τη|το|τον|στισ|στη|στην|στο|για|και|μου|ωρα|η|ο|απο)$/;
function parseEvent(raw) {
  const T = toks(raw).map((t) => ({ ...t, n: t.n.replace(/[,;!?]+$/, '') })); const used = new Set();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let date = null, time = null, pmHint = null; const weekly = T.some((t) => /^(καθε|καθημεριν)/.test(t.n));
  const prevFill = (i) => { let j = i - 1; while (j >= 0 && /^(την|τη|τον|το|στισ|τισ|στην|στη|αλλη|επομενη|ερχομενη|μεθεπομενη)$/.test(T[j].n)) { used.add(j); j--; } };
  T.forEach((t, i) => {
    if (used.has(i)) return;
    if (t.n === 'σημερα') { date = new Date(today); used.add(i); }
    else if (t.n === 'αυριο') { date = addDays(today, 1); used.add(i); }
    else if (t.n === 'μεθαυριο') { date = addDays(today, 2); used.add(i); }
    else if (/^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?$/.test(t.n)) { const [d, m, y] = t.n.split(/[\/-]/).map(Number); date = new Date(y ? (y < 100 ? 2000 + y : y) : today.getFullYear(), m - 1, d); if (!y && date < today) date.setFullYear(date.getFullYear() + 1); used.add(i); prevFill(i); }
    else if (/^\d{1,2}$/.test(t.n) && T[i + 1] && monthOfToken(T[i + 1].n) >= 0) { date = new Date(today.getFullYear(), monthOfToken(T[i + 1].n), +t.n); if (date < today) date.setFullYear(date.getFullYear() + 1); used.add(i); used.add(i + 1); prevFill(i); }
    else if (dayOfToken(t.n) >= 0 && !/^τεταρτο/.test(t.n)) {
      const di = dayOfToken(t.n); let diff = (di - today.getDay() + 7) % 7; if (diff === 0) diff = 7;
      if (T[i - 1] && /^(αλλη|επομενη|ερχομενη|μεθεπομενη)$/.test(T[i - 1].n) && diff < 7 && /μεθεπομενη/.test(T[i - 1].n)) diff += 7;
      date = addDays(today, diff); used.add(i); prevFill(i);
    }
  });
  // Ώρα: «στις 10», «στις 10:30», «10:30», «στις 10 και μισή», «στις 8 το βράδυ».
  for (let i = 0; i < T.length; i++) {
    if (used.has(i)) continue;
    let h = null, mi = 0, k = i;
    if (/^στισ$/.test(T[i].n) && T[i + 1] && /^\d{1,2}([:.]\d{2})?$/.test(T[i + 1].n) && !used.has(i + 1)) { k = i + 1; }
    else if (!/^\d{1,2}[:.]\d{2}$/.test(T[i].n)) continue;
    const [hh, mm] = T[k].n.split(/[:.]/); h = +hh; mi = +(mm || 0); used.add(i); used.add(k);
    let j = k + 1;
    if (T[j] && T[j].n === 'και' && T[j + 1] && /^(μιση|τεταρτο)$/.test(T[j + 1].n)) { mi = T[j + 1].n === 'μιση' ? 30 : 15; used.add(j); used.add(j + 1); j += 2; }
    else if (T[j] && T[j].n === 'παρα' && T[j + 1] && /^τεταρτο$/.test(T[j + 1].n)) { h -= 1; mi = 45; used.add(j); used.add(j + 1); j += 2; }
    if (T[j] && /^(το|τo)$/.test(T[j].n) && T[j + 1] && /^(πρωι|απογευμα|βραδυ|μεσημερι|μεσανυχτα)$/.test(T[j + 1].n)) { pmHint = T[j + 1].n; used.add(j); used.add(j + 1); }
    else if (T[j] && /^(πμ|μμ)$/.test(T[j].n)) { pmHint = T[j].n === 'μμ' ? 'απογευμα' : 'πρωι'; used.add(j); }
    if (h > 23 || mi > 59) { h = null; continue; }
    if (pmHint && /απογευμα|βραδυ/.test(pmHint) && h < 12) h += 12;
    if (pmHint === 'μεσημερι' && h < 5) h += 12;
    // Χωρίς «πρωί/απόγευμα»: 1-7 εννοείται απόγευμα (κανείς δεν κλείνει ραντεβού στις 5 τα ξημερώματα).
    if (!pmHint && h >= 1 && h <= 7) h += 12;
    time = `${pad(h)}:${pad(mi)}`; break;
  }
  T.forEach((t, i) => { if (/^(πρωι|απογευμα|βραδυ|μεσημερι)$/.test(t.n) && !used.has(i) && T[i - 1] && T[i - 1].n === 'το') { used.add(i); used.add(i - 1); } });
  // Κείμενο: ό,τι έμεινε, χωρίς τις λέξεις εντολής στην αρχή και τα «την/στις» στις άκρες.
  let rest = T.filter((_, i) => !used.has(i));
  while (rest.length && (LEAD_SKIP.test(rest[0].n) || FILL.test(rest[0].n))) rest.shift();
  while (rest.length && FILL.test(rest[rest.length - 1].n)) rest.pop();
  const text = rest.map((t) => t.r).join(' ').replace(/^[,.\s:]+|[,.\s:]+$/g, '');
  return { date, time, text: text ? text.charAt(0).toUpperCase() + text.slice(1) : '', weekly };
}

/* ---- Τι έχω μια μέρα: όλες οι πηγές μαζί ---- */
function dayItems(d) {
  const items = [];
  eventsOn(d).forEach((e) => items.push({ time: e.time, text: e.text, kind: 'ev', id: e.id }));
  try { agendaOn(d).forEach((a) => items.push({ time: a.time, text: a.text, kind: 'week' })); } catch {}
  reminders.filter((r) => !r.ev && sameDay(new Date(r.due), d)).forEach((r) => items.push({ time: hm(new Date(r.due)), text: r.kind === 'alarm' ? 'Ξυπνητήρι' : r.kind === 'timer' ? 'Χρονόμετρο' : r.text, kind: 'rem' }));
  try { birthdaysOn(d).forEach((b) => items.push({ time: '', text: `Γενέθλια: ${b.name}`, kind: 'bd' })); } catch {}
  try { const ev = typeof calEvents === 'function' ? calEvents(31) : null; if (Array.isArray(ev)) { const a = new Date(d).setHours(0, 0, 0, 0), b = a + 86400000; ev.filter((e) => e.s < b && e.e > a).forEach((e) => items.push({ time: e.all ? '' : hmOf(e.s), text: e.t, kind: 'phone' })); } } catch {}
  return items.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
}
function daySay(d) {
  const it = dayItems(d);
  if (!it.length) return `Για ${dayName(d)} δεν έχετε τίποτα${nmc()}.`;
  return `Για ${dayName(d)}: ${it.map((x) => (x.time ? `στις ${x.time.replace(/^0/, '')}, ` : '') + x.text).join('. ')}.`;
}

/* ---- Φωνητικές εντολές ---- */
const findEvents = (n) => {
  const up = events.filter((e) => dOf(e.date) >= new Date(new Date().setHours(0, 0, 0, 0)));
  const words = n.split(' ').filter((w) => w.length >= 4);
  return up.filter((e) => norm(e.text).split(' ').some((w) => w.length >= 4 && words.some((x) => x.startsWith(w.slice(0, Math.max(4, w.length - 2))) || w.startsWith(x.slice(0, Math.max(4, x.length - 2))))));
};
function openCalendar(d) { memTab = 'cal'; if (d) { Cal.sel = dstr(d); Cal.month = new Date(d.getFullYear(), d.getMonth(), 1); } renderMem(); $('#memory').classList.remove('hidden'); }
intents.unshift(
  // Προσθήκη: «βάλε στο ημερολόγιο την Πέμπτη στις 10:30 οδοντίατρο», «έχω ραντεβού στις 25 Νοεμβρίου στις 8 με τον Γιώργο»
  { re: /(ημερολογιο|ραντεβου|ατζεντα|προγραμμα)/, test: (n) => /(βαλε|βαλτε|προσθεσε|γραψε|σημειωσε|καταχωρησε|κλεισε (ενα )?ραντεβου|^εχω ραντεβου|κλεισα ραντεβου)/.test(n) && !/(καθε |καθημεριν)/.test(n) && !/^(ανοιξε|δειξε)/.test(n), run: (raw) => {
    const p = parseEvent(raw);
    if (!p.date && !p.time) return 'Πείτε μου και πότε, π.χ. «βάλε στο ημερολόγιο την Πέμπτη στις 10:30 οδοντίατρο» ή «στις 25 Νοεμβρίου στις 8 το βράδυ δείπνο».';
    if (!p.text) return 'Τι να γράψω; Πείτε π.χ. «βάλε στο ημερολόγιο αύριο στις 10 οδοντίατρο».';
    let date = p.date;
    if (!date) { date = new Date(); date.setHours(0, 0, 0, 0); const [h, m] = p.time.split(':').map(Number); const at = new Date(date); at.setHours(h, m); if (at < new Date()) date = addDays(date, 1); }
    const e = { id: uid(), date: dstr(date), time: p.time || '', text: p.text, remId: null };
    const clash = p.time ? eventsOn(date).find((x) => x.time && Math.abs((+x.time.slice(0, 2) * 60 + +x.time.slice(3)) - (+p.time.slice(0, 2) * 60 + +p.time.slice(3))) < 60) : null;
    events.push(e); remindFor(e); saveEvents(); try { renderMem(); } catch {}
    return `Καταχωρήθηκε: ${e.text}, ${dayName(date)}${e.time ? ' στις ' + e.time.replace(/^0/, '') : ', όλη μέρα'}.${e.remId ? ' Θα σας ειδοποιήσω μία ώρα πριν.' : ''}${clash ? ` Προσοχή: την ίδια ώρα περίπου έχετε και ${clash.text}, στις ${clash.time}.` : ''}`;
  } },
  // Ερώτηση: «τι έχω αύριο», «τι έχω την Παρασκευή», «τι έχω στις 25 Νοεμβρίου», «τι έχω αυτή την εβδομάδα»
  { re: /(τι εχω|τι ραντεβου εχω|εχω κατι|τι κανω|το προγραμμα μου|τι γραφει το ημερολογιο|τι εχει το ημερολογιο|ποτε εχω)/, test: (n) => !/(γυμναστικ|διαλογισ|τηλεορασ|ποτε εχω γενεθλια)/.test(n) && !/^τι κανω$/.test(n), run: (raw, n) => {
    if (/ποτε εχω/.test(n)) { const f = findEvents(n.replace(/ποτε εχω/, '')); if (!f.length) return 'Δεν βρίσκω τέτοιο ραντεβού στο ημερολόγιο.'; return f.slice(0, 3).map((e) => `${e.text}: ${dayName(dOf(e.date))}${e.time ? ' στις ' + e.time.replace(/^0/, '') : ''}`).join('. ') + '.'; }
    if (/(εβδομαδα|εβδομαδασ|επομενεσ μερεσ|ολη την εβδομαδα)/.test(n)) {
      const out = []; for (let i = 0; i < 7; i++) { const d = addDays(new Date(), i); const it = dayItems(d); if (it.length) out.push(`${i === 0 ? 'Σήμερα' : i === 1 ? 'Αύριο' : DAYS[d.getDay()] + ' ' + d.getDate()}: ${it.map((x) => (x.time ? x.time.replace(/^0/, '') + ' ' : '') + x.text).join(', ')}`); }
      return out.length ? out.join('. ') + '.' : 'Τις επόμενες επτά μέρες δεν έχετε τίποτα στο ημερολόγιο.';
    }
    const p = parseEvent(raw); const d = p.date || new Date();
    return daySay(d);
  } },
  // Διαγραφή: «σβήσε τον οδοντίατρο», «ακύρωσε το ραντεβού με τον Γιώργο»
  { re: /(σβησε|διεγραψε|ακυρωσε|βγαλε|αφαιρεσε)/, test: (n) => findEvents(n).length > 0, run: (raw, n) => {
    const f = findEvents(n.replace(/(σβησε|διεγραψε|ακυρωσε|βγαλε|αφαιρεσε|το ραντεβου|απο το ημερολογιο)/g, ' '));
    if (f.length > 1) { const p = parseEvent(raw); const g = p.date ? f.filter((e) => e.date === dstr(p.date)) : []; if (g.length !== 1) return `Βρήκα ${f.length}: ${f.slice(0, 4).map((e) => `${e.text} (${dayName(dOf(e.date))})`).join(', ')}. Πείτε μου και τη μέρα.`; f.splice(0, f.length, g[0]); }
    const e = f[0]; dropReminder(e.remId); events = events.filter((x) => x.id !== e.id); saveEvents(); try { renderMem(); } catch {}
    return `Διαγράφηκε: ${e.text}, ${dayName(dOf(e.date))}.`;
  } },
  // Μετακίνηση: «μετάφερε τον οδοντίατρο στις 11», «άλλαξε τον οδοντίατρο για την Παρασκευή»
  { re: /(μεταφερε|μετεφερε|αλλαξε|πηγαινε|μετακινησε|καθυστερησε)/, test: (n) => findEvents(n).length > 0, run: (raw, n) => {
    const f = findEvents(n.replace(/(μεταφερε|αλλαξε|μετακινησε|πηγαινε)/g, ' ')); if (f.length > 1) return `Βρήκα ${f.length} ραντεβού με αυτό το όνομα. Πείτε μου ποιο, με την ημερομηνία του.`;
    const e = f[0]; const p = parseEvent(raw);
    if (!p.date && !p.time) return `Πότε να μεταφέρω το «${e.text}»; Πείτε π.χ. «μετάφερε τον ${e.text.toLowerCase()} στις 11» ή «για την Παρασκευή».`;
    if (p.date) e.date = dstr(p.date); if (p.time) e.time = p.time;
    remindFor(e); saveEvents(); try { renderMem(); } catch {}
    return `Μεταφέρθηκε: ${e.text}, ${dayName(dOf(e.date))}${e.time ? ' στις ' + e.time.replace(/^0/, '') : ''}.`;
  } },
  { re: /^(ανοιξε|δειξε|δειξε μου|ανοιξτε) (το |μου το )?(ημερολογιο|ατζεντα|μηνα)( μου)?$/, run: () => { openCalendar(new Date()); return { text: 'Το ημερολόγιό σας.', silent: false }; } },
);

/* ---- Προβολή μήνα στα «◈ Δεδομένα» ---- */
const Cal = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), sel: dstr(new Date()) };
TABS.unshift({ k: 'cal', label: 'ΗΜΕΡΟΛΟΓΙΟ', get: () => events, set: (v) => { events = v; saveEvents(); },
  head: () => 'Πατήστε μια μέρα για να δείτε τι έχετε. Με τη φωνή: «βάλε στο ημερολόγιο την Πέμπτη στις 10 οδοντίατρο».',
  render(ul) {
    const m = Cal.month, first = new Date(m.getFullYear(), m.getMonth(), 1), start = (first.getDay() + 6) % 7, days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const todayK = dstr(new Date());
    let cells = ''; for (let i = 0; i < 42; i++) {
      const d = new Date(m.getFullYear(), m.getMonth(), i - start + 1), k = dstr(d), out = d.getMonth() !== m.getMonth();
      if (i >= 35 && out && i - start + 1 > days) break;
      const it = dayItems(d); const dots = it.slice(0, 4).map((x) => `<i class="${x.kind === 'bd' ? 'a' : x.kind === 'rem' ? 'r' : ''}"></i>`).join('');
      cells += `<button type="button" class="cd${out ? ' o' : ''}${k === todayK ? ' t' : ''}${k === Cal.sel ? ' s' : ''}" data-d="${k}">${d.getDate()}<span class="dots">${dots}</span></button>`;
    }
    const sd = dOf(Cal.sel), items = dayItems(sd);
    const li = document.createElement('li'); li.className = 'cal-wrap';
    li.innerHTML = `<div class="cal-hd"><button type="button" data-m="-1">‹</button><b>${MONTHS_NOM[m.getMonth()]} ${m.getFullYear()}</b><button type="button" data-m="1">›</button></div>
      <div class="cal-grid">${['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'].map((x) => `<span class="cdn">${x}</span>`).join('')}${cells}</div>
      <div class="cal-legend"><span><i></i>ραντεβού</span><span><i class="a"></i>γενέθλια</span><span><i class="r"></i>υπενθυμίσεις</span></div>
      <div class="cal-day"><h4>${escapeHtml(dayName(sd).replace(/^./, (c) => c.toUpperCase()))}</h4>
      ${items.length ? items.map((x) => `<div class="cev ${x.kind}"><b>${x.time ? x.time : x.kind === 'bd' ? '🎂' : '•'}</b><span>${escapeHtml(x.text)}<small>${{ ev: 'ραντεβού', week: 'κάθε εβδομάδα', rem: 'υπενθύμιση', bd: '', phone: 'ημερολόγιο κινητού' }[x.kind]}</small></span>${x.kind === 'ev' ? `<button type="button" class="cdel" data-id="${x.id}" title="Διαγραφή">✕</button>` : ''}</div>`).join('') : '<div class="cempty">— τίποτα —</div>'}
      <form class="cadd"><input name="time" type="time"><input name="text" placeholder="π.χ. Οδοντίατρος" required><button type="submit">+</button></form></div>`;
    ul.appendChild(li);
    li.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { Sound.tap(); Cal.month = new Date(m.getFullYear(), m.getMonth() + +b.dataset.m, 1); renderMem(); }));
    li.querySelectorAll('.cd').forEach((b) => (b.onclick = () => { Sound.tap(); Cal.sel = b.dataset.d; const d = dOf(Cal.sel); if (d.getMonth() !== m.getMonth()) Cal.month = new Date(d.getFullYear(), d.getMonth(), 1); renderMem(); }));
    li.querySelectorAll('.cdel').forEach((b) => (b.onclick = () => { const e = events.find((x) => String(x.id) === b.dataset.id); if (!e) return; dropReminder(e.remId); events = events.filter((x) => x !== e); saveEvents(); Sound.tap(); renderMem(); }));
    li.querySelector('.cadd').onsubmit = (ev) => { ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target)); const text = String(f.text || '').trim(); if (!text) return Sound.error();
      const e = { id: uid(), date: Cal.sel, time: f.time || '', text: text.charAt(0).toUpperCase() + text.slice(1), remId: null }; events.push(e); remindFor(e); saveEvents(); Sound.reply(); renderMem(); };
  } });

/* Πρωινή ενημέρωση και «εγκέφαλος»: ξέρουν τα σημερινά ραντεβού. */
const baseAiCtxC = window.aiContext;
window.aiContext = () => (baseAiCtxC ? baseAiCtxC() : '') + (() => { const e = eventsOn(new Date()), t = eventsOn(addDays(new Date(), 1)); return ` Ραντεβού σήμερα: ${e.map((x) => (x.time ? x.time + ' ' : '') + x.text).join(', ') || 'κανένα'}. Αύριο: ${t.map((x) => (x.time ? x.time + ' ' : '') + x.text).join(', ') || 'κανένα'}.`; })();
// Παλιά ραντεβού (πάνω από 60 μέρες) σβήνονται, για να μη γεμίζει η μνήμη.
events = events.filter((e) => dOf(e.date) > addDays(new Date(), -60)); saveEvents();
