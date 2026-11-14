package gr.jarvis.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.MediaStore
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * Η εφαρμογή JARVIS για Android: φορτώνει την εφαρμογή web και της δίνει
 * τη φωνή (TextToSpeech) και την ακοή (SpeechRecognizer) του κινητού.
 */
class MainActivity : Activity() {

    companion object {
        const val URL = "https://rivocucine-hash.github.io/jarvis/"
        const val HOST = "rivocucine-hash.github.io"
        const val REQ_PERMS = 10
        /** Αληθές όσο η εφαρμογή είναι μπροστά στον χρήστη. */
        @Volatile var visible = false
        const val REQ_FILE = 11
        @Volatile var listeningNative = false
    }

    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var sr: SpeechRecognizer? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWake = false
    private val prefs by lazy { getSharedPreferences("jarvis", Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        CrashLog.install(this)
        super.onCreate(savedInstanceState)
        // Αν την προηγούμενη φορά η εφαρμογή έκλεισε, δείχνουμε πρώτα την αιτία, πριν ξεκινήσει οτιδήποτε.
        if (prefs.getBoolean("wakeStarting", false)) {
            val header = "Η ακρόαση «Τζάρβις» (Vosk) έκλεισε την εφαρμογή κατά την εκκίνησή της.\nΈκδοση εφαρμογής: " + appVersion() +
                "\nAndroid " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ") · " + Build.MANUFACTURER + " " + Build.MODEL + " · " + Build.SUPPORTED_ABIS.joinToString() + "\nΤελευταίο βήμα ακρόασης: " + (prefs.getString("wakeStage", "-") ?: "-")
            val old = prefs.getString("lastCrash", null)
            prefs.edit().remove("wakeStarting").putBoolean("wake", false).putInt("wakeBlockedVersion", appVersion())
                .putString("lastCrash", header + "\n\n" + CrashLog.exitInfo(this) + (if (old != null) "\n\n" + old else "")).commit()
        }
        val earlyCrash = CrashLog.take(this, "lastCrash")
        if (earlyCrash != null) { crashScreen = true; showCrashScreen(earlyCrash); return }
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this)
        // Όταν ανοίγει το πληκτρολόγιο, η σελίδα μικραίνει ώστε το πεδίο γραφής να μένει ορατό πάνω από αυτό.
        val root = android.widget.FrameLayout(this)
        root.setBackgroundColor(0xFF02070D.toInt())
        root.addView(web, android.widget.FrameLayout.LayoutParams(android.widget.FrameLayout.LayoutParams.MATCH_PARENT, android.widget.FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener { v, insets ->
                val ime = insets.getInsets(android.view.WindowInsets.Type.ime()).bottom
                v.setPadding(0, 0, 0, ime)
                if (ime > 0) js("(function(){var e=document.activeElement;if(e&&e.scrollIntoView)setTimeout(function(){e.scrollIntoView({block:'center'})},150)})()")
                insets
            }
        }
        web.setBackgroundColor(0xFF02070D.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportMultipleWindows(false)
            setGeolocationEnabled(true)
            userAgentString = "$userAgentString JarvisAndroid/1"
        }
        web.addJavascriptInterface(Bridge(), "AndroidJarvis")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == HOST && (u.path ?: "").startsWith("/jarvis")) return false
                openExternal(u); return true
            }
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) { note("page start") }
            override fun onPageFinished(view: WebView, url: String?) { note("page finished") }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                note("load error " + error.errorCode + " " + error.description + " " + request.url.toString().takeLast(60))
            }
            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                note("RENDERER GONE crashed=" + detail.didCrash()); main.post { showDiag("Η μηχανή προβολής (WebView) τερματίστηκε.") }; return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null); fileCallback = cb
                return try { startActivityForResult(params.createIntent(), REQ_FILE); true } catch (e: Exception) { fileCallback = null; false }
            }
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) { callback.invoke(origin, false, false) }
            override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean {
                if (m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR || m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.WARNING)
                    note("js " + m.message() + " @" + m.sourceId().substringAfterLast('/') + ":" + m.lineNumber())
                return true
            }
        }

        try { tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale("el", "GR"); ttsReady = true
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    // Τα αναγνωριστικά που αρχίζουν με «m» είναι η ανάγνωση μηνυμάτων: η σελίδα μαθαίνει μόνο πότε τελείωσε.
                    override fun onStart(id: String?) { if (id?.startsWith("m") == true) return; js("window.__nativeTtsStart && __nativeTtsStart()") }
                    override fun onDone(id: String?) { if (id?.startsWith("m") == true) { if (id == "mLast") js("window.__nativeMsgDone && __nativeMsgDone()"); return }; js("window.__nativeTtsDone && __nativeTtsDone()") }
                    @Deprecated("Deprecated in Java") override fun onError(id: String?) { if (id?.startsWith("m") == true) { if (id == "mLast") js("window.__nativeMsgDone && __nativeMsgDone()"); return }; js("window.__nativeTtsDone && __nativeTtsDone()") }
                })
                note("tts ready")
                // Η λίστα φωνών διαβάζεται στο παρασκήνιο: η σελίδα δεν περιμένει ποτέ τη μηχανή ομιλίας.
                Thread {
                    try {
                        val list = tts?.voices?.filter { it.locale.language == "el" }?.sortedBy { it.isNetworkConnectionRequired } ?: emptyList()
                        val arr = JSONArray()
                        list.forEach { v -> arr.put(JSONObject().put("name", v.name).put("local", !v.isNetworkConnectionRequired)) }
                        voiceMap = list.associateBy { it.name }; voicesJson = arr.toString(); note("voices " + list.size)
                    } catch (e: Throwable) { note("voices failed " + e) }
                    js("window.__nativeTtsReady && __nativeTtsReady()")
                }.start()
            } else note("tts init failed " + status)
        } } catch (e: Throwable) { CrashLog.note(this, "TextToSpeech", e) }

        pendingWake = intent?.getBooleanExtra("wake", false) == true
        t0 = android.os.SystemClock.elapsedRealtime()
        // Πάντα η πιο πρόσφατη έκδοση της σελίδας: σβήνεται η προσωρινή μνήμη του WebView (όχι τα δεδομένα του χρήστη).
        try { web.clearCache(true) } catch (_: Throwable) {}
        val pendingMorning = intent?.getBooleanExtra("morning", false) == true
        if (pendingMorning) { try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(MorningAlarm.NOTIF_ID) } catch (_: Throwable) {}; note("morning launch") }
        web.loadUrl(URL + if (pendingMorning) "?morning=1" else if (pendingWake) "?wake=1" else "")
        pendingWake = false
        main.postDelayed(watchdog, 3000)

        val crash = CrashLog.take(this, "lastProblem")
        if (crash != null) showReport(crash) else askPermissions()
    }

    /* ---------------- Διακοπή με τη φωνή ---------------- */
    private val barge by lazy { BargeIn({ js("window.__nativeBarge && __nativeBarge()") }, { s -> note(s) }) }

    /* ---------------- Διάγνωση εκκίνησης ---------------- */
    @Volatile private var voicesJson = "[]"
    @Volatile private var voiceMap: Map<String, android.speech.tts.Voice> = emptyMap()
    private val diag = java.util.concurrent.ConcurrentLinkedDeque<String>()
    private var t0 = 0L
    @Volatile private var lastReply = "-"
    @Volatile private var lastPong = 0L
    private var hudSeen = false
    private var diagShown = false
    private fun note(s: String) {
        diag.add("[" + (android.os.SystemClock.elapsedRealtime() - t0) + "ms] " + s.take(300))
        while (diag.size > 40) diag.pollFirst()
    }
    /** Ρωτάει τη σελίδα κάθε 2″ σε ποιο βήμα είναι. Αν σε 20″ δεν έχει ανοίξει η κύρια οθόνη, δείχνει αναφορά. */
    private val watchdog = object : Runnable {
        override fun run() {
            if (hudSeen || diagShown || isFinishing || !::web.isInitialized) return
            val now = android.os.SystemClock.elapsedRealtime()
            try {
                web.evaluateJavascript("(function(){try{var h=document.getElementById('hud');return (typeof bootStep==='undefined'?'?':bootStep)+'|'+(h&&!h.classList.contains('hidden')?1:0)+'|'+document.readyState+'|'+(typeof bootProblems==='undefined'?'':bootProblems.join(';'))}catch(e){return 'err '+e}})()") { r ->
                    lastPong = android.os.SystemClock.elapsedRealtime(); lastReply = r ?: "null"
                    if (r != null && r.contains("|1|")) { hudSeen = true; note("hud visible") }
                }
            } catch (e: Throwable) { note("ping failed " + e) }
            if (now - t0 > 20000) { showDiag("Η κύρια οθόνη δεν άνοιξε μέσα σε 20 δευτερόλεπτα."); return }
            main.postDelayed(this, 2000)
        }
    }
    private fun diagText(reason: String): String {
        val sb = StringBuilder()
        val now = android.os.SystemClock.elapsedRealtime()
        sb.append("JARVIS v").append(appVersion()).append(" · ").append(reason).append("\n")
        sb.append("Android ").append(Build.VERSION.RELEASE).append(" · ").append(Build.MANUFACTURER).append(" ").append(Build.MODEL).append("\n")
        try { val p = WebView.getCurrentWebViewPackage(); sb.append("WebView ").append(p?.packageName).append(" ").append(p?.versionName).append("\n") } catch (_: Throwable) {}
        sb.append("Τελευταία απάντηση σελίδας: ").append(lastReply).append(" (πριν ").append(if (lastPong == 0L) "ποτέ" else ((now - lastPong) / 1000).toString() + "s").append(")\n")
        sb.append("--- Καταγραφή ---\n")
        diag.forEach { sb.append(it).append("\n") }
        sb.append("--- Android: τελευταίοι τερματισμοί ---\n")
        try { sb.append(CrashLog.exitInfo(this)).append("\n") } catch (_: Throwable) {}
        sb.append("--- Νήματα ---\n")
        try {
            Thread.getAllStackTraces().forEach { (t, st) ->
                val mine = st.any { it.className.startsWith("gr.jarvis") }
                if (t.name == "main" || t.name.startsWith("JavaBridge") || mine) {
                    sb.append(t.name).append(" [").append(t.state).append("]\n")
                    st.take(12).forEach { sb.append("  ").append(it.className.substringAfterLast('.')).append(".").append(it.methodName).append(":").append(it.lineNumber).append("\n") }
                }
            }
        } catch (_: Throwable) {}
        return sb.toString()
    }
    private fun showDiag(reason: String) {
        if (diagShown || isFinishing) return
        diagShown = true
        val text = diagText(reason)
        val copy = {
            (getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("JARVIS", text))
            android.widget.Toast.makeText(this, "Η αναφορά αντιγράφηκε. Επικολλήστε τη στον δημιουργό σας.", android.widget.Toast.LENGTH_LONG).show()
        }
        try { copy() } catch (_: Throwable) {}
        try {
            AlertDialog.Builder(this).setTitle("JARVIS: δεν ξεκίνησε").setCancelable(false)
                .setMessage("Η αναφορά αντιγράφηκε ήδη. Στείλτε τη στον δημιουργό σας (επικόλληση).\n\n" + text.take(1200))
                .setPositiveButton("Αντιγραφή ξανά") { _, _ -> try { copy() } catch (_: Throwable) {}; diagShown = false }
                .setNegativeButton("Επανεκκίνηση") { _, _ -> diagShown = false; recreate() }
                .show()
        } catch (_: Throwable) { diagShown = false }
    }

    private var crashScreen = false
    /** Απλή οθόνη με την αιτία του κλεισίματος: δεν ξεκινάει τίποτα άλλο, ώστε να μην ξανακλείσει. */
    private fun showCrashScreen(text: String) {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = android.widget.LinearLayout(this).apply { orientation = android.widget.LinearLayout.VERTICAL; setPadding(pad, pad * 2, pad, pad); setBackgroundColor(0xFF02070D.toInt()) }
        val title = android.widget.TextView(this).apply { this.text = "JARVIS: έκλεισε απρόσμενα"; textSize = 20f; setTextColor(0xFF3EE0FF.toInt()) }
        val info = android.widget.TextView(this).apply { this.text = (if (!wakeEnabled()) "Η ακρόαση «Τζάρβις» απενεργοποιήθηκε προσωρινά, ώστε η εφαρμογή να ανοίγει κανονικά.\n\n" else "") + "Πατήστε «Αντιγραφή» και στείλτε το κείμενο στον δημιουργό σας. Μετά πατήστε «Συνέχεια»."; setTextColor(0xFFD8F6FF.toInt()); setPadding(0, pad, 0, pad) }
        val copy = android.widget.Button(this).apply { this.text = "Αντιγραφή"; setOnClickListener {
            (getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("JARVIS", text))
            android.widget.Toast.makeText(this@MainActivity, "Αντιγράφηκε", android.widget.Toast.LENGTH_SHORT).show() } }
        val go = android.widget.Button(this).apply { this.text = "Συνέχεια"; setOnClickListener { recreate() } }
        val body = android.widget.TextView(this).apply { this.text = text; textSize = 11f; setTextColor(0xFF6EA8BA.toInt()); setTextIsSelectable(true); setPadding(0, pad, 0, 0) }
        col.addView(title); col.addView(info); col.addView(copy); col.addView(go); col.addView(body)
        setContentView(android.widget.ScrollView(this).apply { setBackgroundColor(0xFF02070D.toInt()); addView(col) })
    }

    /** Δείχνει την αιτία του προηγούμενου κλεισίματος, με κουμπί αντιγραφής. */
    private fun showReport(text: String) {
        dialogShown = true
        val wakeOff = !wakeEnabled()
        val msg = (if (wakeOff) "Η ακρόαση «Τζάρβις» απενεργοποιήθηκε προσωρινά για να ανοίγει κανονικά η εφαρμογή.\n\n" else "") +
            "Πατήστε «Αντιγραφή» και στείλτε το κείμενο στον δημιουργό σας για διόρθωση.\n\n" + text.take(1500)
        AlertDialog.Builder(this).setTitle("JARVIS: έκλεισε απρόσμενα").setMessage(msg)
            .setPositiveButton("Αντιγραφή") { _, _ ->
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("JARVIS", text))
                android.widget.Toast.makeText(this, "Αντιγράφηκε", android.widget.Toast.LENGTH_SHORT).show()
                dialogShown = false; askPermissions()
            }
            .setNegativeButton("Κλείσιμο") { _, _ -> dialogShown = false; askPermissions() }
            .show()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent)
        if (intent.getBooleanExtra("morning", false)) {
            try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(MorningAlarm.NOTIF_ID) } catch (_: Throwable) {}
            js("window.__nativeMorning && __nativeMorning()"); return
        }
        if (intent.getBooleanExtra("wake", false)) js("window.__nativeWake ? __nativeWake() : (location.href='${URL}?wake=1')")
    }

    override fun onPause() { visible = false; super.onPause() }

    override fun onResume() {
        super.onResume()
        visible = true
        if (crashScreen) return
        try { Health.start(this) } catch (_: Throwable) {}
        if (hasMic()) { if (wakeEnabled() && wakeProven()) startWake(); askNextSpecialPermission() }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (!crashScreen && web.canGoBack()) web.goBack() else moveTaskToBack(true) }

    override fun onDestroy() { try { if (wakeBound) unbindService(wakeConn) } catch (_: Throwable) {}; tts?.shutdown(); sr?.destroy(); super.onDestroy() }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) { fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); fileCallback = null }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (crashScreen) return
        try { Health.start(this) } catch (_: Throwable) {}
        if (hasMic() && wakeEnabled() && wakeProven()) startWake()
        askNextSpecialPermission()
    }

    /* ---------------- Άδειες ---------------- */
    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    private fun wakeProven() = WakeService.okFile(this).exists()
    private var wakeBound = false
    private val wakeConn = object : android.content.ServiceConnection {
        override fun onServiceConnected(name: android.content.ComponentName?, service: android.os.IBinder?) { js("window.__nativeWakeState && __nativeWakeState('up')") }
        override fun onServiceDisconnected(name: android.content.ComponentName?) { js("window.__nativeWakeState && __nativeWakeState('died')") }
    }
    /** Ξεκινά την ακρόαση στη δική της διεργασία και παρακολουθεί αν θα τερματιστεί. */
    private fun startWake() {
        WakeService.start(this)
        try { if (!wakeBound) wakeBound = bindService(Intent(this, WakeService::class.java), wakeConn, 0) } catch (_: Throwable) {}
    }
    private fun wakeBlocked() = prefs.getInt("wakeBlockedVersion", -1) == appVersion()
    private fun wakeEnabled() = prefs.getBoolean("wake", true) && !wakeBlocked()
    private fun appVersion(): Int = try { packageManager.getPackageInfo(packageName, 0).let { if (Build.VERSION.SDK_INT >= 28) it.longVersionCode.toInt() else @Suppress("DEPRECATION") it.versionCode } } catch (_: Throwable) { 0 }

    private fun askPermissions() {
        val need = mutableListOf<String>()
        if (!hasMic()) need += Manifest.permission.RECORD_AUDIO
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) need += Manifest.permission.POST_NOTIFICATIONS
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), REQ_PERMS)
    }

    private var dialogShown = false
    /** Ζητάει μία-μία τις ειδικές άδειες που χρειάζονται για να ανοίγει με το «Τζάρβις». */
    private fun askNextSpecialPermission() {
        // Οι ειδικές άδειες ζητούνται μόνο αφού η ακρόαση αποδειχθεί ότι δουλεύει σε αυτό το κινητό.
        if (dialogShown || diagShown || !wakeEnabled() || !wakeProven()) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        when {
            !Settings.canDrawOverlays(this) && !prefs.getBoolean("askedOverlay", false) -> explain("askedOverlay",
                "Για να ανοίγω μόνος μου όταν λέτε «Τζάρβις», χρειάζομαι την άδεια «Εμφάνιση πάνω από άλλες εφαρμογές». Στην επόμενη οθόνη ενεργοποιήστε την για το JARVIS.") {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            }
            !pm.isIgnoringBatteryOptimizations(packageName) && !prefs.getBoolean("askedBattery", false) -> explain("askedBattery",
                "Για να μη με κλείνει το κινητό όταν δεν με χρησιμοποιείτε, επιτρέψτε μου να μην περιορίζομαι από την εξοικονόμηση μπαταρίας.") {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            }
            Build.VERSION.SDK_INT >= 34 && !nm.canUseFullScreenIntent() && !prefs.getBoolean("askedFullScreen", false) -> explain("askedFullScreen",
                "Για να ανάβω την οθόνη όταν το κινητό είναι κλειδωμένο, επιτρέψτε τις «ειδοποιήσεις πλήρους οθόνης» για το JARVIS.") {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
            }
        }
    }

    private fun explain(flag: String, text: String, action: () -> Unit) {
        dialogShown = true
        AlertDialog.Builder(this).setTitle("JARVIS").setMessage(text).setCancelable(false)
            .setPositiveButton("Ρυθμίσεις") { _, _ -> prefs.edit().putBoolean(flag, true).apply(); dialogShown = false; try { action() } catch (_: Exception) {} }
            .setNegativeButton("Αργότερα") { _, _ -> prefs.edit().putBoolean(flag, true).apply(); dialogShown = false; askNextSpecialPermission() }
            .show()
    }

    /* ---------------- Βοηθητικά ---------------- */
    private fun js(code: String) = main.post { if (::web.isInitialized) web.evaluateJavascript(code, null) }
    private fun q(s: String) = JSONObject.quote(s)

    private fun openExternal(u: Uri) {
        try {
            val i = if (u.scheme == "tel") Intent(Intent.ACTION_DIAL, u) else Intent(Intent.ACTION_VIEW, u)
            startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {}
    }

    /** offline=true: δεύτερη προσπάθεια με αναγνώριση πάνω στο κινητό, όταν η διαδικτυακή αποτύχει (σφάλμα δικτύου). */
    /** Μετά από αποτυχία της διαδικτυακής αναγνώρισης, για 30 λεπτά ξεκινάμε κατευθείαν με αυτήν του κινητού (γλιτώνει την αναμονή). */
    private var preferOfflineUntil = 0L
    private fun startListening(offlineArg: Boolean = false) {
        val offline = offlineArg || android.os.SystemClock.elapsedRealtime() < preferOfflineUntil
        if (!hasMic()) { askPermissions(); js("window.__nativeSttError && __nativeSttError(9); window.__nativeSttEnd && __nativeSttEnd()"); return }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { js("window.__nativeSttError && __nativeSttError(-1); window.__nativeSttEnd && __nativeSttEnd()"); return }
        barge.stop()
        WakeService.send(this, WakeService.ACTION_PAUSE)
        listeningNative = true
        sr?.destroy()
        val onDevice = offline && Build.VERSION.SDK_INT >= 31 && try { SpeechRecognizer.isOnDeviceRecognitionAvailable(this) } catch (_: Throwable) { false }
        val rec = if (onDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(this) else SpeechRecognizer.createSpeechRecognizer(this); sr = rec
        note("stt start offline=$offline onDevice=$onDevice")
        var ended = false
        val end = { if (!ended) { ended = true; listeningNative = false; js("window.__nativeSttEnd && __nativeSttEnd()"); main.postDelayed({ rec.destroy(); if (!listeningNative) WakeService.send(this, WakeService.ACTION_RESUME) }, 300) } }
        rec.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(p: Bundle?) { js("window.__nativeSttStart && __nativeSttStart()") }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(v: Float) {}
            override fun onBufferReceived(b: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(code: Int) {
                note("stt error $code offline=$offline")
                // Σφάλμα δικτύου (1, 2): δοκιμάζουμε μία φορά την αναγνώριση πάνω στο κινητό πριν τα παρατήσουμε.
                if ((code == 1 || code == 2) && !offline && !ended) { ended = true; preferOfflineUntil = android.os.SystemClock.elapsedRealtime() + 30 * 60000L; main.postDelayed({ try { rec.destroy() } catch (_: Throwable) {}; startListening(true) }, 250); return }
                // Αν απέτυχε και η αναγνώριση του κινητού (όχι απλώς σιωπή), την επόμενη φορά ξαναδοκιμάζουμε τη διαδικτυακή.
                if (offline && code != 6 && code != 7) preferOfflineUntil = 0L
                js("window.__nativeSttError && __nativeSttError(" + (if (offline) 100 + code else code) + ")"); end()
            }
            override fun onResults(r: Bundle?) {
                val t = r?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                js("window.__nativeStt && __nativeStt(${q(t)}, true)"); end()
            }
            override fun onPartialResults(r: Bundle?) {
                val t = r?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
                js("window.__nativeStt && __nativeStt(${q(t)}, false)")
            }
            override fun onEvent(t: Int, p: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "el-GR")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            // Πιο γρήγορο τέλος ακρόασης: λιγότερη αναμονή σιωπής μετά την ομιλία.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 900L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 700L)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            if (offline) putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
        try { rec.startListening(intent) } catch (e: Exception) { js("window.__nativeSttError && __nativeSttError(-2)"); end() }
    }

    /* ---------------- Γέφυρα προς την εφαρμογή web ---------------- */
    inner class Bridge {
        @JavascriptInterface fun isNative(): Boolean = true
        @JavascriptInterface fun ttsReady(): Boolean = ttsReady

        @JavascriptInterface fun speak(text: String, rate: Float, pitch: Float, voiceName: String) = main.post {
            val t = tts ?: return@post
            if (voiceName.isNotEmpty()) voiceMap[voiceName]?.let { t.voice = it }
            else t.language = Locale("el", "GR")
            t.setSpeechRate(rate); t.setPitch(pitch)
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "u" + System.currentTimeMillis())
        }
        @JavascriptInterface fun stopSpeak() { main.post { tts?.stop() } }

        @JavascriptInterface fun voices(): String = voicesJson
        @JavascriptInterface fun voicesCached(): String = voicesJson
        /** Η σελίδα γράφει εδώ σημειώσεις για την αναφορά διάγνωσης. */
        @JavascriptInterface fun diagNote(s: String) { note("web " + s) }

        @JavascriptInterface fun listen() { main.post { startListening() } }
        @JavascriptInterface fun stopListen() { main.post { sr?.stopListening() } }

        @JavascriptInterface fun isWakeBlocked(): Boolean = false
        @JavascriptInterface fun isWakeProven(): Boolean = wakeProven()
        @JavascriptInterface fun retryWake() { testWake() }
        /** Δοκιμή ακρόασης: ξεκινά την υπηρεσία όσο κι αν δεν έχει αποδειχθεί ακόμα ότι δουλεύει. */
        @JavascriptInterface fun testWake() {
            prefs.edit().remove("wakeBlockedVersion").putBoolean("wake", true).apply()
            main.post { if (hasMic()) { try { WakeService.logFile(this@MainActivity).delete() } catch (_: Throwable) {}; startWake() } else askPermissions() }
        }
        /** Το αρχείο καταγραφής της ακρόασης, μαζί με όσα κατέγραψε το Android αν τερματίστηκε. */
        @JavascriptInterface fun wakeLog(withExit: Boolean): String {
            val log = try { WakeService.logFile(this@MainActivity).readText() } catch (_: Throwable) { "" }
            return if (withExit) "JARVIS v" + appVersion() + "\n" + log + "\n--- Android: τελευταίοι τερματισμοί ---\n" + CrashLog.exitInfo(this@MainActivity) else log
        }
        /** Ραντεβού από το ημερολόγιο του κινητού για τις επόμενες μέρες. Διαβάζονται τοπικά, δεν στέλνονται πουθενά από εδώ. */
        @JavascriptInterface fun calendarEvents(days: Int): String {
            val out = JSONObject()
            if (checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) return out.put("denied", true).toString()
            val arr = JSONArray()
            try {
                val from = System.currentTimeMillis() - 12 * 3600000L
                val to = System.currentTimeMillis() + days.coerceIn(1, 31) * 86400000L
                val uri = android.provider.CalendarContract.Instances.CONTENT_URI.buildUpon().let { android.content.ContentUris.appendId(it, from); android.content.ContentUris.appendId(it, to); it.build() }
                val cols = arrayOf(android.provider.CalendarContract.Instances.TITLE, android.provider.CalendarContract.Instances.BEGIN, android.provider.CalendarContract.Instances.END, android.provider.CalendarContract.Instances.ALL_DAY, android.provider.CalendarContract.Instances.EVENT_LOCATION)
                contentResolver.query(uri, cols, null, null, android.provider.CalendarContract.Instances.BEGIN + " ASC")?.use { c ->
                    var n = 0
                    while (c.moveToNext() && n++ < 80) {
                        arr.put(JSONObject().put("t", c.getString(0) ?: "(χωρίς τίτλο)").put("s", c.getLong(1)).put("e", c.getLong(2)).put("all", c.getInt(3) == 1).put("loc", c.getString(4) ?: ""))
                    }
                }
            } catch (e: Throwable) { note("calendar failed " + e) }
            return out.put("events", arr).toString()
        }
        /** Ορίζει το πρωινό ξύπνημα στο ξυπνητήρι του Android, ώστε να χτυπά και με κλειστή εφαρμογή. */
        @JavascriptInterface fun setMorningAlarm(hour: Int, minute: Int, on: Boolean): String { MorningAlarm.set(this@MainActivity, hour, minute, on); val r = MorningAlarm.schedule(this@MainActivity); note("morning alarm " + r); return r }
        /**
         * «Παίξε <κάτι>»: ζητά από το YouTube (ή το YouTube Music, ή όποια εφαρμογή μουσικής υπάρχει) να βρει και να ξεκινήσει μόνο του την αναπαραγωγή.
         * Επιστρέφει ποια εφαρμογή το ανέλαβε, ή κενό αν καμία (τότε η σελίδα ανοίγει απλή αναζήτηση).
         */
        @JavascriptInterface fun playMedia(query: String): String {
            val q = query.take(200)
            for (pkg in listOf("com.google.android.youtube", "com.google.android.apps.youtube.music", "")) {
                try {
                    val i = Intent(android.provider.MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
                        .putExtra(android.app.SearchManager.QUERY, q)
                        .putExtra(android.provider.MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (pkg.isNotEmpty()) i.setPackage(pkg)
                    if (i.resolveActivity(packageManager) != null) { main.post { try { startActivity(i) } catch (e: Throwable) { note("playMedia start failed " + e) } }; note("playMedia via " + pkg.ifEmpty { "any" }); return pkg.ifEmpty { "any" } }
                } catch (e: Throwable) { note("playMedia " + pkg + " " + e) }
            }
            note("playMedia: no app"); return ""
        }
        /** Οι υπενθυμίσεις της σελίδας περνούν στο ξυπνητήρι του Android, ώστε να χτυπούν και με κλειστή εφαρμογή. */
        @JavascriptInterface fun syncReminders(json: String): Int { val n = MorningAlarm.syncReminders(this@MainActivity, json); note("reminders synced " + n); return n }
        /** Όσο μιλάει ο βοηθός: ακούει αν ο χρήστης μιλήσει από πάνω του. sensitivity 1 (λίγο) έως 3 (πολύ). */
        @JavascriptInterface fun bargeStart(sensitivity: Int) { if (!hasMic() || listeningNative) return; barge.start(when (sensitivity) { 3 -> 1.5; 1 -> 2.6; else -> 1.9 }) }
        @JavascriptInterface fun bargeStop() { barge.stop() }
        /* ---------- Επαφές του κινητού: κλήση ή SMS με το όνομα. Ο αριθμός δεν επιστρέφεται στη σελίδα· η κλήση/αποστολή γίνεται μόνο αφού πατήσει ο χρήστης. ---------- */
        private fun plainName(s: String): String = java.text.Normalizer.normalize(s.lowercase(), java.text.Normalizer.Form.NFD).replace(Regex("[^a-zα-ω0-9 ]"), "").replace('ς', 'σ').trim()
        private fun findContacts(query: String): List<Pair<String, String>> {
            val stems = plainName(query).split(" ").filter { it.length >= 2 }.map { w -> if (w.length > 3) w.dropLast(1) else w }
            if (stems.isEmpty()) return emptyList()
            val found = LinkedHashMap<String, String>()
            val cols = arrayOf(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)
            contentResolver.query(android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI, cols, null, null, null)?.use { c ->
                while (c.moveToNext()) {
                    val name = c.getString(0) ?: continue; val num = c.getString(1) ?: continue
                    val words = plainName(name).split(" ")
                    if (stems.all { st -> words.any { it.startsWith(st) } } && !found.containsKey(name)) found[name] = num
                }
            }
            return found.entries.map { it.key to it.value }
        }
        private var contactCalls = ArrayDeque<Long>()
        private fun openContact(kind: String, number: String, body: String) {
            try {
                val i = if (kind == "sms") Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(number))).putExtra("sms_body", body.take(500))
                        else Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number)))
                startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Throwable) {}
        }
        /**
         * kind: "call" ανοίγει το πληκτρολόγιο κλήσης, "sms" ανοίγει νέο SMS με έτοιμο κείμενο.
         * Επιστρέφει ΜΟΝΟ {status}: ούτε ονόματα ούτε αριθμοί επαφών φτάνουν στη σελίδα.
         * Αν ταιριάζουν πολλές επαφές, η επιλογή γίνεται σε παράθυρο του κινητού. Υπάρχει όριο κλήσεων, ώστε να μην μπορεί να «ψαχτεί» ο κατάλογος.
         */
        @JavascriptInterface fun contactAction(kind: String, query: String, body: String): String {
            val out = JSONObject()
            val nowMs = android.os.SystemClock.elapsedRealtime()
            synchronized(contactCalls) {
                while (contactCalls.isNotEmpty() && nowMs - contactCalls.first() > 3600000L) contactCalls.removeFirst()
                if (contactCalls.size >= 30 || (contactCalls.isNotEmpty() && nowMs - contactCalls.last() < 1500L)) return out.put("status", "busy").toString()
                contactCalls.addLast(nowMs)
            }
            if (plainName(query).replace(" ", "").length < 3) return out.put("status", "none").toString()
            if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
                main.post { try { requestPermissions(arrayOf(Manifest.permission.READ_CONTACTS), REQ_PERMS) } catch (_: Throwable) {} }
                return out.put("status", "noperm").toString()
            }
            val list = try { findContacts(query) } catch (_: Throwable) { emptyList() }
            if (list.isEmpty()) return out.put("status", "none").toString()
            val exact = list.filter { plainName(it.first) == plainName(query) }
            val pick = if (list.size == 1) list[0] else if (exact.size == 1) exact[0] else null
            if (pick == null) {
                // Πολλές επαφές: η λίστα εμφανίζεται σε παράθυρο του κινητού, όχι στη σελίδα.
                val opts = list.take(8)
                main.post {
                    try {
                        AlertDialog.Builder(this@MainActivity).setTitle(if (kind == "sms") "Σε ποιον το μήνυμα;" else "Ποιον να καλέσω;")
                            .setItems(opts.map { it.first }.toTypedArray()) { _, which -> openContact(kind, opts[which].second, body) }
                            .setNegativeButton("Άκυρο", null).show()
                    } catch (_: Throwable) {}
                }
                return out.put("status", "many").toString()
            }
            main.post { openContact(kind, pick.second, body) }
            return out.put("status", "ok").toString()
        }
        /** Βήματα και ύπνος: τα δείγματα των αισθητήρων (μένουν στο κινητό). */
        @JavascriptInterface fun healthLog(): String = Health.read(this@MainActivity)
        @JavascriptInterface fun healthInfo(): String = JSONObject().put("sensor", Health.hasSensor(this@MainActivity)).put("perm", Health.hasPerm(this@MainActivity)).toString()
        @JavascriptInterface fun askSteps() { main.post { try { if (Build.VERSION.SDK_INT >= 29) requestPermissions(arrayOf(Manifest.permission.ACTIVITY_RECOGNITION), REQ_PERMS) else Health.start(this@MainActivity) } catch (_: Throwable) {} } }
        @JavascriptInterface fun askCalendar() { main.post { try { requestPermissions(arrayOf(Manifest.permission.READ_CALENDAR), REQ_PERMS) } catch (_: Throwable) {} } }
        @JavascriptInterface fun copyText(text: String) {
            main.post {
                (getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("JARVIS", text))
                android.widget.Toast.makeText(this@MainActivity, "Αντιγράφηκε", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
        @JavascriptInterface fun setWakeEnabled(on: Boolean) {
            prefs.edit().putBoolean("wake", on).apply()
            // Αυτόματη εκκίνηση μόνο αν η ακρόαση έχει αποδειχθεί σταθερή σε αυτό το κινητό
            main.post { if (on) { if (!wakeProven()) return@post; if (hasMic()) startWake() else askPermissions() } else WakeService.send(this@MainActivity, WakeService.ACTION_STOP) }
        }
        @JavascriptInterface fun isWakeEnabled(): Boolean = wakeEnabled()
        @JavascriptInterface fun wakeDone() { main.postDelayed({ if (!listeningNative) WakeService.send(this@MainActivity, WakeService.ACTION_RESUME) }, 300) }

        @JavascriptInterface fun notify(title: String, body: String) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            WakeService.ensureChannels(this@MainActivity)
            val pi = PendingIntent.getActivity(this@MainActivity, 3, Intent(this@MainActivity, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = Notification.Builder(this@MainActivity, WakeService.CH_MSG).setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title).setContentText(body).setStyle(Notification.BigTextStyle().bigText(body))
                .setContentIntent(pi).setAutoCancel(true).build()
            nm.notify((System.currentTimeMillis() % 100000).toInt() + 100, n)
        }

        @JavascriptInterface fun saveFile(name: String, content: String): String {
            return try {
                if (Build.VERSION.SDK_INT >= 29) {
                    val v = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, name); put(MediaStore.Downloads.MIME_TYPE, "application/json") }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: return ""
                    contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray()) }
                    "Λήψεις/$name"
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                    val f = File(dir, name); f.writeText(content); f.absolutePath
                }
            } catch (e: Exception) { "" }
        }

        /** Ανοίγει μία από τις γνωστές εφαρμογές μηνυμάτων στην αρχική της οθόνη (τις συζητήσεις). Μόνο από σταθερή λίστα. */
        @JavascriptInterface fun openApp(which: String): String {
            if (which == "sms") {
                // Η προεπιλεγμένη εφαρμογή μηνυμάτων του κινητού, στη λίστα συζητήσεων.
                return try { val i = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_MESSAGING); main.post { try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} }; "ok" } catch (_: Exception) { "error" }
            }
            val pkgs = when (which) {
                "whatsapp" -> listOf("com.whatsapp", "com.whatsapp.w4b")
                "viber" -> listOf("com.viber.voip")
                "messenger" -> listOf("com.facebook.orca")
                "instagram" -> listOf("com.instagram.android")
                else -> return "unknown"
            }
            for (p in pkgs) {
                val i = packageManager.getLaunchIntentForPackage(p) ?: continue
                return try { main.post { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }; "ok" } catch (_: Exception) { "error" }
            }
            return "missing"
        }
        @JavascriptInterface fun openAppSettings() {
            main.post {
                listOf("askedOverlay", "askedBattery", "askedFullScreen").forEach { prefs.edit().remove(it).apply() }
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            }
        }
    }
}
