package gr.jarvis.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.SpeakerModel
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import java.io.File
import java.io.FileOutputStream
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Ακούει συνεχώς, ΧΩΡΙΣ ίντερνετ, μόνο για τη λέξη «Τζάρβις».
 * Τρέχει σε ΞΕΧΩΡΙΣΤΗ διεργασία (:wake): αν το σύστημα την τερματίσει, ο JARVIS μένει ανοιχτός.
 * Κάθε βήμα γράφεται με χρόνο στο files/wake.log, ώστε να φαίνεται πού σταμάτησε.
 */
class WakeService : Service(), RecognitionListener {

    companion object {
        const val TAG = "JarvisWake"
        const val CH_WAKE = "jarvis_wake2"
        const val CH_ALERT = "jarvis_alert"
        const val CH_MSG = "jarvis_msg"
        const val ACTION_START = "gr.jarvis.app.START"
        const val ACTION_PAUSE = "gr.jarvis.app.PAUSE"
        const val ACTION_RESUME = "gr.jarvis.app.RESUME"
        const val ACTION_STOP = "gr.jarvis.app.STOP"
        const val ACTION_SESSION_ON = "gr.jarvis.app.SESSION_ON"
        const val ACTION_SESSION_OFF = "gr.jarvis.app.SESSION_OFF"
        const val LOG_FILE = "wake.log"
        const val OK_FILE = "wake.ok"
        /** Αναγνώριση φωνής χρήστη: εκμάθηση (5 φορές «Τζάρβις»), αποθηκευμένο «αποτύπωμα» φωνής, πρόοδος, όριο ομοιότητας. */
        const val ACTION_ENROLL = "gr.jarvis.app.ENROLL"
        const val SPK_FILE = "spk.json"
        const val ENROLL_FILE = "spk.enroll"
        const val THR_FILE = "spk.thr"
        const val ENROLL_N = 5
        fun spkFile(ctx: Context) = File(ctx.filesDir, SPK_FILE)
        fun enrollFile(ctx: Context) = File(ctx.filesDir, ENROLL_FILE)
        fun thrFile(ctx: Context) = File(ctx.filesDir, THR_FILE)

        /** Ισχύει μόνο μέσα στην κύρια διεργασία: αν έχουμε ζητήσει εκκίνηση της ακρόασης. */
        @Volatile var requested = false

        fun logFile(ctx: Context) = File(ctx.filesDir, LOG_FILE)
        fun okFile(ctx: Context) = File(ctx.filesDir, OK_FILE)

        fun start(ctx: Context) {
            requested = true
            try { ctx.startForegroundService(Intent(ctx, WakeService::class.java).setAction(ACTION_START)) } catch (e: Exception) { Log.e(TAG, "start", e) }
        }
        fun send(ctx: Context, action: String) {
            if (!requested) return
            if (action == ACTION_STOP) requested = false
            try { ctx.startService(Intent(ctx, WakeService::class.java).setAction(action)) } catch (e: Exception) { Log.e(TAG, "send", e) }
        }
        fun ensureChannels(ctx: Context) {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CH_WAKE) == null) nm.createNotificationChannel(NotificationChannel(CH_WAKE, "Ακρόαση «Τζάρβις»", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
            if (nm.getNotificationChannel(CH_ALERT) == null) nm.createNotificationChannel(NotificationChannel(CH_ALERT, "Αφύπνιση JARVIS", NotificationManager.IMPORTANCE_HIGH).apply { setSound(null, null) })
            if (nm.getNotificationChannel(CH_MSG) == null) nm.createNotificationChannel(NotificationChannel(CH_MSG, "Υπενθυμίσεις JARVIS", NotificationManager.IMPORTANCE_HIGH))
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private val t0 = SystemClock.elapsedRealtime()
    private var model: Model? = null
    private var speech: SpeechService? = null
    private var paused = false
    /** Μέσα σε πρόγραμμα (γιόγκα, αναπνοές): μουσική και οδηγίες δεν αφήνουν παύση, οπότε ελέγχουμε και τα μισά αποτελέσματα. */
    @Volatile private var sessionMode = false
    private var initStarted = false
    private var foreground = false
    private var lastWake = 0L
    private var lastHeardLog = 0L

    override fun onBind(intent: Intent?): IBinder = Binder()

    /** Γράφει μια γραμμή στο αρχείο καταγραφής και τη στέλνει αμέσως στον δίσκο. */
    private fun log(s: String) {
        try {
            FileOutputStream(logFile(this), true).use { f ->
                f.write(("[" + (SystemClock.elapsedRealtime() - t0) + "ms] " + s + "\n").toByteArray())
                f.fd.sync()
            }
        } catch (_: Throwable) {}
        Log.i(TAG, s)
    }
    private fun logError(where: String, e: Throwable) {
        val sw = StringWriter(); e.printStackTrace(PrintWriter(sw))
        log("ΣΦΑΛΜΑ στο «$where»: " + sw.toString().take(1500))
    }

    override fun onCreate() {
        super.onCreate()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e -> logError("uncaught, thread " + t.name, e); previous?.uncaughtException(t, e) }
        // Δεν σβήνουμε το παλιό αρχείο (μόνο αν μεγάλωσε), ώστε η αναφορά να δείχνει και τι έγινε πριν από το κλείσιμο.
        try { val f = logFile(this); if (f.length() > 60000) f.delete() else if (f.exists()) f.appendText("\n----- νέα εκκίνηση -----\n") } catch (_: Throwable) {}
        log("0 διεργασία ακρόασης ξεκίνησε · Android " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ") · " + Build.MANUFACTURER + " " + Build.MODEL + " · " + Build.SUPPORTED_ABIS.joinToString())
        try { ensureChannels(this) } catch (e: Throwable) { logError("channels", e) }
        // Μισοτελειωμένη εκμάθηση φωνής από προηγούμενη φορά: ακυρώνεται (η υπηρεσία δεν τη θυμάται).
        try { val ef = enrollFile(this); if (ef.exists() && ef.readText().trim() != "done") ef.delete() } catch (_: Throwable) {}
        try { Health.start(this) } catch (e: Throwable) { logError("health", e) }
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, ongoing(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else startForeground(1, ongoing())
            foreground = true
            log("1 υπηρεσία προσκηνίου (μικρόφωνο) ξεκίνησε")
        } catch (e: Throwable) {
            logError("startForeground", e); stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE -> pause()
            ACTION_RESUME -> resume()
            ACTION_SESSION_ON -> { sessionMode = true; log("λειτουργία προγράμματος") }
            ACTION_SESSION_OFF -> { sessionMode = false }
            ACTION_ENROLL -> { enrollVecs.clear(); enrolling = true; writeEnroll("0/$ENROLL_N"); log("εκμάθηση φωνής: πείτε «Τζάρβις» $ENROLL_N φορές" + if (spkModel == null) " (ΠΡΟΣΟΧΗ: δεν φορτώθηκε το μοντέλο φωνής)" else "") }
            // stopSelf(startId): αν ήρθε ήδη νεότερο «ξεκίνα» (π.χ. κλείσε-άνοιξε από ρυθμίσεις), δεν κλείνει.
            ACTION_STOP -> { log("τερματισμός κατόπιν αιτήματος"); stopping = true; try { (getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager).cancel(restartIntent()) } catch (_: Throwable) {}; stopSelf(startId); return START_NOT_STICKY }
        }
        // Αν η υπηρεσία είχε κλείσει και ξαναξεκίνησε με οποιαδήποτε εντολή (π.χ. «συνέχισε»), φορτώνει ξανά και ακούει,
        // αντί να κλείνει πάλι αμέσως (αυτό άφηνε τον JARVIS κουφό μέχρι τη «Δοκιμή ακρόασης»).
        if (intent == null) log("ξαναξεκίνησε από το σύστημα, μετά από κλείσιμο")
        if (foreground && !initStarted) { initStarted = true; Thread({ init() }, "wake-init").start() }
        // Όπως στην πρώτη έκδοση: αν το κινητό κλείσει την υπηρεσία (π.χ. σύρσιμο από τις πρόσφατες), το Android την ξαναξεκινά.
        return START_STICKY
    }

    /** Σύρσιμο του JARVIS έξω από τις πρόσφατες: ζητάμε επανεκκίνηση σε 2″, για την περίπτωση που το κινητό σκοτώσει τη διεργασία. */
    /** Μετά από «shut down» (εντολή τερματισμού) δεν ξαναξεκινάμε. */
    @Volatile private var stopping = false
    private fun restartIntent() = PendingIntent.getForegroundService(this, 7, Intent(this, WakeService::class.java).setAction(ACTION_START), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (stopping) { super.onTaskRemoved(rootIntent); return }
        log("η εφαρμογή έκλεισε από τις πρόσφατες· η ακρόαση συνεχίζει")
        try {
            val am = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            am.set(android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 2000, restartIntent())
        } catch (e: Throwable) { logError("επανεκκίνηση", e) }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        stopListening()
        try { model?.close() } catch (_: Throwable) {}
        try { spkModel?.close() } catch (_: Throwable) {}
        model = null; spkModel = null
        super.onDestroy()
    }

    /** Εκκίνηση βήμα-βήμα, με καταγραφή πριν από κάθε βήμα. */
    private fun init() {
        try {
            log("2 αναμονή 1,5″ (μόνο η υπηρεσία, χωρίς τίποτα άλλο)")
            Thread.sleep(1500)

            log("3 φόρτωση βιβλιοθήκης jnidispatch (JNA)")
            val ptr = com.sun.jna.Native.POINTER_SIZE
            log("3 ok · pointer size $ptr")

            log("4 φόρτωση βιβλιοθήκης libvosk")
            org.vosk.LibVosk.setLogLevel(org.vosk.LogLevel.WARNINGS)
            log("4 ok")

            log("5 αντιγραφή μοντέλου στην εσωτερική μνήμη")
            val dir = File(filesDir, "model-en-us")
            val marker = File(dir, ".copied")
            if (!marker.exists()) {
                dir.deleteRecursively()
                val n = copyAssets("model-en-us", dir)
                marker.writeText("ok")
                log("5 ok · αντιγράφηκαν $n αρχεία")
            } else log("5 ok · υπήρχε ήδη")

            log("6 άνοιγμα μοντέλου")
            val m = Model(dir.absolutePath)
            model = m
            log("6 ok")

            // Μοντέλο φωνής ομιλητή (για «μόνο η δική μου φωνή»). Αν αποτύχει, η ακρόαση δουλεύει κανονικά χωρίς αυτό.
            try {
                val sdir = File(filesDir, "model-spk")
                val smark = File(sdir, ".copied")
                if (!smark.exists() && (assets.list("model-spk")?.isNotEmpty() == true)) { sdir.deleteRecursively(); copyAssets("model-spk", sdir); smark.writeText("ok") }
                if (smark.exists()) { spkModel = SpeakerModel(sdir.absolutePath); log("6β μοντέλο φωνής ok" + if (spkFile(this).exists()) " · ακούω μόνο τη φωνή σας" else " · δεν έχει γίνει εκμάθηση φωνής") }
            } catch (e: Throwable) { logError("μοντέλο φωνής", e); spkModel = null }

            main.post { startListening() }
        } catch (e: Throwable) {
            logError("εκκίνηση", e)
            main.post { stopSelf() }
        }
    }

    private fun copyAssets(path: String, target: File): Int {
        val list = assets.list(path) ?: emptyArray()
        if (list.isEmpty()) {
            target.parentFile?.mkdirs()
            assets.open(path).use { input -> FileOutputStream(target).use { out -> input.copyTo(out, 64 * 1024) } }
            return 1
        }
        target.mkdirs()
        var n = 0
        for (name in list) n += copyAssets("$path/$name", File(target, name))
        return n
    }

    private fun ongoing(): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, CH_WAKE)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("JARVIS σε αναμονή")
            .setContentText("Πείτε «Τζάρβις» οποιαδήποτε στιγμή")
            .setOngoing(true)
            .setContentIntent(open)
            // Χωρίς κουμπί «Τέλος ακρόασης»: πατιόταν κατά λάθος. Η ακρόαση κλείνει με τη φωνή («κλείσε το μικρόφωνο») ή από τις ρυθμίσεις.
            .build()
    }

    private var alive = 0
    private val heartbeat = object : Runnable {
        override fun run() {
            alive += 5
            if (alive == 10) { try { okFile(this@WakeService).writeText("ok") } catch (_: Throwable) {}; log("10 ΣΤΑΘΕΡΗ ακρόαση 10″ · η ακρόαση «Τζάρβις» λειτουργεί σε αυτό το κινητό") }
            else if (alive <= 60 || alive % 300 == 0) log("ζωντανή ${alive}″")
            // Αυτοθεραπεία: αν έμεινε σε παύση πάνω από 45″ (χάθηκε η εντολή «συνέχισε») ή δεν ακούει χωρίς λόγο, ξαναρχίζει.
            if (paused && SystemClock.elapsedRealtime() - pausedAt > 45000) { log("παύση πάνω από 45″: συνεχίζω μόνη μου"); resume() }
            else if (!paused && speech == null && model != null && !retryPending) { log("δεν άκουγε: ξαναρχίζω"); startListening() }
            main.postDelayed(this, 5000)
        }
    }

    /** Αποτυχίες στη σειρά στο άνοιγμα μικροφώνου (π.χ. το κρατά ακόμα άλλη ακρόαση): ξαναδοκιμάζουμε με αυξανόμενη αναμονή. */
    private var micFails = 0
    private var retryPending = false
    private var pausedAt = 0L

    private fun startListening() {
        val m = model ?: return
        if (paused || speech != null) return
        retryPending = false
        try {
            log("7 δημιουργία αναγνωριστή")
            // Λέξεις-«δολώματα» που μοιάζουν ηχητικά: απορροφούν άλλες ομιλίες, ώστε να μην ξυπνάει κατά λάθος.
            val rec = Recognizer(m, 16000f, "[\"jarvis\", \"service\", \"travis\", \"harvest\", \"nervous\", \"jar\", \"this\", \"yes\", \"the\", \"hey\", \"charge\", \"garbage\", \"[unk]\"]")
            rec.setWords(true)
            spkModel?.let { try { rec.setSpeakerModel(it) } catch (e: Throwable) { logError("φωνή στον αναγνωριστή", e) } }
            log("8 άνοιγμα μικροφώνου")
            speech = SpeechService(rec, 16000f).also { it.startListening(this) }
            log("9 ΑΚΟΥΕΙ για «Τζάρβις»")
            micFails = 0
            if (!heartbeatOn) { heartbeatOn = true; main.postDelayed(heartbeat, 5000) }
        } catch (e: Throwable) {
            // Παλιά εδώ η υπηρεσία έκλεινε για πάντα. Τώρα ξαναδοκιμάζει: 1″, 2″, 4″ … έως 30″.
            logError("ακρόαση", e); stopListening()
            val wait = minOf(30000L, 1000L shl minOf(micFails, 5)); micFails++
            log("ξαναδοκιμή μικροφώνου σε ${wait / 1000}″")
            retryPending = true
            main.postDelayed({ startListening() }, wait)
            if (!heartbeatOn) { heartbeatOn = true; main.postDelayed(heartbeat, 5000) }
        }
    }
    private var heartbeatOn = false

    private fun stopListening() {
        try { speech?.stop(); speech?.shutdown() } catch (_: Throwable) {}
        speech = null
    }

    private fun pause() { paused = true; pausedAt = SystemClock.elapsedRealtime(); stopListening() }
    private fun resume() {
        // Αμέσως μετά το «Τζάρβις» η εφαρμογή θα ανοίξει τη δική της ακρόαση για την εντολή: αν ξανανοίγαμε εδώ το μικρόφωνο,
        // οι δύο ακροάσεις θα τσακώνονταν και η εντολή θα ακουγόταν πιο αργά ή χειρότερα.
        if (SystemClock.elapsedRealtime() - lastWake < 3000) { log("αγνοήθηκε «συνέχισε» αμέσως μετά το «Τζάρβις»"); return }
        paused = false; main.postDelayed({ startListening() }, 400)
    }

    /* ---------------- Φωνή χρήστη ---------------- */
    private var spkModel: SpeakerModel? = null
    @Volatile private var enrolling = false
    private val enrollVecs = mutableListOf<DoubleArray>()
    private var profile: DoubleArray? = null
    private var profileStamp = -1L

    private fun writeEnroll(s: String) { try { enrollFile(this).writeText(s) } catch (_: Throwable) {} }
    private fun vec(json: JSONObject): DoubleArray? { val a = json.optJSONArray("spk") ?: return null; return DoubleArray(a.length()) { a.optDouble(it, 0.0) } }
    private fun cosine(a: DoubleArray, b: DoubleArray): Double {
        var d = 0.0; var na = 0.0; var nb = 0.0
        for (i in 0 until minOf(a.size, b.size)) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
        return if (na == 0.0 || nb == 0.0) 0.0 else d / Math.sqrt(na * nb)
    }
    /** Το αποθηκευμένο αποτύπωμα φωνής (ξαναδιαβάζεται αν άλλαξε το αρχείο, π.χ. «ξέχνα τη φωνή μου»). */
    private fun loadProfile(): DoubleArray? {
        val f = spkFile(this)
        if (!f.exists()) { profile = null; profileStamp = -1; return null }
        if (f.lastModified() != profileStamp) {
            profile = try { val a = org.json.JSONArray(f.readText()); DoubleArray(a.length()) { a.optDouble(it, 0.0) } } catch (_: Throwable) { null }
            profileStamp = f.lastModified()
        }
        return profile
    }
    private fun threshold(): Double = try { thrFile(this).readText().trim().toDouble() } catch (_: Throwable) { 0.4 }

    /** true = να ξυπνήσει. Στην εκμάθηση μαζεύει δείγματα και δεν ξυπνά. */
    private fun voiceOk(json: JSONObject): Boolean {
        val v = vec(json)
        if (enrolling) {
            if (v == null) { log("εκμάθηση: δεν βγήκε δείγμα φωνής, πείτε το ξανά"); return false }
            enrollVecs += v
            writeEnroll("${enrollVecs.size}/$ENROLL_N"); log("εκμάθηση φωνής: δείγμα ${enrollVecs.size}/$ENROLL_N")
            if (enrollVecs.size >= ENROLL_N) {
                val avg = DoubleArray(v.size); enrollVecs.forEach { s -> for (i in avg.indices) avg[i] += s[i] / enrollVecs.size }
                // Πόσο μοιάζουν τα δείγματα με τον μέσο όρο: χρήσιμο για το όριο.
                val sims = enrollVecs.map { cosine(it, avg) }
                try { spkFile(this).writeText(org.json.JSONArray(avg.toList()).toString()) } catch (e: Throwable) { logError("αποθήκευση φωνής", e) }
                enrolling = false; enrollVecs.clear(); writeEnroll("done")
                log("εκμάθηση φωνής ολοκληρώθηκε · ομοιότητα δειγμάτων " + sims.joinToString(" ") { String.format(java.util.Locale.US, "%.2f", it) })
            }
            return false
        }
        val p = loadProfile() ?: return true
        if (v == null) { log("φωνή: χωρίς δείγμα, ξυπνάω"); return true }
        val sim = cosine(v, p); val thr = threshold()
        log("φωνή: ομοιότητα " + String.format(java.util.Locale.US, "%.2f", sim) + " (όριο " + String.format(java.util.Locale.US, "%.2f", thr) + ")")
        return sim >= thr
    }

    /* ---------------- Vosk ---------------- */
    override fun onPartialResult(hypothesis: String?) {
        if (!sessionMode || paused) return
        val t = try { JSONObject(hypothesis ?: "{}").optString("partial") } catch (_: Exception) { "" }
        if (t.split(" ").contains("jarvis")) { log("«Τζάρβις» μέσα σε πρόγραμμα"); fire() }
    }
    override fun onResult(hypothesis: String?) { check(hypothesis) }
    override fun onFinalResult(hypothesis: String?) { check(hypothesis) }
    override fun onError(exception: Exception?) { if (exception != null) logError("vosk", exception); stopListening(); main.postDelayed({ startListening() }, 2000) }
    override fun onTimeout() { stopListening(); startListening() }

    private fun check(hypothesis: String?) {
        val json = try { JSONObject(hypothesis ?: "{}") } catch (_: Exception) { JSONObject() }
        val words = json.optString("text").trim().split(" ").filter { it.isNotEmpty() && it != "[unk]" }
        // Αυστηρός έλεγχος: μόνο η λέξη «jarvis» (μόνη της ή μετά από «hey»), και με υψηλή βεβαιότητα.
        // Μετά το «jarvis» επιτρέπονται λέξεις (π.χ. «Τζάρβις σταμάτα» μονορούφι)· πριν από αυτό μόνο το «hey».
        val at = words.indexOf("jarvis")
        // Για διάγνωση: τι άκουσε (π.χ. «travis» αντί για «jarvis»), έως μία γραμμή ανά 3″.
        if (at < 0 && words.isNotEmpty() && words.size <= 4) { val now = SystemClock.elapsedRealtime(); if (now - lastHeardLog > 3000) { lastHeardLog = now; log("άκουσε: " + words.joinToString(" ")) } }
        if (at < 0 || at > 1 || (at == 1 && words[0] != "hey")) return
        val arr = json.optJSONArray("result")
        if (arr != null) {
            var conf = 0.0
            for (i in 0 until arr.length()) { val o = arr.optJSONObject(i) ?: continue; if (o.optString("word") == "jarvis") conf = maxOf(conf, o.optDouble("conf", 0.0)) }
            // Η ελληνική προφορά του «Τζάρβις» βγάζει χαμηλότερη βεβαιότητα (π.χ. 0.73 απορρίφθηκε με όριο 0.85).
            if (conf < (if (sessionMode) 0.55 else 0.6)) { log("αγνοήθηκε «jarvis» με βεβαιότητα " + String.format(java.util.Locale.US, "%.2f", conf)); return }
        }
        if (!voiceOk(json)) { if (!enrolling && loadProfile() != null) log("άλλη φωνή: δεν ξυπνάω"); return }
        fire()
    }

    private fun fire() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastWake < 4000) return
        lastWake = now
        log("ΑΚΟΥΣΤΗΚΕ «Τζάρβις»")
        main.post { pause(); wakeUp() }
    }

    private fun wakeUp() {
        val i = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            .putExtra("wake", true)

        // Άναμμα οθόνης
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            pm.newWakeLock(PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE, "jarvis:wake").acquire(6000)
        } catch (_: Exception) {}

        // 1) Απευθείας άνοιγμα (χρειάζεται «Εμφάνιση πάνω από άλλες εφαρμογές»)
        if (Settings.canDrawOverlays(this)) { try { startActivity(i) } catch (e: Exception) { logError("άνοιγμα", e) } }

        // 2) Ειδοποίηση πλήρους οθόνης (για κλειδωμένο κινητό)
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val pi = PendingIntent.getActivity(this, 2, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(this, CH_ALERT)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("JARVIS")
            .setContentText("Πείτε μου, κύριε.")
            .setCategory(Notification.CATEGORY_CALL)
            .setFullScreenIntent(pi, true)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        try { nm.notify(2, n) } catch (_: Exception) {}
        main.postDelayed({ nm.cancel(2) }, 8000)

        // Ασφάλεια: αν δεν έρθει εντολή συνέχισης από την εφαρμογή, ξαναρχίζει να ακούει
        main.postDelayed({ if (paused) resume() }, 30000)
    }
}
