/** Build 42 guarda los chunks en cuadrículas de 8x8 tiles (en B41 eran 10x10). */
export const TILES_PER_CHUNK = 8;

/**
 * Una "celda" (chunkdata/apop/metagrid/zpop) agrupa 32x32 chunks = 256x256 tiles.
 * Verificado contra un save de 42.20: map/ va de X 208..1759 y chunkdata_ de 6..54.
 */
export const CHUNKS_PER_CELL = 32;

/** Versión de mundo que escribe Build 42 (42.x). */
export const B42_WORLD_VERSION = 249;
