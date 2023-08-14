"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropagationTaskStore = void 0;
const FifoMapWithTtl_1 = require("./FifoMapWithTtl");
/**
 * Keeps track of propagation tasks for the needs of message propagation logic.
 *
 * Properties:
 * - Allows fetching propagation tasks by StreamPartID
 * - Upper bound on number of tasks stored, replacement policy if FIFO
 * - Items have a TTL, after which they are considered stale and not returned when querying
**/
class PropagationTaskStore {
    constructor(ttlInMs, maxTasks) {
        this.streamPartLookup = new Map();
        this.tasks = new FifoMapWithTtl_1.FifoMapWithTtl({
            ttlInMs,
            maxSize: maxTasks,
            onItemDropped: (messageId) => {
                const streamPartId = messageId.getStreamPartID();
                const messageIdsForStream = this.streamPartLookup.get(streamPartId);
                if (messageIdsForStream !== undefined) {
                    messageIdsForStream.delete(messageId);
                    if (messageIdsForStream.size === 0) {
                        this.streamPartLookup.delete(streamPartId);
                    }
                }
            }
        });
    }
    add(task) {
        const messageId = task.message.messageId;
        const streamPartId = messageId.getStreamPartID();
        if (!this.streamPartLookup.has(streamPartId)) {
            this.streamPartLookup.set(streamPartId, new Set());
        }
        this.streamPartLookup.get(streamPartId).add(messageId);
        this.tasks.set(messageId, task);
    }
    delete(messageId) {
        this.tasks.delete(messageId); // causes `onKeyDropped` to be invoked
    }
    get(streamPartId) {
        const messageIds = this.streamPartLookup.get(streamPartId);
        const tasks = [];
        if (messageIds !== undefined) {
            messageIds.forEach((messageId) => {
                const task = this.tasks.get(messageId);
                if (task !== undefined) { // should never be undefined if we don't have bugs
                    tasks.push(task);
                }
            });
        }
        return tasks;
    }
    size() {
        return this.tasks.size();
    }
}
exports.PropagationTaskStore = PropagationTaskStore;
//# sourceMappingURL=PropagationTaskStore.js.map