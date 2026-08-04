# Project Zomboid Chunk Cleaner — Build 42

Herramienta visual para borrar zonas del mapa de una partida de Project Zomboid
**Build 42**, protegiendo los refugios (safehouses) reclamados por los jugadores
y un radio configurable a su alrededor.

Creada para el servidor **Zurrupio's Land**.

<p align="center">
  <img src="./LogoZurrupiosLand.png" alt="Zurrupio's Land Logo" width="300">
</p>

---

## Antes de usarla

1. **Para el servidor / cierra el juego.** Si está encendido volverá a escribir
   los ficheros que borres y la partida puede quedar inconsistente.
2. **Haz una copia de la carpeta de la partida.** El borrado no se puede deshacer.
3. Usa **Chrome o Edge**. Firefox y Safari no soportan `showDirectoryPicker`.

La carpeta que hay que elegir es la de la partida, la que contiene `map/` y
`map_meta.bin`. En un servidor dedicado suele ser
`…\Zomboid\Saves\Multiplayer\servertest`.

## Cómo usarla

### Opción A — en la nube (GitHub Pages)

La web es estática y lee los ficheros desde tu disco con la File System Access
API del navegador: **nada se sube a ningún sitio**, todo pasa en local aunque la
página esté alojada en GitHub.

Para publicarla en tu propio repositorio, una única vez:

1. `Settings` → `Actions` → `General` → habilita los workflows (en los *forks*
   vienen desactivados por defecto).
2. `Settings` → `Pages` → `Source`: **GitHub Actions**.
3. Haz push a `master` (o lanza el workflow a mano desde la pestaña `Actions`).

Queda publicada en `https://<usuario>.github.io/<repositorio>/`.

### Opción B — en tu PC

Con [Node.js](https://nodejs.org) instalado, doble clic en **`INICIAR.bat`**.
Instala dependencias la primera vez y abre `http://localhost:3000`.

A mano:

```bash
npm install
npm run dev
```

## Qué borra

Seleccionas una zona con el ratón (`Ctrl` + arrastrar para invertir la
selección) y se borra, de los chunks seleccionados:

| Opción | Ficheros | Notas |
| --- | --- | --- |
| *(siempre)* | `map/X/Y.bin`, `map_X_Y.bin` | El chunk en sí: terreno, loot, construcciones, zombis y animales que estén dentro. |
| 🌍 Datos de región | `isoregiondata/datachunk_X_Y.bin` | Se regeneran solos. |
| 📦 Agregados de celda | `chunkdata/`, `apop/`, `metagrid/`, `zpop/` | Sólo si la celda de 32×32 chunks (256×256 tiles) queda vacía entera. |
| 🚗 Vehículos | `vehicles.db` | Borra las filas cuyo `wx`/`wy` esté en la selección. Deja `vehicles.db.bak`. |
| 🐄 Animales | `map_animals.bin` | Los animales salvajes **no** viven dentro del chunk: hay una población global. Sin esto reaparecen en la zona limpiada. Deja `map_animals.bin.bak`. |
| 💥 Chunks corruptos | `blam/X/Y.bin`, `blam/X/Y_error.txt` | Copias que deja el juego cuando un chunk falla el CRC. |
| ♻️ Repoblar celdas parciales | `apop/`, `zpop/` | También en las celdas limpiadas a medias, para que zombis y animales se regeneren ahí igualmente. Afecta a la celda entera, incluida la parte del refugio. Desactivado por defecto. |

### Lo que **no** toca

- `map_meta.bin` (refugios, zonas, edificios) — se conserva a propósito.
- `players.db` — los personajes de los jugadores no se tocan.
- `gos_*.bin` (huertos, trampas, comederos, hogueras, barriles de agua). Si un
  jugador dejó un huerto en un chunk borrado, la entrada global sobrevive; el
  juego la descarta al no encontrar el chunk, pero el fichero no adelgaza.

## Protección de refugios

Los refugios se leen de la estructura real de `map_meta.bin`:

- Se recorre la rejilla de celdas (`roomDef` de 10 bytes, `buildingDef` de 23 en
  B42; 19 en B41) hasta llegar a `safeHouseCount`.
- De cada refugio se leen `x`, `y`, `w`, `h` y el propietario, que van siempre al
  principio del registro. El resto del registro cambia entre parches (por
  ejemplo al añadir jugadores a la lista del refugio), así que en vez de
  interpretarlo se busca dónde encaja el registro siguiente, y al final la lista
  de zonas. Ese anclaje es lo que valida todo el parseo.
- Si nada valida, se cae a un barrido aproximado por patrones y **la interfaz lo
  avisa en rojo**: es el caso en el que no hay que borrar nada sin comprobarlo.

El área protegida se convierte de tiles a chunks dividiendo entre 8 (en B42 un
chunk son 8×8 tiles, no 10×10 como en B41) y se amplía con el *relleno de
seguridad* configurable.

## Verificado contra

Build **42.20** (versión de mundo `249`), sobre un save real de servidor
dedicado: coordenadas de chunk (`x/8`), `wx`/`wy` de `vehicles.db`, alineación
de la imagen del mapa (1 px = 1 tile, origen en el tile 0,0), estructura de
`map_meta.bin` y de `map_animals.bin` (round-trip byte a byte).

## Comunidad

[Discord de Zurrupio's Land](https://discord.gg/KVryPCUTPy)
