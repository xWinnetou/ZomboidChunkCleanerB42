import { useCallback, useMemo, useRef, useState } from 'react';

import { AppContext } from '../contexts';
import { DEFAULT_DELETE_OPTIONS } from '../types';
import type {
    AppContextValue,
    Coordinate,
    DeleteOptions,
    DeleteProgress,
    DeleteReport,
    Region,
    SafeHouse,
    SafeHouseScanMethod
} from '../types';
import { deleteMapData, expandRegion, loadMapData, loadSafeHouses } from '../utils';

interface SelectionInfo {
    isSelectionInverted: boolean;
    selection: Region;
}

interface DeleteFiles {
    mapData: Coordinate[];
    selectionInfo?: SelectionInfo;
    excludedRegions: Region[];
    deleteOptions: DeleteOptions;
}

const pickSaveDirectory = async (): Promise<FileSystemDirectoryHandle> => {
    const directoryHandle = await window.showDirectoryPicker({ id: 'pz-save', mode: 'readwrite' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = directoryHandle as any;
    if (typeof handle.queryPermission === 'function') {
        let permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission === 'prompt') {
            permission = await handle.requestPermission({ mode: 'readwrite' });
        }
        if (permission !== 'granted') {
            throw new Error('No has dado permiso de escritura sobre la carpeta. Sin ese permiso la herramienta no puede borrar nada.');
        }
    }

    return directoryHandle;
};

export const AppContainer: React.FC = (props) => {
    const directoryHandleRef = useRef<FileSystemDirectoryHandle>();

    const [isMapDisplayed, setIsMapDisplayed] = useState<boolean>(true);
    const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | undefined>(undefined);
    const [mapData, setMapData] = useState<Coordinate[]>([]);
    const [zoomLevel, setZoomLevel] = useState<number>(1);

    const [isSafeHouseProtectionEnabled, setIsSafeHouseProtectionEnabled] = useState<boolean>(true);
    const [safeHouses, setSafeHouses] = useState<SafeHouse[]>([]);
    const [safeHousePadding, setSafeHousePadding] = useState<number>(4);
    const [safeHouseScanMethod, setSafeHouseScanMethod] = useState<SafeHouseScanMethod | undefined>(undefined);
    const [safeHouseWarnings, setSafeHouseWarnings] = useState<string[]>([]);
    const [worldVersion, setWorldVersion] = useState<number | null>(null);

    const [deleteOptions, setDeleteOptions] = useState<DeleteOptions>(DEFAULT_DELETE_OPTIONS);
    const [deleteProgress, setDeleteProgress] = useState<DeleteProgress | undefined>(undefined);
    const [deleteReport, setDeleteReport] = useState<DeleteReport | undefined>(undefined);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<string | undefined>(undefined);

    const deleteFilesRef = useRef<DeleteFiles>();

    const excludedRegions = useMemo<Region[]>(() => {
        if (!isSafeHouseProtectionEnabled) {
            return [];
        }
        return safeHouses.map(({ region }) => expandRegion(region, safeHousePadding));
    }, [isSafeHouseProtectionEnabled, safeHousePadding, safeHouses]);

    deleteFilesRef.current = {
        mapData,
        selectionInfo,
        excludedRegions,
        deleteOptions
    };

    const runDelete = useCallback(() => {
        if (!deleteFilesRef.current) {
            return;
        }

        const { excludedRegions, mapData, selectionInfo, deleteOptions } = deleteFilesRef.current;
        if (!directoryHandleRef.current) {
            setLoadError('No hay ninguna partida cargada.');
            return;
        }
        if (!selectionInfo) {
            return;
        }

        setDeleteReport(undefined);
        setDeleteProgress({ phase: 'Preparando', current: 0, total: 1 });

        const [newMapData, done] = deleteMapData(
            directoryHandleRef.current,
            mapData,
            selectionInfo.selection,
            selectionInfo.isSelectionInverted,
            excludedRegions,
            deleteOptions,
            setDeleteProgress
        );

        done.then(
            (report) => {
                setMapData(newMapData);
                setSelectionInfo(undefined);
                setDeleteProgress(undefined);
                setDeleteReport(report);
            },
            (e: Error) => {
                setDeleteProgress(undefined);
                setLoadError(`El borrado ha fallado: ${e.message}`);
            }
        );
    }, []);

    const load = useCallback(async () => {
        setLoadError(undefined);
        setDeleteReport(undefined);

        let directoryHandle: FileSystemDirectoryHandle;
        try {
            directoryHandle = await pickSaveDirectory();
        } catch (e) {
            const error = e as Error;
            if (error.name !== 'AbortError') {
                setLoadError(error.message);
            }
            return;
        }

        directoryHandleRef.current = directoryHandle;
        setIsLoading(true);
        try {
            const mapData = await loadMapData(directoryHandle);
            const scan = await loadSafeHouses(directoryHandle);

            setMapData(mapData);
            setSafeHouses(scan.safeHouses);
            setSafeHouseScanMethod(scan.method);
            setSafeHouseWarnings(scan.warnings);
            setWorldVersion(scan.version);
            setSelectionInfo(undefined);

            if (!mapData.length) {
                setLoadError(
                    'No se ha encontrado ningún chunk. ¿Seguro que has elegido la carpeta de la partida ' +
                        '(la que contiene map/ y map_meta.bin) y no la carpeta Saves?'
                );
            }
        } catch (e) {
            setLoadError(`No se ha podido leer la partida: ${(e as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const actions = useMemo<AppContextValue['actions']>(
        () => ({
            deleteMapData: runDelete,
            loadMapData: load,
            selectRegion: (region, isSelectionInverted) => {
                setSelectionInfo({ selection: region, isSelectionInverted: isSelectionInverted ?? false });
            },
            unselectRegion: () => setSelectionInfo(undefined),
            setDeleteOption: (key, value) => setDeleteOptions((current) => ({ ...current, [key]: value })),
            setIsSafeHouseProtectionEnabled,
            setSafeHousePadding,
            setZoomLevel,
            toggleMap: setIsMapDisplayed
        }),
        [load, runDelete]
    );

    const state = useMemo<AppContextValue['state']>(
        () => ({
            deleteOptions,
            deleteProgress,
            deleteReport,
            excludedRegions,
            isLoading,
            isMapDisplayed,
            isSafeHouseProtectionEnabled,
            isSelectionInverted: selectionInfo?.isSelectionInverted ?? false,
            loadError,
            mapData,
            safeHouses,
            safeHouseScanMethod,
            safeHousePadding,
            safeHouseWarnings,
            selection: selectionInfo?.selection,
            worldVersion,
            zoomLevel
        }),
        [
            deleteOptions,
            deleteProgress,
            deleteReport,
            excludedRegions,
            isLoading,
            isMapDisplayed,
            isSafeHouseProtectionEnabled,
            loadError,
            mapData,
            safeHousePadding,
            safeHouseScanMethod,
            safeHouseWarnings,
            safeHouses,
            selectionInfo,
            worldVersion,
            zoomLevel
        ]
    );

    const value = useMemo(() => ({ actions, state }), [actions, state]);

    return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
};
