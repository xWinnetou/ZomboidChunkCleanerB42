import { TILES_PER_CHUNK } from '../constants';
import type { Coordinate } from '../types';

interface AnimalRecord {
    start: number;
    end: number;
    x: number;
    y: number;
    uuid: string;
}

interface RelationRecord {
    start: number;
    from: string;
    to: string;
}

interface ParsedAnimals {
    headerEnd: number;
    animals: AnimalRecord[];
    relations: RelationRecord[];
}

const RELATION_SIZE = 40;

const toHex = (bytes: Uint8Array) => {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
};

const parse = (buffer: ArrayBuffer): ParsedAnimals => {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const size = buffer.byteLength;

    const need = (offset: number, length: number) => {
        if (offset + length > size) {
            throw new Error(`Fin de fichero inesperado en ${offset}`);
        }
    };

    if (size < 26 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'ZONE') {
        throw new Error('map_animals.bin no empieza por "ZONE"');
    }

    const nameLength = view.getInt32(12);
    if (nameLength < 0 || nameLength > 64) {
        throw new Error(`Longitud de nombre inesperada: ${nameLength}`);
    }

    let offset = 16 + nameLength;
    const headerEnd = offset;

    const animalCount = view.getInt32(offset);
    offset += 4;
    if (animalCount < 0 || animalCount > 1000000) {
        throw new Error(`Número de animales inverosímil: ${animalCount}`);
    }

    const animals: AnimalRecord[] = [];
    for (let i = 0; i < animalCount; i++) {
        const start = offset;
        need(offset, 24);
        offset += 4;
        const x = view.getInt32(offset);
        offset += 4;
        const y = view.getInt32(offset);
        offset += 4;
        offset += 1 + 4 + 4 + 1 + 2;

        need(offset, 1);
        const pathLength = view.getUint8(offset);
        offset += 1;
        offset += pathLength * 4 + 11;

        need(offset, 16);
        const uuid = toHex(bytes.subarray(offset, offset + 16));
        offset += 16;

        for (let s = 0; s < 2; s++) {
            need(offset, 2);
            const length = view.getInt16(offset);
            if (length < 0 || length > 256) {
                throw new Error(`Longitud de cadena inválida (${length}) en el animal ${i}`);
            }
            offset += 2 + length;
        }
        offset += 2;
        need(offset, 0);

        animals.push({ start, end: offset, x, y, uuid });
    }

    need(offset, 4);
    const relationCount = view.getInt32(offset);
    offset += 4;
    if (relationCount < 0 || relationCount > 5000000) {
        throw new Error(`Número de relaciones inverosímil: ${relationCount}`);
    }

    const relations: RelationRecord[] = [];
    for (let i = 0; i < relationCount; i++) {
        need(offset, RELATION_SIZE);
        relations.push({
            start: offset,
            from: toHex(bytes.subarray(offset + 8, offset + 24)),
            to: toHex(bytes.subarray(offset + 24, offset + 40))
        });
        offset += RELATION_SIZE;
    }

    if (offset !== size) {
        throw new Error(`Sobran ${size - offset} bytes al final del fichero`);
    }

    return { headerEnd, animals, relations };
};

const serialize = (buffer: ArrayBuffer, parsed: ParsedAnimals, animals: AnimalRecord[], relations: RelationRecord[]): Uint8Array => {
    const source = new Uint8Array(buffer);

    let length = parsed.headerEnd + 4 + 4 + relations.length * RELATION_SIZE;
    for (const animal of animals) {
        length += animal.end - animal.start;
    }

    const out = new Uint8Array(length);
    const view = new DataView(out.buffer);
    let offset = 0;

    out.set(source.subarray(0, parsed.headerEnd), offset);
    offset += parsed.headerEnd;

    view.setInt32(offset, animals.length);
    offset += 4;
    for (const animal of animals) {
        out.set(source.subarray(animal.start, animal.end), offset);
        offset += animal.end - animal.start;
    }

    view.setInt32(offset, relations.length);
    offset += 4;
    for (const relation of relations) {
        out.set(source.subarray(relation.start, relation.start + RELATION_SIZE), offset);
        offset += RELATION_SIZE;
    }

    return out;
};

const isSameBytes = (a: Uint8Array, b: Uint8Array) => {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
};

export const cleanAnimals = async (
    root: FileSystemDirectoryHandle,
    isSelected: (chunk: Coordinate) => boolean,
    errors: string[]
): Promise<number | null> => {
    let fileHandle: FileSystemFileHandle;
    let buffer: ArrayBuffer;
    try {
        fileHandle = await root.getFileHandle('map_animals.bin', { create: false });
        buffer = await (await fileHandle.getFile()).arrayBuffer();
    } catch {
        return null;
    }

    let parsed: ParsedAnimals;
    try {
        parsed = parse(buffer);
    } catch (e) {
        errors.push(`map_animals.bin no se ha tocado: ${(e as Error).message}`);
        return null;
    }

    const rebuilt = serialize(buffer, parsed, parsed.animals, parsed.relations);
    if (!isSameBytes(rebuilt, new Uint8Array(buffer))) {
        errors.push('map_animals.bin no se ha tocado: la reconstrucción de prueba no coincide con el original.');
        return null;
    }

    const keptAnimals: AnimalRecord[] = [];
    const removedUuids = new Set<string>();

    for (const animal of parsed.animals) {
        const chunk = {
            x: Math.floor(animal.x / TILES_PER_CHUNK),
            y: Math.floor(animal.y / TILES_PER_CHUNK)
        };
        if (isSelected(chunk)) {
            removedUuids.add(animal.uuid);
        } else {
            keptAnimals.push(animal);
        }
    }

    if (removedUuids.size === 0) {
        return 0;
    }

    const keptRelations = parsed.relations.filter(({ from, to }) => !removedUuids.has(from) && !removedUuids.has(to));

    const output = serialize(buffer, parsed, keptAnimals, keptRelations);

    try {
        const backupHandle = await root.getFileHandle('map_animals.bin.bak', { create: true });
        const backupWritable = await backupHandle.createWritable();
        await backupWritable.write(buffer);
        await backupWritable.close();

        const writable = await fileHandle.createWritable();
        await writable.write(output);
        await writable.close();
    } catch (e) {
        errors.push(`No se ha podido escribir map_animals.bin: ${(e as Error).message}`);
        return null;
    }

    return removedUuids.size;
};
