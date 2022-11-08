import 'reflect-metadata'
import './utils/PatchTsyringe'
import { DependencyContainer } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { AuthenticationInjectionToken, createAuthentication } from './Authentication'

export function initContainer(config: StrictStreamrClientConfig, c: DependencyContainer): void {
    c.register(AuthenticationInjectionToken, {
        useValue: createAuthentication(config)
    })

    c.register(ConfigInjectionToken, { useValue: config })
}
