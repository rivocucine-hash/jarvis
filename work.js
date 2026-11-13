/* =========================================================
   J.A.R.V.I.S. — Δουλειά & βραδινή «καληνύχτα»
   ========================================================= */
'use strict';

Object.entries({ workStart: '09:00', workEnd: '17:00', workWeekend: false, workBrief: true, nightTime: '23:00', autoNight: true }).forEach(([k, v]) => { if (S[k] === undefined) S[k] = v; });
saveSettings();
let work = Store.get('work', []); // {id, text, project, prio:1|2|3, due:'YYYY-MM-DD'|'', done, doneAt, created}
const saveWork = () => { Store.set('work', work); renderMem(); };
const PRIO = { 1: '🔴 Επείγον', 2: '🟡 Κανονικό', 3: '🟢 Χαμηλό' };
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isWorkDay = (d = new Date()) => S.workWeekend || (d.getDay() >= 1 && d.getDay() <= 5);

/* ---------- Ανάλυση προθεσμίας και προτεραιότητας ---------- */
function parseDue(n) {
  n = wordsToNums(n); const today = new Date(); today.setHours(0, 0, 0, 0);
  if (/μεθαυριο/.test(n)) return addDays(today, 2);
  if (/αυριο/.test(n)) return addDays(today, 1);
  if (/(σημερα|αποψε|μεχρι το βραδυ)/.test(n)) return today;
  let m = n.match(/σε\s+(\d+)\s*(μερεσ|μερα|ημερεσ)/); if (m) return addDays(today, +m[1]);
  m = n.match(/σε\s+(\d+)\s*(εβδομαδεσ|εβδομαδα)/); if (m) return addDays(today, 7 * +m[1]);
  if (/(επομενη εβδομαδα|αλλη εβδομαδα)/.test(n)) return addDays(today, ((8 - today.getDay()) % 7) || 7);
  if (/(τελοσ τησ εβδομαδασ|μεχρι την παρασκευη)/.test(n)) return addDays(today, (5 - today.getDay() + 7) % 7);
  if (/(τελοσ του μηνα)/.test(n)) return new Date(today.getFullYear(), today.getMonth() + 1, 0);
  m = n.match(/(\d{1,2})\s*\/\s*(\d{1,2})/); if (m) { let d = new Date(today.getFullYear(), +m[2] - 1, +m[1]); if (d < today) d.setFullYear(d.getFullYear() + 1); return d; }
  m = n.match(/(\d{1,2})\s+([α-ω]+)/); if (m && monthOfToken(m[2]) >= 0) { let d = new Date(today.getFullYear(), monthOfToken(m[2]), +m[1]); if (d < today) d.setFullYear(d.getFullYear() + 1); return d; }
  const di = n.split(' ').map(dayOfToken).find((x) => x >= 0); if (di != null && di >= 0) return addDays(today, ((di - today.getDay() + 7) % 7) || 7);
  return null;
}
const parsePrio = (n) => (/(επειγ|σημαντικ|προτεραιοτητα|αμεσα|κρισιμ|asap)/.test(n) ? 1 : /(οταν μπορω|χαμηλ|καποια στιγμη|χωρισ βιαση)/.test(n) ? 3 : 2);
function dueLabel(due) {
  if (!due) return ''; const t = new Date(); t.setHours(0, 0, 0, 0); const d = new Date(due + 'T00:00'); const diff = Math.round((d - t) / 86400000);
  return diff < 0 ? `εκπρόθεσμη ${-diff === 1 ? 'από χθες' : `${-diff} μέρες`}` : diff === 0 ? 'σήμερα' : diff === 1 ? 'αύριο' : diff < 7 ? `${DAYS[d.getDay()]}` : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
const openWork = () => work.filter((w) => !w.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.prio - b.prio);
const todayStr = () => ymd(new Date());
const overdue = () => openWork().filter((w) => w.due && w.due < todayStr());
const dueToday = () => openWork().filter((w) => w.due === todayStr());
const nextTask = () => [...openWork()].sort((a, b) => ((a.due && a.due <= todayStr()) ? 0 : 1) - ((b.due && b.due <= todayStr()) ? 0 : 1) || a.prio - b.prio || (a.due || '9999').localeCompare(b.due || '9999'))[0];
function findWork(n) { const open = work.filter((w) => !w.done); return open.find((w) => n.includes(norm(w.text))) || open.find((w) => norm(w.text).split(' ').filter((x) => x.length > 3).some((x) => n.includes(x.slice(0, -1)))); }

function workSummary(short) {
  const o = openWork(); if (!o.length) return 'Δεν έχετε ανοιχτές εργασίες στη δουλειά. Καθαρό γραφείο, καθαρό μυαλό.';
  const od = overdue(), td = dueToday(), urgent = o.filter((w) => w.prio === 1 && !od.includes(w) && !td.includes(w)), rest = o.filter((w) => !od.includes(w) && !td.includes(w) && !urgent.includes(w));
  const L = (arr) => arr.map((w) => `${w.text}${w.project ? ` (${w.project})` : ''}${w.due && !td.includes(w) ? `, ${dueLabel(w.due)}` : ''}`).join(', ');
  const p = [];
  if (od.length) p.push(`Εκπρόθεσμες: ${L(od)}`);
  if (td.length) p.push(`Για σήμερα: ${L(td)}`);
  if (urgent.length) p.push(`Επείγουσες: ${L(urgent)}`);
  if (!short && rest.length) p.push(`Επόμενες: ${L(rest.slice(0, 5))}${rest.length > 5 ? ` και άλλες ${rest.length - 5}` : ''}`);
  return `Έχετε ${o.length} ${o.length === 1 ? 'ανοιχτή εργασία' : 'ανοιχτές εργασίες'}. ${p.join('. ')}.`;
}

/* ---------- Βραδινή «καληνύχτα» ---------- */
async function eveningBriefing() {
  const now = new Date(), tom = addDays(now, 1), sp = [], html = [];
  const add = (icon, t) => { html.push(`<div style="margin-top:5px">${icon} ${escapeHtml(t)}</div>`); sp.push(t); };
  const head = `Καληνύχτα${nmc()}. Ας κλείσουμε τη μέρα.`;
  // σήμερα
  const doneToday = work.filter((w) => w.done && w.doneAt && sameDay(new Date(w.doneAt), now)).length;
  const habDone = habits.filter((h) => h.log[dkey()]).length;
  let today = [];
  if (doneToday) today.push(`ολοκληρώσατε ${doneToday} ${doneToday === 1 ? 'εργασία' : 'εργασίες'}`);
  if (habits.length) today.push(`${habDone} από ${habits.length} συνήθειες`);
  today.push(`ήπιατε ${(waterToday() / 1000).toFixed(1).replace('.', ',')} λίτρα νερό`);
  add('✅', `Σήμερα: ${today.join(', ')}.${habDone === habits.length && habits.length ? ' Τέλεια μέρα!' : ''}`);
  const risk = habits.filter((h) => !h.log[dkey()] && habitStreak(h) >= 2); if (risk.length) add('🔥', `Προλαβαίνετε ακόμα: ${risk.map((h) => h.name).join(', ')}, για να μη χαθεί το σερί.`);
  // αύριο
  try { const w = await getWeather(); if (w) { const pr = w.daily.precipitation_probability_max[1]; add('☁', `Αύριο: ${(WMO[w.daily.weather_code[1]] || '').toLowerCase()}, ${Math.round(w.daily.temperature_2m_min[1])} με ${Math.round(w.daily.temperature_2m_max[1])} βαθμούς${pr > 40 ? `, πιθανότητα βροχής ${pr}%` : ''}.`); } } catch {}
  const ag = agendaOn(tom); if (ag.length) add('🗓', `Πρόγραμμα αύριο: ${ag.map((a) => `${a.time} ${a.text}`).join(', ')}.`);
  const wt = openWork().filter((w) => w.due && w.due <= ymd(tom)); if (wt.length && isWorkDay(tom)) add('💼', `Δουλειά αύριο: ${wt.slice(0, 4).map((w) => w.text).join(', ')}.`); else if (isWorkDay(tom) && openWork().length) add('💼', `Πρώτη εργασία αύριο: ${nextTask().text}.`);
  const bd = birthdaysOn(tom); if (bd.length) add('🎂', `Αύριο έχει γενέθλια: ${bd.map((b) => b.name).join(', ')}.`);
  const nd = namedaysOn(tom); const cel = celebratingContacts(tom); if (cel.length) add('🎉', `Αύριο γιορτάζει: ${cel.join(', ')}.`); else if (nd.length) add('🎉', `Αύριο γιορτάζουν: ${nd.slice(0, 5).join(', ')}.`);
  if (typeof pills !== 'undefined') { const pm = pills.flatMap((p) => p.times.filter((t) => t >= '19:00' && !pillTaken(p, t)).map(() => p.name)); if (pm.length) add('💊', `Μην ξεχάσετε απόψε: ${[...new Set(pm)].join(', ')}.`); }
  // ύπνος
  const { h, m } = parseHM(S.wakeTime); const wk = new Date(now); wk.setHours(h, m, 0, 0); if (wk <= now) wk.setDate(wk.getDate() + 1);
  const bt = bedtimesFor(wk); const best = [bt[1], bt[0], bt[2]].find((b) => b.t > now); const sleepNow = new Date(Date.now() + (5 * 90 + 15) * 60000);
  add('☾', best ? `Για να ξυπνήσετε ξεκούραστος στις ${hm(wk)}, ιδανικά κοιμηθείτε στις ${hm(best.t)}.` : `Αν κοιμηθείτε τώρα, ιδανική ώρα αφύπνισης: ${hm(sleepNow)}.`);
  add('✨', pick(['Ό,τι δεν έγινε σήμερα, θα γίνει αύριο. Ξεκουραστείτε.', 'Κάνατε αρκετά. Το σώμα και το μυαλό χτίζονται στον ύπνο.', 'Αφήστε το κινητό μακριά και δώστε στον εαυτό σας ένα ήσυχο βράδυ.', 'Περήφανος για σήμερα; Θα έπρεπε. Καληνύχτα.']));
  await say(head, { html: `<b>🌙 ${escapeHtml(head)}</b>` + html.join(''), speak: head + ' ' + sp.join(' '), noRelisten: true });
  document.body.classList.add('night');
  pending = (raw, nn) => {
    if (/(μουσικη|χαλαρωσ)/.test(nn)) { Music.start('sleep', 30); return 'Μουσική για ύπνο για 30 λεπτά. Καληνύχτα.'; }
    if (/^(οχι|τιποτα|δεν ξερω|ασ το)/.test(nn)) return 'Δεν πειράζει. Αύριο είναι μια νέα μέρα. Όνειρα γλυκά.';
    journal.push({ id: uid(), text: raw, at: Date.now(), kind: 'reflection' }); Store.set('journal', journal);
    pending = (r2, n2) => (/^(ναι|οκ|ok|βαλε|παιξε)/.test(n2) ? (Music.start('sleep', 30), 'Μουσική για ύπνο για 30 λεπτά. Όνειρα γλυκά.') : /^(οχι)/.test(n2) ? 'Καληνύχτα. Τα λέμε αύριο.' : null);
    return 'Καταγράφηκε στο ημερολόγιο. Να είστε περήφανος για σήμερα. Θέλετε μουσική για ύπνο; Αλλιώς, καληνύχτα.';
  };
  say('Πριν κλείσετε τα μάτια: πείτε μου ένα πράγμα που πήγε καλά σήμερα.', { noRelisten: true });
}

/* ---------- Ενημέρωση αρχής/τέλους βάρδιας & έλεγχοι ---------- */
async function workStartBrief() {
  const o = openWork(); if (!o.length) return say(`Καλή αρχή στη δουλειά${nmc()}. Δεν υπάρχουν ανοιχτές εργασίες. Ιδανική μέρα για τα στρατηγικά.`, { noRelisten: true });
  const nt = nextTask();
  pending = (raw, nn) => (/^(ναι|οκ|ok|παμε|ξεκινα|βεβαια)/.test(nn) ? (Pomo.start(25, 5), `Pomodoro 25 λεπτών για: ${nt.text}. Συγκέντρωση!`) : null);
  return say(`Καλή αρχή στη δουλειά${nmc()}. ${workSummary(true)} Προτείνω να ξεκινήσετε από: ${nt.text}. Θέλετε pomodoro συγκέντρωσης;`, { noRelisten: true });
}
function workEndBrief() {
  const done = work.filter((w) => w.done && w.doneAt && sameDay(new Date(w.doneAt), new Date()));
  const o = openWork(); const tomorrow = o.filter((w) => w.due && w.due <= ymd(addDays(new Date(), 1)));
  return say(`Τέλος βάρδιας${nmc()}. ${done.length ? `Σήμερα ολοκληρώσατε ${done.length}: ${done.map((w) => w.text).join(', ')}. Μπράβο!` : 'Σήμερα δεν σημειώσατε ολοκληρωμένες εργασίες.'} ${tomorrow.length ? `Για αύριο: ${tomorrow.map((w) => w.text).join(', ')}.` : o.length ? `Απομένουν ${o.length} ανοιχτές.` : 'Δεν απομένει τίποτα!'} Κλείστε τον υπολογιστή και αφήστε τη δουλειά στη δουλειά.`, { noRelisten: true });
}
function tickWork() {
  const d = new Date(), now = `${pad(d.getHours())}:${pad(d.getMinutes())}`, day = todayKey();
  if (S.workBrief && isWorkDay(d)) {
    if (now === S.workStart && once(`ws-${day}`)) { toast('ΔΟΥΛΕΙΑ', 'Καλή αρχή! ' + workSummary(true)); notify('Δουλειά', workSummary(true)); workStartBrief(); }
    if (now === S.workEnd && once(`we-${day}`)) { notify('Δουλειά', 'Τέλος βάρδιας'); workEndBrief(); }
  }
  if (now === '18:00' && once(`wd-${day}`)) { const t = openWork().filter((w) => w.due === ymd(addDays(d, 1)) && w.prio === 1); if (t.length) { const msg = `Αύριο λήγει: ${t.map((w) => w.text).join(', ')}.`; toast('ΠΡΟΘΕΣΜΙΑ', msg); notify('Προθεσμία', msg); } }
  if (S.autoNight && now === S.nightTime && once(`night-${day}`)) { notify('Καληνύχτα', 'Η βραδινή σύνοψη της ημέρας σας περιμένει.'); eveningBriefing(); }
  if (document.body.classList.contains('night') && d.getHours() >= 6 && d.getHours() < 20) document.body.classList.remove('night');
}

/* ---------- Πρωινή ενημέρωση: δουλειά ---------- */
const baseExtrasW = window.briefingExtras;
window.briefingExtras = async (add, d) => {
  if (baseExtrasW) await baseExtrasW(add, d);
  if (!openWork().length || !isWorkDay(d)) return;
  const od = overdue(), td = dueToday();
  add('💼', `Δουλειά: ${od.length ? `${od.length} εκπρόθεσμες (${od.map((w) => w.text).join(', ')}). ` : ''}${td.length ? `Για σήμερα: ${td.map((w) => w.text).join(', ')}. ` : ''}Πρώτη προτεραιότητα: ${nextTask().text}.`);
};

/* ---------- Καρτέλα ΔΟΥΛΕΙΑ ---------- */
TABS.splice(1, 0, { k: 'work', label: 'ΔΟΥΛΕΙΑ', get: () => work, set: (v) => { work = v; },
  fields: [{ n: 'text', ph: 'Νέα εργασία' }, { n: 'due', type: 'date' }, { n: 'prio', type: 'select', opts: [['2', '🟡 Κανονικό'], ['1', '🔴 Επείγον'], ['3', '🟢 Χαμηλό']] }], opt: ['due'],
  make: (f) => ({ id: uid(), text: f.text, project: '', prio: +f.prio, due: f.due || '', done: false, created: Date.now() }),
  head: () => { const o = openWork(); return o.length ? `Ανοιχτές: <b>${o.length}</b> · Εκπρόθεσμες: <b>${overdue().length}</b> · Σήμερα: <b>${dueToday().length}</b> · Ολοκληρωμένες: ${work.filter((w) => w.done).length}` : 'Πείτε π.χ. «πρόσθεσε εργασία να στείλω την προσφορά μέχρι αύριο, επείγον».'; },
  render(ul) {
    const list = [...openWork(), ...work.filter((w) => w.done).sort((a, b) => b.doneAt - a.doneAt).slice(0, 10)];
    if (!list.length) { ul.innerHTML = '<li class="empty">— κενό —</li>'; return; }
    list.forEach((w) => {
      const late = w.due && w.due < todayStr() && !w.done; const li = document.createElement('li'); li.className = (w.done ? 'done' : '') + (late ? ' late' : '');
      li.innerHTML = `<button data-a="t">${w.done ? '✓' : ''}</button><span>${escapeHtml(w.text)}<small>${PRIO[w.prio]}${w.project ? ' · ' + escapeHtml(w.project) : ''}${w.due ? ' · ' + dueLabel(w.due) : ''}</small></span><button data-a="d">✕</button>`;
      li.querySelector('[data-a=t]').onclick = () => { w.done = !w.done; w.doneAt = w.done ? Date.now() : null; if (w.done) { Sound.tone(988, 0.12, 'triangle', 0.12); Sound.tone(1319, 0.18, 'triangle', 0.12, 0.1); if (!openWork().length) celebrate(true); } saveWork(); };
      li.querySelector('[data-a=d]').onclick = () => { work = work.filter((x) => x !== w); saveWork(); };
      ul.appendChild(li);
    });
  } });

/* ---------- Βοήθεια ---------- */
const baseHelpW = helpHtml;
helpHtml = function () {
  const G = [['💼 Δουλειά', ['«Πρόσθεσε εργασία να στείλω την προσφορά μέχρι αύριο, επείγον»', '«Νέα εργασία για τον πελάτη Χ: τηλεφώνημα την Πέμπτη»', '«Τι δουλειές έχω;» / «Με τι να ξεκινήσω;»', '«Ολοκλήρωσα την προσφορά» / «Μετάθεσε την αναφορά για Δευτέρα»', 'Αυτόματα: ενημέρωση στην αρχή και σύνοψη στο τέλος της βάρδιας']],
    ['🌙 Καληνύχτα', ['«Καληνύχτα» → σύνοψη ημέρας, αύριο, ιδανική ώρα ύπνου, ημερολόγιο', 'Έρχεται αυτόματα κάθε βράδυ στην ώρα που ορίζετε στις ρυθμίσεις']]];
  return baseHelpW() + G.map(([h, l]) => `<div style="margin-top:8px"><b>${h}</b>${l.map((x) => `<div style="opacity:.8;margin-left:6px">${x}</div>`).join('')}</div>`).join('');
};

/* ---------- Εντολές ---------- */
const W = [
  { re: /^(καληνυχτα|καληνυχτα σου|πεφτω για υπνο|παω για υπνο|θα κοιμηθω|ωρα για υπνο|βραδινη συνοψη|βραδινη ενημερωση)/, run: () => { eveningBriefing(); return { silent: true, text: '' }; } },
  { re: /(προσθεσε|νεα|γραψε|βαλε|καταχωρησε)\s+(?:μια\s+|μία\s+)?(εργασια|δουλεια|task)|(?:προσθεσε|βαλε|γραψε)\s+.+\s+(?:στη δουλεια|στισ δουλειεσ|για τη δουλεια|στισ εργασιεσ)$/, test: (n) => !/(συνηθεια|στοχ)/.test(n), run: (raw, n) => {
    let body = n.replace(/^(προσθεσε|νεα|γραψε|βαλε|καταχωρησε)\s+(μια\s+)?(εργασια|δουλεια|task)?\s*(για τη δουλεια|στη δουλεια|στισ δουλειεσ|στισ εργασιεσ)?\s*:?\s*/, '');
    let project = ''; const pm = body.match(/(?:για τον πελατη|για την πελατισσα|για το εργο|για το project|στο εργο|στο project|για την εταιρεια)\s+([^\s,:]+(?:\s[^\s,:]+)?)\s*:?/);
    if (pm) { project = cap(rawSpan(raw, n, pm[1])).replace(/[:,.;]+$/, ''); body = body.replace(pm[0], ' '); }
    const due = parseDue(body), prio = parsePrio(body);
    body = body.replace(/(στη δουλεια|στισ δουλειεσ|για τη δουλεια|στισ εργασιεσ)/g, '').replace(/,?\s*(επειγον|επειγουσα|σημαντικο|σημαντικη|με προτεραιοτητα|αμεσα|οταν μπορω|χαμηλη προτεραιοτητα|χωρισ βιαση)\s*$/g, '')
      .replace(/\s+(μεχρι|εωσ|ωσ|για|την|το)?\s*(σημερα|αυριο|μεθαυριο|την επομενη εβδομαδα|τελοσ τησ εβδομαδασ|τελοσ του μηνα|σε \d+ μερεσ|\d{1,2}\s*\/\s*\d{1,2}|\d{1,2}\s+[α-ω]+|(?:την |το )?(?:δευτερα|τριτη|τεταρτη|πεμπτη|παρασκευη|σαββατο|κυριακη))\s*$/g, '').replace(/^οτι\s+/, '').replace(/[,.:]+$/, '').trim();
    if (!body) return 'Ποια είναι η εργασία; Πείτε π.χ. «πρόσθεσε εργασία να στείλω την προσφορά μέχρι αύριο».';
    const text = ufx(rawSpan(raw, n, body));
    work.push({ id: uid(), text, project, prio, due: due ? ymd(due) : '', done: false, created: Date.now() }); saveWork();
    return `Νέα εργασία: «${text}»${project ? `, για ${project}` : ''}${due ? `, προθεσμία ${dueLabel(ymd(due))}` : ''}${prio === 1 ? ', επείγουσα' : ''}. Έχετε ${openWork().length} ανοιχτές.`; } },
  { re: /(τι δουλειεσ εχω|τι εργασιεσ|εργασιεσ μου|τι εχω στη δουλεια|τι εχω για τη δουλεια|τι πρεπει να κανω στη δουλεια|δουλειεσ μου|εκκρεμοτητεσ στη δουλεια|ενημερωση δουλειασ)/, run: () => workSummary(false) },
  { re: /(με τι να ξεκινησω|τι να κανω πρωτα|επομενη εργασια|ποια ειναι η προτεραιοτητα)/, run: () => { const t = nextTask(); if (!t) return 'Δεν υπάρχει ανοιχτή εργασία.'; pending = (raw, nn) => (/^(ναι|οκ|ok|παμε)/.test(nn) ? (Pomo.start(25, 5), `Pomodoro για: ${t.text}. Πάμε!`) : null); return `Ξεκινήστε από: ${t.text}${t.due ? `, ${dueLabel(t.due)}` : ''}. Θέλετε pomodoro 25 λεπτών;`; } },
  { re: /(ολοκληρωσα|τελειωσα|εκανα|εγινε|εστειλα|εκλεισα)\s+(?:την\s+|το\s+|τη\s+)?(?:εργασια\s+)?(.+)/, test: (n) => !!findWork(n), run: (raw, n) => {
    const w = findWork(n); w.done = true; w.doneAt = Date.now(); saveWork(); const left = openWork().length;
    if (!left) { celebrate(true); return `Ολοκληρώθηκε: «${w.text}». Και αυτή ήταν η τελευταία! Όλες οι εργασίες έκλεισαν 🏆`; }
    Sound.tone(988, 0.12, 'triangle', 0.12); return `Ολοκληρώθηκε: «${w.text}». Μπράβο! Απομένουν ${left}. Επόμενη: ${nextTask().text}.`; } },
  { re: /(μεταθεσε|αναβαλε|μετεφερε|πηγαινε)\s+(?:την\s+|το\s+)?(?:εργασια\s+)?(.+?)\s+(?:για|στισ|την|στη)\s+(.+)$/, test: (n) => !!findWork(n), run: (raw, n, m) => { const w = findWork(n); const d = parseDue(m[3]); if (!d) return 'Για πότε να τη μεταθέσω;'; w.due = ymd(d); saveWork(); return `Η εργασία «${w.text}» μεταφέρθηκε για ${dueLabel(w.due)}.`; } },
  { re: /(καθαρισε|σβησε).*(ολοκληρωμενεσ εργασιεσ|τελειωμενεσ εργασιεσ)/, run: () => { const k = work.filter((w) => w.done).length; work = work.filter((w) => !w.done); saveWork(); return `Διαγράφηκαν ${k} ολοκληρωμένες εργασίες.`; } },
];
intents.unshift(...W);

const baseFIw = featuresInit;
window.featuresInit = function () { baseFIw(); setInterval(tickWork, 30000); tickWork(); };
fillSettings();
