# Plan de integración SQLite para Lynx y Mithril

## Decisión técnica

SQLite vive en el host Android. Lynx invoca un módulo nativo desde su hilo JavaScript de fondo y Mithril consume una fachada asíncrona (`lynx-android-plugins/sqlite`). No se introduce una API especial para Mithril: la vista usa promesas y llama a `redraw()` al recibir resultados. El host registra el módulo solo cuando se selecciona `sqlite` o `all`; no se requieren permisos ni callbacks de Activity.

La primera opción evaluada fue `AndroidSQLiteDriver` de AndroidX SQLite. Su versión con la API de driver arrastró metadatos de Kotlin 2.1 incompatibles con Kotlin 1.9 del monorepo y de las apps generadas. Para no obligar a migrar todo el host, la implementación usa `android.database.sqlite` del sistema, con sentencias compiladas, parámetros enlazados y una cola nativa única. Room es muy buena opción para entidades y DAOs definidos en Kotlin, pero no es la vía más directa para una API genérica de SQL definida desde JS. SQLite-WASM tampoco aporta ventaja aquí: la persistencia del navegador (OPFS) no es el entorno de Lynx y el soporte WASM de Lynx es limitado por versión.

## API y flujo

```ts
import { sqlite } from "lynx-android-plugins/sqlite";

const db = await sqlite.open({
  name: "app_data",
  version: 1,
  migrations: [{ to: 1, statements: [
    "CREATE TABLE items (id INTEGER PRIMARY KEY, title TEXT NOT NULL)",
  ] }],
});

await db.execute("INSERT INTO items (title) VALUES (?)", ["Example"]);
const { rows } = await db.query("SELECT id, title FROM items LIMIT 20");
await db.transaction([{ sql: "UPDATE items SET title = ? WHERE id = ?", params: ["Updated", 1] }]);
await db.close();
```

La fachada ofrece `sqlite.isAvailable()`, `sqlite.int64()`, `sqlite.blob()`, `open`, `query`, `execute`, `transaction` y `close`. El módulo Android abre archivos en el directorio privado de bases de datos de la app; un identificador de conexión evita aceptar rutas desde JS. Cada petición lleva un ID y se resuelve mediante el puente de eventos existente. El SQL y sus parámetros viajan juntos; se enlazan sin interpolar valores. Las transacciones y migraciones se realizan por completo en Android y revierten sus cambios ante errores. Un esquema anterior sin ruta de migración produce error, no una recreación destructiva.

## Integración y pruebas

El módulo nuevo `android-sqlite` se distribuye como `io.github.carlos-sweb:lynx-android-sqlite:0.3.0`; la fachada JS se exporta desde el paquete npm existente. `create-mithril-lynx` acepta `--android-plugins sqlite`, lo ofrece en el flujo interactivo y permite añadirlo después con `add-android-plugin sqlite`. `all` incorpora el conector y pasa a requerir el artefacto agregado Maven `0.3.0`. La versión Maven debe publicarse antes de que un proyecto generado pueda resolverla desde Central.

Pruebas de aceptación: compilación Kotlin del módulo y del agregado, build y tipos de la fachada, serialización de parámetros y errores, generación de un host con y sin SQLite, migración de esquema sin pérdida de datos, rollback de una transacción fallida y persistencia tras reinicio de la APK. La demo Mithril incluye un botón `ontap` que inserta un registro y muestra el total guardado. Sin dispositivo conectado, la verificación real de persistencia y rollback en Android queda pendiente de ejecución en dispositivo/emulador.

## Riesgos y dificultad

**Dificultad: 7/10.** El mayor riesgo no es la sintaxis SQL sino el contrato entre hilos y lenguajes: tipos de 64 bits/BLOB, límites de respuestas, concurrencia, migraciones y compatibilidad con hosts existentes. La API acepta SQL del bundle de la app; enlazar parámetros protege valores, pero no convierte en seguro el SQL tomado de fuentes no confiables. Se limitan resultados a 1.000 filas y 1 MiB por respuesta para no saturar el puente.

## Fuentes oficiales

- [Lynx: Native Modules](https://lynxjs.org/3.6/guide/use-native-modules.html)
- [Android: SQLiteDatabase](https://developer.android.com/reference/android/database/sqlite/SQLiteDatabase)
- [Android: SQLiteProgram y parámetros enlazados](https://developer.android.com/reference/android/database/sqlite/SQLiteProgram)
- [Android: Room y sus casos de uso](https://developer.android.com/training/data-storage/room)
- [SQLite: persistencia de la versión WASM](https://sqlite.org/wasm/doc/tip/persistence.md)
