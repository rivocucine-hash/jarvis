/* ---------------- ΝΤΥΣΙΜΟ ΜΕ ΕΙΚΟΝΕΣ ----------------
   Στο «τι να φορέσω» δείχνει, μαζί με τη συμβουλή:
   1) ένα σχέδιο του συνδυασμού με τα σωστά χρώματα (πάντα, χωρίς ίντερνετ),
   2) πραγματικές φωτογραφίες από το Pexels, αν ο χρήστης έχει βάλει δωρεάν κλειδί,
   3) κουμπί για περισσότερες φωτογραφίες στο Google Εικόνες. */
const OUTFITS = {
  hot: { top: ['Λινό πουκάμισο', '#f4f1e8'], bottom: ['Μπεζ chino', '#cdb48a'], shoes: ['Καφέ loafers', '#7a4a26'], q: 'men summer linen shirt beige chinos outfit', pq: 'man summer fashion', g: 'ανδρικό ντύσιμο λινό πουκάμισο μπεζ chino καλοκαίρι' },
  mild: { top: ['Γαλάζιο oxford', '#a9c6e8'], layer: ['Navy overshirt', '#22324f'], bottom: ['Σκούρο τζιν', '#2d3a55'], shoes: ['Λευκά sneakers', '#f2f2f2'], q: 'men oxford shirt dark jeans white sneakers outfit', pq: 'man casual fashion', g: 'ανδρικό ντύσιμο oxford πουκάμισο σκούρο τζιν λευκά sneakers' },
  cool: { top: ['Γκρι πλεκτό', '#8d9096'], layer: ['Λαδί μπουφάν', '#5a5f3c'], bottom: ['Σκούρο τζιν', '#2d3a55'], shoes: ['Καφέ suede μποτάκια', '#8a5a34'], q: 'men grey sweater jeans jacket autumn outfit', pq: 'man autumn fashion', g: 'ανδρικό ντύσιμο γκρι πλεκτό τζιν μπουφάν φθινόπωρο' },
  cold: { top: ['Navy ζιβάγκο', '#1f2a44'], layer: ['Καμηλό παλτό', '#c19a6b'], bottom: ['Ανθρακί παντελόνι', '#3b3f45'], shoes: ['Μαύρα Chelsea boots', '#1b1b1b'], q: 'men camel coat turtleneck winter outfit', pq: 'man winter coat fashion', g: 'ανδρικό ντύσιμο καμηλό παλτό ζιβάγκο χειμώνας' },
};
const OCC_OUTFITS = [
  [/(ραντεβου|date)/, { top: ['Λευκό oxford', '#f5f5f2'], layer: ['Navy μπλέιζερ', '#1e2a46'], bottom: ['Σκούρο τζιν', '#2d3a55'], shoes: ['Καφέ suede', '#8a5a34'], q: 'men date night outfit blazer jeans', pq: 'man blazer fashion', g: 'ανδρικό ντύσιμο για ραντεβού μπλέιζερ τζιν' }],
  [/(γραφειο|δουλεια|συνεντευξη)/, { top: ['Γαλάζιο πουκάμισο', '#b9d0ea'], layer: ['Γκρι σακάκι', '#5d636b'], bottom: ['Navy παντελόνι', '#22304d'], shoes: ['Καφέ δερμάτινα', '#5b3a22'], q: 'men business casual office outfit', pq: 'businessman fashion', g: 'ανδρικό ντύσιμο γραφείο business casual' }],
  [/(γαμο|βαπτιση|βαφτιση|εκδηλωση|επισημο)/, { top: ['Λευκό πουκάμισο', '#f7f7f5'], layer: ['Μπλε κοστούμι', '#2c4170'], bottom: ['Μπλε παντελόνι', '#2c4170'], shoes: ['Καφέ loafers', '#6b4226'], q: 'men blue suit wedding guest outfit', pq: 'man suit', g: 'ανδρικό ντύσιμο γάμος μπλε κοστούμι' }],
  [/(εξοδο|βραδυ|μπαρ|club)/, { top: ['Μαύρο T-shirt', '#161616'], layer: ['Δερμάτινο μπουφάν', '#2a2420'], bottom: ['Μαύρο τζιν', '#1d1f24'], shoes: ['Chelsea boots', '#1b1b1b'], q: 'men night out outfit leather jacket black jeans', pq: 'man leather jacket', g: 'ανδρικό ντύσιμο βραδινή έξοδος δερμάτινο μπουφάν' }],
  [/(casual|καθημεριν|χαλαρ)/, { top: ['Λευκό T-shirt', '#f4f4f4'], layer: ['Γκρι φούτερ', '#9a9ea5'], bottom: ['Μπεζ chino', '#cdb48a'], shoes: ['Λευκά sneakers', '#f2f2f2'], q: 'men casual outfit white tshirt chinos sneakers', pq: 'man casual style', g: 'ανδρικό καθημερινό ντύσιμο λευκό t-shirt chino sneakers' }],
];
const outfitFor = (n, t) => { const o = OCC_OUTFITS.find(([re]) => re.test(n)); if (o) return o[1]; return t == null ? OUTFITS.mild : t >= 28 ? OUTFITS.hot : t >= 20 ? OUTFITS.mild : t >= 12 ? OUTFITS.cool : OUTFITS.cold; };
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');

/* Σχέδιο «απλωμένα ρούχα»: πανωφόρι/μπλούζα, παντελόνι, παπούτσια στα χρώματα του συνδυασμού. */
function outfitSvg(o) {
  const top = safeColor(o.top[1]), layer = o.layer ? safeColor(o.layer[1]) : null, bot = safeColor(o.bottom[1]), sh = safeColor(o.shoes[1]), st = 'stroke="rgba(255,255,255,.35)" stroke-width="1.5"';
  return `<svg viewBox="0 0 300 190" width="100%" style="max-width:340px;display:block;margin:8px auto 2px" role="img" aria-label="Σχέδιο συνδυασμού">
    ${layer ? `<path d="M40 30 L75 18 L95 30 L115 18 L150 30 L160 95 L138 98 L135 60 L135 150 L55 150 L55 60 L52 98 L30 95 Z" fill="${layer}" ${st}/>` : ''}
    <path d="M${layer ? '68 32 L85 24 L95 34 L105 24 L122 32 L122 148 L68 148' : '48 32 L80 20 L95 30 L110 20 L142 32 L152 80 L132 84 L130 60 L130 148 L60 148 L60 60 L58 84 L38 80'} Z" fill="${top}" ${st}/>
    <path d="M178 22 L248 22 L254 150 L226 150 L214 62 L202 150 L174 150 Z" fill="${bot}" ${st}/>
    <path d="M160 160 Q160 150 172 150 L196 152 Q206 154 206 164 L206 170 L160 170 Z" fill="${sh}" ${st}/>
    <path d="M222 160 Q222 150 234 150 L258 152 Q268 154 268 164 L268 170 L222 170 Z" fill="${sh}" ${st}/>
  </svg>`;
}
function outfitLegend(o) {
  return `<div style="display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;font-size:13px;opacity:.9">${[o.layer, o.top, o.bottom, o.shoes].filter(Boolean).map(([name, c]) => `<span style="display:inline-flex;align-items:center;gap:5px"><i style="width:11px;height:11px;border-radius:3px;background:${safeColor(c)};border:1px solid rgba(255,255,255,.4);display:inline-block"></i>${escapeHtml(name)}</span>`).join('')}</div>`;
}

/* Πραγματικές φωτογραφίες από το Pexels (δωρεάν κλειδί). Κρατιούνται 6 ώρες, για να μη χαλάμε το όριο. */
/* Pixabay (δωρεάν κλειδί, φαίνεται στη σελίδα pixabay.com/api/docs μόλις συνδεθείτε). Κρατιούνται 24 ώρες, όπως ζητά το Pixabay. */
async function pixabayPhotos(q) {
  if (!S.pixabayKey || !navigator.onLine) return null;
  const ck = Store.get('pix_' + q, null); if (ck && Date.now() - ck.at < 24 * 3600000) return ck.p;
  try {
    const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(S.pixabayKey)}&q=${encodeURIComponent(q)}&image_type=photo&orientation=vertical&safesearch=true&per_page=12`, { signal: AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined });
    if (!r.ok) return r.status === 400 || r.status === 401 || r.status === 403 ? 'bad' : null;
    const j = await r.json();
    const p = (j.hits || []).map((x) => ({ src: x.webformatURL, link: x.pageURL, by: x.user })).filter((x) => /^https:\/\/(pixabay\.com\/get\/|cdn\.pixabay\.com\/)/.test(x.src || '') && /^https:\/\/pixabay\.com\//.test(x.link || '')).slice(0, 6);
    Store.set('pix_' + q, { at: Date.now(), p }); return p;
  } catch { return null; }
}
async function pexelsPhotos(q) {
  if (!S.pexelsKey || !navigator.onLine) return null;
  const ck = Store.get('pex_' + q, null); if (ck && Date.now() - ck.at < 6 * 3600000) return ck.p;
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=6&orientation=portrait`, { headers: { Authorization: S.pexelsKey }, signal: AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined });
    if (!r.ok) return r.status === 401 || r.status === 403 ? 'bad' : null;
    const j = await r.json();
    const p = (j.photos || []).map((x) => ({ src: x.src?.medium, link: x.url, by: x.photographer })).filter((x) => /^https:\/\/images\.pexels\.com\//.test(x.src || '') && /^https:\/\/www\.pexels\.com\//.test(x.link || ''));
    Store.set('pex_' + q, { at: Date.now(), p }); return p;
  } catch { return null; }
}

if (typeof outfitToday === 'function') {
  const baseOutfit = outfitToday;
  outfitToday = async function (n) {
    const text = await baseOutfit(n);
    let t = null; try { const w = await getWeather(); t = Math.round(w.daily.temperature_2m_max[0]); } catch {}
    const o = outfitFor(n || '', t);
    const photos = S.pixabayKey ? await pixabayPhotos(o.pq || o.q) : await pexelsPhotos(o.q);
    const gUrl = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(o.g);
    let gallery = '';
    if (Array.isArray(photos) && photos.length) gallery = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px">${photos.slice(0, 6).map((p) => `<a href="${escapeHtml(p.link)}" target="_blank" rel="noopener"><img src="${escapeHtml(p.src)}" alt="Ιδέα ντυσίματος" loading="lazy" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px;display:block"></a>`).join('')}</div><div style="font-size:11px;opacity:.6;margin-top:3px">Φωτογραφίες: ${S.pixabayKey ? 'Pixabay' : 'Pexels'}</div>`;
    else if (photos === 'bad') gallery = '<div style="font-size:13px;opacity:.8;margin-top:6px">Το κλειδί φωτογραφιών δεν έγινε δεκτό. Πείτε «ρύθμισε τις φωτογραφίες».</div>';
    const more = `<div style="margin-top:8px;text-align:center"><a href="${gUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:7px 14px;border:1px solid var(--line);border-radius:999px;color:var(--cyan);text-decoration:none">📷 Περισσότερες φωτογραφίες</a></div>`;
    return { text, html: `${escapeHtml(text)}${outfitSvg(o)}${outfitLegend(o)}${gallery}${more}${!S.pexelsKey && !S.pixabayKey ? '<div style="font-size:12px;opacity:.6;margin-top:6px;text-align:center">Για φωτογραφίες εδώ μέσα, πείτε «ρύθμισε τις φωτογραφίες».</div>' : ''}`, speak: text };
  };
}

intents.unshift({ re: /(ρυθμισε τισ φωτογραφιεσ|κλειδι (pexels|pixabay)|βαλε (pexels|pixabay)|^(pexels|pixabay)$|πιξαμπει|πεξελσ)/, run: () => {
  setTimeout(() => { $('#settings').classList.remove('hidden'); fillSettings(); const el = document.querySelector('[data-k="pixabayKey"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 9000);
  return { text: 'Ρύθμιση φωτογραφιών', html: `<b>📷 Δωρεάν φωτογραφίες ντυσίματος (Pixabay), σε 4 βήματα</b>
    <div style="margin-top:6px">1. Πατήστε εδώ: <a href="https://pixabay.com/accounts/register/" target="_blank" rel="noopener">pixabay.com, εγγραφή →</a> και φτιάξτε δωρεάν λογαριασμό (ή «Continue with Google»).</div>
    <div>2. Μετά ανοίξτε αυτή τη σελίδα: <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">pixabay.com/api/docs →</a></div>
    <div>3. Κατεβείτε λίγο, στο σημείο <b>«Parameters»</b> → <b>key (required)</b>. Εκεί, με πράσινα γράμματα, είναι το κλειδί σας (αριθμοί και γράμματα). Αντιγράψτε το.</div>
    <div>4. Γυρίστε εδώ, ⚙ → <b>Κλειδί φωτογραφιών Pixabay</b>, και κάντε επικόλληση. Μετά πείτε «τι να φορέσω».</div>`,
    speak: 'Σε τέσσερα βήματα. Ένα: φτιάξτε δωρεάν λογαριασμό στο Pixabay με το Google σας. Δύο: ανοίξτε τη σελίδα pixabay τελεία com κάθετος api κάθετος docs. Τρία: κατεβείτε στο key, εκεί είναι το κλειδί σας με πράσινα γράμματα, αντιγράψτε το. Τέσσερα: γυρίστε εδώ, στις ρυθμίσεις, στο κλειδί φωτογραφιών Pixabay, και κάντε επικόλληση.' }; } });
