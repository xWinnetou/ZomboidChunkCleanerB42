import type { Region } from './Region';

export interface SafeHouse {
    region: Region;
    tileRegion: Region;
    owner: string;
    players: string[];
    title: string;
}

export type SafeHouseScanMethod = 'structured' | 'heuristic' | 'failed';

export interface SafeHouseScan {
    safeHouses: SafeHouse[];
    method: SafeHouseScanMethod;
    version: number | null;
    warnings: string[];
}
