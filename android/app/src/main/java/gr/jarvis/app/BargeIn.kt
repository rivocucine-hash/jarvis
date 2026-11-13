package gr.jarvis.app

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import kotlin.math.sqrt

/**
 * Διακοπή με τη φωνή: όσο ο JARVIS μιλάει, το μικρόφωνο ακούει αν ο χρήστης αρχίσει να μιλά από πάνω του.
 * Χρησιμοποιεί την πηγή «φωνητικής επικοινωνίας» με ακύρωση ηχούς, ώστε η φωνή του ηχείου να φτάνει εξασθενημένη.
 * Πυροδοτείται μόνο όταν η ένταση ξεπεράσει καθαρά και για αρκετή ώρα το επίπεδο που είχε η ηχώ ως τότε.
 */
class BargeIn(private val onVoice: () -> Unit, private val log: (String) -> Unit) {
    @Volatile private var running = false
    private var thread: Thread? = null

    /** factor: πόσες φορές πάνω από το επίπεδο της ηχούς πρέπει να είναι η φωνή (μικρότερο = πιο ευαίσθητο). */
    @SuppressLint("MissingPermission")
    fun start(factor: Double) {
        if (running) return
        running = true
        thread = Thread {
            var rec: AudioRecord? = null
            var aec: AcousticEchoCanceler? = null
            var ns: NoiseSuppressor? = null
            try {
                val rate = 16000
                val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                rec = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, 6400))
                if (rec.state != AudioRecord.STATE_INITIALIZED) { log("barge: mic not available"); return@Thread }
                try { if (AcousticEchoCanceler.isAvailable()) aec = AcousticEchoCanceler.create(rec.audioSessionId)?.also { it.enabled = true } } catch (_: Throwable) {}
                try { if (NoiseSuppressor.isAvailable()) ns = NoiseSuppressor.create(rec.audioSessionId)?.also { it.enabled = true } } catch (_: Throwable) {}
                rec.startRecording()
                val buf = ShortArray(320) // 20 ms
                var frames = 0; var peak = 0.0; var hot = 0; var miss = 0
                while (running) {
                    val n = rec.read(buf, 0, buf.size)
                    if (n <= 0) continue
                    var sum = 0.0
                    for (i in 0 until n) { val v = buf[i].toDouble(); sum += v * v }
                    val rms = sqrt(sum / n)
                    frames++
                    if (frames <= 30) { if (rms > peak) peak = rms; continue } // 0,6″ προθέρμανση: μαθαίνει πόσο δυνατά ακούγεται η δική του φωνή
                    val threshold = maxOf(peak * factor, 900.0)
                    if (rms > threshold) { hot++; miss = 0 } else if (hot > 0 && miss < 2) miss++ else { hot = 0; miss = 0 }
                    if (hot >= 12) { // περίπου 0,25″ συνεχόμενης δυνατής φωνής
                        log("barge: voice rms=" + rms.toInt() + " peak=" + peak.toInt())
                        running = false
                        onVoice()
                        break
                    }
                    // Το επίπεδο της ηχούς παρακολουθείται συνεχώς: ανεβαίνει γρήγορα, πέφτει αργά.
                    if (hot == 0) peak = if (rms > peak) rms else peak * 0.995 + rms * 0.005
                }
            } catch (e: Throwable) { log("barge failed " + e) }
            finally {
                try { aec?.release() } catch (_: Throwable) {}
                try { ns?.release() } catch (_: Throwable) {}
                try { rec?.stop() } catch (_: Throwable) {}
                try { rec?.release() } catch (_: Throwable) {}
                running = false
            }
        }.also { it.isDaemon = true; it.start() }
    }

    /** Σταματά και περιμένει λίγο να ελευθερωθεί το μικρόφωνο, ώστε να το πάρει η αναγνώριση φωνής. */
    fun stop() {
        running = false
        val t = thread; thread = null
        try { t?.join(250) } catch (_: Throwable) {}
    }
}
