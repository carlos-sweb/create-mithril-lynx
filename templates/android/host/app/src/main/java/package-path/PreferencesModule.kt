package {{PACKAGE_NAME}}

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule

class PreferencesModule(context: Context) : LynxModule(context) {
    private val prefs = context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)

    @LynxMethod
    fun getTheme(): String {
        return prefs.getString("theme", "light") ?: "light"
    }

    @LynxMethod
    fun setTheme(theme: String) {
        prefs.edit().putString("theme", theme).apply()
    }
}
