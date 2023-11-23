// Connection locks are independent of the existence of connections
// that is why this class is needed

import { PeerIDKey } from '../helpers/PeerID'

export type LockID = string

export class ConnectionLockHandler {

    private localLocks: Map<PeerIDKey, Set<LockID>> = new Map()
    private remoteLocks: Map<PeerIDKey, Set<LockID>> = new Map()
    // TODO: remove weakLocks use localLocks instead. When opening weakLocks from the ConnectioManager,
    // simply do not send lock requests.
    private weakLocks: Set<PeerIDKey> = new Set()

    public getNumberOfLocalLockedConnections(): number {
        return this.localLocks.size
    }

    public getNumberOfRemoteLockedConnections(): number {
        return this.remoteLocks.size
    }

    public getNumberOfWeakLockedConnections(): number {
        return this.weakLocks.size
    }

    public isLocalLocked(id: PeerIDKey, lockId?: LockID): boolean {
        if (lockId === undefined) {
            return this.localLocks.has(id)
        } else {
            return this.localLocks.has(id) && this.localLocks.get(id)!.has(lockId)
        }
    }

    public isRemoteLocked(id: PeerIDKey, lockId?: LockID): boolean {
        if (lockId === undefined) {
            return this.remoteLocks.has(id)
        } else {
            if (this.remoteLocks.has(id) && this.remoteLocks.get(id)!.has(lockId)) {
                return true
            } else {
                return false
            }
        }
    }

    private isWeakLocked(id: PeerIDKey): boolean {
        return this.weakLocks.has(id)
    }

    public isLocked(id: PeerIDKey): boolean {
        return (this.isLocalLocked(id) || this.isRemoteLocked(id) || this.isWeakLocked(id))
    }

    public addLocalLocked(id: PeerIDKey, lockId: LockID): void {
        if (!this.localLocks.has(id)) {
            this.localLocks.set(id, new Set())
        }
        this.localLocks.get(id)!.add(lockId)
    }

    public addRemoteLocked(id: PeerIDKey, lockId: LockID): void {
        if (!this.remoteLocks.has(id)) {
            this.remoteLocks.set(id, new Set())
        }
        this.remoteLocks.get(id)!.add(lockId)
    }

    public addWeakLocked(id: PeerIDKey): void {
        this.weakLocks.add(id)
    }

    public removeLocalLocked(id: PeerIDKey, lockId: LockID): void {
        if (this.localLocks.has(id)) {
            this.localLocks.get(id)?.delete(lockId)
            if (this.localLocks.get(id)?.size === 0) {
                this.localLocks.delete(id)
            }
        }
    }

    public removeRemoteLocked(id: PeerIDKey, lockId: LockID): void {
        if (this.remoteLocks.has(id)) {
            this.remoteLocks.get(id)?.delete(lockId)
            if (this.remoteLocks.get(id)?.size === 0) {
                this.remoteLocks.delete(id)
            }
        }
    }

    public removeWeakLocked(id: PeerIDKey): void {
        this.weakLocks.delete(id)
    }

    public clearAllLocks(id: PeerIDKey): void {
        this.localLocks.delete(id)
        this.remoteLocks.delete(id)
        this.weakLocks.delete(id)
    }

    public clear(): void {
        this.localLocks.clear()
        this.remoteLocks.clear()
        this.weakLocks.clear()
    }
}
