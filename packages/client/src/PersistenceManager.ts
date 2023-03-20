import 'reflect-metadata'

import { join } from 'path'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { DestroySignal } from './DestroySignal'
import { LoggerFactory } from './utils/LoggerFactory'
import { Persistence } from './utils/persistence/Persistence'
import ServerPersistence from './utils/persistence/ServerPersistence'

@scoped(Lifecycle.ContainerScoped)
export class PersistenceManager {

    private persistence: ServerPersistence<string, string> | undefined
    private readonly authentication: Authentication
    private readonly loggerFactory: LoggerFactory

    /* eslint-disable indent */
    constructor(
        @inject(AuthenticationInjectionToken) authentication: Authentication,
        destroySignal: DestroySignal,
        loggerFactory: LoggerFactory
    ) {
        this.authentication = authentication
        this.loggerFactory = loggerFactory
        destroySignal.onDestroy.listen(() => {
            if (this.persistence !== undefined) {
                return this.persistence.close()
            }
        })
    }

    private async ensureInitialized() {
        if (this.persistence === undefined) {
            this.persistence = new ServerPersistence({
                loggerFactory: this.loggerFactory,
                clientId: await this.authentication.getAddress(),
                migrationsPath: join(__dirname, 'encryption/migrations') // TODO move migrations to some generic place?
            })
        }
    }

    async getPersistence(namespace: string): Promise<Persistence<string, string>> {
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
