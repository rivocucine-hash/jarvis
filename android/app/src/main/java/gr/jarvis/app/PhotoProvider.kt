package gr.jarvis.app

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File

/**
 * «Τζάρβις, τι βλέπεις;»: η εφαρμογή κάμερας γράφει τη φωτογραφία εδώ (ένα μόνο προσωρινό αρχείο, cache/cam.jpg).
 * Μόνο με προσωρινή άδεια που δίνει το JARVIS στην κάμερα· δεν είναι ανοιχτό σε άλλες εφαρμογές.
 */
class PhotoProvider : ContentProvider() {
    companion object {
        const val AUTHORITY = "gr.jarvis.app.photo"
        val URI: Uri = Uri.parse("content://$AUTHORITY/cam.jpg")
        fun file(dir: File) = File(dir, "cam.jpg")
    }
    override fun onCreate() = true
    override fun getType(uri: Uri) = "image/jpeg"
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val f = file(context!!.cacheDir)
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode) or ParcelFileDescriptor.MODE_CREATE)
    }
    override fun query(uri: Uri, p: Array<out String>?, s: String?, a: Array<out String>?, o: String?): Cursor? = null
    override fun insert(uri: Uri, v: ContentValues?): Uri? = null
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<out String>?) = 0
    override fun delete(uri: Uri, s: String?, a: Array<out String>?) = 0
}
