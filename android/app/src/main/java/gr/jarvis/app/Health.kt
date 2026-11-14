package gr.jarvis.app

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import java.io.File
import java.io.FileOutputStream

/**
 * Βήματα και ύπνος, μόνο με τους αισθητήρες του κινητού, χωρίς ίντερνετ.
 * - Βήματα: ο μετρητής βημάτων του κινητού (μετράει μόνος του από την τελευταία επανεκκίνηση).
 *   Κρατάμε δείγματα «ώρα μετρητής» και η εφαρμογή web βγάζει τα βήματα ανά ημέρα.
 * - Ύπνος: πότε έσβησε και πότε άνοιξε η οθόνη. Η μεγαλύτερη νυχτερινή παύση είναι ο ύπνος.
 * Τα δεδομένα μένουν σε ένα αρχείο μέσα στην εφαρμογή και δεν στέλνονται πουθενά.
 */
object Health : SensorEventListener {
    private var sm: SensorManager? = null
    private var app: Context? = null
    private var screenOn: BroadcastReceiver? = null
    @Volatile var lastSteps = -1L
    private var lastSave = 0L
    private var lastSavedValue = -1L

    fun file(c: Context) = File(c.filesDir, "health.log")
    fun hasPerm(c: Context) = Build.VERSION.SDK_INT < 29 || c.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
    fun hasSensor(c: Context) = (c.getSystemService(Context.SENSOR_SERVICE) as SensorManager).getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null

    /** Ξεκινά την καταγραφή (ασφαλές να καλείται πολλές φορές και από τις δύο διεργασίες). */
    @Synchronized fun start(c: Context) {
        val ctx = c.applicationContext
        app = ctx
        if (screenOn == null) {
            val r = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    when (intent.action) {
                        Intent.ACTION_SCREEN_OFF -> append(ctx, "e off")
                        Intent.ACTION_SCREEN_ON -> append(ctx, "e on")
                        Intent.ACTION_USER_PRESENT -> append(ctx, "e unlock")
                    }
                }
            }
            try {
                val f = IntentFilter().apply { addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_USER_PRESENT) }
                ctx.registerReceiver(r, f)
                screenOn = r
            } catch (_: Throwable) {}
        }
        if (sm == null && hasPerm(ctx)) {
            try {
                val m = ctx.getSystemService(Context.SENSOR_SERVICE) as SensorManager
                val s = m.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return
                // Ομαδοποιημένες αναφορές ανά λίγα λεπτά: ελάχιστη κατανάλωση μπαταρίας.
                if (m.registerListener(this, s, SensorManager.SENSOR_DELAY_NORMAL, 3 * 60 * 1_000_000)) sm = m
            } catch (_: Throwable) {}
        }
    }

    override fun onSensorChanged(e: SensorEvent) {
        val v = e.values[0].toLong(); lastSteps = v
        val ctx = app ?: return
        val now = System.currentTimeMillis()
        val newDay = java.util.Calendar.getInstance().apply { timeInMillis = lastSave }.get(java.util.Calendar.DAY_OF_YEAR) != java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_YEAR)
        // Ένα δείγμα κάθε 10′ το πολύ (και πάντα με την αλλαγή ημέρας), μόνο αν άλλαξε ο μετρητής.
        if (v != lastSavedValue && (newDay || now - lastSave > 10 * 60_000)) { lastSave = now; lastSavedValue = v; append(ctx, "s $v") }
    }
    override fun onAccuracyChanged(s: Sensor?, a: Int) {}

    @Synchronized private fun append(c: Context, line: String) {
        try {
            val f = file(c)
            FileOutputStream(f, true).use { it.write((System.currentTimeMillis().toString() + " " + line + "\n").toByteArray()) }
            // Κρατάμε περίπου τις τελευταίες 10 ημέρες.
            if (f.length() > 120_000) { val keep = f.readLines().takeLast(2500); f.writeText(keep.joinToString("\n") + "\n") }
        } catch (_: Throwable) {}
    }

    /** Όλο το αρχείο, μαζί με την τρέχουσα τιμή του μετρητή (αν είναι γνωστή). */
    fun read(c: Context): String {
        val body = try { file(c).readText() } catch (_: Throwable) { "" }
        return if (lastSteps >= 0) body + System.currentTimeMillis() + " s " + lastSteps + "\n" else body
    }
}
