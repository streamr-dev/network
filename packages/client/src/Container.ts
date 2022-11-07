import 'reflect-metadata'
import './utils/PatchTsyringe'
import { DependencyContainer } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from './Config'
import { AuthenticationInjectionToken, createAuthentication } from './Authentication'

export function initContainer(config: StrictStreamrClientConfig, c: DependencyContainer): void {
    c.register(AuthenticationInjectionToken, {
        useValue: createAuthentication(config.auth, config.contracts)
    })

    // associate values to config tokens
    const configTokens: [symbol, object][] = [
        [ConfigInjectionToken.Root, config],
        [ConfigInjectionToken.Ethereum, config.contracts],
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
