/* =========================================================
   J.A.R.V.I.S. — Αντίγραφο ασφαλείας & επαναφορά
   ========================================================= */
'use strict';

if (S.lastBackup === undefined) { S.lastBackup = 0; saveSettings(); }
if (S.backupRemind === undefined) { S.backupRemind = true; saveSettings(); }
const SKIP_KEYS = /^jv_(rss_|wday$|fired$)/; // προσωρινές μνήμες που δεν χρειάζονται

function collectData() {
  const data = {};
  Object.keys(localStorage).filter((k) => k.startsWith('jv_') && !SKIP_KEYS.test(k)).forEach((k) => { try { data[k] = JSON.parse(localStorage.getItem(k)); } catch { data[k] = localStorage.getItem(k); } });
  if (data.jv_settings) { delete data.jv_settings.geminiKey; delete data.jv_settings.aiKey; delete data.jv_settings.gptKey; delete data.jv_settings.groqKey; delete data.jv_settings.tmdbKey; delete data.jv_settings.psiKey; } // τα κλειδιά δεν μπαίνουν στο αρχείο
  return { app: 'jarvis', version: 1, at: new Date().toISOString(), data };
}
const backupName = () => `jarvis-backup-${dkey()}.json`;
function backupSummary(d) {
  const n = (k) => (Array.isArray(d[k]) ? d[k].length : 0);
  return [['συνήθειες', n('jv_habits')], ['στόχοι', n('jv_goals')], ['εργασίες', n('jv_work')], ['επαφές', n('jv_contacts')], ['σημειώσεις', n('jv_notes')], ['έξοδα', n('jv_expenses')], ['καταγραφές ημερολογίου', n('jv_journal')]].filter((x) => x[1]).map(([l, v]) => `${v} ${l}`).join(', ');
}
function markBackup() { S.lastBackup = Date.now(); saveSettings(); updateBackupInfo(); }

async function exportBackup(viaShare) {
  const payload = collectData(); const json = JSON.stringify(payload, null, 1);
  const file = new File([json], backupName(), { type: 'application/json' });
  // Στο κινητό: παράθυρο κοινοποίησης για αποθήκευση σε Google Drive, email κ.λπ.
  if (viaShare && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'JARVIS αντίγραφο ασφαλείας', text: `Αντίγραφο ασφαλείας ${new Date().toLocaleDateString('el-GR')}` }); markBackup(); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = backupName(); document.body.appendChild(a);
  HTMLAnchorElement.prototype.click.call(a); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); markBackup(); return 'downloaded';
}

function importBackup(file) {
  return new Promise((res) => {
    const rd = new FileReader();
    rd.onload = () => {
      let p; try { p = JSON.parse(rd.result); } catch { return res('Το αρχείο δεν είναι έγκυρο αντίγραφο ασφαλείας.'); }
      if (!p || p.app !== 'jarvis' || !p.data) return res('Αυτό το αρχείο δεν είναι αντίγραφο ασφαλείας του JARVIS.');
      const when = new Date(p.at).toLocaleString('el-GR');
      if (!confirm(`Επαναφορά από το αντίγραφο της ${when};\n\nΠεριέχει: ${backupSummary(p.data) || 'ρυθμίσεις'}.\n\nΤα τωρινά δεδομένα θα αντικατασταθούν.`)) return res(null);
      const keepKeys = { geminiKey: S.geminiKey, aiKey: S.aiKey, gptKey: S.gptKey, groqKey: S.groqKey, tmdbKey: S.tmdbKey, psiKey: S.psiKey };
      Object.keys(localStorage).filter((k) => k.startsWith('jv_')).forEach((k) => localStorage.removeItem(k));
      Object.entries(p.data).forEach(([k, v]) => { if (k.startsWith('jv_')) localStorage.setItem(k, JSON.stringify(v)); });
      const st = JSON.parse(localStorage.getItem('jv_settings') || '{}'); Object.entries(keepKeys).forEach(([k, v]) => { if (v && !st[k]) st[k] = v; }); st.lastBackup = Date.now(); st.lastBrief = new Date().toDateString();
      localStorage.setItem('jv_settings', JSON.stringify(st));
      toast('ΕΠΑΝΑΦΟΡΑ', 'Τα δεδομένα επαναφέρθηκαν. Επανεκκίνηση συστημάτων...', 4000); Sound.reply();
      setTimeout(() => location.reload(), 1600); res('ok');
    };
    rd.readAsText(file);
  });
}

function daysSinceBackup() { return S.lastBackup ? Math.floor((Date.now() - S.lastBackup) / 86400000) : null; }
function updateBackupInfo() {
  const el = $('#backupInfo'); if (!el) return; const d = daysSinceBackup();
  el.textContent = d == null ? 'Δεν έχει γίνει ακόμα αντίγραφο ασφαλείας.' : d === 0 ? `Τελευταίο αντίγραφο: σήμερα, ${new Date(S.lastBackup).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hour12: false })}.` : `Τελευταίο αντίγραφο: πριν από ${d} ${d === 1 ? 'μέρα' : 'μέρες'}.`;
  el.classList.toggle('warn', d == null || d >= 7);
}

function tickBackup() {
  const d = new Date(), now = `${pad(d.getHours())}:${pad(d.getMinutes())}`, ds = daysSinceBackup();
  if (S.backupRemind && now === '20:45' && (ds == null || ds >= 7) && (habits.some((h) => Object.keys(h.log).length) || todos.length || notes.length || work.length) && once(`bk-${todayKey()}`)) {
    const msg = ds == null ? 'Δεν έχετε κρατήσει ακόμα αντίγραφο ασφαλείας των δεδομένων σας.' : `Πέρασαν ${ds} μέρες από το τελευταίο αντίγραφο ασφαλείας.`;
    toast('ΑΝΤΙΓΡΑΦΟ ΑΣΦΑΛΕΙΑΣ', msg + ' Ρυθμίσεις → Αντίγραφο ασφαλείας → Εξαγωγή.', 12000); notify('Αντίγραφο ασφαλείας', msg);
    pending = (raw, nn) => (/^(ναι|οκ|ok|καντο|καν το|βεβαια|παμε)/.test(nn) ? exportBackup(false).then(() => `Το αρχείο ${backupName()} αποθηκεύτηκε στις Λήψεις. Ανεβάστε το στο Google Drive για να είναι ασφαλές.`) : null);
    say(msg + ' Θέλετε να το κάνω τώρα;', { noRelisten: true });
  }
}

/* Κουμπιά ρυθμίσεων */
function bindBackupUI() {
  updateBackupInfo();
  $('#backupExport').onclick = async () => { Sound.tap(); const r = await exportBackup(true); if (r === 'downloaded') toast('ΑΝΤΙΓΡΑΦΟ ΑΣΦΑΛΕΙΑΣ', `Αποθηκεύτηκε το ${backupName()} στις Λήψεις. Καλό είναι να το ανεβάσετε και στο Google Drive.`, 9000); else if (r === 'shared') toast('ΑΝΤΙΓΡΑΦΟ ΑΣΦΑΛΕΙΑΣ', 'Το αντίγραφο στάλθηκε.', 5000); };
  $('#backupImport').onclick = () => { Sound.tap(); $('#backupFile').click(); };
  $('#backupFile').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const r = await importBackup(f); if (r && r !== 'ok') { toast('ΕΠΑΝΑΦΟΡΑ', r, 7000); Sound.error(); } };
}

/* Βοήθεια & εντολές */
const baseHelpB = helpHtml;
helpHtml = function () { return baseHelpB() + '<div style="margin-top:8px"><b>💾 Αντίγραφο ασφαλείας</b><div style="opacity:.8;margin-left:6px">«Κάνε αντίγραφο ασφαλείας» → αρχείο με όλα σας τα δεδομένα</div><div style="opacity:.8;margin-left:6px">Επαναφορά: Ρυθμίσεις → Αντίγραφο ασφαλείας → Επαναφορά</div></div>'; };
intents.unshift(
  { re: /(σταματα να ακουσ|κλεισε το μικροφωνο|μην ακουσ|σταματα την ακροαση|κλεισε την ακροαση)/, run: () => { S.handsFree = false; S.wake = false; saveSettings(); fillSettings(); Wake.stop(); return 'Το μικρόφωνο έκλεισε. Πατήστε τον αντιδραστήρα ή πείτε μου από τις ρυθμίσεις όταν με χρειαστείτε.'; } },
  { re: /(ακουγε με συνεχεια|ανοιξε το μικροφωνο|συνεχησ ακροαση|ακου με συνεχεια|να με ακουσ συνεχεια)/, run: () => { S.handsFree = true; saveSettings(); fillSettings(); Wake.stop(); Wake.start(); return 'Συνεχής ακρόαση ενεργή. Απλώς μιλήστε μου, χωρίς κουμπιά.'; } },
  { re: /(αντιγραφο ασφαλειασ|backup|μπακαπ|εξαγωγη δεδομενων|σωσε τα δεδομενα)/, test: (n) => !/(επαναφορα|restore|ποτε)/.test(n), run: async () => { const r = await exportBackup(false); const ds = collectData(); return `Έτοιμο. Το αρχείο ${backupName()} αποθηκεύτηκε στις Λήψεις, με ${backupSummary(ds.data) || 'τις ρυθμίσεις σας'}. Ανεβάστε το στο Google Drive ή στείλτε το στον εαυτό σας με email για να είναι ασφαλές. Τα κλειδιά API δεν περιλαμβάνονται για λόγους ασφαλείας.`; } },
  { re: /(επαναφορα|restore).*(δεδομενων|αντιγραφου|backup)|(ποτε εκανα|τελευταιο) (αντιγραφο|backup)/, run: (raw, n) => { if (/(ποτε|τελευταιο)/.test(n)) { const d = daysSinceBackup(); return d == null ? 'Δεν έχετε κάνει ακόμα αντίγραφο ασφαλείας. Πείτε «κάνε αντίγραφο ασφαλείας».' : `Το τελευταίο αντίγραφο έγινε πριν από ${d} ${d === 1 ? 'μέρα' : 'μέρες'}.`; } $('#settings').classList.remove('hidden'); setTimeout(() => $('#backupImport').scrollIntoView({ block: 'center' }), 200); return 'Άνοιξα τις ρυθμίσεις. Πατήστε «Επαναφορά» και διαλέξτε το αρχείο αντιγράφου.'; } },
);

const baseFIb = featuresInit;
window.featuresInit = function () { baseFIb(); setInterval(tickBackup, 30000); tickBackup(); };
bindBackupUI();
