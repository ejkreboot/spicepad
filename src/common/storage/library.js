import { delete as deleteKey, get, listKeys, openDB, set } from './indexeddb.js';

function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

export async function loadLibrary(options = {}) {
    const { seedLibrary } = options;
    await openDB();
    let keys = await listKeys();

    if (keys.length === 0 && seedLibrary && isObject(seedLibrary)) {
        await replaceLibrary(seedLibrary);
        keys = await listKeys();
    }

    const entries = await Promise.all(keys.map(async (key) => [key, await get(key)]));
    const library = {};
    entries.forEach(([key, value]) => {
        if (value !== undefined) {
            library[key] = value;
        }
    });
    return library;
}

export async function saveSymbol(id, symbol) {
    if (!id) throw new Error('Symbol id is required');
    await openDB();
    await set(id, symbol);
    return symbol;
}

export async function deleteSymbol(id) {
    if (!id) return;
    await openDB();
    await deleteKey(id);
}

export async function listSymbols() {
    return loadLibrary();
}

export async function replaceLibrary(library = {}) {
    await openDB();
    const keys = await listKeys();
    await Promise.all(keys.map((key) => deleteKey(key)));
    const entries = Object.entries(library || {});
    await Promise.all(entries.map(([id, symbol]) => set(id, symbol)));
    return library;
}
