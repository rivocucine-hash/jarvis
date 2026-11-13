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

    fun take(ctx: Context, key: String): String? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val v = p.getString(key, null) ?: return null
        p.edit().remove(key).apply(); return v
    }
}
