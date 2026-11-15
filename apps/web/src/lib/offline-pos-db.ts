"use client";

/**
 * Minimal native-IndexedDB wrapper for the offline POS screen — no external dependency, since
 * this only needs two small object stores with simple key lookups, not a query engine.
 *
 * Two stores:
 * - "reference": the sellable-item list cached for one outlet at a time, refreshed whenever the
 *   offline POS page successfully loads it online. Prices here are the *base* price only (no
 *   PricingRulesService rules applied) — an estimate shown to the cashier, never the authoritative
 *   charge. The real price is always resolved server-side when the order is synced.
 * - "queue": orders the cashier completed while offline, waiting to sync. Each is keyed by the
 *   client-generated clientOrderId so a sync retry can never create a duplicate.
 */

export interface OfflineReferenceItem {
  variantId: string;
  productName: string;
  variantName: string;
  estimatedPrice: string;
  estimatedTaxRatePercent: string;
}

export interface OfflineReference {
  outletId: string;
  outletName: string;
  fetchedAt: string;
  items: OfflineReferenceItem[];
}

export interface OfflineQueuedItem {
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  estimatedPrice: string;
}

export type OfflineOrderStatus = "pending" | "failed";

export interface OfflineQueuedOrder {
  clientOrderId: string;
  outletId: string;
  outletName: string;
  channel: "DINE_IN" | "DELIVERY" | "TAKEAWAY";
  items: OfflineQueuedItem[];
  cashTendered: string;
  estimatedTotal: string;
  createdAtOffline: string;
  status: OfflineOrderStatus;
  lastError?: string;
}

const DB_NAME = "kitchenos-offline-pos";
const DB_VERSION = 1;
const REFERENCE_STORE = "reference";
const QUEUE_STORE = "queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REFERENCE_STORE)) db.createObjectStore(REFERENCE_STORE, { keyPath: "outletId" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "clientOrderId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = fn(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveReference(reference: OfflineReference): Promise<void> {
  await withStore(REFERENCE_STORE, "readwrite", (store) => store.put(reference));
}

export async function getReference(outletId: string): Promise<OfflineReference | undefined> {
  return withStore(REFERENCE_STORE, "readonly", (store) => store.get(outletId));
}

export async function listReferences(): Promise<OfflineReference[]> {
  return withStore(REFERENCE_STORE, "readonly", (store) => store.getAll());
}

export async function enqueueOrder(order: OfflineQueuedOrder): Promise<void> {
  await withStore(QUEUE_STORE, "readwrite", (store) => store.put(order));
}

export async function listQueuedOrders(): Promise<OfflineQueuedOrder[]> {
  return withStore(QUEUE_STORE, "readonly", (store) => store.getAll());
}

export async function removeQueuedOrder(clientOrderId: string): Promise<void> {
  await withStore(QUEUE_STORE, "readwrite", (store) => store.delete(clientOrderId));
}

export async function markQueuedOrderFailed(clientOrderId: string, error: string): Promise<void> {
  const order = await withStore<OfflineQueuedOrder>(QUEUE_STORE, "readonly", (store) => store.get(clientOrderId));
  if (!order) return;
  await withStore(QUEUE_STORE, "readwrite", (store) => store.put({ ...order, status: "failed", lastError: error }));
}
