#!/bin/bash
# Captura los logs de Lynx desde el device Android via adb logcat.
# Filtra solo las lineas con [mrl-trace] y [mithril-lynx-v2].
# Uso: bash scripts/adb-log.sh
set -euo pipefail

echo "=== mithril-lynx-v2 adb logcat (filtrando [mrl-trace] + [mithril-lynx-v2]) ==="
echo "Esperando logs del device... (Ctrl+C para salir)"
echo ""

adb logcat -c 2>/dev/null || true
adb logcat -s "lynx:*" "chromium:*" "SystemWebView:*" 2>/dev/null | grep --line-buffered -E "\[mrl-trace|\[mithril-lynx-v2"
