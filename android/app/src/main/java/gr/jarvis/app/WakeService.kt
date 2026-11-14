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
        const val LOG_FILE = "wake.log"
        const val OK_FILE = "wake.ok"

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
    private var initStarted = false
    private var foreground = false
    private var lastWake = 0L

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
        try { logFile(this).delete() } catch (_: Throwable) {}
        log("0 διεργασία ακρόασης ξεκίνησε · Android " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ") · " + Build.MANUFACTURER + " " + Build.MODEL + " · " + Build.SUPPORTED_ABIS.joinToString())
        try { ensureChannels(this) } catch (e: Throwable) { logError("channels", e) }
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
            ACTION_PAUSE -> if (initStarted) pause() else { stopSelf(); return START_NOT_STICKY }
            ACTION_RESUME -> if (initStarted) resume() else { stopSelf(); return START_NOT_STICKY }
            ACTION_STOP -> { log("τερματισμός κατόπιν αιτήματος"); stopSelf(); return START_NOT_STICKY }
            else -> if (foreground && !initStarted) { initStarted = true; Thread({ init() }, "wake-init").start() }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopListening()
        try { model?.close() } catch (_: Throwable) {}
        model = null
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
        val stop = PendingIntent.getService(this, 1, Intent(this, WakeService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CH_WAKE)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("JARVIS σε αναμονή")
            .setContentText("Πείτε «Τζάρβις» οποιαδήποτε στιγμή")
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "Τέλος ακρόασης", stop).build())
            .build()
    }

    private var alive = 0
    private val heartbeat = object : Runnable {
        override fun run() {
            alive += 5
            if (alive == 10) { try { okFile(this@WakeService).writeText("ok") } catch (_: Throwable) {}; log("10 ΣΤΑΘΕΡΗ ακρόαση 10″ · η ακρόαση «Τζάρβις» λειτουργεί σε αυτό το κινητό") }
            else if (alive <= 60 || alive % 300 == 0) log("ζωντανή ${alive}″")
            main.postDelayed(this, 5000)
        }
    }

    private fun startListening() {
        val m = model ?: return
        if (paused || speech != null) return
        try {
            log("7 δημιουργία αναγνωριστή")
            // Λέξεις-«δολώματα» που μοιάζουν ηχητικά: απορροφούν άλλες ομιλίες, ώστε να μην ξυπνάει κατά λάθος.
            val rec = Recognizer(m, 16000f, "[\"jarvis\", \"service\", \"travis\", \"harvest\", \"nervous\", \"jar\", \"this\", \"yes\", \"the\", \"hey\", \"charge\", \"garbage\", \"[unk]\"]")
            rec.setWords(true)
            log("8 άνοιγμα μικροφώνου")
            speech = SpeechService(rec, 16000f).also { it.startListening(this) }
            log("9 ΑΚΟΥΕΙ για «Τζάρβις»")
            main.removeCallbacks(heartbeat); main.postDelayed(heartbeat, 5000)
        } catch (e: Throwable) { logError("ακρόαση", e); main.postDelayed({ stopSelf() }, 200) }
    }

    private fun stopListening() {
        try { speech?.stop(); speech?.shutdown() } catch (_: Throwable) {}
        speech = null
    }

    private fun pause() { paused = true; stopListening() }
    private fun resume() { paused = false; main.postDelayed({ startListening() }, 400) }

    /* ---------------- Vosk ---------------- */
    override fun onPartialResult(hypothesis: String?) {}
    override fun onResult(hypothesis: String?) { check(hypothesis) }
    override fun onFinalResult(hypothesis: String?) { check(hypothesis) }
    override fun onError(exception: Exception?) { if (exception != null) logError("vosk", exception); stopListening(); main.postDelayed({ startListening() }, 2000) }
    override fun onTimeout() { stopListening(); startListening() }

    private fun check(hypothesis: String?) {
        val json = try { JSONObject(hypothesis ?: "{}") } catch (_: Exception) { JSONObject() }
        val words = json.optString("text").trim().split(" ").filter { it.isNotEmpty() && it != "[unk]" }
        // Αυστηρός έλεγχος: μόνο η λέξη «jarvis» (μόνη της ή μετά από «hey»), και με υψηλή βεβαιότητα.
        if (words.isEmpty() || words.last() != "jarvis" || words.size > 2 || (words.size == 2 && words[0] != "hey")) return
        val arr = json.optJSONArray("result")
        if (arr != null) {
            var conf = 0.0
            for (i in 0 until arr.length()) { val o = arr.optJSONObject(i) ?: continue; if (o.optString("word") == "jarvis") conf = maxOf(conf, o.optDouble("conf", 0.0)) }
            if (conf < 0.85) { log("αγνοήθηκε «jarvis» με βεβαιότητα " + String.format(java.util.Locale.US, "%.2f", conf)); return }
        }
        val now = SystemClock.elapsedRealtime()
        if (now - lastWake < 4000) return
        lastWake = now
        log("ΑΚΟΥΣΤΗΚΕ «Τζάρβις»")
        pause()
        wakeUp()
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
