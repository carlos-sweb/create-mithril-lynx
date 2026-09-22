package {{PACKAGE_NAME}}

import android.util.Base64
import com.lynx.tasm.resourceprovider.LynxResourceCallback
import com.lynx.tasm.resourceprovider.LynxResourceRequest
import com.lynx.tasm.resourceprovider.LynxResourceResponse
import com.lynx.tasm.resourceprovider.generic.LynxGenericResourceFetcher

/**
 * Decodes `data:` URIs for @font-face / lynx.addFont() src resolution —
 * nothing else (this host never fetches real remote resources this way).
 *
 * Root cause of the ~1.4-1.5s cold-start cost custom fonts added, found by
 * diffing LynxExplorer's logcat while it loaded a @font-face-heavy bundle
 * fast (2026-09-10): it logs `FontFaceManager: Try to loadTypeface with
 * GenericLynxResourceFetcher` → success in ~13ms. @font-face src resolution
 * — even for a `data:` URI — routes through
 * LynxGenericResourceFetcher.fetchResource(); WITHOUT one registered, that
 * fast path fails and the engine falls back to a much slower legacy
 * font-loading path (~1.4-1.5s fixed cost).
 *
 * Tracked upstream: https://github.com/lynx-family/lynx/issues/9431
 */
class NoopGenericResourceFetcher : LynxGenericResourceFetcher() {
    @Suppress("UNCHECKED_CAST")
    override fun fetchResource(request: LynxResourceRequest, callback: LynxResourceCallback<ByteArray>) {
        val url = request.url
        val commaIndex = url.indexOf(',')
        if (url.startsWith("data:") && commaIndex != -1) {
            try {
                val bytes = Base64.decode(url.substring(commaIndex + 1), Base64.DEFAULT)
                callback.onResponse(LynxResourceResponse.onSuccess(bytes))
                return
            } catch (e: IllegalArgumentException) {
                // fall through to failure below
            }
        }
        val response = LynxResourceResponse.onFailed(Throwable("not supported: $url")) as LynxResourceResponse<ByteArray>
        callback.onResponse(response)
    }

    @Suppress("UNCHECKED_CAST")
    override fun fetchResourcePath(request: LynxResourceRequest, callback: LynxResourceCallback<String>) {
        val response = LynxResourceResponse.onFailed(Throwable("not supported")) as LynxResourceResponse<String>
        callback.onResponse(response)
    }
}
