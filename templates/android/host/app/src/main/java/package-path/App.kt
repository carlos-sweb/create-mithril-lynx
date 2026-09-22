package {{PACKAGE_NAME}}

import android.app.Application
import com.lynx.service.log.LynxLogService
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.loader.LynxFontFaceLoader
import com.lynx.tasm.service.LynxServiceCenter

class {{APP_CLASS}} : Application() {
    override fun onCreate() {
        super.onCreate()

        // Without a registered ILynxLogService, console.log() and JS errors
        // from the bundle are dropped silently — not even logcat shows them.
        // Drop this (and the lynx-service-log dependency) in production if you
        // don't want it.
        LynxServiceCenter.inst().registerService(LynxLogService)
        LynxLogService.switchLogToSystem(true)

        // Lets FontFaceManager resolve "asset:///" (production fonts under
        // assets/fonts/) — see AssetFontFaceLoader. Pairs with
        // NoopGenericResourceFetcher in MainActivity for the fast @font-face
        // path (https://github.com/lynx-family/lynx/issues/9431).
        LynxFontFaceLoader.setLoader(AssetFontFaceLoader)

        LynxEnv.inst().init(this, null, null, null)
    }
}
