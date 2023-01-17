import { StreamID } from '@streamr/protocol'
import { GroupKey } from '../encryption/GroupKey'
import { GroupKeyStore } from '../encryption/GroupKeyStore'
import { LitProtocolKeyStore } from '../encryption/LitProtocolKeyStore'
import crypto from 'crypto'
import { uuid } from '../utils/uuid'

export interface GroupKeySequence {
    current: GroupKey
    next?: GroupKey
}

export class GroupKeyQueue {

    private currentGroupKey: GroupKey | undefined
    private queuedGroupKey: GroupKey | undefined // a group key queued to be rotated into use after the call to useGroupKey
    private readonly streamId: StreamID
    private readonly store: GroupKeyStore
    private readonly litProtocolKeyStore: LitProtocolKeyStore

    constructor(streamId: StreamID, store: GroupKeyStore, litProtocolKeyStore: LitProtocolKeyStore) {
        this.streamId = streamId
        this.store = store
        this.litProtocolKeyStore = litProtocolKeyStore
    }

    async useGroupKey(): Promise<GroupKeySequence> {
        // Ensure we have a current key by picking a queued key or generating a new one
        if (!this.currentGroupKey) {
            this.currentGroupKey = this.queuedGroupKey || await this.rekey()
            this.queuedGroupKey = undefined
        }
        // Always return an array consisting of currentGroupKey and queuedGroupKey (latter may be undefined)
        const result: GroupKeySequence = {
            current: this.currentGroupKey!,
            next: this.queuedGroupKey,
        }
        // Perform the rotate if there's a next key queued
        if (this.queuedGroupKey) {
            this.currentGroupKey = this.queuedGroupKey
            this.queuedGroupKey = undefined
        }
        return result
    }

    async rotate(newKey?: GroupKey): Promise<GroupKey> {
        if (newKey === undefined) {
            newKey = await this.generateNewKey()
        }
        this.queuedGroupKey = newKey
        await this.store.add(newKey, this.streamId)
        return newKey
    }

    async rekey(newKey?: GroupKey): Promise<GroupKey> {
        if (newKey === undefined) {
            newKey = await this.generateNewKey()
        }
        await this.store.add(newKey, this.streamId)
        this.currentGroupKey = newKey
        this.queuedGroupKey = undefined
        return newKey
    }

    private async generateNewKey(): Promise<GroupKey> {
        const keyData = crypto.randomBytes(32)
        // 1st try lit-protocol, if a key cannot be generated and stored, then generate group key locally
        const litProtocolGroupKey = await this.litProtocolKeyStore.store(this.streamId, keyData)
        return litProtocolGroupKey !== undefined ? litProtocolGroupKey : new GroupKey(uuid('GroupKey'), keyData)
    }
}
