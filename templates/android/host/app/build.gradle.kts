import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Optional release signing, driven by keystore.properties (gitignored).
// Without that file, `./gradlew assembleRelease` simply produces an unsigned
// APK instead of failing. To generate it:
//   npm run android:keystore
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        FileInputStream(keystorePropertiesFile).use { load(it) }
    }
}

android {
    namespace = "{{PACKAGE_NAME}}"
    compileSdk = 34

    defaultConfig {
        applicationId = "{{PACKAGE_NAME}}"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                // storeFile resolves against the Android project root, so
                // "release.keystore" means <android-dir>/release.keystore.
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // The core artifact — LynxView, LynxViewBuilder, the layout engine, etc.
    implementation("org.lynxsdk.lynx:lynx:4.1.0")

    // OPT-IN: add these only if you use those elements, but they cost little
    // and without them the failure is silent (the element mounts and never
    // responds), so the scaffold ships them.

    // <input>/<textarea> — without this those elements take up zero size and
    // never open the keyboard. XElementBehaviors is registered in MainActivity.kt.
    implementation("org.lynxsdk.lynx:xelement:4.1.0")
    implementation("org.lynxsdk.lynx:xelement-input:4.1.0")

    // <overlay> — without this the element mounts without error but is never
    // visible (mithril-lynx-ui's Dialog/Sheet/Popover need it).
    implementation("org.lynxsdk.lynx:xelement-overlay:4.1.0")

    // Without a registered ILynxLogService, console.log() and JS errors from
    // the bundle are dropped silently — not even logcat shows them. Remove it
    // (along with its registration in the Application class) in a production
    // build.
    implementation("org.lynxsdk.lynx:lynx-service-log:4.1.0")

    // <refresh> (pull-to-refresh, inside the xelement artifact) internally
    // depends on SmartRefreshLayout, whose touch-dispatch code references
    // ViewPager2 even though you don't use it — without this, every touch on a
    // <refresh> throws NoClassDefFoundError (caught by the engine, but the
    // gesture then never works).
    implementation("androidx.viewpager2:viewpager2:1.1.0")

    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
}
