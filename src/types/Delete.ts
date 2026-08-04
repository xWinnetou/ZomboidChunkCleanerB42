export interface DeleteOptions {
    isoRegionData: boolean;
    aggregates: boolean;
    vehicles: boolean;
    animals: boolean;
    corruptedChunks: boolean;
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
    vehicles: number | null;
    animals: number | null;
    errors: string[];
}
