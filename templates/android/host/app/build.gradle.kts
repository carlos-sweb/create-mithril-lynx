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
            isShrinkResources = true
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

    // XElements are opt-in. The aggregate xelement artifact brings native
    // implementations for WebView, video, refresh, animax and more, so a
    // Blank app should not pay their cold-start and APK-size cost by default.
    // If you use <input> or <textarea>, add these two dependencies and restore
    // `builder.addBehaviors(XElementBehaviors().create())` in MainActivity:
    // implementation("org.lynxsdk.lynx:xelement:4.1.0")
    // implementation("org.lynxsdk.lynx:xelement-input:4.1.0")
    // Add xelement-overlay only when rendering <overlay> components.

    // Without a registered ILynxLogService, console.log() and JS errors from
    // the bundle are dropped silently — not even logcat shows them. Remove it
    // (along with its registration in the Application class) in a production
    // build.
    implementation("org.lynxsdk.lynx:lynx-service-log:4.1.0")

    // If you use xelement <refresh>, also add:
    // implementation("androidx.viewpager2:viewpager2:1.1.0")

    // <create-mithril-lynx:android-connectors>
{{ANDROID_PLUGIN_DEPENDENCIES}}
    // </create-mithril-lynx:android-connectors>

    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
}
