/** Qué se borra además de los chunks del mapa. */
export interface DeleteOptions {
    /** isoregiondata/datachunk_X_Y.bin */
    isoRegionData: boolean;
    /** chunkdata/, apop/, metagrid/, zpop/ — sólo si la celda 32x32 queda vacía del todo. */
    aggregates: boolean;
    /** Filas de vehicles.db cuyo chunk se borra. */
    vehicles: boolean;
    /** Animales de map_animals.bin que estén en los chunks borrados. */
    animals: boolean;
    /** blam/ — copias de chunks corruptos que dejó el juego (+ sus _error.txt). */
    corruptedChunks: boolean;
    /**
     * Además, borra apop/ y zpop/ de las celdas que sólo se limpian a medias,
     * para que zombis y animales se repueblen desde cero también ahí.
     * Afecta a la celda entera, incluida la parte protegida por refugios.
     */
    resetPartialPopulation: boolean;
}

export const DEFAULT_DELETE_OPTIONS: DeleteOptions = {
    isoRegionData: true,
    aggregates: true,
    vehicles: true,
    animals: true,
    corruptedChunks: true,
    resetPartialPopulation: false
};

export interface DeleteProgress {
    phase: string;
    current: number;
    total: number;
}

export interface DeleteReport {
    chunks: number;
    isoRegionData: number;
    aggregates: number;
    corruptedChunks: number;
    /** `null` = no se ha tocado vehicles.db. */
    vehicles: number | null;
    /** `null` = no se ha tocado map_animals.bin. */
    animals: number | null;
    errors: string[];
}
