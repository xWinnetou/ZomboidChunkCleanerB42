import type { Region } from './Region';

export interface SafeHouse {
    /** Área del refugio en coordenadas de chunk (1 chunk = 8 tiles en B42). */
    region: Region;
    /** Área del refugio tal cual está guardada, en tiles. */
    tileRegion: Region;
    owner: string;
    players: string[];
    title: string;
}

/**
 * Cómo se han obtenido los refugios:
 * - `structured`: se ha leído la estructura real de map_meta.bin (fiable).
 * - `heuristic`:  no se ha podido leer la estructura y se ha caído al escaneo
 *                 por patrones (aproximado, puede perder refugios).
 * - `failed`:     no se ha podido leer nada.
 */
export type SafeHouseScanMethod = 'structured' | 'heuristic' | 'failed';

export interface SafeHouseScan {
    safeHouses: SafeHouse[];
    method: SafeHouseScanMethod;
    /** Versión del mundo leída de map_meta.bin (249 = build 42.x). */
    version: number | null;
    warnings: string[];
}
