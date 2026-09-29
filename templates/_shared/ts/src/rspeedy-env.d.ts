/// <reference types="@lynx-js/rspeedy/client" />
/// <reference types="@lynx-js/types" />
/// <reference types="@lynx-js/type-element-api" />

declare module "@lynx-js/types" {
	interface NativeModules {
		/** Android host bridge used by mithril-lynx/route.listenBackButton(). */
		MithrilLynxNavigationModule?: {
			setCanGoBack(canGoBack: boolean): void;
		};
	}
}
