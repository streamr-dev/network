export interface FifoMapWithTtlOptions<K> {
    ttlInMs: number;
    maxSize: number;
    onItemDropped?: (key: K) => void;
    timeProvider?: () => number;
    debugMode?: boolean;
}
/**
 * A "Map" implementation with a maximum size and TTL expiration on entries.
 *
 * When full, room is made for new entries by dropping existing by FIFO method.
 *
 * Entries have a TTL after which they are considered stale. Stale items are
 * not returned when querying.
 *
 */
export declare class FifoMapWithTtl<K, V> {
    private readonly items;
    private readonly dropQueue;
    private readonly ttlInMs;
    private readonly maxSize;
    private readonly onItemDropped;
    private readonly timeProvider;
    constructor({ ttlInMs, maxSize, onItemDropped, timeProvider }: FifoMapWithTtlOptions<K>);
    set(key: K, value: V): void;
    delete(key: K): void;
    get(key: K): V | undefined;
    size(): number;
}
