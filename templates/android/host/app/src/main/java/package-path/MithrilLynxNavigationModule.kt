package {{PACKAGE_NAME}}

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.tasm.behavior.LynxContext

/**
 * JS -> Android half of mithril-lynx/route's system Back integration.
 *
 * MainActivity supplies the Android -> JS half with sendGlobalEvent(). Keeping
 * the callback disabled when the route history is empty preserves Android's
 * default behavior on the app's first screen, including predictive Back.
 */
class MithrilLynxNavigationModule(context: Context) : LynxModule(context) {
    private val activity = (context as? LynxContext)?.activity as? MainActivity

    @LynxMethod
    fun setCanGoBack(canGoBack: Boolean) {
        // Lynx invokes native modules from its JS thread; Android's callback
        // belongs to the main thread.
        Handler(Looper.getMainLooper()).post {
            activity?.setCanGoBack(canGoBack)
        }
    }
}
