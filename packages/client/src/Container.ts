import 'reflect-metadata'
import './utils/PatchTsyringe'
import { DependencyContainer } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { AuthenticationInjectionToken, createAuthentication } from './Authentication'
import { counterId } from './utils/utils'
import { uuid } from './utils/uuid'

function generateClientId(): string {
    return counterId(process.pid ? `${process.pid}` : `${uuid().slice(-4)}${uuid().slice(0, 4)}`)
}

/**
 * DI Token for injecting the Client container.
 * Use sparingly, but can be necessary for factories
 * or to work around circular dependencies.
 */
export const BrubeckContainer = Symbol('BrubeckContainer')

export const StreamrClientIdToken = Symbol('StreamrClientId')

export function initContainer(config: StrictStreamrClientConfig, c: DependencyContainer): void {
    c.register(StreamrClientIdToken, {
        useValue: config.id ?? generateClientId()
    })
    c.register(BrubeckContainer, {
        useValue: c
    })
    c.register(AuthenticationInjectionToken, {
        useValue: createAuthentication(config.auth, config)
    })

    // associate values to config tokens
    const configTokens: [symbol, object][] = [
        [ConfigInjectionToken.Root, config],
        [ConfigInjectionToken.Auth, config.auth],
        [ConfigInjectionToken.Ethereum, config],
        [ConfigInjectionToken.Network, config.network],
        [ConfigInjectionToken.Connection, config],
        [ConfigInjectionToken.Subscribe, config],
        [ConfigInjectionToken.Publish, config],
        [ConfigInjectionToken.Decryption, config.decryption],
        [ConfigInjectionToken.Cache, config.cache],
        // eslint-disable-next-line no-underscore-dangle
        [ConfigInjectionToken.Timeouts, config._timeouts],
    ]

    configTokens.forEach(([token, useValue]) => {
        c.register(token, { useValue })
    })
}
