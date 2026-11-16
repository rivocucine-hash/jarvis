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

  /* ---------- «Τζάρβις, τι βλέπεις;»: φωτογραφία από την κάμερα → Gemini (ή Groq) → απάντηση φωναχτά (εφαρμογή v40+) ---------- */
  const Vision = { img: null, at: 0 };
  let photoWait = null;
  window.__nativePhoto = (b64) => { const f = photoWait; photoWait = null; if (f) f(b64 || ''); };
  const takePhoto = () => new Promise((res) => { photoWait = res; AJ.takePhoto(); setTimeout(() => { if (photoWait) { photoWait = null; res(''); } }, 180000); });
  const VSYS = 'Είσαι ο JARVIS και βλέπεις μια φωτογραφία από την κάμερα του κινητού του χρήστη. Απάντησε στα ελληνικά, στον πληθυντικό ευγενείας, σύντομα (2-5 προτάσεις) γιατί η απάντηση διαβάζεται φωναχτά, χωρίς markdown, λίστες ή emoji. Αν υπάρχει κείμενο σε ξένη γλώσσα (μενού, πινακίδα, ετικέτα), μετάφρασέ το στα ελληνικά. Αν ζητηθεί ανάγνωση, διάβασε το κείμενο όπως είναι.';
  async function askVision(question, b64) {
    const q = question || 'Τι βλέπεις στη φωτογραφία;';
    if (S.geminiKey) {
      for (const m of [...new Set([S.model || 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.0-flash'])]) {
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, { method: 'POST', signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.geminiKey },
            body: JSON.stringify({ system_instruction: { parts: [{ text: VSYS }] }, contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: q }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 700 } }) });
          const j = await r.json().catch(() => ({}));
          const o = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
          if (r.ok && o) return o;
          if (r.status === 401 || r.status === 403) break;
        } catch {}
      }
    }
    if (S.groqKey) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.groqKey },
          body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', temperature: 0.4, max_tokens: 700, messages: [{ role: 'system', content: VSYS }, { role: 'user', content: [{ type: 'text', text: q }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } }] }] }) });
        const j = await r.json().catch(() => ({})); const o = (j.choices?.[0]?.message?.content || '').trim();
        if (r.ok && o) return o;
      } catch {}
    }
    return null;
  }
  async function lookAt(raw) {
    if (!AJ || !AJ.takePhoto) return 'Για να βλέπω με την κάμερα, χρειάζεται η νεότερη εφαρμογή. Εγκαταστήστε τη και ξαναδοκιμάστε.';
    if (!S.geminiKey && !S.groqKey) return 'Για να καταλαβαίνω φωτογραφίες χρειάζομαι εγκέφαλο. Πείτε «ρύθμισε τον εγκέφαλο».';
    toast('ΚΑΜΕΡΑ', 'Βγάλτε φωτογραφία και πατήστε ✓.', 5000);
    const b64 = await takePhoto();
    if (!b64) return 'Δεν βγήκε φωτογραφία.';
    addMsg('ai', '', { html: `<img src="data:image/jpeg;base64,${b64}" alt="φωτογραφία" style="max-width:100%;max-height:260px;display:block;border:1px solid var(--line)">` });
    toast('ΚΑΜΕΡΑ', 'Κοιτάζω τη φωτογραφία…', 6000);
    // Η ερώτηση χωρίς τις λέξεις της εντολής· αν μείνει μόνο «τι βλέπεις», γενική περιγραφή.
    const q = raw.replace(/^(τζ?άρβις|jarvis)[,]?\s*/i, '').trim();
    const o = await askVision(q, b64);
    if (!o) return 'Δεν μπόρεσα να δω τη φωτογραφία αυτή τη στιγμή. Ελέγξτε το ίντερνετ και ξαναδοκιμάστε.';
    Vision.img = b64; Vision.at = Date.now();
    return o;
  }
  // Ερωτήσεις συνέχειας για την ίδια φωτογραφία (έως 3 λεπτά μετά): «πόσο κάνει το δεύτερο πιάτο;».
  const baseAskAIv = askAI;
  askAI = async function (text) {
    if (Vision.img && Date.now() - Vision.at < 180000) { const o = await askVision(text, Vision.img); if (o) { Vision.at = Date.now(); return o; } }
    return baseAskAIv(text);
  };
  intents.unshift(
    { re: /(τι βλεπεισ|κοιτα (αυτο|εδω)|κοιταξε (αυτο|εδω)|βγαλε (μια )?φωτογραφια|ανοιξε την καμερα|τι ειναι αυτο που κραταω|διαβασε μου (αυτο το χαρτι|αυτη την ετικετα|αυτο εδω|αυτο)$|μεταφρασε (μου )?(αυτη την |αυτο το |το |την )?(πινακιδα|μενου|ταμπελα|ετικετα|χαρτι|σημα)|τι γραφει (αυτο|εδω|η πινακιδα|το μενου|η ετικετα))/, run: (raw) => lookAt(raw) },
    { re: /(ξεχασε τη φωτογραφια|τελοσ φωτογραφιασ)/, run: () => { Vision.img = null; return 'Εντάξει.'; } },
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
