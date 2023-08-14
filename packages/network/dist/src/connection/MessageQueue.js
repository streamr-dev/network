"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageQueue = exports.QueueItem = void 0;
const heap_1 = __importDefault(require("heap"));
const utils_1 = require("@streamr/utils");
class QueueItem {
    constructor(message, onSuccess, onError) {
        this.message = message;
        this.onSuccess = onSuccess;
        this.onError = onError;
        this.errorInfos = [];
        this.no = QueueItem.nextNumber++;
        this.tries = 0;
        this.failed = false;
    }
    getMessage() {
        return this.message;
    }
    getErrorInfos() {
        return this.errorInfos;
    }
    isFailed() {
        return this.failed;
    }
    delivered() {
        this.onSuccess();
    }
    incrementTries(info) {
        this.tries += 1;
        this.errorInfos.push(info);
        if (this.tries >= MessageQueue.MAX_TRIES) {
            this.failed = true;
        }
        if (this.isFailed()) {
            this.onError(new Error('Failed to deliver message.'));
        }
    }
    immediateFail(errMsg) {
        this.failed = true;
        this.onError(new Error(errMsg));
    }
}
exports.QueueItem = QueueItem;
QueueItem.nextNumber = 0;
class MessageQueue {
    constructor(maxSize) {
        this.heap = new heap_1.default((a, b) => a.no - b.no);
        this.logger = new utils_1.Logger(module);
        this.maxSize = maxSize;
    }
    add(message) {
        if (this.size() === this.maxSize) {
            this.logger.warn('Discard oldest message (queue is full)', { maxSize: this.maxSize });
            this.pop().immediateFail('Message queue full, dropping message.');
        }
        return new Promise((resolve, reject) => {
            this.heap.push(new QueueItem(message, resolve, reject));
        });
    }
    peek() {
        return this.heap.peek();
    }
    pop() {
        return this.heap.pop();
    }
    size() {
        return this.heap.size();
    }
    empty() {
        return this.heap.empty();
    }
    clear() {
        // @ts-expect-error clear exists but isn't in typedef
        return this.heap.clear();
    }
}
exports.MessageQueue = MessageQueue;
MessageQueue.MAX_TRIES = 10;
//# sourceMappingURL=MessageQueue.js.map