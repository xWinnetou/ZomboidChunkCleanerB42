import { CHUNKS_PER_CELL } from '../constants';
import type { Coordinate, DeleteOptions, DeleteProgress, DeleteReport, Region } from '../types';

import { cleanAnimals } from './cleanAnimals';
import { isPointSelected } from './isPointSelected';
import { partition } from './partition';

const BATCH_SIZE = 64;

const AGGREGATES: { folder: string; prefix: string; isPopulation: boolean }[] = [
    { folder: 'chunkdata', prefix: 'chunkdata', isPopulation: false },
    { folder: 'metagrid', prefix: 'metacell', isPopulation: false },
    { folder: 'apop', prefix: 'apop', isPopulation: true },
    { folder: 'zpop', prefix: 'zpop', isPopulation: true }
];

const getDirectory = async (root: FileSystemDirectoryHandle, name: string) => {
    try {
        return await root.getDirectoryHandle(name);
    } catch {
        return undefined;
    }
};

const listEntries = async (directory: FileSystemDirectoryHandle, kind: 'file' | 'directory'): Promise<string[]> => {
    const names: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const entry of (directory as any).values()) {
        if (entry.kind === kind) {
            names.push(entry.name);
        }
    }
    return names;
};

const parseCoordinates = (name: string, prefix: string): Coordinate | undefined => {
    const match = new RegExp(`^${prefix}_(-?\\d+)_(-?\\d+)\\.bin$`).exec(name);
    return match ? { x: parseInt(match[1], 10), y: parseInt(match[2], 10) } : undefined;
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
    isSelected: (chunk: Coordinate) => boolean,
    errors: string[],
    extraNames: (y: number) => string[] = () => []
): Promise<number> => {
    const directory = await getDirectory(root, folder);
    if (!directory) {
        return 0;
    }

    let deleted = 0;
    for (const xName of await listEntries(directory, 'directory')) {
        const x = parseInt(xName, 10);
        if (isNaN(x)) {
            continue;
        }

        const xDirectory = await getDirectory(directory, xName);
        if (!xDirectory) {
            continue;
        }

        const files = await listEntries(xDirectory, 'file');
        const targets = files
            .filter((name) => name.endsWith('.bin'))
            .map((name) => parseInt(name.slice(0, -4), 10))
            .filter((y) => !isNaN(y) && isSelected({ x, y }));

        await runBatched(targets, async (y) => {
            if (await removeEntry(xDirectory, `${y}.bin`, errors)) {
                deleted++;
            }
            for (const name of extraNames(y)) {
                await removeEntry(xDirectory, name, errors);
            }
        });

        if (targets.length === files.length) {
            await removeEntry(directory, xName, []);
        }
    }
    return deleted;
};

const deleteVehicles = async (
    root: FileSystemDirectoryHandle,
    isSelected: (chunk: Coordinate) => boolean,
    errors: string[]
): Promise<number | null> => {
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
            const chunks: Coordinate[] = [];
            const cursor = db.prepare('SELECT DISTINCT wx, wy FROM vehicles');
            while (cursor.step()) {
                const [wx, wy] = cursor.get() as number[];
                const chunk = { x: wx, y: wy };
                if (isSelected(chunk)) {
                    chunks.push(chunk);
                }
            }
            cursor.free();

            if (!chunks.length) {
                return 0;
            }

            db.run('BEGIN TRANSACTION');
            db.run('CREATE TEMP TABLE __chunks_to_delete (wx INTEGER, wy INTEGER)');
            const insert = db.prepare('INSERT INTO __chunks_to_delete VALUES (:wx, :wy)');
            for (const { x, y } of chunks) {
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
    const isSelected = (chunk: Coordinate) => isPointSelected(chunk, region, isSelectionInverted, excludedRegions);

    const [pointsToDelete, pointsToKeep] = partition(mapData, isSelected);

    const protectedCells = new Set<string>();
    for (const [{ x: x1, y: y1 }, { x: x2, y: y2 }] of excludedRegions) {
        for (let x = Math.floor(x1 / CHUNKS_PER_CELL); x <= Math.floor((x2 - 1) / CHUNKS_PER_CELL); x++) {
            for (let y = Math.floor(y1 / CHUNKS_PER_CELL); y <= Math.floor((y2 - 1) / CHUNKS_PER_CELL); y++) {
                protectedCells.add(`${x}_${y}`);
            }
        }
    }

    const cellCache = new Map<string, { partly: boolean; fully: boolean }>();
    const classifyCell = ({ x: cellX, y: cellY }: Coordinate) => {
        const key = `${cellX}_${cellY}`;
        const cached = cellCache.get(key);
        if (cached) {
            return cached;
        }

        let partly = false;
        let fully = true;
        for (let x = cellX * CHUNKS_PER_CELL; x < (cellX + 1) * CHUNKS_PER_CELL; x++) {
            for (let y = cellY * CHUNKS_PER_CELL; y < (cellY + 1) * CHUNKS_PER_CELL; y++) {
                if (isSelected({ x, y })) {
                    partly = true;
                } else {
                    fully = false;
                }
            }
        }

        const result = { partly, fully };
        cellCache.set(key, result);
        return result;
    };

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

        const flatChunks = (await listEntries(directoryHandle, 'file')).filter((name) => {
            const chunk = parseCoordinates(name, 'map');
            return !!chunk && isSelected(chunk);
        });
        if (flatChunks.length) {
            progress('Chunks (formato B41)', 0, flatChunks.length);
            await runBatched(
                flatChunks,
                async (name) => {
                    if (await removeEntry(directoryHandle, name, errors)) {
                        report.chunks++;
                    }
                },
                (done) => progress('Chunks (formato B41)', done, flatChunks.length)
            );
        }

        progress('Chunks del mapa', 0, pointsToDelete.length);
        report.chunks += await deleteNested(directoryHandle, 'map', isSelected, errors);
        progress('Chunks del mapa', pointsToDelete.length, pointsToDelete.length);

        if (options.corruptedChunks) {
            progress('Chunks corruptos (blam)', 0, 1);
            report.corruptedChunks += await deleteNested(directoryHandle, 'blam', isSelected, errors, (y) => [`${y}_error.txt`]);
            progress('Chunks corruptos (blam)', 1, 1);
        }

        if (options.isoRegionData) {
            const isoDirectory = await getDirectory(directoryHandle, 'isoregiondata');
            if (isoDirectory) {
                const targets = (await listEntries(isoDirectory, 'file')).filter((name) => {
                    const chunk = parseCoordinates(name, 'datachunk');
                    return !!chunk && isSelected(chunk);
                });
                progress('Datos de región', 0, targets.length);
                await runBatched(
                    targets,
                    async (name) => {
                        if (await removeEntry(isoDirectory, name, errors)) {
                            report.isoRegionData++;
                        }
                    },
                    (done) => progress('Datos de región', done, targets.length)
                );
            }
        }

        for (const { folder, prefix, isPopulation } of AGGREGATES) {
            const directory = await getDirectory(directoryHandle, folder);
            if (!directory) {
                continue;
            }

            const targets = (await listEntries(directory, 'file')).filter((name) => {
                const cell = parseCoordinates(name, prefix);
                if (!cell) {
                    return false;
                }
                const { partly, fully } = classifyCell(cell);
                if (!partly) {
                    return false;
                }
                if (options.aggregates && fully) {
                    return true;
                }
                return options.resetPopulation && isPopulation && !protectedCells.has(`${cell.x}_${cell.y}`);
            });

            progress(`Agregados: ${folder}`, 0, targets.length);
            await runBatched(
                targets,
                async (name) => {
                    if (await removeEntry(directory, name, errors)) {
                        report.aggregates++;
                    }
                },
                (done) => progress(`Agregados: ${folder}`, done, targets.length)
            );
        }

        if (options.vehicles) {
            progress('Vehículos', 0, 1);
            report.vehicles = await deleteVehicles(directoryHandle, isSelected, errors);
            progress('Vehículos', 1, 1);
        }

        if (options.animals) {
            progress('Animales', 0, 1);
            report.animals = await cleanAnimals(directoryHandle, isSelected, errors);
            progress('Animales', 1, 1);
        }

        return report;
    };

    return [pointsToKeep, run()];
};
