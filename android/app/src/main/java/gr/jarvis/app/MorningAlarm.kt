package gr.jarvis.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import java.util.Calendar

/**
 * Πρωινό ξύπνημα που δουλεύει και με κλειστή εφαρμογή.
 * Το Android χτυπά το ξυπνητήρι στην ώρα που όρισε ο χρήστης· τότε ανοίγει το JARVIS,
 * που βάζει μουσική 432Hz και λέει «Καλημέρα». Αν το κινητό δεν αφήσει την εφαρμογή να ανοίξει,
 * μένει ειδοποίηση με ήχο ξυπνητηριού: ένα άγγιγμα την ανοίγει.
 */
class MorningAlarm : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> schedule(ctx)
            ACTION_FIRE -> { fire(ctx); schedule(ctx) }
        }
    }

    companion object {
        const val ACTION_FIRE = "gr.jarvis.app.MORNING"
        const val CH = "jarvis_morning"
        const val NOTIF_ID = 3

        private fun prefs(ctx: Context) = ctx.getSharedPreferences("jarvis", Context.MODE_PRIVATE)
        private fun operation(ctx: Context) = PendingIntent.getBroadcast(ctx, 30, Intent(ctx, MorningAlarm::class.java).setAction(ACTION_FIRE), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        private fun openApp(ctx: Context) = Intent(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            .putExtra("morning", true)

        fun set(ctx: Context, hour: Int, minute: Int, on: Boolean) {
            prefs(ctx).edit().putBoolean("morningOn", on).putInt("morningH", hour.coerceIn(0, 23)).putInt("morningM", minute.coerceIn(0, 59)).apply()
            schedule(ctx)
        }

        /** Ορίζει (ή ακυρώνει) το επόμενο ξύπνημα. Επιστρέφει κείμενο κατάστασης για την αναφορά. */
        fun schedule(ctx: Context): String {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val p = prefs(ctx)
            try { am.cancel(operation(ctx)) } catch (_: Throwable) {}
            if (!p.getBoolean("morningOn", false)) return "off"
            val c = Calendar.getInstance()
            c.set(Calendar.HOUR_OF_DAY, p.getInt("morningH", 7)); c.set(Calendar.MINUTE, p.getInt("morningM", 0)); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
            if (c.timeInMillis <= System.currentTimeMillis() + 5000) c.add(Calendar.DAY_OF_YEAR, 1)
            return try {
                val show = PendingIntent.getActivity(ctx, 31, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                    // Χωρίς άδεια ακριβούς ξυπνητηριού: το Android μπορεί να το καθυστερήσει μερικά λεπτά.
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, c.timeInMillis, operation(ctx)); "inexact " + c.time
                } else { am.setAlarmClock(AlarmManager.AlarmClockInfo(c.timeInMillis, show), operation(ctx)); "exact " + c.time }
            } catch (e: Throwable) { "failed " + e }
        }

        private fun fire(ctx: Context) {
            // Άναμμα οθόνης για λίγα δευτερόλεπτα
            try {
                val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
                @Suppress("DEPRECATION")
                pm.newWakeLock(PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE, "jarvis:morning").acquire(15000)
            } catch (_: Throwable) {}

            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CH) == null) {
                val ch = NotificationChannel(CH, "Πρωινό ξύπνημα JARVIS", NotificationManager.IMPORTANCE_HIGH)
                ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                ch.enableVibration(true); ch.setBypassDnd(true); ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                nm.createNotificationChannel(ch)
            }
            val i = openApp(ctx)
            val pi = PendingIntent.getActivity(ctx, 32, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = Notification.Builder(ctx, CH)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("JARVIS · Ώρα να ξυπνήσετε, κύριε")
                .setContentText("Αγγίξτε για μουσική 432Hz και καλημέρα.")
                .setCategory(Notification.CATEGORY_ALARM)
                .setFullScreenIntent(pi, true)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setTimeoutAfter(10 * 60 * 1000L)
                .build()
            try { nm.notify(NOTIF_ID, n) } catch (_: Throwable) {}
            // Απευθείας άνοιγμα, όπου το κινητό το επιτρέπει
            try { ctx.startActivity(i) } catch (_: Throwable) {}
        }
    }
}
