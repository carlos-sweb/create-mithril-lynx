let darkMode = false;

export function initTheme() {
    // Lee de forma síncrona desde el host Android (inyectado antes del primer frame)
    if (typeof lynx !== "undefined" && lynx.__globalProps) {
        const theme = (lynx.__globalProps as { theme?: string }).theme;
        darkMode = theme === "dark";
    }
}

export function isDarkMode(): boolean {
    return darkMode;
}

export function themeClass(): string {
    return darkMode ? "theme-dark" : "theme-light";
}

export function toggleTheme(): void {
    darkMode = !darkMode;
    const newMode = darkMode ? "dark" : "light";
    
    // Persistir en Android
    if (typeof NativeModules !== "undefined" && NativeModules.PreferencesModule) {
        NativeModules.PreferencesModule.setTheme(newMode);
    }
    
    // Redibujar Mithril si es necesario (dependiendo de la configuración del template)
}

// Llamar a initTheme() inmediatamente al importar
initTheme();
