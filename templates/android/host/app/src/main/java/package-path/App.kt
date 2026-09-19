package {{PACKAGE_NAME}}

import android.app.Application
import com.lynx.service.log.LynxLogService
import com.lynx.tasm.LynxEnv
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

        LynxEnv.inst().init(this, null, null, null)
    }
}
