package {{PACKAGE_NAME}}

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.ThreadStrategyForRendering
// {{FONT_IMPORT}}
import com.lynx.xelement.XElementBehaviors

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Must run BEFORE super.onCreate() — a Splash Screen API requirement.
        installSplashScreen()
        super.onCreate(savedInstanceState)

        val builder = LynxViewBuilder()
        // <input>/<textarea> are opt-in "xelement" components, not part of the
        // core artifact: without this they measure 0 and never open the
        // keyboard. Remove this line (and the xelement dependencies) if you
        // don't use them.
        builder.addBehaviors(XElementBehaviors().create())
        builder.setThreadStrategyForRendering(ThreadStrategyForRendering.ALL_ON_UI)
        // Reads the bundle from assets on a separate thread — see
        // AssetTemplateProvider's comment: reading it synchronously here cost
        // 2.4-2.8s of cold start measured on a real device, vs ~300ms with this.
        builder.setTemplateProvider(AssetTemplateProvider(this))
        val lynxView = builder.build(this)
        setContentView(lynxView)

        // {{FONT_PREFETCH}}
        // The bundle lives in app/src/main/assets/main-thread.bundle, copied
        // there by `npm run android` (scripts/android.mjs) from the JS
        // project's dist/. The name has to match exactly.
        lynxView.renderTemplateUrl("main-thread.bundle", "")
    }
}
