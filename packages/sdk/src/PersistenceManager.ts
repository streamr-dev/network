import 'reflect-metadata'

import { join } from 'path'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from './identity/Identity'
import { DestroySignal } from './DestroySignal'
import { LoggerFactory } from './utils/LoggerFactory'
import { Persistence } from './utils/persistence/Persistence'
import ServerPersistence from './utils/persistence/ServerPersistence'

export const NAMESPACES = {
    ENCRYPTION_KEYS: 'EncryptionKeys',
    LATEST_ENCRYPTION_KEY_IDS: 'LatestEncryptionKeyIds'
}

@scoped(Lifecycle.ContainerScoped)
export class PersistenceManager {

    private persistence?: ServerPersistence
    private readonly identity: Identity
    private readonly loggerFactory: LoggerFactory

    /* eslint-disable indent */
    constructor(
        @inject(IdentityInjectionToken) identity: Identity,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory
    ) {
        this.identity = identity
        this.loggerFactory = loggerFactory
        destroySignal.onDestroy.listen(() => {
            if (this.persistence !== undefined) {
                return this.persistence.close()
            }
        })
    }

    private async ensureInitialized() {
        this.persistence ??= await ServerPersistence.createInstance({
            loggerFactory: this.loggerFactory,
            ownerId: await this.identity.getUserId(),
            namespaces: Object.values(NAMESPACES),
            migrationsPath: join(__dirname, 'encryption/migrations') // TODO move migrations to some generic place?
        })
    }

    async getPersistence(namespace: string): Promise<Persistence> {
        await this.ensureInitialized()
        return {
            get: (key: string): Promise<string | undefined> => {
                return this.persistence!.get(key, namespace)
            },
            set: (key: string, value: string): Promise<void> => {
                return this.persistence!.set(key, value, namespace)
            }
        }
    }
}
