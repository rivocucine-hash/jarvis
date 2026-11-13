package gr.jarvis.app

import android.content.Context
import android.os.Build
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Καταγράφει κάθε απρόσμενο κλείσιμο, ώστε την επόμενη φορά
 * να εμφανιστεί η αιτία στην οθόνη (και να μπορεί να αντιγραφεί).
 */
object CrashLog {
    private const val PREFS = "jarvis"
    @Volatile private var installed = false

    fun install(ctx: Context) {
        if (installed) return
        installed = true
        val app = ctx.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val sw = StringWriter(); error.printStackTrace(PrintWriter(sw))
                val text = "Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}) · ${Build.MANUFACTURER} ${Build.MODEL}\nThread: ${thread.name}\n\n$sw"
                val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("lastCrash", text.take(6000))
                // Αν έσκασε η ακρόαση «Τζάρβις», την απενεργοποιούμε για να ανοίγει κανονικά η εφαρμογή.
                if (text.contains("vosk", true) || text.contains("WakeService") || text.contains("jna", true) || text.contains("UnsatisfiedLink")) prefs.putBoolean("wake", false)
                prefs.commit()
            } catch (_: Throwable) {}
            previous?.uncaughtException(thread, error)
        }
    }

    fun note(ctx: Context, where: String, error: Throwable) {
        try {
            val sw = StringWriter(); error.printStackTrace(PrintWriter(sw))
            ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("lastProblem", "$where\nAndroid ${Build.VERSION.RELEASE} · ${Build.MANUFACTURER} ${Build.MODEL}\n\n$sw".take(6000)).apply()
        } catch (_: Throwable) {}
    }

    /** Λεπτομέρειες από το ίδιο το Android για το τελευταίο κλείσιμο (και για native crash). */
    fun exitInfo(ctx: Context): String {
        if (Build.VERSION.SDK_INT < 30) return "(χωρίς λεπτομέρειες σε αυτή την έκδοση Android)"
        return try {
            val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val list = am.getHistoricalProcessExitReasons(ctx.packageName, 0, 5)
            val sb = StringBuilder()
            for (info in list) {
                sb.append(info.processName.substringAfterLast(":", "main")).append(" reason=").append(info.reason).append(" status=").append(info.status).append(" importance=").append(info.importance).append(" rssMB=").append(info.rss / 1024).append(" desc=").append(info.description ?: "").append("\n")
                if (info.reason == android.app.ApplicationExitInfo.REASON_CRASH_NATIVE || info.reason == android.app.ApplicationExitInfo.REASON_CRASH) {
                    val bytes = try { info.traceInputStream?.use { it.readBytes() } } catch (_: Throwable) { null }
                    if (bytes != null) {
                        // Το ίχνος είναι δυαδικό: κρατάμε μόνο τα αναγνώσιμα κομμάτια (ονόματα βιβλιοθηκών, μήνυμα τερματισμού).
                        val cur = StringBuilder(); val parts = ArrayList<String>()
                        for (b in bytes) { val c = b.toInt() and 0xFF; if (c in 32..126) cur.append(c.toChar()) else { if (cur.length >= 6) parts.add(cur.toString()); cur.setLength(0) } }
                        if (cur.length >= 6) parts.add(cur.toString())
                        val keep = parts.filter { it.contains("vosk", true) || it.contains("jna", true) || it.contains("jnidispatch", true) || it.contains("abort", true) || it.contains("SIG") || it.contains("fault", true) || it.contains("kaldi", true) || it.contains("libc", true) || it.contains("Cause", true) || it.contains("page", true) }
                        sb.append((if (keep.isNotEmpty()) keep else parts).distinct().take(60).joinToString("\n")).append("\n")
                    }
                    break
                }
            }
            sb.toString().take(4000)
        } catch (e: Throwable) { "(exitInfo: " + e + ")" }
    }

    fun take(ctx: Context, key: String): String? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val v = p.getString(key, null) ?: return null
        p.edit().remove(key).apply(); return v
    }
}
