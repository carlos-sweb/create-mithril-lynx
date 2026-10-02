/// <reference types="@lynx-js/rspeedy/client" />
/// <reference types="@lynx-js/types" />
/// <reference types="@lynx-js/type-element-api" />

declare module "@lynx-js/types" {
	interface NativeModules {
		/** Android host bridge used by mithril-lynx/route.listenBackButton(). */
		MithrilLynxNavigationModule?: {
			setCanGoBack(canGoBack: boolean): void;
		};
		LynxBatteryPlugin?: { getStatus(requestId: string): void };
		LynxCameraPlugin?: { takePhoto(requestId: string): void };
		LynxDevicePlugin?: { getInfo(requestId: string): void };
		LynxGeolocationPlugin?: { getCurrentPosition(requestId: string, highAccuracy: boolean): void };
		LynxNetworkPlugin?: { getInfo(requestId: string): void };
		LynxVibrationPlugin?: {
			vibrate(requestId: string, durationMs: number): void;
			cancel(requestId: string): void;
		};
	}
}
