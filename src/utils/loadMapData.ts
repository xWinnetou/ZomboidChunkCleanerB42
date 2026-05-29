import type { Coordinate } from '../types';

export const loadMapData = async (directoryHandle: FileSystemDirectoryHandle): Promise<Coordinate[]> => {
    const mapData: Coordinate[] = [];

    const regexB41 = new RegExp(/map_(\d+)_(\d+).bin/);

    // Cast to any to bypass missing type definition for values()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = directoryHandle as any;

    for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
            const match = regexB41.exec(entry.name);
            if (match) {
                const [_, x, y] = match;
                mapData.push({ x: parseInt(x), y: parseInt(y) });
            }
        } else if (entry.kind === 'directory' && entry.name === 'map') {
            // B42 Recursive Scan
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapDir = entry as any;
            for await (const subEntry of mapDir.values()) {
                if (subEntry.kind === 'directory') {
                    const xStr = subEntry.name;
                    const x = parseInt(xStr);
                    if (!isNaN(x)) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const xDir = subEntry as any;
                        for await (const fileEntry of xDir.values()) {
                            if (fileEntry.kind === 'file' && fileEntry.name.endsWith('.bin')) {
                                const yStr = fileEntry.name.replace('.bin', '');
                                const y = parseInt(yStr);
                                if (!isNaN(y)) {
                                    mapData.push({ x, y });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return mapData;
};
