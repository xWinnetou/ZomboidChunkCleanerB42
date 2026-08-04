import type { Coordinate } from './Coordinate';
import type { DeleteOptions, DeleteProgress, DeleteReport } from './Delete';
import type { Region } from './Region';
import type { SafeHouse, SafeHouseScanMethod } from './SafeHouse';

export interface AppContextValue {
    actions: {
        deleteMapData: () => void;
        loadMapData: () => Promise<void>;
        selectRegion: (region: Region, isSelectionInverted?: boolean) => void;
        unselectRegion: () => void;
        setDeleteOption: <K extends keyof DeleteOptions>(key: K, value: DeleteOptions[K]) => void;
        setIsSafeHouseProtectionEnabled: (isSafeHouseProtectionEnabled: boolean) => void;
        setSafeHousePadding: (safeHousePadding: number) => void;
        setZoomLevel: (zoomLevel: number) => void;
        toggleMap: (isMapDisplayed: boolean) => void;
    };
    state: {
        deleteOptions: DeleteOptions;
        deleteProgress: DeleteProgress | undefined;
        deleteReport: DeleteReport | undefined;
        excludedRegions: Region[];
        isLoading: boolean;
        isMapDisplayed: boolean;
        isSafeHouseProtectionEnabled: boolean;
        isSelectionInverted: boolean;
        loadError: string | undefined;
        mapData: Coordinate[];
        safeHouses: SafeHouse[];
        safeHouseScanMethod: SafeHouseScanMethod | undefined;
        safeHousePadding: number;
        safeHouseWarnings: string[];
        selection: Region | undefined;
        worldVersion: number | null;
        zoomLevel: number;
    };
}
