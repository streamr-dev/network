import { StreamID } from '@streamr/protocol'
import { EthereumAddress, Logger } from '@streamr/utils'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { StreamrClientEventEmitter } from '../events'
import { PersistenceManager, NAMESPACES } from '../PersistenceManager'
import { LoggerFactory } from '../utils/LoggerFactory'
import { GroupKey } from './GroupKey'

/**
 * @privateRemarks
 *
 * In the client API we use the term EncryptionKey instead of GroupKey.
 * The GroupKey name comes from the protocol. TODO: we could rename all classes
 * and methods to use the term EncryptionKey (except protocol-classes, which
 * should use the protocol level term GroupKey)
 */
export interface UpdateEncryptionKeyOptions {
    /**
     * The Stream ID for which this key update applies.
     */
    streamId: string

    /**
     * Determines how the new key will be distributed to subscribers.
     *
     * @remarks
     * With `rotate`, the new key will be sent to the stream alongside the next published message. The key will be
     * encrypted using the current key. Only after this will the new key be used for publishing. This
     * provides forward secrecy.
     *
     * With `rekey`, we for each subscriber to fetch the new key individually. This ensures each subscriber's
     * permissions are revalidated before they are given the new key.
     */
    distributionMethod: 'rotate' | 'rekey'

    /**
     * Provide a specific key to be used. If left undefined, a new key is generated automatically.
     */
    key?: GroupKey
}

function formKey(keyId: string, publisherId: string): string {
    return `${publisherId}::${keyId}`
}

function formKey2(publisherId: EthereumAddress, streamId: StreamID): string {
    return `${publisherId}::${streamId}`
}

/**
 * TODO: rename to e.g. `LocalGroupKeyStore` for clarity
 */
@scoped(Lifecycle.ContainerScoped)
export class GroupKeyStore {

    private persistenceManager: PersistenceManager
    private eventEmitter: StreamrClientEventEmitter
    private readonly logger: Logger

    constructor(
        @inject(PersistenceManager) persistenceManager: PersistenceManager,
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(StreamrClientEventEmitter) eventEmitter: StreamrClientEventEmitter
    ) {
        this.persistenceManager = persistenceManager
        this.eventEmitter = eventEmitter
        this.logger = loggerFactory.createLogger(module)
    }

    async get(keyId: string, publisherId: EthereumAddress): Promise<GroupKey | undefined> {
        const persistence = await this.persistenceManager.getPersistence(NAMESPACES.ENCRYPTION_KEYS)
        const value = await persistence.get(formKey(keyId, publisherId))
        if (value !== undefined) {
            return new GroupKey(keyId, Buffer.from(value, 'hex'))
        } else {
            return this.getLegacyKey(keyId)
        }
    }

    /**
     * Legacy keys refer to group keys migrated from a previous version of the client where group keys were not tied
     * to a specific publisherId, therefore any publisherId for a given legacy key id is considered a match.
     *
     * TODO: remove this functionality in the future
     */
    private async getLegacyKey(keyId: string): Promise<GroupKey | undefined> {
        const persistence = await this.persistenceManager.getPersistence(NAMESPACES.ENCRYPTION_KEYS)
        const value = await persistence.get(formKey(keyId, 'LEGACY'))
        return value !== undefined ? new GroupKey(keyId, Buffer.from(value, 'hex')) : undefined
    }

    async add(key: GroupKey, publisherId: EthereumAddress): Promise<void> {
        const persistence = await this.persistenceManager.getPersistence(NAMESPACES.ENCRYPTION_KEYS)
        this.logger.debug('add key %s', key.id)
        await persistence.set(formKey(key.id, publisherId), Buffer.from(key.data).toString('hex'))
        this.eventEmitter.emit('addGroupKey', key)
    }

    async addPublisherKeyId(keyId: string, publisherId: EthereumAddress, streamId: StreamID): Promise<void> {
        const persistence = await this.persistenceManager.getPersistence(NAMESPACES.PUBLISHER_KEY_IDS)
        this.logger.debug('add publisherKeyId %s', keyId)
        await persistence.set(formKey2(publisherId, streamId), keyId)
    }

    async getPublisherKeyId(publisherId: EthereumAddress, streamId: StreamID): Promise<string | undefined> {
        const persistence = await this.persistenceManager.getPersistence(NAMESPACES.PUBLISHER_KEY_IDS)
        const value = await persistence.get(formKey2(publisherId, streamId))
        return value
    }
}
