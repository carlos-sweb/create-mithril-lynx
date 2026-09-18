package {{PACKAGE_NAME}}

import android.content.Context
import com.lynx.tasm.provider.AbsTemplateProvider
import java.io.IOException

/**
 * Reads the Lynx bundle from assets on a separate thread.
 *
 * Measured on real hardware: reading the same asset SYNCHRONOUSLY in
 * MainActivity.onCreate() (blocking Android's UI thread — distinct from Lynx's
 * internal main/background thread split, but just as harmful to the first
 * frame) cost 2.4-2.8s of cold start under `adb shell am start -W`; with this
 * async provider, ~300ms. This is not optional.
 */
class AssetTemplateProvider(private val context: Context) : AbsTemplateProvider() {
    override fun loadTemplate(url: String, callback: Callback) {
        Thread {
            try {
                val bytes = context.assets.open(url).use { it.readBytes() }
                callback.onSuccess(bytes)
            } catch (e: IOException) {
                callback.onFailed(e.toString())
            }
        }.start()
    }
}
