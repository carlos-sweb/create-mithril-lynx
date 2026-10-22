package com.example.cmlslimfinal

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.ImageView
// <create-mithril-lynx:connector-imports>
// </create-mithril-lynx:connector-imports>
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.tasm.LynxBooleanOption
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.LynxViewClientV2
import com.lynx.tasm.ThreadStrategyForRendering
import com.lynx.tasm.performance.performanceobserver.PerformanceEntry
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : AppCompatActivity() {
    private var backCallback: OnBackPressedCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        // Must run BEFORE super.onCreate() — a Splash Screen API requirement.
        installSplashScreen()
        super.onCreate(savedInstanceState)

        val builder = LynxViewBuilder()
        // Lets mithril-lynx/route tell Android when its in-memory history can
        // handle Back. See MithrilLynxNavigationModule and the callback below.
        builder.registerModule("MithrilLynxNavigationModule", MithrilLynxNavigationModule::class.java)
        // <create-mithril-lynx:connector-registration>
        // </create-mithril-lynx:connector-registration>
        // lynx-family/lynx's own explorer/android registers a
        // GenericResourceFetcher unconditionally (LynxViewShellActivity —
        // "used inside LynxEngine for resource loading capabilities of
        // components such as Text"). Without one, @font-face / addFont
        // data: URIs fall back to a ~1.4-1.5s legacy path — see
        // NoopGenericResourceFetcher and
        // https://github.com/lynx-family/lynx/issues/9431
        builder.setEnableGenericResourceFetcher(LynxBooleanOption.TRUE)
        builder.setGenericResourceFetcher(NoopGenericResourceFetcher())
        // Production rendering keeps Mithril/JS work off Android's UI thread.
        builder.setThreadStrategyForRendering(ThreadStrategyForRendering.MULTI_THREADS)
        // Reads the bundle from assets on a separate thread — see
        // AssetTemplateProvider's comment: reading it synchronously here cost
        // 2.4-2.8s of cold start measured on a real device, vs ~300ms with this.
        builder.setTemplateProvider(AssetTemplateProvider(this))
        val lynxView = builder.build(this)
        val rootLayout = FrameLayout(this)
        rootLayout.addView(
            lynxView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        // Continue the system splash in-process until Lynx has rendered its
        // first real frame. Its geometry matches Theme.SplashScreen exactly:
        // a 288dp canvas and FIT_CENTER for an icon without IconBackground.
        val placeholderView = FrameLayout(this).apply {
            setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.splash_background))
            isClickable = true
            isFocusable = true
        }
        val iconSizePx = (288 * resources.displayMetrics.density).toInt()
        placeholderView.addView(
            ImageView(this).apply {
                setImageResource(R.drawable.ic_launcher_foreground)
                scaleType = ImageView.ScaleType.FIT_CENTER
                contentDescription = null
            },
            FrameLayout.LayoutParams(iconSizePx, iconSizePx, Gravity.CENTER),
        )
        rootLayout.addView(
            placeholderView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        setContentView(rootLayout)

        val mainHandler = Handler(Looper.getMainLooper())
        val firstDrawObserved = AtomicBoolean(false)
        val performanceObserved = AtomicBoolean(false)
        val placeholderRemovalStarted = AtomicBoolean(false)
        lateinit var earlyTimeout: Runnable
        lateinit var absoluteTimeout: Runnable

        fun removePlaceholder() {
            if (!placeholderRemovalStarted.compareAndSet(false, true)) return
            mainHandler.removeCallbacks(earlyTimeout)
            mainHandler.removeCallbacks(absoluteTimeout)
            placeholderView.animate()
                .alpha(0f)
                .setDuration(120)
                .withEndAction { placeholderView.visibility = View.GONE }
                .start()
        }

        earlyTimeout = Runnable(::removePlaceholder)
        absoluteTimeout = Runnable(::removePlaceholder)
        mainHandler.postDelayed(absoluteTimeout, 2_000)

        lynxView.viewTreeObserver.addOnDrawListener(object : ViewTreeObserver.OnDrawListener {
            override fun onDraw() {
                if (!firstDrawObserved.compareAndSet(false, true)) return
                lynxView.post { lynxView.viewTreeObserver.removeOnDrawListener(this) }
                if (performanceObserved.get()) {
                    removePlaceholder()
                } else {
                    mainHandler.postDelayed(earlyTimeout, 300)
                }
            }
        })
        lynxView.addLynxViewClientV2(object : LynxViewClientV2() {
            override fun onPerformanceEvent(entry: PerformanceEntry) {
                if (entry.entryType != "pipeline" && entry.name != "loadBundle") return
                performanceObserved.set(true)
                if (firstDrawObserved.get()) {
                    mainHandler.post(::removePlaceholder)
                }
            }
        })

        // Disabled until route.listenBackButton() reports that JS has an
        // in-app history entry. When disabled, Android's normal Back behavior
        // remains in charge and closes the activity from the first screen.
        val callback = object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                lynxView.sendGlobalEvent("mithrilLynx:back", JavaOnlyArray())
            }
        }
        onBackPressedDispatcher.addCallback(this, callback)
        backCallback = callback

        // The bundle lives in app/src/main/assets/main-thread.bundle, copied
        // there by `npm run android` (scripts/android.mjs) from the JS
        // project's dist/. The name has to match exactly.
        lynxView.renderTemplateUrl("main-thread.bundle", "")
    }

    fun setCanGoBack(canGoBack: Boolean) {
        backCallback?.isEnabled = canGoBack
    }

    // <create-mithril-lynx:connector-callbacks>
    // </create-mithril-lynx:connector-callbacks>

    override fun onDestroy() {
        backCallback = null
        super.onDestroy()
    }
}
