import { TILES_PER_CHUNK } from '../constants';
import type { SafeHouse, SafeHouseScan } from '../types';

/*
 * ---------------------------------------------------------------------------
 * Lectura de refugios (safehouses) desde map_meta.bin
 * ---------------------------------------------------------------------------
 *
 * Estructura verificada contra un save real de Build 42.20 (versión de mundo 249):
 *
 *   "META"                                    4 bytes
 *   int32   version                           = 249 en B42
 *   int32   minX, minY, maxX, maxY            (-250, -250, 250, 250)
 *   por cada celda de minX..maxX / minY..maxY:
 *       int32 roomDefCount;     roomDefCount     * 10 bytes
 *       int32 buildingDefCount; buildingDefCount * 23 bytes   (en B41 eran 19)
 *   int32   safeHouseCount
 *   por cada refugio:
 *       int32  x, y, w, h                     (en TILES)
 *       string owner
 *       ... cola de longitud variable: lista de jugadores, marcas de tiempo,
 *           título, población ("Riverside, KY"), puntos de reaparición ...
 *   int32   0, int32 0
 *   int32   zoneCount
 *   por cada zona: double, int32 x,y,z,w,h, string type, string name, int32
 *   ...
 *
 * Las cadenas son [int16 longitud][bytes].
 *
 * La cola de cada refugio cambia entre parches: observada de 8 bytes con la
 * lista de jugadores vacía y de 16 con un jugador, que no cuadra con ninguna
 * lectura fija de esos campos. Por eso NO se interpreta: de cada refugio se
 * leen sólo x/y/w/h y el propietario (que van siempre delante) y para saber
 * dónde acaba el registro se prueban offsets hasta que encaja el refugio
 * siguiente y, al final, la lista de zonas.
 *
 * Ese anclaje en la lista de zonas es lo que hace fiable la lectura: si el
 * formato cambia de verdad, no encajará nada, y se avisa al usuario en vez de
 * borrar con la protección de refugios rota.
 */

const MAX_SAFE_HOUSES = 20000;
const MAX_ZONES = 200000;
const MAX_STRING_LENGTH = 1000;
const MAX_DEF_COUNT = 100000;

class Cursor {
    public offset = 0;
    public readonly size: number;
    private readonly _view: DataView;

    constructor(buffer: ArrayBuffer) {
        this._view = new DataView(buffer);
        this.size = buffer.byteLength;
    }

    public seek(offset: number): void {
        this.offset = offset;
    }

    public need(bytes: number): void {
        if (this.offset < 0 || this.offset + bytes > this.size) {
            throw new Error(`Fin de fichero inesperado en ${this.offset} (+${bytes})`);
        }
    }

    public skip(bytes: number): void {
        this.need(bytes);
        this.offset += bytes;
    }

    public int32(): number {
        this.need(4);
        const value = this._view.getInt32(this.offset);
        this.offset += 4;
        return value;
    }

    public int16(): number {
        this.need(2);
        const value = this._view.getInt16(this.offset);
        this.offset += 2;
        return value;
    }

    public float64(): number {
        this.need(8);
        const value = this._view.getFloat64(this.offset);
        this.offset += 8;
        return value;
    }

    public ascii(length: number): string {
        this.need(length);
        let out = '';
        for (let i = 0; i < length; i++) {
            out += String.fromCharCode(this._view.getUint8(this.offset + i));
        }
        this.offset += length;
        return out;
    }

    public string(): string {
        const length = this.int16();
        if (length < 0 || length > MAX_STRING_LENGTH) {
            throw new Error(`Longitud de cadena inválida (${length}) en ${this.offset - 2}`);
        }
        const value = this.ascii(length);
        return value;
    }
}

interface RawSafeHouse {
    x: number;
    y: number;
    w: number;
    h: number;
    owner: string;
    players: string[];
    title: string;
}

const isPlausibleName = (value: string) => {
    if (value.length === 0 || value.length > 100) {
        return false;
    }
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 32 || code === 127) {
            return false;
        }
    }
    return true;
};

interface SafeHouseHead extends RawSafeHouse {
    /** Offset justo detrás del nombre del propietario. */
    end: number;
}

/**
 * Lee la cabecera de un refugio: x, y, w, h y propietario. Estos campos van
 * siempre al principio del registro y no dependen de la versión, así que son
 * los únicos de los que nos fiamos.
 */
const readSafeHouseHead = (cursor: Cursor, offset: number): SafeHouseHead | undefined => {
    try {
        cursor.seek(offset);
        const x = cursor.int32();
        const y = cursor.int32();
        const w = cursor.int32();
        const h = cursor.int32();

        if (x < 0 || x > 200000 || y < 0 || y > 200000 || w <= 0 || w > 20000 || h <= 0 || h > 20000) {
            return undefined;
        }

        const owner = cursor.string();
        if (!isPlausibleName(owner)) {
            return undefined;
        }

        return { x, y, w, h, owner, players: [], title: owner, end: cursor.offset };
    } catch {
        return undefined;
    }
};

/**
 * Detrás de la lista de refugios va la lista de zonas. Si consigue leerse
 * entera, es que los refugios se han leído en la posición correcta.
 *
 * Esto es lo que ancla todo el parseo: no hace falta entender los campos del
 * medio de cada refugio (que cambian entre parches, p.ej. al añadir jugadores
 * a la lista del refugio), basta con encontrar el punto donde encaja el resto.
 */
const isZoneListAt = (cursor: Cursor, offset: number): boolean => {
    try {
        cursor.seek(offset);
        cursor.int32();
        cursor.int32();

        const zoneCount = cursor.int32();
        if (zoneCount < 0 || zoneCount > MAX_ZONES) {
            return false;
        }

        for (let i = 0; i < zoneCount; i++) {
            cursor.float64();
            cursor.skip(20); // x, y, z, w, h
            cursor.string(); // tipo, p.ej. "AnimalZone"
            cursor.string(); // nombre
            cursor.int32();
        }
        return true;
    } catch {
        return false;
    }
};

const walkCellGrid = (cursor: Cursor, roomDefSize: number, buildingDefSize: number, cells: number): void => {
    for (let i = 0; i < cells; i++) {
        const roomDefCount = cursor.int32();
        if (roomDefCount < 0 || roomDefCount > MAX_DEF_COUNT) {
            throw new Error(`roomDefCount inverosímil: ${roomDefCount}`);
        }
        cursor.skip(roomDefCount * roomDefSize);

        const buildingDefCount = cursor.int32();
        if (buildingDefCount < 0 || buildingDefCount > MAX_DEF_COUNT) {
            throw new Error(`buildingDefCount inverosímil: ${buildingDefCount}`);
        }
        cursor.skip(buildingDefCount * buildingDefSize);
    }
};

/** Bytes máximos que puede ocupar la cola desconocida de un refugio. */
const MAX_RECORD_TAIL = 8192;
/** Tope de exploración, para que un fichero raro no cuelgue el navegador. */
const MAX_SEARCH_STEPS = 200000;

/**
 * Lee la lista de refugios que empieza en `gridEnd`. De cada registro sólo se
 * interpreta la cabecera; para saber dónde acaba se prueban offsets hasta que
 * encaja el registro siguiente (o, en el último, la lista de zonas).
 */
const parseSafeHouseList = (cursor: Cursor, gridEnd: number): RawSafeHouse[] | undefined => {
    cursor.seek(gridEnd);
    let count: number;
    try {
        count = cursor.int32();
    } catch {
        return undefined;
    }
    if (count < 0 || count > MAX_SAFE_HOUSES) {
        return undefined;
    }
    if (count === 0) {
        return isZoneListAt(cursor, gridEnd + 4) ? [] : undefined;
    }

    let steps = 0;

    const search = (offset: number, index: number, found: RawSafeHouse[]): RawSafeHouse[] | undefined => {
        if (index === count) {
            return isZoneListAt(cursor, offset) ? found : undefined;
        }

        const head = readSafeHouseHead(cursor, offset);
        if (!head) {
            return undefined;
        }

        const { end, ...safeHouse } = head;
        const next = [...found, safeHouse];

        for (let p = end; p <= end + MAX_RECORD_TAIL && p < cursor.size; p++) {
            if (++steps > MAX_SEARCH_STEPS) {
                return undefined;
            }
            const result = search(p, index + 1, next);
            if (result) {
                return result;
            }
        }
        return undefined;
    };

    return search(gridEnd + 4, 0, []);
};

/** Combinaciones (roomDef, buildingDef) conocidas, de más a menos probable. */
const KNOWN_GRID_SIZES: [number, number][] = [
    [10, 23], // Build 42 (versión de mundo 249), verificado en 42.20
    [10, 19] // Build 41 (versión >= 194)
];

const buildGridSizeCandidates = (): [number, number][] => {
    const candidates = [...KNOWN_GRID_SIZES];
    const seen = new Set(candidates.map(([room, building]) => `${room}_${building}`));
    for (let room = 4; room <= 16; room++) {
        for (let building = 8; building <= 40; building++) {
            const key = `${room}_${building}`;
            if (!seen.has(key)) {
                seen.add(key);
                candidates.push([room, building]);
            }
        }
    }
    return candidates;
};

interface StructuredParse {
    safeHouses: RawSafeHouse[];
    version: number;
    warnings: string[];
}

const parseStructured = (buffer: ArrayBuffer): StructuredParse => {
    const cursor = new Cursor(buffer);

    if (cursor.ascii(4) !== 'META') {
        throw new Error('map_meta.bin no empieza por "META"');
    }

    const version = cursor.int32();
    if (version < 194) {
        throw new Error(`Versión de mundo ${version} no soportada (se esperaba >= 194)`);
    }

    const minX = cursor.int32();
    const minY = cursor.int32();
    const maxX = cursor.int32();
    const maxY = cursor.int32();

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (width <= 0 || height <= 0 || width > 5000 || height > 5000) {
        throw new Error(`Límites del mundo inverosímiles: ${minX},${minY} .. ${maxX},${maxY}`);
    }

    const cells = width * height;
    const gridStart = cursor.offset;

    for (const [roomDefSize, buildingDefSize] of buildGridSizeCandidates()) {
        let gridEnd: number;
        try {
            cursor.seek(gridStart);
            walkCellGrid(cursor, roomDefSize, buildingDefSize, cells);
            gridEnd = cursor.offset;
        } catch {
            continue;
        }

        const safeHouses = parseSafeHouseList(cursor, gridEnd);
        if (safeHouses) {
            return { safeHouses, version, warnings: [] };
        }
    }

    throw new Error('No se ha podido localizar la lista de refugios dentro de map_meta.bin');
};

/**
 * Plan B: barrido byte a byte buscando algo con forma de refugio.
 * Es lo que hacía la versión anterior de la herramienta. Se conserva sólo como
 * red de seguridad porque genera falsos positivos y puede perder refugios.
 */
const scanHeuristic = (buffer: ArrayBuffer): RawSafeHouse[] => {
    const view = new DataView(buffer);
    const size = buffer.byteLength;
    const safeHouses: RawSafeHouse[] = [];
    const foundOffsets: number[] = [];

    const excludePatterns = [/^Rancho?\s/i, /Cows\s*\d+$/i, /StashMap\d*$/i, /Zone$/i, /^\w+Map\d*$/i];
    const ownerPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.\- ]*$/;

    const scanStart = Math.max(0, size - 2000000);
    const scanEnd = size - 24;

    for (let scan = scanStart; scan < scanEnd; scan++) {
        const x = view.getInt32(scan);
        const y = view.getInt32(scan + 4);
        const w = view.getInt32(scan + 8);
        const h = view.getInt32(scan + 12);

        if (x < 0 || x >= 65000 || y < 0 || y >= 65000 || w <= 0 || w > 500 || h <= 0 || h > 500) {
            continue;
        }

        const strLen = view.getInt16(scan + 16);
        if (strLen < 2 || strLen > 50 || scan + 18 + strLen > size) {
            continue;
        }

        let owner = '';
        let valid = true;
        for (let i = 0; i < strLen && valid; i++) {
            const code = view.getUint8(scan + 18 + i);
            if (code >= 32 && code < 127) {
                owner += String.fromCharCode(code);
            } else {
                valid = false;
            }
        }

        if (!valid || !ownerPattern.test(owner) || excludePatterns.some((pattern) => pattern.test(owner))) {
            continue;
        }
        if (foundOffsets.some((offset) => Math.abs(offset - scan) < 50)) {
            continue;
        }

        foundOffsets.push(scan);
        safeHouses.push({ x, y, w, h, owner, players: [], title: owner });
    }

    return safeHouses;
};

const toSafeHouse = ({ x, y, w, h, owner, players, title }: RawSafeHouse): SafeHouse => ({
    region: [
        { x: Math.floor(x / TILES_PER_CHUNK), y: Math.floor(y / TILES_PER_CHUNK) },
        { x: Math.ceil((x + w) / TILES_PER_CHUNK), y: Math.ceil((y + h) / TILES_PER_CHUNK) }
    ],
    tileRegion: [
        { x, y },
        { x: x + w, y: y + h }
    ],
    owner,
    players,
    title: title || owner
});

const readWorldVersion = (buffer: ArrayBuffer): number | null => {
    if (buffer.byteLength < 8) {
        return null;
    }
    const header = new Uint8Array(buffer, 0, 4);
    if (String.fromCharCode(header[0], header[1], header[2], header[3]) !== 'META') {
        return null;
    }
    return new DataView(buffer).getInt32(4);
};

export const loadSafeHouses = async (directoryHandle: FileSystemDirectoryHandle): Promise<SafeHouseScan> => {
    let buffer: ArrayBuffer;
    try {
        const fileHandle = await directoryHandle.getFileHandle('map_meta.bin');
        buffer = await (await fileHandle.getFile()).arrayBuffer();
    } catch (e) {
        return {
            safeHouses: [],
            method: 'failed',
            version: null,
            warnings: [`No se ha podido leer map_meta.bin: ${(e as Error).message}`]
        };
    }

    const version = readWorldVersion(buffer);

    try {
        const parsed = parseStructured(buffer);
        return {
            safeHouses: parsed.safeHouses.map(toSafeHouse),
            method: 'structured',
            version: parsed.version,
            warnings: parsed.warnings
        };
    } catch (structuredError) {
        try {
            return {
                safeHouses: scanHeuristic(buffer).map(toSafeHouse),
                method: 'heuristic',
                version,
                warnings: [
                    `No se ha podido leer la estructura de map_meta.bin (${(structuredError as Error).message}).`,
                    'Se ha usado el barrido aproximado: la protección de refugios NO es fiable. ' +
                        'Comprueba en el mapa que salen todos los refugios antes de borrar nada.'
                ]
            };
        } catch (heuristicError) {
            return {
                safeHouses: [],
                method: 'failed',
                version,
                warnings: [
                    `No se han podido leer los refugios: ${(structuredError as Error).message}`,
                    `El barrido aproximado también ha fallado: ${(heuristicError as Error).message}`
                ]
            };
        }
    }
};
