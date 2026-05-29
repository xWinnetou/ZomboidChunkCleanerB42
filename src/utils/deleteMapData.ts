import type { Coordinate, Region } from '../types';

import { isPointSelected } from './isPointSelected';
import { partition } from './partition';

// Identify General Cells (32x32 Chunks)
const getGeneralCell = (x: number, y: number) => `${Math.floor(x / 32)}_${Math.floor(y / 32)}`;

const deleteFile = async (root: FileSystemDirectoryHandle, path: string[]) => {
    try {
        let current = root;
        for (let i = 0; i < path.length - 1; i++) {
            current = await current.getDirectoryHandle(path[i]);
        }
        await current.removeEntry(path[path.length - 1]);
    } catch (e) {
        // Ignore (file/dir doesn't exist)
    }
};

// Generic nested deleter for structure: root/X/Y.bin
const deleteNested = async (root: FileSystemDirectoryHandle, folder: string, points: Coordinate[]) => {
    try {
        const dir = await root.getDirectoryHandle(folder);
        // Optimization: Group by X
        const byX = new Map<number, number[]>();
        points.forEach(({ x, y }) => {
            if (!byX.has(x)) byX.set(x, []);
            byX.get(x)!.push(y);
        });

        for (const [x, ys] of byX.entries()) {
            try {
                const xDir = await dir.getDirectoryHandle(x.toString());
                await Promise.all(ys.map(y => xDir.removeEntry(`${y}.bin`).catch(() => { })));
            } catch { } // X dir missing
        }
    } catch { } // Root folder missing
};

// Generic flat deleter for structure: root/prefix_X_Y.bin
// Validates X,Y against points set
const deleteFlat = async (root: FileSystemDirectoryHandle, folder: string, prefix: string, pointsSet: Set<string>) => {
    try {
        const dir = await root.getDirectoryHandle(folder);
        // We have to scan because we don't know exactly which files exist, 
        // OR we can iterate points and try delete? Use Points is better if sparse selection?
        // But iterating 1000s of points vs 100s of files.
        // Better: Iterate points and try delete.

        // Wait, for `isoregiondata`, it's `datachunk_X_Y.bin`.
        // If we iterate points, we generate thousands of requests.
        // Better to list dir?
        // Let's iterate directory values (if standard API allows).
        // Since we faced issues with .values() before, let's use the 'any' hack or iterate points if selection is small?
        // Let's try iterating selection. Safe and correct.

        // However, user said `isoregiondata` creates many files.
        // Let's try iterating points.

        // Wait, PointsSet is `X_Y`.
        // We iterate `pointsSet` entries? No, `pointsToDelete` array.
    } catch { }
};

const loadSqlJsLib = async () => {
    // @ts-ignore
    if (typeof window !== 'undefined' && !window.initSqlJs) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.min.js';
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
};

export const deleteMapData = (
    directoryHandle: FileSystemDirectoryHandle,
    mapData: Coordinate[],
    region: Region,
    isSelectionInverted: boolean,
    excludedRegions: Region[]
): [mapData: Coordinate[], done: Promise<void>] => {
    const [pointsToDelete, pointsToKeep] = partition(mapData, (point) =>
        isPointSelected(point, region, isSelectionInverted, excludedRegions)
    );

    const keptGeneralCells = new Set<string>();
    pointsToKeep.forEach((p) => keptGeneralCells.add(getGeneralCell(p.x, p.y)));

    const affectedGeneralCells = new Set<string>();
    pointsToDelete.forEach((p) => affectedGeneralCells.add(getGeneralCell(p.x, p.y)));

    const filesToDelete: string[] = [];
    pointsToDelete.forEach(({ x, y }) => {
        filesToDelete.push(`map_${x}_${y}.bin`);
    });

    const deletePromise = async () => {
        // 1. B41 Flat Files
        await Promise.all(
            filesToDelete.map((f) => directoryHandle.removeEntry(f).catch(() => { }))
        );

        // 2. B42 Nested Chunks: map/X/Y.bin
        await deleteNested(directoryHandle, 'map', pointsToDelete);

        // 3. Vehicles.db (Selective Delete)
        try {
            // Load SQL.js
            await loadSqlJsLib();

            // Open vehicles.db
            const vehiclesHandle = await directoryHandle.getFileHandle('vehicles.db', { create: false });
            const vehiclesFile = await vehiclesHandle.getFile();
            const arrayBuffer = await vehiclesFile.arrayBuffer();

            // @ts-ignore
            const SQL = await window.initSqlJs({
                locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
            });
            const db = new SQL.Database(new Uint8Array(arrayBuffer));

            // Execute Delete
            // vehicles.db stores chunk coordinates in 'wx' and 'wy'
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare("DELETE FROM vehicles WHERE wx = :wx AND wy = :wy");

            // Optimization: We could group or use IN clause, but simple iteration is robust
            for (const p of pointsToDelete) {
                stmt.run({ ':wx': p.x, ':wy': p.y });
            }
            stmt.free();
            db.run("COMMIT");

            // Export and Write
            const data = db.export();
            const writable = await vehiclesHandle.createWritable();
            await writable.write(data as any);
            await writable.close();

            // Delete journal to prevent potential consistency issues
            await directoryHandle.removeEntry('vehicles.db-journal').catch(() => { });

            console.log('Successfully cleaned vehicles.db');
        } catch (e) {
            console.warn('Failed to clean vehicles.db (it might not exist or blocked):', e);
        }

        // 4. Special folders cleanup
        // zpop is flat in B42/B41 mixed ? User says zpop/zpop_X_Y.bin exists.
        // We handle zpop in aggregates below if the cell is fully cleared.
        // But if user has zpop_X_Y.bin NOT in aggregates approach? 
        // Existing code handled zpop in aggregates. Let's ensure we look in zpop folder.

        // 5. ISOREGIONDATA: isoregiondata/datachunk_X_Y.bin (Flat)
        try {
            const isoDir = await directoryHandle.getDirectoryHandle('isoregiondata');
            const chunkSize = 50;
            for (let i = 0; i < pointsToDelete.length; i += chunkSize) {
                const chunk = pointsToDelete.slice(i, i + chunkSize);
                await Promise.all(chunk.map(p =>
                    isoDir.removeEntry(`datachunk_${p.x}_${p.y}.bin`).catch(() => { })
                ));
            }
        } catch { }

        // 6. Aggregate Files (Safed)
        for (const cellKey of affectedGeneralCells) {
            if (!keptGeneralCells.has(cellKey)) {
                // Delete aggregates only if fully cleared
                await deleteFile(directoryHandle, ['chunkdata', `chunkdata_${cellKey}.bin`]);
                await deleteFile(directoryHandle, ['apop', `apop_${cellKey}.bin`]);
                await deleteFile(directoryHandle, ['metagrid', `metacell_${cellKey}.bin`]);
                // Explicitly check zpop folder for zpop_X_Y.bin
                await deleteFile(directoryHandle, ['zpop', `zpop_${cellKey}.bin`]);
            }
        }
    };

    return [pointsToKeep, deletePromise().then(() => undefined)];
};
