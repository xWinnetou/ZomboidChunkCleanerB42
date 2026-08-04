import { CHUNKS_PER_CELL } from '../constants';
import type { Coordinate, DeleteOptions, DeleteProgress, DeleteReport, Region } from '../types';

import { cleanAnimals } from './cleanAnimals';
import { isPointSelected } from './isPointSelected';
import { partition } from './partition';

const BATCH_SIZE = 64;

const getCellKey = (x: number, y: number) => `${Math.floor(x / CHUNKS_PER_CELL)}_${Math.floor(y / CHUNKS_PER_CELL)}`;

const getDirectory = async (root: FileSystemDirectoryHandle, name: string) => {
    try {
        return await root.getDirectoryHandle(name);
    } catch {
        return undefined;
    }
};

const removeEntry = async (directory: FileSystemDirectoryHandle, name: string, errors: string[]) => {
    try {
        await directory.removeEntry(name);
        return true;
    } catch (e) {
        const error = e as DOMException;
        if (error?.name && error.name !== 'NotFoundError') {
            errors.push(`${name}: ${error.name} ${error.message ?? ''}`.trim());
        }
        return false;
    }
};

const runBatched = async <T>(items: T[], run: (item: T) => Promise<void>, onBatch?: (done: number) => void) => {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        await Promise.all(items.slice(i, i + BATCH_SIZE).map(run));
        onBatch?.(Math.min(i + BATCH_SIZE, items.length));
    }
};

const deleteNested = async (
    root: FileSystemDirectoryHandle,
    folder: string,
    points: Coordinate[],
    errors: string[],
    extraNames: (y: number) => string[] = () => []
): Promise<number> => {
    const directory = await getDirectory(root, folder);
    if (!directory) {
        return 0;
    }

    const byX = new Map<number, number[]>();
    points.forEach(({ x, y }) => {
        const ys = byX.get(x);
        if (ys) {
            ys.push(y);
        } else {
            byX.set(x, [y]);
        }
    });

    let deleted = 0;
    for (const [x, ys] of byX.entries()) {
        const xDirectory = await getDirectory(directory, x.toString());
        if (!xDirectory) {
            continue;
        }

        await runBatched(ys, async (y) => {
            if (await removeEntry(xDirectory, `${y}.bin`, errors)) {
                deleted++;
            }
            for (const name of extraNames(y)) {
                await removeEntry(xDirectory, name, errors);
            }
        });

        await removeEntry(directory, x.toString(), []);
    }
    return deleted;
};

const deleteVehicles = async (root: FileSystemDirectoryHandle, points: Coordinate[], errors: string[]): Promise<number | null> => {
    if (!points.length) {
        return 0;
    }

    try {
        const fileHandle = await root.getFileHandle('vehicles.db', { create: false });
        const original = await (await fileHandle.getFile()).arrayBuffer();

        const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
            import('sql.js'),
            import('sql.js/dist/sql-wasm.wasm?url')
        ]);
        const SQL = await initSqlJs({ locateFile: () => wasmUrl });
        const db = new SQL.Database(new Uint8Array(original));

        try {
            db.run('BEGIN TRANSACTION');
            db.run('CREATE TEMP TABLE __chunks_to_delete (wx INTEGER, wy INTEGER)');
            const insert = db.prepare('INSERT INTO __chunks_to_delete VALUES (:wx, :wy)');
            for (const { x, y } of points) {
                insert.run({ ':wx': x, ':wy': y });
            }
            insert.free();
            db.run(
                'DELETE FROM vehicles WHERE EXISTS (' +
                    'SELECT 1 FROM __chunks_to_delete d WHERE d.wx = vehicles.wx AND d.wy = vehicles.wy)'
            );
            const removed = db.getRowsModified();
            db.run('DROP TABLE __chunks_to_delete');
            db.run('COMMIT');

            if (removed === 0) {
                return 0;
            }

            const backupHandle = await root.getFileHandle('vehicles.db.bak', { create: true });
            const backupWritable = await backupHandle.createWritable();
            await backupWritable.write(original);
            await backupWritable.close();

            const data = db.export();
            const writable = await fileHandle.createWritable();
            await writable.write(data);
            await writable.close();

            await removeEntry(root, 'vehicles.db-journal', []);

            return removed;
        } finally {
            db.close();
        }
    } catch (e) {
        const error = e as Error;
        if ((e as DOMException)?.name === 'NotFoundError') {
            return null;
        }
        errors.push(`vehicles.db: ${error.message}`);
        return null;
    }
};

export const deleteMapData = (
    directoryHandle: FileSystemDirectoryHandle,
    mapData: Coordinate[],
    region: Region,
    isSelectionInverted: boolean,
    excludedRegions: Region[],
    options: DeleteOptions,
    onProgress?: (progress: DeleteProgress) => void
): [mapData: Coordinate[], done: Promise<DeleteReport>] => {
    const [pointsToDelete, pointsToKeep] = partition(mapData, (point) =>
        isPointSelected(point, region, isSelectionInverted, excludedRegions)
    );

    const keptCells = new Set(pointsToKeep.map(({ x, y }) => getCellKey(x, y)));
    const affectedCells = [...new Set(pointsToDelete.map(({ x, y }) => getCellKey(x, y)))];
    const emptiedCells = affectedCells.filter((cell) => !keptCells.has(cell));
    const partialCells = affectedCells.filter((cell) => keptCells.has(cell));

    const run = async (): Promise<DeleteReport> => {
        const errors: string[] = [];
        const report: DeleteReport = {
            chunks: 0,
            isoRegionData: 0,
            aggregates: 0,
            corruptedChunks: 0,
            vehicles: null,
            animals: null,
            errors
        };

        const progress = (phase: string, current: number, total: number) => onProgress?.({ phase, current, total });

        progress('Chunks (formato B41)', 0, pointsToDelete.length);
        await runBatched(
            pointsToDelete,
            async ({ x, y }) => {
                if (await removeEntry(directoryHandle, `map_${x}_${y}.bin`, errors)) {
                    report.chunks++;
                }
            },
            (done) => progress('Chunks (formato B41)', done, pointsToDelete.length)
        );

        progress('Chunks del mapa', 0, pointsToDelete.length);
        report.chunks += await deleteNested(directoryHandle, 'map', pointsToDelete, errors);
        progress('Chunks del mapa', pointsToDelete.length, pointsToDelete.length);

        if (options.corruptedChunks) {
            progress('Chunks corruptos (blam)', 0, pointsToDelete.length);
            report.corruptedChunks += await deleteNested(directoryHandle, 'blam', pointsToDelete, errors, (y) => [`${y}_error.txt`]);
            progress('Chunks corruptos (blam)', pointsToDelete.length, pointsToDelete.length);
        }

        if (options.isoRegionData) {
            const isoDirectory = await getDirectory(directoryHandle, 'isoregiondata');
            if (isoDirectory) {
                progress('Datos de región', 0, pointsToDelete.length);
                await runBatched(
                    pointsToDelete,
                    async ({ x, y }) => {
                        if (await removeEntry(isoDirectory, `datachunk_${x}_${y}.bin`, errors)) {
                            report.isoRegionData++;
                        }
                    },
                    (done) => progress('Datos de región', done, pointsToDelete.length)
                );
            }
        }

        if (options.aggregates) {
            progress('Agregados por celda', 0, emptiedCells.length);
            const aggregates: [string, (cell: string) => string][] = [
                ['chunkdata', (cell) => `chunkdata_${cell}.bin`],
                ['apop', (cell) => `apop_${cell}.bin`],
                ['metagrid', (cell) => `metacell_${cell}.bin`],
                ['zpop', (cell) => `zpop_${cell}.bin`]
            ];
            for (const [folder, toName] of aggregates) {
                const directory = await getDirectory(directoryHandle, folder);
                if (!directory) {
                    continue;
                }
                await runBatched(emptiedCells, async (cell) => {
                    if (await removeEntry(directory, toName(cell), errors)) {
                        report.aggregates++;
                    }
                });
            }
            progress('Agregados por celda', emptiedCells.length, emptiedCells.length);
        }

        if (options.resetPartialPopulation && partialCells.length) {
            progress('Repoblación de celdas parciales', 0, partialCells.length);
            for (const [folder, prefix] of [
                ['apop', 'apop'],
                ['zpop', 'zpop']
            ]) {
                const directory = await getDirectory(directoryHandle, folder);
                if (!directory) {
                    continue;
                }
                await runBatched(partialCells, async (cell) => {
                    if (await removeEntry(directory, `${prefix}_${cell}.bin`, errors)) {
                        report.aggregates++;
                    }
                });
            }
            progress('Repoblación de celdas parciales', partialCells.length, partialCells.length);
        }

        if (options.vehicles) {
            progress('Vehículos', 0, 1);
            report.vehicles = await deleteVehicles(directoryHandle, pointsToDelete, errors);
            progress('Vehículos', 1, 1);
        }

        if (options.animals) {
            progress('Animales', 0, 1);
            report.animals = await cleanAnimals(directoryHandle, pointsToDelete, errors);
            progress('Animales', 1, 1);
        }

        return report;
    };

    return [pointsToKeep, run()];
};
