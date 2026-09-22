package {{PACKAGE_NAME}}

import android.graphics.Typeface
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.fontface.FontFace
import com.lynx.tasm.loader.LynxFontFaceLoader

// Public Lynx extension point (com.lynx.tasm.loader.LynxFontFaceLoader, in the
// core `lynx` artifact) for resolving custom @font-face / addFont src schemes.
// Without a registered Loader, Lynx's default never resolves "asset:///" —
// FontFaceManager only handles asset:/// inline when a "FONT"
// LynxResourceProvider is registered (we don't), and prefetchFont()'s
// non-http/non-data: branch goes ONLY through this Loader.
//
// Production builds register fonts as asset:///fonts/<file> (see the generated
// background.ts) so the APK stays small and cold-start stays fast; Lynx Go /
// `rspeedy dev` still uses inlined data: URIs via NoopGenericResourceFetcher.
// See https://github.com/lynx-family/lynx/issues/9431
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
