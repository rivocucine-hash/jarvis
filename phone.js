/* =========================================================
   J.A.R.V.I.S. — Τηλέφωνο & απολογισμός
   1) «Τι μηνύματα έχω;»  (Viber, WhatsApp, Instagram, Messenger, SMS)
   2) Κλήση / SMS με το όνομα, από τις επαφές του κινητού
   3) Απολογισμός ημέρας και πλάνο για αύριο

   Ασφάλεια μηνυμάτων: το περιεχόμενο ΔΕΝ φτάνει ποτέ σε αυτή τη σελίδα.
   Το διαβάζει φωναχτά το ίδιο το κινητό. Εδώ έρχεται μόνο ο αριθμός τους.
   Τίποτα δεν αποθηκεύεται και τίποτα δεν πηγαίνει στον εγκέφαλο ΤΝ.
   ========================================================= */
'use strict';

/* Απαντήσεις με private:true δεν μπαίνουν στη μνήμη της κουβέντας ούτε στο ιστορικό του εγκεφάλου. */
const baseOnCommandP = window.onCommand;
window.onCommand = (cmd, n, out) => { if (out && out.private) return; if (baseOnCommandP) baseOnCommandP(cmd, n, out); };

const PA = window.AndroidJarvis;

/* ---------------- 1) ΜΗΝΥΜΑΤΑ ---------------- */
let msgSafety = null;
window.__nativeMsgDone = () => { clearTimeout(msgSafety); Voice.speakingNow = false; Voice.lastEnd = Date.now(); if (Core.state === 'speaking') Core.set('idle'); try { PA.wakeDone(); } catch {} };
function readMessages() {
  if (!PA || !PA.readMessages) return { private: true, text: 'Η ανάγνωση μηνυμάτων γίνεται μόνο από την εφαρμογή Android, έκδοση 21 και πάνω.' };
  let r; try { r = JSON.parse(PA.readMessages(+S.rate || 1, +S.pitch || 1, S.voiceURI || '')); } catch { return { private: true, text: 'Δεν μπόρεσα να διαβάσω τα μηνύματα.' }; }
  if (r.status === 'noaccess') {
    pending = (raw, nn) => (/^(ναι|οκ|ok|ενταξει|βεβαια|ανοιξε|παμε)/.test(nn) ? (PA.askMsgAccess(), { private: true, text: 'Άνοιξα τις ρυθμίσεις. Ενεργοποιήστε το «JARVIS» στη λίστα. Αν είναι γκρι, πηγαίνετε Ρυθμίσεις → Εφαρμογές → JARVIS → ⋮ (πάνω δεξιά) → «Να επιτρέπονται οι περιορισμένες ρυθμίσεις» και δοκιμάστε ξανά.' }) : 'Εντάξει, δεν άνοιξα τίποτα.');
    return { private: true, text: 'Για να σας διαβάζω τα μηνύματα χρειάζομαι την άδεια «Πρόσβαση σε ειδοποιήσεις». Διαβάζω μόνο Viber, WhatsApp, Instagram, Messenger και SMS, μόνο όταν το ζητάτε, και δεν αποθηκεύω τίποτα. Να ανοίξω τις ρυθμίσεις; Πείτε ναι ή όχι.' };
  }
  if (r.status === 'notready') return { private: true, text: 'Η άδεια υπάρχει, αλλά το κινητό δεν έχει συνδέσει ακόμα την υπηρεσία. Κλείστε τελείως το JARVIS, ανοίξτε το ξανά και ρωτήστε με πάλι.' };
  if (r.status === 'novoice') return { private: true, text: 'Δεν διαβάζω τα μηνύματα, γιατί το κινητό δεν έχει ελληνική φωνή που να δουλεύει χωρίς ίντερνετ. Με διαδικτυακή φωνή το κείμενο θα έφευγε από το κινητό. Κατεβάστε την ελληνική φωνή από Ρυθμίσεις → Μετατροπή κειμένου σε ομιλία.' };
  if (r.status !== 'ok') return { private: true, text: 'Η φωνή του κινητού δεν είναι έτοιμη. Δοκιμάστε σε λίγα δευτερόλεπτα.' };
  // Το κινητό μιλάει ήδη. Εδώ δείχνουμε μόνο πόσα είναι.
  Voice.speakingNow = true; Core.set('speaking');
  clearTimeout(msgSafety); msgSafety = setTimeout(() => window.__nativeMsgDone(), 15000 + (r.count || 0) * 25000);
  return { silent: true, private: true, text: r.count ? `📩 Διαβάζω ${r.count} ${r.count === 1 ? 'μήνυμα' : 'μηνύματα'}. Το περιεχόμενο δεν εμφανίζεται και δεν αποθηκεύεται. Πείτε «στοπ» για διακοπή.` : '📩 Δεν έχετε νέα μηνύματα.' };
}
intents.unshift({ re: /(τι μηνυματα εχω|εχω (κανενα |καποιο |νεα |νεο )?μηνυμα|διαβασε (μου )?τα μηνυματα|πεσ μου τα μηνυματα|ποιοσ μου εγραψε|ποιοσ μου εστειλε|τα μηνυματα μου|νεα μηνυματα|τι μου εστειλαν|μου εγραψε κανεισ|μου εστειλε κανεισ)/, test: (n) => !/^(ανοιξε|δειξε|στειλε|γραψε)/.test(n), run: () => readMessages() });

/* ---------------- 2) ΚΛΗΣΗ / SMS ΜΕ ΤΟ ΟΝΟΜΑ ---------------- */
function contactDo(kind, name, body) {
  if (!PA || !PA.contactAction) return null;
  let r; try { r = JSON.parse(PA.contactAction(kind, name, body || '')); } catch { return null; }
  if (r.status === 'noperm') return { private: true, text: 'Χρειάζομαι άδεια για τις επαφές του κινητού. Πατήστε «Να επιτρέπεται» στο παράθυρο που άνοιξε και πείτε μου το ξανά.' };
  if (r.status === 'none') return null; // δεν βρέθηκε: συνεχίζει στις επαφές που έχετε περάσει στον JARVIS
  if (r.status === 'many') {
    const opts = r.options || [];
    pending = (raw, nn) => { const i = (nn.match(/^(\d)/) || [])[1]; const pickName = i ? opts[+i - 1] : opts.find((o) => norm(o).includes(nn) || nn.split(' ').every((w) => norm(o).includes(w.slice(0, Math.max(3, w.length - 1))))); return pickName ? contactDo(kind, pickName, body) : 'Δεν κατάλαβα ποιον. Ακυρώθηκε.'; };
    return { private: true, text: `Βρήκα ${opts.length} επαφές`, html: `Βρήκα ${opts.length} επαφές. Ποια;<br>` + opts.map((o, i) => `${i + 1}. ${escapeHtml(o)}`).join('<br>'), speak: `Βρήκα ${opts.length} επαφές. ${opts.map((o, i) => (i + 1) + ', ' + o).join('. ')}. Ποια; Πείτε τον αριθμό.` };
  }
  return { private: true, text: kind === 'sms' ? `Ετοίμασα το μήνυμα προς ${r.name}. Ελέγξτε το και πατήστε αποστολή.` : `Άνοιξα την κλήση προς ${r.name}. Πατήστε το πράσινο κουμπί για να καλέσετε.` };
}
if (PA && PA.contactAction) {
  intents.unshift(
    { re: /^(παρε|καλεσε|τηλεφωνησε|κανε κληση|παρε τηλεφωνο|παρε ενα τηλεφωνο)\s+(.+)$/, test: (n) => !/\d{5,}/.test(n.replace(/\s/g, '')) && !/(μουσικ|καιρο|ανασ)/.test(n), run: (raw) => {
      const name = raw.replace(/^(πάρε|παρε|κάλεσε|καλεσε|τηλεφώνησε|τηλεφωνησε|κάνε κλήση|κανε κληση)(\s+(ένα\s+|ενα\s+)?(τηλέφωνο|τηλεφωνο))?\s+((στον|στην|στη|στο|τον|την|τη|το)\s+)?/i, '').replace(/[.;?!]+$/, '').trim();
      return name ? contactDo('call', name, '') : null;
    } },
    { re: /^(στειλε|γραψε)( ενα)?( μηνυμα| sms| γραπτο)?\s+(στον|στην|στη|στο)\s+(.+?)\s+(οτι|πωσ|να του πεισ|να τησ πεισ)\s+(.+)$/, run: (raw) => {
      const m = raw.match(/^\S+(?:\s+ένα|\s+ενα)?(?:\s+μήνυμα|\s+μηνυμα|\s+sms|\s+γραπτό|\s+γραπτο)?\s+(?:στον|στην|στη|στο)\s+(.+?)\s+(?:ότι|οτι|πως|πώς|να του πεις(?:\s+ότι|\s+οτι)?|να της πεις(?:\s+ότι|\s+οτι)?)\s+(.+)$/i);
      if (!m) return null;
      const body = m[2].trim(); return contactDo('sms', m[1].trim(), body.charAt(0).toUpperCase() + body.slice(1));
    } },
  );
}

/* ---------------- 3) ΑΠΟΛΟΓΙΣΜΟΣ ΗΜΕΡΑΣ & ΠΛΑΝΟ ΓΙΑ ΑΥΡΙΟ ---------------- */
async function dayReview() {
  const now = new Date(), tom = addDays(now, 1), sp = [], html = [];
  const add = (icon, t) => { html.push(`<div style="margin-top:5px">${icon} ${escapeHtml(t)}</div>`); sp.push(t); };
  const safe = (f) => { try { f(); } catch (e) { console.error(e); } };
  // τι έγινε
  safe(() => { const done = work.filter((w) => w.done && w.doneAt && sameDay(new Date(w.doneAt), now)); add('✅', done.length ? `Ολοκληρώσατε ${done.length} ${done.length === 1 ? 'εργασία' : 'εργασίες'}: ${done.slice(0, 5).map((w) => w.text).join(', ')}.` : 'Δεν σημειώσατε ολοκληρωμένη εργασία σήμερα.'); });
  safe(() => { if (habits && habits.length) { const k = dkey(), ok = habits.filter((h) => h.log[k]); add('🔥', `Συνήθειες: ${ok.length} από ${habits.length}${ok.length ? ' (' + ok.map((h) => h.name).join(', ') + ')' : ''}.`); } });
  safe(() => add('💧', `Νερό: ${(waterToday() / 1000).toFixed(1).replace('.', ',')} από ${(waterGoal() / 1000).toFixed(1).replace('.', ',')} λίτρα.`));
  safe(() => { const e = expenses.filter((x) => sameDay(new Date(x.at), now)); if (e.length) add('💶', `Έξοδα σήμερα: ${e.reduce((s, x) => s + (+x.amount || 0), 0).toFixed(2).replace('.', ',')} ευρώ.`); });
  // τι έμεινε
  safe(() => { const left = openWork(); if (left.length) add('📌', `Έμειναν ${left.length} ανοιχτές εργασίες. Πρώτη: ${left[0].text}.`); });
  safe(() => { const k = dkey(), miss = (habits || []).filter((h) => !h.log[k]); if (miss.length && now.getHours() < 23) add('⏳', `Προλαβαίνετε ακόμα: ${miss.slice(0, 4).map((h) => h.name).join(', ')}.`); });
  // αύριο
  safe(() => { const ev = typeof calEvents === 'function' ? calEvents(2) : null; if (Array.isArray(ev)) { const d0 = new Date(); d0.setHours(24, 0, 0, 0); const t = ev.filter((e) => e.s >= d0.getTime() && e.s < d0.getTime() + 86400000); if (t.length) add('📅', `Αύριο στο ημερολόγιο: ${t.map((e) => (e.all ? '' : pad(new Date(e.s).getHours()) + ':' + pad(new Date(e.s).getMinutes()) + ' ') + e.t).join(', ')}.`); } });
  safe(() => { const ag = agendaOn(tom); if (ag.length) add('🗓', `Πρόγραμμα αύριο: ${ag.map((a) => a.time + ' ' + a.text).join(', ')}.`); });
  safe(() => { const due = openWork().filter((w) => w.due && w.due <= ymd(tom)); if (due.length) add('💼', `Λήγουν ως αύριο: ${due.slice(0, 4).map((w) => w.text).join(', ')}.`); });
  safe(() => { const t0 = new Date(tom); t0.setHours(0, 0, 0, 0); const rs = reminders.filter((r) => r.due >= t0.getTime() && r.due < t0.getTime() + 86400000); if (rs.length) add('⏰', `Υπενθυμίσεις αύριο: ${rs.map((r) => pad(new Date(r.due).getHours()) + ':' + pad(new Date(r.due).getMinutes()) + ' ' + r.text).join(', ')}.`); });
  const head = `Απολογισμός ημέρας${nmc()}.`;
  // πλάνο: ό,τι πει ο χρήστης μπαίνει ως εργασία για αύριο
  let count = 0;
  const step = (raw, nn) => {
    if (/^(τελοσ|τελειωσα|αυτα|αυτα ειναι|ενταξει|οκ|ok|οχι|τιποτα|τιποτα αλλο|οχι αλλο|σταματα|στοπ|κλεισε|κλειστο|φτανει|ευχαριστω)$/.test(nn)) return count ? `Έβαλα ${count} ${count === 1 ? 'εργασία' : 'εργασίες'} στο πλάνο για αύριο. Θα σας τις θυμίσω το πρωί. Καλή ξεκούραση${nmc()}.` : `Εντάξει. Καλή ξεκούραση${nmc()}.`;
    const t = raw.replace(/^(πρέπει|πρεπει|έχω|εχω|θέλω|θελω)\s+(?=να\s)/i, '').replace(/[.!]+$/, '').trim(); if (t.length < 2) { pending = step; return 'Δεν το κατάλαβα. Πείτε το ξανά ή πείτε «τέλος».'; }
    work.push({ id: uid(), text: t.charAt(0).toUpperCase() + t.slice(1), project: '', prio: 2, due: ymd(tom), done: false, created: Date.now() }); saveWork(); count++;
    pending = step; return { text: '✓ ' + t, speak: 'Το έβαλα. Άλλο;' };
  };
  pending = step;
  const ask = 'Τι θέλετε να βάλω στο πλάνο για αύριο; Πείτε τα ένα-ένα, και «τέλος» όταν τελειώσετε.';
  return { text: head, html: `<b>📋 ${escapeHtml(head)}</b>` + html.join('') + `<div style="margin-top:8px">${escapeHtml(ask)}</div>`, speak: head + ' ' + sp.join(' ') + ' ' + ask };
}
intents.unshift({ re: /(απολογισμ|πωσ πηγε η μερα μου|τι εκανα σημερα|κλεισιμο ημερασ|πλανο για αυριο|σχεδιο για αυριο|προγραμματισε το αυριο|ασ κλεισουμε τη μερα)/, run: () => dayReview() });
