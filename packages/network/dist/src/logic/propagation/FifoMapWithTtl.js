"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FifoMapWithTtl = void 0;
const yallist_1 = __importDefault(require("yallist"));
/**
 * A "Map" implementation with a maximum size and TTL expiration on entries.
 *
 * When full, room is made for new entries by dropping existing by FIFO method.
 *
 * Entries have a TTL after which they are considered stale. Stale items are
 * not returned when querying.
 *
 */
class FifoMapWithTtl {
    constructor({ ttlInMs, maxSize, onItemDropped = () => { }, timeProvider = Date.now }) {
        // class invariant: the keys present in `items` and `dropQueue` are the same set.
        this.items = new Map();
        this.dropQueue = yallist_1.default.create(); // queue is used to determine deletion order when full
        if (ttlInMs < 0) {
            throw new Error(`ttlInMs (${ttlInMs}) cannot be < 0`);
        }
        if (maxSize < 0) {
            throw new Error(`maxSize (${maxSize}) cannot be < 0`);
        }
        this.ttlInMs = ttlInMs;
        this.maxSize = maxSize;
        this.onItemDropped = onItemDropped;
        this.timeProvider = timeProvider;
    }
    set(key, value) {
        if (this.maxSize === 0) {
            return;
        }
        if (this.items.size > this.maxSize) {
            throw new Error('assertion error: maximum size exceeded');
        }
        // delete an existing entry if exists
        this.delete(key);
        // make room for new entry
        if (this.items.size === this.maxSize) {
            const keyToDel = this.dropQueue.shift();
            if (keyToDel === undefined) {
                throw new Error('assertion error: queue empty but still have items');
            }
            this.items.delete(keyToDel);
            this.onItemDropped(keyToDel);
        }
        // add entry
        const dropQueueNode = new yallist_1.default.Node(key);
        this.dropQueue.pushNode(dropQueueNode);
        this.items.set(key, {
            value,
            dropQueueNode,
            expiresAt: this.timeProvider() + this.ttlInMs
        });
    }
    delete(key) {
        const item = this.items.get(key);
        if (item !== undefined) {
            this.items.delete(key);
            this.dropQueue.removeNode(item.dropQueueNode);
            this.onItemDropped(key);
        }
    }
    get(key) {
        const item = this.items.get(key);
        if (item === undefined) {
            return undefined;
        }
        if (item.expiresAt <= this.timeProvider()) {
            this.delete(key);
            return undefined;
        }
        return item.value;
    }
    size() {
        return this.items.size;
    }
}
exports.FifoMapWithTtl = FifoMapWithTtl;
//# sourceMappingURL=FifoMapWithTtl.js.map