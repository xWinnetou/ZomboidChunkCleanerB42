import { createContext } from 'react';

import { DEFAULT_DELETE_OPTIONS } from '../types';
import type { AppContextValue } from '../types';

const err = () => {
    throw new Error('Invalid invocation outside of AppContext!');
};

export const AppContext = createContext<AppContextValue>({
    actions: {
        deleteMapData: err,
        loadMapData: err,
        selectRegion: err,
        unselectRegion: err,
        setDeleteOption: err,
        setIsSafeHouseProtectionEnabled: err,
        setSafeHousePadding: err,
        setZoomLevel: err,
        toggleMap: err
    },
    state: {
        deleteOptions: DEFAULT_DELETE_OPTIONS,
        deleteProgress: undefined,
        deleteReport: undefined,
        excludedRegions: [],
        isLoading: false,
        isMapDisplayed: true,
        isSafeHouseProtectionEnabled: true,
        isSelectionInverted: false,
        loadError: undefined,
        mapData: [],
        safeHousePadding: 4,
        safeHouses: [],
        safeHouseScanMethod: undefined,
        safeHouseWarnings: [],
        selection: undefined,
        worldVersion: null,
        zoomLevel: 1
    }
});
