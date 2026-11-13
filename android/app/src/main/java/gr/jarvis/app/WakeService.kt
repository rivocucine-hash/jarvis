package gr.jarvis.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
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
import org.vosk.android.StorageService

/**
 * Ακούει συνεχώς, ΧΩΡΙΣ ίντερνετ, μόνο για τη λέξη «Τζάρβις».
 * Όταν την ακούσει, ανάβει την οθόνη και ανοίγει το JARVIS.
 */
class WakeService : Service(), RecognitionListener {

    companion object {
        const val TAG = "JarvisWake"
        const val CH_WAKE = "jarvis_wake"
        const val CH_ALERT = "jarvis_alert"
        const val CH_MSG = "jarvis_msg"
        const val ACTION_PAUSE = "gr.jarvis.app.PAUSE"
        const val ACTION_RESUME = "gr.jarvis.app.RESUME"
        const val ACTION_STOP = "gr.jarvis.app.STOP"
        @Volatile var running = false

        fun start(ctx: Context) {
            if (running) return
            try { ctx.startForegroundService(Intent(ctx, WakeService::class.java)) } catch (e: Exception) { Log.e(TAG, "start", e) }
        }
        fun send(ctx: Context, action: String) {
            if (!running) return
            try { ctx.startService(Intent(ctx, WakeService::class.java).setAction(action)) } catch (e: Exception) { Log.e(TAG, "send", e) }
        }
        fun ensureChannels(ctx: Context) {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CH_WAKE) == null) nm.createNotificationChannel(NotificationChannel(CH_WAKE, "Ακρόαση «Τζάρβις»", NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) })
            if (nm.getNotificationChannel(CH_ALERT) == null) nm.createNotificationChannel(NotificationChannel(CH_ALERT, "Αφύπνιση JARVIS", NotificationManager.IMPORTANCE_HIGH).apply { setSound(null, null) })
            if (nm.getNotificationChannel(CH_MSG) == null) nm.createNotificationChannel(NotificationChannel(CH_MSG, "Υπενθυμίσεις JARVIS", NotificationManager.IMPORTANCE_HIGH))
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private var model: Model? = null
    private var speech: SpeechService? = null
    private var paused = false
    private var lastWake = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannels(this)
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, ongoing(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else startForeground(1, ongoing())
        } catch (e: Exception) {
            // Το Android δεν επιτρέπει έναρξη ακρόασης από το παρασκήνιο: θα ξεκινήσει μόλις ανοίξει η εφαρμογή.
            Log.e(TAG, "foreground", e); stopSelf(); return
        }
        running = true
        StorageService.unpack(this, "model-en-us", "model",
            { m: Model -> model = m; startListening() },
            { e: java.io.IOException -> Log.e(TAG, "model", e) })
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE -> pause()
            ACTION_RESUME -> resume()
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        stopListening()
        model?.close(); model = null
        super.onDestroy()
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

    private fun startListening() {
        val m = model ?: return
        if (paused || speech != null) return
        try {
            val rec = Recognizer(m, 16000f, "[\"jarvis\", \"[unk]\"]")
            speech = SpeechService(rec, 16000f).also { it.startListening(this) }
        } catch (e: Exception) { Log.e(TAG, "listen", e); main.postDelayed({ startListening() }, 3000) }
    }

    private fun stopListening() {
        try { speech?.stop(); speech?.shutdown() } catch (_: Exception) {}
        speech = null
    }

    private fun pause() { paused = true; stopListening() }
    private fun resume() { paused = false; main.postDelayed({ startListening() }, 400) }

    /* ---------------- Vosk ---------------- */
    override fun onPartialResult(hypothesis: String?) {}
    override fun onResult(hypothesis: String?) { check(hypothesis) }
    override fun onFinalResult(hypothesis: String?) { check(hypothesis) }
    override fun onError(exception: Exception?) { Log.e(TAG, "vosk", exception); stopListening(); main.postDelayed({ startListening() }, 2000) }
    override fun onTimeout() { stopListening(); startListening() }

    private fun check(hypothesis: String?) {
        val text = try { JSONObject(hypothesis ?: "{}").optString("text") } catch (_: Exception) { "" }
        if (!text.split(" ").contains("jarvis")) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastWake < 4000) return
        lastWake = now
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
        if (Settings.canDrawOverlays(this)) { try { startActivity(i) } catch (e: Exception) { Log.e(TAG, "open", e) } }

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

        // Ασφάλεια: αν δεν ανοίξει τίποτα, ξαναρχίζει να ακούει
        main.postDelayed({ if (paused && !MainActivity.listeningNative) resume() }, 25000)
    }
}
