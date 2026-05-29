import type { SafeHouse } from '../types';

const loadFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result;
            if (result instanceof ArrayBuffer) {
                resolve(result);
            }
            reject(new Error('Invalid return type!'));
        };
        reader.onerror = (error) => {
            reject(error);
        };
        reader.readAsArrayBuffer(file);
    });
};

export const loadSafeHouses = async (directoryHandle: FileSystemDirectoryHandle): Promise<SafeHouse[]> => {
    const safeHouses: SafeHouse[] = [];

    // 1. Load File
    let arrayBuffer: ArrayBuffer;
    try {
        const fileHandle = await directoryHandle.getFileHandle('map_meta.bin');
        const file = await fileHandle.getFile();
        arrayBuffer = await loadFileAsArrayBuffer(file);
    } catch (e) {
        console.warn('Map meta file not found or unreadable.', e);
        return [];
    }

    const view = new DataView(arrayBuffer);
    const size = arrayBuffer.byteLength;
    let offset = 0;

    console.log(`B42 DEBUG: Loaded map_meta.bin. Size: ${size}`);

    const canRead = (n: number) => (offset + n) <= size;

    const readInt32 = () => {
        if (!canRead(4)) return 0;
        const v = view.getInt32(offset);
        offset += 4;
        return v;
    };

    const readInt16 = () => {
        if (!canRead(2)) return 0;
        const v = view.getInt16(offset);
        offset += 2;
        return v;
    };

    const readString = (lenArg?: number): string => {
        let len = lenArg;
        if (len === undefined) {
            len = readInt16();
            if (len < 0 || len > 1000) {
                console.warn(`B42 DEBUG: Suspicious string len ${len} at ${offset}.`);
                return "";
            }
        }
        if (!canRead(len)) return "";
        let str = "";
        for (let i = 0; i < len; i++) {
            str += String.fromCharCode(view.getInt8(offset + i));
        }
        offset += len;
        return str;
    };

    const skipBytes = (n: number) => {
        if (canRead(n)) offset += n;
    };

    // 3. PATTERN-BASED SCAN: Find all safehouses by detecting their pattern
    // Pattern: x (int32) + y (int32) + w (int32) + h (int32) + strlen (int16) + valid_owner_string
    // This approach avoids offset corruption from parsing unknown fields between safehouses
    try {
        console.log("B42 DEBUG: Starting Pattern-Based Safehouse Scan...");

        // Scan last 500KB (or whole file if smaller) for safehouse patterns
        const scanStart = Math.max(0, size - 500000);
        const scanEnd = size - 24; // Need at least 16 bytes for coords + 2 for strlen + some owner chars

        console.log(`B42 DEBUG: Scanning from ${scanStart} to ${scanEnd}`);

        // Interface to track found safehouses by offset to avoid duplicates
        const foundOffsets = new Set<number>();

        for (let scan = scanStart; scan < scanEnd; scan++) {
            const x = view.getInt32(scan);
            const y = view.getInt32(scan + 4);
            const w = view.getInt32(scan + 8);
            const h = view.getInt32(scan + 12);

            // Validate geometry strictly for safehouses:
            // Coordinates: 0-65000 (map range)
            // Dimensions: 1-500 (safehouse size, rarely > 100 but can be larger)
            if (x >= 0 && x < 65000 &&
                y >= 0 && y < 65000 &&
                w > 0 && w <= 500 &&
                h > 0 && h <= 500) {

                // Check for valid owner string at position scan + 16
                if (scan + 18 < size) {
                    const strLen = view.getInt16(scan + 16);

                    // Valid string length (2-50 characters is reasonable for an owner name)
                    if (strLen >= 2 && strLen <= 50 && scan + 18 + strLen <= size) {
                        // Validate string contains only printable ASCII characters
                        let validStr = true;
                        let owner = "";
                        for (let j = 0; j < strLen && validStr; j++) {
                            const c = view.getUint8(scan + 18 + j);
                            if (c >= 32 && c < 127) {
                                owner += String.fromCharCode(c);
                            } else {
                                validStr = false;
                            }
                        }

                        if (validStr && owner.length >= 2) {
                            // Additional validation: owner should look like a username 
                            // (starts with letter/number, can contain underscores/periods)
                            const ownerPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.\- ]*$/;

                            // Exclude known non-safehouse patterns (AnimalZone, StashMap, etc.)
                            // These have owner names like "Ranch Cows 6487", "WorldStashMap3", etc.
                            const excludePatterns = [
                                /^Ranch\s/i,           // AnimalZone: "Ranch Cows 6487"
                                /Cows\s*\d+$/i,        // AnimalZone: ends with "Cows" + number
                                /StashMap\d*$/i,       // StashMap entries
                                /^AnimalZone$/i,       // Direct AnimalZone name
                                /^World\w+Map\d*$/i,   // WorldStashMap entries
                                /^Mul\w+Map\d*$/i,     // MulStashMap entries
                                /^BBurg\w+Map\d*$/i,   // BBurgStashMap entries
                                /^Ekron\w+Map\d*$/i,   // EkronStashMap entries
                                /^Irvington\w+Map\d*$/i, // IrvingtonStashMap entries
                                /^Louisville\w+Map\d*$/i, // LouisvilleStashMap entries
                                /^Riverside\w+Map\d*$/i,  // RiversideStashMap entries
                                /^MarchRidge\w+Map\d*$/i, // MarchRidgeStashMap entries
                            ];

                            const isExcluded = excludePatterns.some(pattern => pattern.test(owner));

                            if (ownerPattern.test(owner) && !isExcluded) {
                                // Avoid overlapping detections (skip if we found one nearby)
                                let tooClose = false;
                                for (const existingOffset of foundOffsets) {
                                    if (Math.abs(existingOffset - scan) < 50) {
                                        tooClose = true;
                                        break;
                                    }
                                }

                                if (!tooClose) {
                                    foundOffsets.add(scan);
                                    console.log(`B42 DEBUG: Found safehouse at offset ${scan}: X=${x}, Y=${y}, W=${w}, H=${h}, Owner="${owner}"`);

                                    // B42 uses 8x8 tile chunks (not 10x10 like B41)
                                    const TILES_PER_CHUNK = 8;

                                    // Make the safehouse area SQUARE (use larger dimension for both)
                                    const maxDimension = Math.max(w, h);

                                    safeHouses.push({
                                        region: [
                                            { x: Math.floor(x / TILES_PER_CHUNK), y: Math.floor(y / TILES_PER_CHUNK) },
                                            { x: Math.ceil((x + maxDimension) / TILES_PER_CHUNK), y: Math.ceil((y + maxDimension) / TILES_PER_CHUNK) }
                                        ],
                                        owner,
                                        players: [],
                                        title: `Safehouse de ${owner}`
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        console.log(`B42 DEBUG: Successfully found ${safeHouses.length} safehouses via pattern matching!`);

    } catch (critical) {
        console.error("B42 DEBUG: CRITICAL ERROR", critical);
    }

    return safeHouses;
};