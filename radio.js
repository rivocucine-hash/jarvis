/* ---------------- ΡΑΔΙΟΦΩΝΟ (δωρεάν, χωρίς κλειδί) ----------------
   Οι σταθμοί έρχονται από τον ανοιχτό κατάλογο radio-browser.info. Παίζουν μόνο ροές https,
   γιατί η εφαρμογή είναι σελίδα https και το κινητό μπλοκάρει τις μη ασφαλείς. */
const RADIO_API = 'https://de1.api.radio-browser.info/json/stations/';
// Ελληνικά ονόματα όπως τα λέει ο χρήστης → όπως είναι γραμμένα στον κατάλογο
const RADIO_ALIAS = [
  [/σκαι|skai/, 'skai'], [/σφαιρα|sfera/, 'sfera'], [/λαβ|love/, 'love radio'], [/κισ|kiss/, 'kiss fm'], [/κοσμο|cosmo/, 'cosmoradio'],
  [/ρυθμοσ 9(4|49)|rythmos/, 'rythmos 94.9'], [/ρυθμοσ/, 'ρυθμός'], [/ντερτι|derti/, 'derti'], [/πεπερ|pepper/, 'pepper'], [/μεντα|menta/, 'menta'],
  [/λαικοσ|laikos/, 'laikos'], [/ιζι|easy/, 'easy'], [/στο κοκκινο|κοκκινο|kokkino/, 'kokkino'], [/ροκ ?(εφ ?εμ|fm)|rock ?fm/, 'rock fm'], [/στοουν|stone/, 'stone radio'],
  [/σκυλοσ/, 'σκύλος'], [/μελωδια|melodia/, 'melodia'], [/διεση|diesi/, 'diesi'], [/αθηνα ?9|athina ?9/, 'athina 9.84'], [/παραπολιτικα|parapolitika/, 'parapolitika'],
  [/ρεαλ|real/, 'real fm'], [/σπορ ?(εφ ?εμ|fm)|sport ?fm/, 'sport fm'], [/ερα ?σπορ|eraspor/, 'erasport'], [/δευτερο προγραμμα|ερα 2|deftero/, 'ert-deftero'],
  [/τριτο προγραμμα|ερα 3|trito/, 'trito programma'], [/πρωτο προγραμμα|ερα 1|ερα|ερτ|proto/, 'era proto'], [/μεγκα|mega/, 'mega news'], [/βανιλα|vanilla/, 'vanilla'],
  [/ψυνδωρα|psyndora/, 'psyndora'],
];
// Είδη μουσικής → ετικέτες του καταλόγου
const RADIO_TAGS = [
  [/ελληνικ|ελληνικη μουσικη/, 'greek'], [/λαικ/, 'greek folk'], [/ροκ|rock/, 'rock'], [/τζαζ|jazz/, 'jazz'], [/κλασικ|classical/, 'classical'],
  [/ειδησ|ενημερωσ|news/, 'news'], [/αθλητικ|σπορ|sports/, 'sports'], [/χαλαρ|chill|lounge/, 'chillout'], [/ποπ|pop/, 'pop'], [/80|ογδονταρ/, '80s'],
  [/90|ενενηνταρ/, '90s'], [/μπαλαντ|ballad/, 'ballads'], [/ηλεκτρονικ|dance|ντανσ/, 'dance'], [/ρεμπετ/, 'rebetiko'],
];
const Radio = {
  audio: null, name: '', list: [], idx: 0, base: 0.9,
  get on() { return !!this.audio; },
  byName: false,
  async find(q) {
    const get = async (path) => { try { const r = await fetch(RADIO_API + path, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }); return r.ok ? await r.json() : []; } catch { return []; } };
    const qs = '&hidebroken=true&order=clickcount&reverse=true&limit=30';
    let res = [];
    this.byName = !!q.name;
    if (q.name) { res = await get(`search?name=${encodeURIComponent(q.name)}&countrycode=GR${qs}`); if (!res.length) res = await get(`search?name=${encodeURIComponent(q.name)}${qs}`); }
    else if (q.tag) { res = await get(`search?tag=${encodeURIComponent(q.tag)}&countrycode=GR${qs}`); if (res.length < 3) res = res.concat(await get(`search?tag=${encodeURIComponent(q.tag)}${qs}`)); }
    else res = await get(`search?countrycode=GR${qs}`);
    // Μόνο ροές που μπορούν να παίξουν σε σελίδα https (οι http δοκιμάζονται ως https).
    const seen = new Set();
    return res.map((s) => ({ name: (s.name || '').trim(), url: (s.url_resolved || s.url || '').replace(/^http:\/\//, 'https://') }))
      .filter((s) => s.url && s.name && !seen.has(s.name.toLowerCase()) && seen.add(s.name.toLowerCase()));
  },
  playAt(i) {
    return new Promise((done) => {
      const s = this.list[i]; if (!s) return done(false);
      this.stop(true);
      const a = new Audio(); a.preload = 'none'; a.volume = this.base; this.audio = a; this.idx = i; this.name = s.name;
      let settled = false; const fin = (ok) => { if (!settled) { settled = true; clearTimeout(t); done(ok); } };
      const t = setTimeout(() => fin(false), 9000);
      a.addEventListener('playing', () => fin(true), { once: true });
      // Αν η ροή κοπεί αργότερα, ξανασυνδέεται μία φορά στον ίδιο σταθμό.
      a.addEventListener('error', () => { if (settled && this.audio === a && !a.retried) { a.retried = true; setTimeout(() => { if (this.audio === a) { a.src = s.url; a.play().catch(() => {}); } }, 2000); } });
      a.addEventListener('error', () => fin(false), { once: true });
      a.src = s.url; a.play().catch(() => fin(false));
    });
  },
  // Δοκιμάζει τους σταθμούς με τη σειρά μέχρι να παίξει κάποιος.
  async start(from = 0, max = 5) {
    for (let i = from; i < Math.min(this.list.length, from + max); i++) { if (await this.playAt(i)) { Store.set('radioLast', this.list[i]); Banner.set('radio', `📻 ${this.name}`, () => this.stop()); return true; } }
    this.stop(true); return false;
  },
  async play(q) {
    try { Music.stop(2); } catch {}
    this.list = await this.find(q);
    if (!this.list.length) return false;
    return this.start(0);
  },
  async next() {
    // Μετά από σταθμό με όνομα (π.χ. Σκάι), «επόμενος» σημαίνει άλλος ελληνικός σταθμός, όχι άλλη ροή του ίδιου.
    if (this.byName || this.list.length < 2) { const cur = norm(this.name).slice(0, 4); this.list = (await this.find({})).filter((x) => !norm(x.name).startsWith(cur)); this.byName = false; return this.start(0); }
    return this.start((this.idx + 1) % this.list.length);
  },
  stop(quiet) { if (this.audio) { try { this.audio.pause(); this.audio.src = ''; } catch {} } this.audio = null; if (!quiet) { this.name = ''; Banner.clear('radio'); } },
  vol(d) { this.base = Math.min(1, Math.max(0.1, this.base + d)); if (this.audio) this.audio.volume = this.base; return Math.round(this.base * 10); },
};
window.Radio = Radio;
// Όταν ο JARVIS μιλάει ή ακούει, το ραδιόφωνο χαμηλώνει, για να ακούγεται και να μην μπερδεύει το μικρόφωνο.
setInterval(() => { if (!Radio.audio) return; const duck = Voice.listening || Voice.speakingNow; const v = duck ? Math.min(0.15, Radio.base) : Radio.base; if (Math.abs(Radio.audio.volume - v) > 0.01) Radio.audio.volume = v; }, 250);

function radioQuery(n) {
  const a = RADIO_ALIAS.find(([re]) => re.test(n)); if (a) return { name: a[1] };
  const num = n.match(/(\d{2,3})[.,](\d)/); if (num) return { name: `${num[1]}.${num[2]}` };
  const g = RADIO_TAGS.find(([re]) => re.test(n)); if (g) return { tag: g[1] };
  return {};
}
intents.unshift(
  { re: /(ραδιοφων|σταθμο|radio|ραδιο )/, test: (n) => /(βαλε|παιξε|ανοιξε|θελω|ακουσω|ακουσουμε|ραδιοφωνο)/.test(n) && !/(κλεισ|σταματ|κατεβασ|χαμηλωσ|δυναμωσ|ανεβασ|επομεν|αλλο σταθμο|αλλαξε|ποιοσ σταθμοσ|τι παιζει)/.test(n), run: async (raw, n) => {
    let q = radioQuery(n);
    // «Βάλε ραδιόφωνο» σκέτο: ο τελευταίος σταθμός που άκουσε.
    if (!q.name && !q.tag) { const last = Store.get('radioLast', null); if (last) { Radio.list = [last]; if (await Radio.start(0, 1)) return `Ραδιόφωνο: ${Radio.name}.`; } }
    Core.set('thinking');
    if (await Radio.play(q)) return `Ραδιόφωνο: ${Radio.name}. Πείτε «επόμενος σταθμός» για αλλαγή.`;
    return navigator.onLine ? 'Δεν βρήκα σταθμό που να παίζει αυτή τη στιγμή. Δοκιμάστε άλλον, π.χ. «βάλε Σκάι» ή «βάλε ελληνικά τραγούδια στο ραδιόφωνο».' : 'Για ραδιόφωνο χρειάζομαι ίντερνετ.';
  } },
  // «Βάλε Σκάι», «βάλε Love Radio»: όνομα σταθμού χωρίς τη λέξη «ραδιόφωνο».
  { re: /^(βαλε|παιξε|ανοιξε) (τον |το |την )?(.+)$/, test: (n) => !/(ραδιοφων|τραγουδ|youtube|γιουτιουμπ|βιντεο|μουσικη για|ξυπνητηρι|υπενθυμ|χρονομετρ|γιογκα|αναπνο)/.test(n) && RADIO_ALIAS.some(([re]) => re.test(n.replace(/^(βαλε|παιξε|ανοιξε) /, ''))), run: async (raw, n) => {
    Core.set('thinking');
    if (await Radio.play(radioQuery(n))) return `Ραδιόφωνο: ${Radio.name}.`;
    return 'Ο σταθμός δεν παίζει αυτή τη στιγμή. Πείτε «βάλε ραδιόφωνο» για άλλον.';
  } },
  { re: /(επομενο σταθμο|επομενοσ σταθμοσ|αλλο σταθμο|αλλαξε σταθμο|αλλο ραδιοφωνο|επομενο ραδιοφωνο)/, run: async () => { if (!Radio.list.length) return 'Δεν παίζει ραδιόφωνο. Πείτε «βάλε ραδιόφωνο».'; Core.set('thinking'); return (await Radio.next()) ? `${Radio.name}.` : 'Δεν βρήκα άλλο σταθμό που να παίζει.'; } },
  { re: /(ποιοσ σταθμοσ|τι σταθμο|τι ακουμε|τι παιζει το ραδιοφωνο|ποιο ραδιοφωνο)/, test: () => Radio.on, run: () => `Ακούτε ${Radio.name}.` },
  { re: /(δυναμωσε|πιο δυνατα|ανεβασε την ενταση|ανεβασ το)/, test: () => Radio.on, run: () => ({ text: `Ένταση ${Radio.vol(0.2)} στα 10.`, silent: false }) },
  { re: /(χαμηλωσε|πιο σιγα|κατεβασε την ενταση|κατεβασ το)/, test: () => Radio.on, run: () => ({ text: `Ένταση ${Radio.vol(-0.2)} στα 10.`, silent: false }) },
  { re: /(σταματα|σταματησε|κλεισε|κλεισ|σβησε|τελοσ|φτανει|αρκετα|stop)/, test: (n) => Radio.on && (/ραδιοφων|σταθμο|μουσικη/.test(n) || n.split(' ').length <= 3), run: () => { Radio.stop(); return 'Έκλεισα το ραδιόφωνο.'; } },
);
// «Κλείσε τα όλα» κλείνει και το ραδιόφωνο.
const baseCloseAllR = closeAll;
closeAll = function () { const was = Radio.on; Radio.stop(); const r = baseCloseAllR(); return was && /^Δεν έχω/.test(r) ? `Έκλεισα το ραδιόφωνο${nmc()}.` : was ? r.replace('Έκλεισα ', 'Έκλεισα το ραδιόφωνο και ') : r; };
