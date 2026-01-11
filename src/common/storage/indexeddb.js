import { createStore, del as idbDelete, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';

const DB_NAME = 'spicepad';
const STORE_NAME = 'symbols';

let store;

async function ensureStore() {
    if (!store) {
        store = createStore(DB_NAME, STORE_NAME);
    }
    return store;
}

export async function openDB() {
    return ensureStore();
}

export async function get(key) {
    const currentStore = await ensureStore();
    return idbGet(key, currentStore);
}

export async function set(key, value) {
    const currentStore = await ensureStore();
    return idbSet(key, value, currentStore);
}

async function deleteRecord(key) {
    const currentStore = await ensureStore();
    return idbDelete(key, currentStore);
}

export { deleteRecord as delete };

export async function listKeys() {
    const currentStore = await ensureStore();
    return idbKeys(currentStore);
}
