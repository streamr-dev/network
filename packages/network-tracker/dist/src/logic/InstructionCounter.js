"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstructionCounter = void 0;
const streamr_client_protocol_1 = require("streamr-client-protocol");
const streamr_network_1 = require("streamr-network");
class InstructionCounter {
    constructor() {
        this.counters = {};
    }
    setOrIncrement(nodeId, streamPartId) {
        this.getAndSetIfNecessary(nodeId, streamPartId);
        this.counters[nodeId][streamPartId] += 1;
        return this.counters[nodeId][streamPartId];
    }
    isMostRecent(status, source) {
        const streamPartId = (0, streamr_client_protocol_1.toStreamPartID)(status.streamPart.id, status.streamPart.partition);
        const currentCounter = this.getAndSetIfNecessary(source, streamPartId);
        return (status.streamPart.counter >= currentCounter || status.streamPart.counter === streamr_network_1.COUNTER_UNSUBSCRIBE);
    }
    removeNodeFromStreamPart(nodeId, streamPartId) {
        if (this.counters[nodeId] !== undefined) {
            delete this.counters[nodeId][streamPartId];
            if (Object.keys(this.counters[nodeId]).length === 0) {
                delete this.counters[nodeId];
            }
        }
    }
    removeStreamPart(streamPartId) {
        Object.keys(this.counters).forEach((nodeId) => {
            delete this.counters[nodeId][streamPartId];
        });
    }
    getAndSetIfNecessary(nodeId, streamPartId) {
        if (this.counters[nodeId] === undefined) {
            this.counters[nodeId] = {};
        }
        if (this.counters[nodeId][streamPartId] === undefined) {
            this.counters[nodeId][streamPartId] = 0;
        }
        return this.counters[nodeId][streamPartId];
    }
}
exports.InstructionCounter = InstructionCounter;
//# sourceMappingURL=InstructionCounter.js.map