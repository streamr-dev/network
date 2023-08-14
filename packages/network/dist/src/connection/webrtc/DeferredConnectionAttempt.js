"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeferredConnectionAttempt = void 0;
const events_1 = __importDefault(require("events"));
class DeferredConnectionAttempt {
    constructor() {
        this.eventEmitter = new events_1.default();
        this.connectionAttemptPromise = new Promise((resolve, reject) => {
            this.eventEmitter.once('resolve', (targetPeerId) => {
                resolve(targetPeerId);
            });
            this.eventEmitter.once('reject', (reason) => {
                reject(reason);
            });
        });
        // allow promise to reject without outside catch
        this.connectionAttemptPromise.catch(() => { });
    }
    getPromise() {
        return this.connectionAttemptPromise;
    }
    resolve(targetPeerId) {
        this.eventEmitter.emit('resolve', targetPeerId);
    }
    reject(reason) {
        this.eventEmitter.emit('reject', reason);
    }
}
exports.DeferredConnectionAttempt = DeferredConnectionAttempt;
//# sourceMappingURL=DeferredConnectionAttempt.js.map