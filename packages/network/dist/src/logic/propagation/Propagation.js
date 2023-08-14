"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Propagation = void 0;
const PropagationTaskStore_1 = require("./PropagationTaskStore");
const DEFAULT_MAX_MESSAGES = 30;
const DEFAULT_TTL = 30 * 1000;
/**
 * Message propagation logic of a node. Given a message, this class will actively attempt to propagate it to
 * `minPropagationTargets` neighbors until success or TTL expiration.
 *
 * Setting `minPropagationTargets = 0` effectively disables any propagation reattempts. A message will then
 * only be propagated exactly once, to neighbors that are present at that moment, in a fire-and-forget manner.
 */
class Propagation {
    constructor({ sendToNeighbor, minPropagationTargets, ttl = DEFAULT_TTL, maxMessages = DEFAULT_MAX_MESSAGES }) {
        this.sendToNeighbor = sendToNeighbor;
        this.minPropagationTargets = minPropagationTargets;
        this.activeTaskStore = new PropagationTaskStore_1.PropagationTaskStore(ttl, maxMessages);
    }
    /**
     * Node should invoke this when it learns about a new message
     */
    feedUnseenMessage(message, targets, source) {
        const task = {
            message,
            source,
            handledNeighbors: new Set()
        };
        this.activeTaskStore.add(task);
        for (const target of targets) {
            this.sendAndAwaitThenMark(task, target);
        }
    }
    /**
     * Node should invoke this when it learns about a new node stream assignment
     */
    onNeighborJoined(neighborId, streamPartId) {
        const tasksOfStream = this.activeTaskStore.get(streamPartId);
        for (const task of tasksOfStream) {
            this.sendAndAwaitThenMark(task, neighborId);
        }
    }
    numOfActivePropagationTasks() {
        return this.activeTaskStore.size();
    }
    sendAndAwaitThenMark({ message, source, handledNeighbors }, neighborId) {
        if (!handledNeighbors.has(neighborId) && neighborId !== source) {
            (async () => {
                try {
                    await this.sendToNeighbor(neighborId, message);
                }
                catch {
                    return;
                }
                // Side-note: due to asynchronicity, the task being modified at this point could already be stale and
                // deleted from `activeTaskStore`. However, as modifying it or re-deleting it is pretty much
                // inconsequential at this point, leaving the logic as is.
                handledNeighbors.add(neighborId);
                if (handledNeighbors.size >= this.minPropagationTargets) {
                    this.activeTaskStore.delete(message.messageId);
                }
            })();
        }
    }
}
exports.Propagation = Propagation;
//# sourceMappingURL=Propagation.js.map