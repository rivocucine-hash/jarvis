package gr.jarvis.app

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Ανάγνωση μηνυμάτων ΜΟΝΟ όταν το ζητήσει ο χρήστης («τι μηνύματα έχω;»).
 *
 * Κανόνες ασφαλείας (μην αλλάξουν):
 *  - Διαβάζονται μόνο οι εφαρμογές της σταθερής λίστας APPS. Καμία άλλη ειδοποίηση δεν αγγίζεται.
 *  - Τίποτα δεν αποθηκεύεται, δεν καταγράφεται και δεν στέλνεται πουθενά: ούτε σε αρχείο, ούτε σε ρυθμίσεις, ούτε στο ίντερνετ.
 *  - Το περιεχόμενο δεν περνά ποτέ στη σελίδα (WebView), άρα ούτε στο ιστορικό της συνομιλίας ούτε στον εγκέφαλο ΤΝ.
 *    Το διαβάζει φωναχτά απευθείας το κινητό. Η σελίδα μαθαίνει μόνο πόσα είναι.
 *  - Μηνύματα με κωδικούς, τράπεζες, κάρτες ή πληρωμές παραλείπονται εντελώς.
 *  - Η υπηρεσία δεν κάνει τίποτα όταν έρχεται ειδοποίηση· διαβάζει μόνο όσες είναι ήδη στην οθόνη τη στιγμή της ερώτησης.
 */
class MsgListener : NotificationListenerService() {
    override fun onListenerConnected() { instance = this }
    override fun onListenerDisconnected() { if (instance === this) instance = null }
    override fun onDestroy() { if (instance === this) instance = null; super.onDestroy() }
    // Σκόπιμα κενά: καμία ενέργεια και καμία αποθήκευση όταν φτάνει ή φεύγει ειδοποίηση.
    override fun onNotificationPosted(sbn: StatusBarNotification?) {}
    override fun onNotificationRemoved(sbn: StatusBarNotification?) {}

    class Msg(val app: String, val from: String, val text: String)
    class Result(val list: List<Msg>, val skipped: Int)

    companion object {
        @Volatile var instance: MsgListener? = null

        /** Η μόνη λίστα εφαρμογών που επιτρέπεται να διαβαστούν. */
        private val APPS = mapOf(
            "com.viber.voip" to "Viber",
            "com.whatsapp" to "WhatsApp",
            "com.whatsapp.w4b" to "WhatsApp",
            "com.instagram.android" to "Instagram",
            "com.facebook.orca" to "Messenger",
            "com.google.android.apps.messaging" to "SMS",
            "com.android.mms" to "SMS",
            "com.android.messaging" to "SMS",
            "com.samsung.android.messaging" to "SMS",
        )

        /** Ευαίσθητο περιεχόμενο: κωδικοί μίας χρήσης, τράπεζες, κάρτες, πληρωμές. Τέτοια μηνύματα δεν διαβάζονται ποτέ. */
        private val SENSITIVE = Regex(
            "(κωδικ|κωδ|code|otp|pin\\b|password|passcode|verification|verify|login|log in|sign in|συνδεσ|2fa|authenticat|token|one-time|μιασ χρησησ|security|ασφαλει|επαληθευ|επιβεβαιωσ|τραπεζ|bank|iban|καρτα|καρτασ|card|υπολοιπο|balance|πληρωμ|payment|συναλλαγ|transaction|μεταφορα χρηματ|εμβασμα|χρεωσ|πιστωσ|ευρω|eur\\b|€|" +
                "piraeus|πειραιωσ|alpha|eurobank|εθνικη|nbg|attica|optima|viva|revolut|paypal|n26|wise|winbank|e-banking|ebanking|taxis|gov\\.gr|aade|ααδε|εφκα|efka|iris)", RegexOption.IGNORE_CASE)
        private val CODE = Regex("(?<![0-9])[0-9]{4,8}(?![0-9])")

        private fun plain(s: String): String = java.text.Normalizer.normalize(s.lowercase(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").replace('ς', 'σ')
        private val TIME_OR_DATE = Regex("(?<![0-9])[0-9]{1,2}[:.][0-9]{2}(?![0-9])|(?<![0-9])[0-9]{1,2}/[0-9]{1,2}(/[0-9]{2,4})?(?![0-9])")
        private val DIGIT_SEPARATOR = Regex("(?<=[0-9])[ ._-](?=[0-9])")
        private fun sensitive(from: String, text: String): Boolean {
            val p = plain("$from $text")
            if (SENSITIVE.containsMatchIn(p)) return true
            // Ώρες και ημερομηνίες («στις 18:30», «15/11») δεν είναι κωδικοί· κάθε άλλη σειρά 4+ ψηφίων θεωρείται κωδικός,
            // ακόμα κι αν είναι γραμμένη με κενά, παύλες ή τελείες («12 34 56», «123-456»).
            val digits = DIGIT_SEPARATOR.replace(TIME_OR_DATE.replace("$from $text", " "), "")
            return CODE.containsMatchIn(digits) || Regex("[0-9]{4,}").containsMatchIn(digits)
        }

        /** null = δεν έχει δοθεί η άδεια «Πρόσβαση σε ειδοποιήσεις» (ή η υπηρεσία δεν έχει συνδεθεί ακόμα). */
        fun read(): Result? {
            val svc = instance ?: return null
            val active = try { svc.activeNotifications } catch (_: Throwable) { return null } ?: return Result(emptyList(), 0)
            val out = ArrayList<Msg>(); var skipped = 0
            val seen = HashSet<String>()
            for (sbn in active) {
                val app = APPS[sbn.packageName] ?: continue                       // εκτός λίστας: δεν διαβάζεται καθόλου
                val n = sbn.notification ?: continue
                if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) continue      // «3 νέα μηνύματα»: όχι διπλά
                if (n.flags and Notification.FLAG_ONGOING_EVENT != 0) continue      // κλήσεις σε εξέλιξη κ.λπ.
                if (n.category == Notification.CATEGORY_CALL) continue
                val ex = n.extras ?: continue
                val from = (ex.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE) ?: ex.getCharSequence(Notification.EXTRA_TITLE))?.toString()?.trim().orEmpty()
                val text = (ex.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: ex.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.trim().orEmpty()
                if (from.isEmpty() && text.isEmpty()) continue
                if (sensitive(from, text)) { skipped++; continue }
                if (!seen.add("$app|$from|$text")) continue
                out.add(Msg(app, from.take(60), text.replace(Regex("\\s+"), " ").take(300)))
                if (out.size >= 15) break
            }
            return Result(out, skipped)
        }
    }
}
