import { PeerId } from '../PeerInfo';
export declare class DeferredConnectionAttempt {
    private eventEmitter;
    private connectionAttemptPromise;
    constructor();
    getPromise(): Promise<PeerId>;
    resolve(targetPeerId: PeerId): void;
    reject(reason: Error | string): void;
}
