package {{PACKAGE_NAME}}

import android.graphics.Typeface
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.fontface.FontFace
import com.lynx.tasm.loader.LynxFontFaceLoader

/**
 * Resolves `asset:///` in `@font-face`, both for the prefetch and for the real
 * lookup.
 *
 * Lynx's default loader (LynxFontFaceLoader$1, decompiled from
 * lynx-4.1.0.aar) is a no-op that never resolves `asset:///`: in
 * FontFaceManager that scheme is only handled inline inside loadTypeface()
 * when a FONT-type LynxResourceProvider is registered, and the non-http/
 * non-data: branch of prefetchFont() (prefetchFontWithLoader) goes through this
 * Loader only, with no fallback of its own. Without registering this,
 * `asset:///` resolves no way at all.
 *
 * Trade-off to keep in mind: FontFaceManager/LynxFontFaceLoader are public
 * classes (not @RestrictTo) but are not documented for this specific use —
 * they could change without notice in a major Lynx SDK release.
 */
object AssetFontFaceLoader : LynxFontFaceLoader.Loader() {
    private const val ASSET_PREFIX = "asset:///"

    override fun onLoadFontFace(
        context: LynxContext,
        type: FontFace.TYPE,
        src: String,
    ): Typeface? {
        if (!src.startsWith(ASSET_PREFIX)) return null
        return try {
            Typeface.createFromAsset(context.context.assets, src.removePrefix(ASSET_PREFIX))
        } catch (e: Exception) {
            null
        }
    }
}
