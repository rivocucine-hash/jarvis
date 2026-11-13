/* =========================================================
   J.A.R.V.I.S. — Πρωτοβουλίες
   Ο βοηθός μιλάει μόνος του όταν έχει κάτι χρήσιμο:
   πρωινό ξύπνημα με «Καλημέρα» και μουσική 432Hz, διάλειμμα,
   εκκρεμείς δουλειές, νερό. Λειτουργεί όσο η εφαρμογή είναι ανοιχτή.
   ========================================================= */
'use strict';

if (S.proactive === undefined) { S.proactive = true; S.morningWake = true; saveSettings(); }
// Η πρωινή ενημέρωση δεν λέγεται πια αυτόματα στο άνοιγμα: μόνο όταν ζητηθεί («καλημέρα»). Αλλάζει μία φορά.
if (!S.noAutoBriefV1) { S.noAutoBriefV1 = true; S.autoBrief = false; saveSettings(); }

const Proactive = {
  last: 0,           // πότε μίλησε τελευταία φορά με δική του πρωτοβουλία
  opened: Date.now(),
  busy() { return Voice.listening || Voice.speakingNow || Session.active || !!pending || document.querySelector('.sheet:not(.hidden)'); },
  /* Λέει κάτι και, αν ο χρήστης απαντήσει «ναι», εκτελεί την εντολή. */
  async offer(msg, cmd) {
    this.last = Date.now();
    toast(S.assistant.toUpperCase(), msg, 9000); notify(S.assistant, msg);
    if (cmd) pending = async (raw, nn) => (/^(ναι|οκ|ok|ενταξει|βεβαια|παμε|καν το|κανε το|αμε|φυσικα|θελω)/.test(nn) ? await runIntents(cmd, norm(cmd)) : /^(οχι|αργοτερα|ασε|ασ το|μη)/.test(nn) ? 'Όπως επιθυμείτε.' : null);
    await say(msg);
  },
  /* Πρωινό ξύπνημα: μουσική 432Hz χαμηλά και μετά η πλήρης «Καλημέρα». */
  async morning() {
    this.last = Date.now();
    if (window.Standby && Standby.on) Standby.hide();
    try { if (!Music.n) Music.start('432', 20); } catch {}
    notify('Καλημέρα', 'Ώρα να ξυπνήσετε. Η πρωινή ενημέρωση είναι έτοιμη.');
    await sleep(6000);
    S.lastBrief = new Date().toDateString(); saveSettings();
    // Η ενημέρωση λέγεται μόνο αν τη ζητήσει ο χρήστης.
    pending = async (raw, nn) => (/^(ναι|οκ|ok|ενταξει|βεβαια|πεσ|πεσ μου|πεσ τα|ακουω|θελω|αμε)/.test(nn) ? (morningBriefing(), { silent: true, text: '' }) : /^(οχι|αργοτερα|ασε|ασ το|μη)/.test(nn) ? 'Όπως επιθυμείτε. Πείτε «καλημέρα» όποτε τη θέλετε.' : null);
    await say(`${hello()}${nmc()}. Ώρα να ξυπνήσετε. Πείτε «ναι» αν θέλετε την ενημέρωση της ημέρας.`);
  },
  tick() {
    const d = new Date(), day = todayKey(), now = `${pad(d.getHours())}:${pad(d.getMinutes())}`, h = d.getHours();
    // 1) Ξύπνημα στην ώρα αφύπνισης (ισχύει ακόμα κι αν οι υπόλοιπες πρωτοβουλίες είναι κλειστές)
    if (S.morningWake !== false && now === (S.wakeTime || '07:00') && !Session.active && once(`wakeup-${day}`)) return this.morning();
    if (!S.proactive || h < 9 || h >= 22 || this.busy()) return;
    if (Date.now() - this.last < 45 * 60000) return; // το πολύ μία πρωτοβουλία ανά 45 λεπτά
    // 2) Εκκρεμείς δουλειές: μία φορά το πρωί και μία το απόγευμα
    try {
      const open = typeof openWork === 'function' ? openWork() : [];
      if (open.length && ((h === 10 && once(`pw-am-${day}`)) || (h === 16 && once(`pw-pm-${day}`)))) {
        const top = open.slice().sort((a, b) => (a.prio || 3) - (b.prio || 3))[0];
        return this.offer(`${cap(addressAs())}, έχετε ${open.length} ${open.length === 1 ? 'ανοιχτή εργασία' : 'ανοιχτές εργασίες'}. Η πιο σημαντική: ${top.text}. Να σας τις πω όλες;`, 'Τι δουλειές έχω;');
      }
    } catch {}
    // 3) Διάλειμμα: αν η εφαρμογή είναι ανοιχτή πάνω από 2 ώρες συνεχόμενα
    if (Date.now() - this.opened > 120 * 60000 && once(`brk-${h}-${day}`)) { this.opened = Date.now(); return this.offer('Έχουν περάσει δύο ώρες. Ένα λεπτό αναπνοές θα σας ξεκουράσει. Να ξεκινήσουμε;', 'Κάνε μου αναπνοές'); }
    // 4) Βράδυ: πρόταση για χαλάρωση
    if (h === 21 && d.getMinutes() >= 30 && once(`relax-${day}`)) return this.offer('Η μέρα τελειώνει. Να βάλω χαλαρωτική μουσική 432 για να ηρεμήσετε;', 'Βάλε μουσική 432');
  },
};

intents.unshift(
  { re: /(μην παιρνεισ πρωτοβουλι|σταματα (τισ )?πρωτοβουλι|χωρισ πρωτοβουλι|μη μου μιλασ μονοσ)/, run: () => { S.proactive = false; saveSettings(); return 'Κατανοητό. Δεν θα παίρνω πρωτοβουλίες. Το πρωινό ξύπνημα παραμένει.'; } },
  { re: /(παρε πρωτοβουλι|να παιρνεισ πρωτοβουλι|ενεργοποιησε (τισ )?πρωτοβουλι)/, run: () => { S.proactive = true; saveSettings(); return 'Μάλιστα. Θα σας μιλάω όταν έχω κάτι χρήσιμο να προτείνω.'; } },
  { re: /(μη με ξυπνασ|ακυρωσε το ξυπνημα|κλεισε το ξυπνημα|χωρισ ξυπνημα)/, run: () => { S.morningWake = false; saveSettings(); return 'Το πρωινό ξύπνημα απενεργοποιήθηκε.'; } },
  { re: /(ξυπνα με|ξυπνησε με|ξυπναμε|ξυπνημα|να με ξυπνασ|θα ξυπνησω|ξυπναω|σηκωνομαι|αφυπνιση).*?(\d{1,2})(?:[:. ](\d{2}))?/, test: (n) => !/(κοιμηθ|υπνο|ποτε να|τι ωρα να)/.test(n), run: (raw, n, m) => {
    let hh = +m[2], mm = +(m[3] || 0);
    if (!m[3]) { if (/και μιση/.test(n)) mm = 30; else if (/και τεταρτο/.test(n)) mm = 15; else if (/παρα τεταρτο/.test(n)) { hh = (hh + 23) % 24; mm = 45; } }
    if (hh > 23 || mm > 59) return null;
    S.wakeTime = `${pad(hh)}:${pad(mm)}`; S.morningWake = true; saveSettings(); try { fillSettings(); } catch {}
    return `Μάλιστα. Στις ${S.wakeTime} θα σας πω καλημέρα με μουσική 432. Την ενημέρωση θα τη λέω μόνο αν τη ζητήσετε. Αφήστε την εφαρμογή ανοιχτή και το κινητό στη φόρτιση.`;
  } },
  { re: /^(δοκιμασε το ξυπνημα|δοκιμη ξυπνηματοσ)$/, run: () => { Proactive.morning(); return { silent: true, text: '' }; } },
);

const baseFIp = featuresInit;
window.featuresInit = function () { baseFIp(); setInterval(() => { try { Proactive.tick(); } catch (e) { console.error(e); } }, 30000); };
