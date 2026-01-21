import { inject, Lifecycle, scoped } from 'tsyringe'
import { Identity, IdentityInjectionToken } from './identity/Identity'
import { DestroySignal } from './DestroySignal'
import { LoggerFactory } from './utils/LoggerFactory'
import type { Persistence as PersistenceInterface } from './Persistence.types'
import { Persistence } from '@/Persistence'

export const NAMESPACES = {
    ENCRYPTION_KEYS: 'EncryptionKeys',
    LATEST_ENCRYPTION_KEY_IDS: 'LatestEncryptionKeyIds'
}

@scoped(Lifecycle.ContainerScoped)
export class PersistenceManager {

    private persistence?: Persistence
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
        this.persistence ??= await Persistence.createInstance({
            loggerFactory: this.loggerFactory,
            ownerId: await this.identity.getUserId(),
            namespaces: Object.values(NAMESPACES),
            migrationsUrl: new URL('./encryption/migrations', `file://${__dirname}/`),
        })
    }

    async getPersistence(namespace: string): Promise<PersistenceInterface> {
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
