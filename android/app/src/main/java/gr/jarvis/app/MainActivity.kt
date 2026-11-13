package gr.jarvis.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.MediaStore
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * Η εφαρμογή JARVIS για Android: φορτώνει την εφαρμογή web και της δίνει
 * τη φωνή (TextToSpeech) και την ακοή (SpeechRecognizer) του κινητού.
 */
class MainActivity : Activity() {

    companion object {
        const val URL = "https://rivocucine-hash.github.io/jarvis/"
        const val HOST = "rivocucine-hash.github.io"
        const val REQ_PERMS = 10
        const val REQ_FILE = 11
        @Volatile var listeningNative = false
    }

    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var sr: SpeechRecognizer? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWake = false
    private val prefs by lazy { getSharedPreferences("jarvis", Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(0xFF02070D.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            setSupportMultipleWindows(false)
            setGeolocationEnabled(true)
            userAgentString = "$userAgentString JarvisAndroid/1"
        }
        web.addJavascriptInterface(Bridge(), "AndroidJarvis")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == HOST && (u.path ?: "").startsWith("/jarvis")) return false
                openExternal(u); return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null); fileCallback = cb
                return try { startActivityForResult(params.createIntent(), REQ_FILE); true } catch (e: Exception) { fileCallback = null; false }
            }
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) { callback.invoke(origin, false, false) }
        }

        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale("el", "GR"); ttsReady = true
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) { js("window.__nativeTtsStart && __nativeTtsStart()") }
                    override fun onDone(id: String?) { js("window.__nativeTtsDone && __nativeTtsDone()") }
                    @Deprecated("Deprecated in Java") override fun onError(id: String?) { js("window.__nativeTtsDone && __nativeTtsDone()") }
                })
                js("window.__nativeTtsReady && __nativeTtsReady()")
            }
        }

        pendingWake = intent?.getBooleanExtra("wake", false) == true
        web.loadUrl(URL + if (pendingWake) "?wake=1" else "")
        pendingWake = false
        askPermissions()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent)
        if (intent.getBooleanExtra("wake", false)) js("window.__nativeWake ? __nativeWake() : (location.href='${URL}?wake=1')")
    }

    override fun onResume() {
        super.onResume()
        if (hasMic()) { if (wakeEnabled()) WakeService.start(this); askNextSpecialPermission() }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else moveTaskToBack(true) }

    override fun onDestroy() { tts?.shutdown(); sr?.destroy(); super.onDestroy() }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) { fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); fileCallback = null }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (hasMic() && wakeEnabled()) WakeService.start(this)
        askNextSpecialPermission()
    }

    /* ---------------- Άδειες ---------------- */
    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    private fun wakeEnabled() = prefs.getBoolean("wake", true)

    private fun askPermissions() {
        val need = mutableListOf<String>()
        if (!hasMic()) need += Manifest.permission.RECORD_AUDIO
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) need += Manifest.permission.POST_NOTIFICATIONS
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), REQ_PERMS)
    }

    private var dialogShown = false
    /** Ζητάει μία-μία τις ειδικές άδειες που χρειάζονται για να ανοίγει με το «Τζάρβις». */
    private fun askNextSpecialPermission() {
        if (dialogShown || !wakeEnabled()) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        when {
            !Settings.canDrawOverlays(this) && !prefs.getBoolean("askedOverlay", false) -> explain("askedOverlay",
                "Για να ανοίγω μόνος μου όταν λέτε «Τζάρβις», χρειάζομαι την άδεια «Εμφάνιση πάνω από άλλες εφαρμογές». Στην επόμενη οθόνη ενεργοποιήστε την για το JARVIS.") {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            }
            !pm.isIgnoringBatteryOptimizations(packageName) && !prefs.getBoolean("askedBattery", false) -> explain("askedBattery",
                "Για να μη με κλείνει το κινητό όταν δεν με χρησιμοποιείτε, επιτρέψτε μου να μην περιορίζομαι από την εξοικονόμηση μπαταρίας.") {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            }
            Build.VERSION.SDK_INT >= 34 && !nm.canUseFullScreenIntent() && !prefs.getBoolean("askedFullScreen", false) -> explain("askedFullScreen",
                "Για να ανάβω την οθόνη όταν το κινητό είναι κλειδωμένο, επιτρέψτε τις «ειδοποιήσεις πλήρους οθόνης» για το JARVIS.") {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
            }
        }
    }

    private fun explain(flag: String, text: String, action: () -> Unit) {
        dialogShown = true
        AlertDialog.Builder(this).setTitle("JARVIS").setMessage(text).setCancelable(false)
            .setPositiveButton("Ρυθμίσεις") { _, _ -> prefs.edit().putBoolean(flag, true).apply(); dialogShown = false; try { action() } catch (_: Exception) {} }
            .setNegativeButton("Αργότερα") { _, _ -> prefs.edit().putBoolean(flag, true).apply(); dialogShown = false; askNextSpecialPermission() }
            .show()
    }

    /* ---------------- Βοηθητικά ---------------- */
    private fun js(code: String) = main.post { if (::web.isInitialized) web.evaluateJavascript(code, null) }
    private fun q(s: String) = JSONObject.quote(s)

    private fun openExternal(u: Uri) {
        try {
            val i = if (u.scheme == "tel") Intent(Intent.ACTION_DIAL, u) else Intent(Intent.ACTION_VIEW, u)
            startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {}
    }

    private fun startListening() {
        if (!hasMic()) { askPermissions(); js("window.__nativeSttError && __nativeSttError(9); window.__nativeSttEnd && __nativeSttEnd()"); return }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { js("window.__nativeSttError && __nativeSttError(-1); window.__nativeSttEnd && __nativeSttEnd()"); return }
        WakeService.send(this, WakeService.ACTION_PAUSE)
        listeningNative = true
        sr?.destroy()
        val rec = SpeechRecognizer.createSpeechRecognizer(this); sr = rec
        var ended = false
        val end = { if (!ended) { ended = true; listeningNative = false; js("window.__nativeSttEnd && __nativeSttEnd()"); main.postDelayed({ rec.destroy(); if (!listeningNative) WakeService.send(this, WakeService.ACTION_RESUME) }, 300) } }
        rec.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(p: Bundle?) { js("window.__nativeSttStart && __nativeSttStart()") }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(v: Float) {}
            override fun onBufferReceived(b: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(code: Int) { js("window.__nativeSttError && __nativeSttError($code)"); end() }
            override fun onResults(r: Bundle?) {
                val t = r?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                js("window.__nativeStt && __nativeStt(${q(t)}, true)"); end()
            }
            override fun onPartialResults(r: Bundle?) {
                val t = r?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
                js("window.__nativeStt && __nativeStt(${q(t)}, false)")
            }
            override fun onEvent(t: Int, p: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "el-GR")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        try { rec.startListening(intent) } catch (e: Exception) { js("window.__nativeSttError && __nativeSttError(-2)"); end() }
    }

    /* ---------------- Γέφυρα προς την εφαρμογή web ---------------- */
    inner class Bridge {
        @JavascriptInterface fun isNative(): Boolean = true
        @JavascriptInterface fun ttsReady(): Boolean = ttsReady

        @JavascriptInterface fun speak(text: String, rate: Float, pitch: Float, voiceName: String) = main.post {
            val t = tts ?: return@post
            if (voiceName.isNotEmpty()) t.voices?.firstOrNull { it.name == voiceName }?.let { t.voice = it }
            else t.language = Locale("el", "GR")
            t.setSpeechRate(rate); t.setPitch(pitch)
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "u" + System.currentTimeMillis())
        }
        @JavascriptInterface fun stopSpeak() { main.post { tts?.stop() } }

        @JavascriptInterface fun voices(): String {
            val arr = JSONArray()
            try { tts?.voices?.filter { it.locale.language == "el" }?.sortedBy { it.isNetworkConnectionRequired }?.forEach { v ->
                arr.put(JSONObject().put("name", v.name).put("local", !v.isNetworkConnectionRequired))
            } } catch (_: Exception) {}
            return arr.toString()
        }

        @JavascriptInterface fun listen() { main.post { startListening() } }
        @JavascriptInterface fun stopListen() { main.post { sr?.stopListening() } }

        @JavascriptInterface fun setWakeEnabled(on: Boolean) {
            prefs.edit().putBoolean("wake", on).apply()
            main.post { if (on) { if (hasMic()) WakeService.start(this@MainActivity) else askPermissions() } else WakeService.send(this@MainActivity, WakeService.ACTION_STOP) }
        }
        @JavascriptInterface fun isWakeEnabled(): Boolean = wakeEnabled()
        @JavascriptInterface fun wakeDone() { main.postDelayed({ if (!listeningNative) WakeService.send(this@MainActivity, WakeService.ACTION_RESUME) }, 300) }

        @JavascriptInterface fun notify(title: String, body: String) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            WakeService.ensureChannels(this@MainActivity)
            val pi = PendingIntent.getActivity(this@MainActivity, 3, Intent(this@MainActivity, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = Notification.Builder(this@MainActivity, WakeService.CH_MSG).setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title).setContentText(body).setStyle(Notification.BigTextStyle().bigText(body))
                .setContentIntent(pi).setAutoCancel(true).build()
            nm.notify((System.currentTimeMillis() % 100000).toInt() + 100, n)
        }

        @JavascriptInterface fun saveFile(name: String, content: String): String {
            return try {
                if (Build.VERSION.SDK_INT >= 29) {
                    val v = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, name); put(MediaStore.Downloads.MIME_TYPE, "application/json") }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: return ""
                    contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray()) }
                    "Λήψεις/$name"
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                    val f = File(dir, name); f.writeText(content); f.absolutePath
                }
            } catch (e: Exception) { "" }
        }

        @JavascriptInterface fun openAppSettings() {
            main.post {
                listOf("askedOverlay", "askedBattery", "askedFullScreen").forEach { prefs.edit().remove(it).apply() }
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            }
        }
    }
}
