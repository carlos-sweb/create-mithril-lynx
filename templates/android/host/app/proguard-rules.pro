# ProGuard/R8 rules for the release build.

# ---------------------------------------------------------------------------
# 1. OPTIONAL Lynx SDK dependencies that are not on the classpath.
#
# The `xelement` artifact (and part of the core) references library classes the
# SDK does NOT declare as transitive dependencies:
#   - Fresco (com.facebook.**)        -> SvgDefaultResourceManager's remote SVG path
#   - Gson (com.google.gson.**)       -> LynxEnv.GetNativeEnvDebugDescription()
#   - Markdown (com.lynx.markdown.**) -> LynxUIMarkdownShadowNode
#
# Without these -dontwarn rules, R8 aborts with "Missing classes detected while
# running R8" and `./gradlew assembleRelease` fails outright. Verified with
# lynx:4.1.0 + AGP 8.5.2. They are optional paths a normal mithril-lynx app
# never uses, so ignoring them is correct (adding the real libraries would only
# bloat the APK for nothing).
-dontwarn com.facebook.**
-dontwarn com.google.gson.**
-dontwarn com.lynx.markdown.**

# ---------------------------------------------------------------------------
# 1b. Methods Lynx's NATIVE code calls by exact name + signature.
#
# The `lynx-base` AAR calls
# `com.lynx.base.log.LynxLog.log(int, String, String, int, long, int, int)`
# from C++ via JNI GetStaticMethodID. That class is NOT annotated with
# @CalledByNative (unlike most of the bridge), so the AAR's consumer rules
# don't cover it: R8 renames it and startup dies with
#
#   java.lang.NoSuchMethodError: no static method
#     "Lcom/lynx/base/log/LynxLog;.log(ILjava/lang/String;Ljava/lang/String;IJII)V"
#   JNI DETECTED ERROR IN APPLICATION: mid == null
#   Fatal signal 6 (SIGABRT)  <- on the LynxTraceInit thread, before drawing anything
#
# Verified on a device (minified release, lynx:4.1.0 + AGP 8.5.2): without this
# rule the release APK crashes on startup; with it, it starts like the debug one.
-keep class com.lynx.base.log.LynxLog { *; }

# ---------------------------------------------------------------------------
# 2. Your own classes reached by reflection.
#
# The Lynx SDK ships its own "consumer" rules inside the AAR. What it cannot
# know about is your classes, so anything Lynx reaches by name has to survive
# minification:
#
#   - modules registered with builder.registerModule("Name", Class::class.java)
#   - your own @LynxMethod / behaviors
#
# Example:
#
#   -keep class com.example.myapp.MyNativeModule { *; }
