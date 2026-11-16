/* =========================================================
   J.A.R.V.I.S. — Πάρκινγκ και ανάγνωση σελίδων
   «θυμήσου πού πάρκαρα» / «πού πάρκαρα;»: θέση από το GPS του κινητού, μόνο τοπικά.
   «Κοινοποίηση → JARVIS» σε μια σελίδα ή κείμενο: περίληψη ή ανάγνωση.
   Φορτώνεται τελευταίο, ώστε οι εντολές του να προηγούνται (π.χ. του γενικού «θυμήσου»).
   ========================================================= */
'use strict';
{
  const AJ = window.AndroidJarvis;

  /* ---------- Τοποθεσία από το κινητό (εφαρμογή v39+) ---------- */
  let locWait = null;
  window.__nativeLocation = (lat, lon, acc, why) => { const f = locWait; locWait = null; if (f) f(lat == null ? null : { lat, lon, acc }, why); };
  const getLoc = (ms = 25000) => new Promise((res) => {
    if (!AJ || !AJ.getLocation) return res([null, 'old']);
    locWait = (l, w) => res([l, w]); AJ.getLocation();
    setTimeout(() => { if (locWait) { locWait = null; res([null, 'timeout']); } }, ms);
  });
  const distM = (a, b) => { const R = 6371000, t = (x) => (x * Math.PI) / 180; const dLa = t(b.lat - a.lat), dLo = t(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const ago = (ms) => { const m = Math.round(ms / 60000); if (m < 2) return 'μόλις τώρα'; if (m < 60) return `πριν από ${m} λεπτά`; const h = Math.floor(m / 60); if (h < 24) return `πριν από ${h === 1 ? 'μία ώρα' : h + ' ώρες'}${m % 60 >= 10 ? ' και ' + (m % 60) + ' λεπτά' : ''}`; const d = Math.floor(h / 24); return `πριν από ${d === 1 ? 'μία μέρα' : d + ' μέρες'}`; };
  const locFail = (why) => why === 'denied' ? 'Χρειάζομαι άδεια τοποθεσίας. Όταν σας ρωτήσει το κινητό, πατήστε «Κατά τη χρήση της εφαρμογής».'
    : why === 'off' ? 'Η τοποθεσία (GPS) του κινητού είναι κλειστή. Ανοίξτε την από τις γρήγορες ρυθμίσεις και ξαναπείτε το.'
    : why === 'old' ? 'Για να κρατάω πού παρκάρατε, χρειάζεται η νεότερη εφαρμογή. Εγκαταστήστε τη και ξαναδοκιμάστε.'
    : 'Δεν μπόρεσα να βρω τη θέση σας. Δοκιμάστε σε πιο ανοιχτό σημείο.';

  const PARK_SAVE = /(θυμησου (που|οτι) (παρκαρα|εχω παρκαρει|αφησα (το αυτοκινητο|το αμαξι|τη μηχανη))|παρκαρα εδω|κρατα (τη θεση|που παρκαρα)|σημειωσε που παρκαρα|αποθηκευσε που παρκαρα)/;
  const PARK_FIND = /(που παρκαρα|που ειχα παρκαρει|που ειναι το (αυτοκινητο|αμαξι)|που αφησα το (αυτοκινητο|αμαξι|τη μηχανη)|πηγαινε με στο (αυτοκινητο|αμαξι)|βρεσ το (αυτοκινητο|αμαξι))/;

  async function parkSave(raw) {
    // Ό,τι λέγεται μετά τη φράση είναι σημείωση: «θυμήσου πού πάρκαρα, όροφος μείον δύο θέση 45».
    const note = raw.replace(/^.*?(πάρκαρα|παρκαρα|παρκάρει|παρκαρει|αμάξι|αμαξι|αυτοκίνητο|αυτοκινητο|μηχανή|μηχανη|εδώ|εδω)\s*[,.:-]?\s*/i, '').replace(/^(σημείωση|σημειωση)\s*/i, '').trim();
    toast('ΠΑΡΚΙΝΓΚ', 'Βρίσκω τη θέση σας…', 4000);
    const [l, why] = await getLoc();
    if (!l) return locFail(why);
    Store.set('parking', { lat: l.lat, lon: l.lon, acc: Math.round(l.acc || 0), at: Date.now(), note });
    const accTxt = l.acc > 60 ? ` Η ακρίβεια είναι περίπου ${Math.round(l.acc)} μέτρα.` : '';
    return `Κράτησα πού παρκάρατε${note ? `, με σημείωση «${note}»` : ''}.${accTxt} Όταν γυρίσετε, πείτε «πού πάρκαρα».`;
  }
  async function parkFind() {
    const p = Store.get('parking', null);
    if (!p) return 'Δεν έχω κρατήσει πού παρκάρατε. Την επόμενη φορά, μόλις παρκάρετε, πείτε «θυμήσου πού πάρκαρα».';
    let dist = '';
    const [l] = await getLoc(7000);
    if (l) { const d = distM(l, p); dist = d < 40 ? ' Είστε πολύ κοντά.' : d < 1000 ? ` Είναι περίπου ${Math.round(d / 10) * 10} μέτρα από εσάς.` : ` Είναι περίπου ${(d / 1000).toFixed(1).replace('.', ',')} χιλιόμετρα από εσάς.`; }
    try { openUrl(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking`); } catch {}
    return `Παρκάρατε ${ago(Date.now() - p.at)}.${p.note ? ` Σημείωση: ${p.note}.` : ''}${dist} Σας άνοιξα τον χάρτη με οδηγίες για περπάτημα.`;
  }
  intents.unshift(
    { re: PARK_SAVE, run: (raw) => parkSave(raw) },
    { re: PARK_FIND, run: () => parkFind() },
    { re: /(ξεχασε που παρκαρα|σβησε το παρκινγκ|βρηκα το (αυτοκινητο|αμαξι))/, run: () => { Store.set('parking', null); return 'Εντάξει, ξέχασα τη θέση του αυτοκινήτου.'; } },
  );

  /* ---------- Ανάγνωση σελίδας/κειμένου που κοινοποιήθηκε στο JARVIS (εφαρμογή v39+) ---------- */
  let shared = null; // { title, text, url }
  const URL_RE = /https?:\/\/\S+/i;
  async function fetchPage(url) {
    // Υπηρεσία ανάγνωσης (δωρεάν, χωρίς κλειδί): επιστρέφει το καθαρό κείμενο της σελίδας.
    try {
      const r = await fetch('https://r.jina.ai/' + url, { headers: { Accept: 'text/plain' }, signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
      if (!r.ok) return null;
      const t = (await r.text()).trim();
      const title = (t.match(/^Title:\s*(.+)$/m) || [])[1] || '';
      const body = t.replace(/^[\s\S]*?Markdown Content:\s*/m, '').replace(/^(Title|URL Source|Published Time):.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>`|]+/g, ' ').replace(/[ \t]+/g, ' ').split('\n').map((x) => x.trim()).filter((x) => x.length >= 40).join('\n').trim(); // μόνο πραγματικές προτάσεις, όχι μενού
      return body ? { title, text: body.slice(0, 15000), url } : null;
    } catch { return null; }
  }
  async function brain(sys, text) {
    const g = await askGroq(sys, [{ role: 'user', parts: [{ text }] }], 15000);
    if (g && g.text) return g.text;
    const o = await askAI(`${sys}\n\n${text.slice(0, 6000)}`);
    return o || null;
  }
  const isGreek = (t) => (t.match(/[α-ωάέήίόύώ]/gi) || []).length > (t.match(/[a-z]/gi) || []).length;
  async function summarize() {
    if (!shared) return 'Δεν μου έχετε στείλει κάποια σελίδα. Στη σελίδα που θέλετε, πατήστε «Κοινοποίηση» και διαλέξτε JARVIS.';
    const s = await brain('Είσαι βοηθός που διαβάζει φωναχτά. Κάνε περίληψη του κειμένου στα ελληνικά, σε 4-6 σύντομες προτάσεις, χωρίς markdown, λίστες ή emoji. Ξεκίνα κατευθείαν με το περιεχόμενο.', shared.text.slice(0, 12000));
    if (!s) return 'Ο εγκέφαλος δεν απάντησε για την περίληψη. Πείτε «διάβασέ το ολόκληρο» για να σας το διαβάσω όπως είναι.';
    return `${shared.title ? shared.title + '. ' : ''}${s} Πείτε «διάβασέ το ολόκληρο» αν θέλετε όλο το κείμενο.`;
  }
  async function readAll() {
    if (!shared) return 'Δεν μου έχετε στείλει κάποια σελίδα.';
    let t = shared.text.slice(0, 5000);
    if (!isGreek(t)) { const tr = await brain('Μετάφρασε το κείμενο στα ελληνικά, φυσικά, για ανάγνωση φωναχτά. Μόνο τη μετάφραση, χωρίς markdown.', t); if (tr) t = tr; }
    return (shared.title ? shared.title + '. ' : '') + t + (shared.text.length > 5000 ? ' Αυτό ήταν το πρώτο μέρος της σελίδας.' : '');
  }
  async function onShared() {
    const raw = (AJ && AJ.takeShared ? AJ.takeShared() : '').trim(); if (!raw) return;
    const url = (raw.match(URL_RE) || [])[0];
    if (typeof Standby !== 'undefined' && Standby.on) Standby.hide();
    addMsg('user', url ? '🔗 ' + url : '📄 ' + raw.slice(0, 120) + (raw.length > 120 ? '…' : ''));
    let page = null;
    if (url) { toast('ΣΕΛΙΔΑ', 'Διαβάζω τη σελίδα…', 5000); page = await fetchPage(url); }
    if (!page && raw.replace(URL_RE, '').trim().length > 40) page = { title: '', text: raw.replace(URL_RE, '').trim(), url: url || '' };
    if (!page) { const m = 'Δεν μπόρεσα να διαβάσω αυτή τη σελίδα. Κάποιες σελίδες δεν επιτρέπουν την ανάγνωση.'; addMsg('ai', m); say(m); return; }
    shared = page;
    const m = await summarize(); addMsg('ai', m); say(m);
  }
  window.__nativeShared = () => { const go = () => { if ($('#hud').classList.contains('hidden')) return setTimeout(go, 700); onShared(); }; go(); };
  // Αν η εφαρμογή άνοιξε από κοινοποίηση (κλειστή πριν), παίρνουμε το κείμενο μόλις ανοίξει η κύρια οθόνη.
  setTimeout(() => window.__nativeShared(), 1500);
  intents.unshift(
    { re: /(διαβασε (το |μου το )?ολοκληρο|ολοκληρο το κειμενο|διαβασε (μου )?ολη τη σελιδα)/, run: () => readAll() },
    { re: /(περιληψη (τησ σελιδασ|του αρθρου)|πεσ μου (ξανα )?την περιληψη)/, run: () => summarize() },
    { re: /^(διαβασε μου (αυτη τη|τη) σελιδα|διαβασε μου (αυτο το|το) αρθρο|διαβασε μου μια σελιδα)$/, run: () => shared ? summarize() : 'Στη σελίδα που θέλετε, πατήστε «Κοινοποίηση» και διαλέξτε JARVIS. Θα σας πω περίληψη και, αν θέλετε, θα τη διαβάσω ολόκληρη.' },
  );
}
