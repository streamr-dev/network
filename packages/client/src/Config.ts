/**
 * New Brubeck Configuration.
 * Old Config in ConfigBase.
 * TODO: Disolve ConfigBase.
 */
import 'reflect-metadata'

/**
 * DI Injection tokens for pieces of config.
 * tsyringe needs a concrete value to use as the injection token.
 * In the case of interfaces & types, these have no runtime value
 * so we have to introduce some token to use for their injection.
 * These symbols represent subsections of the full config.
 *
 * For example:
 * config.ethereum can be injected with a token like: @inject(Config.Ethereum)
 */
const BrubeckConfigInjection = {
    Root: Symbol('Config.Root'),
    Auth: Symbol('Config.Auth'),
    Ethereum: Symbol('Config.Ethereum'),
    Network: Symbol('Config.Network'),
    Connection: Symbol('Config.Connection'),
    Subscribe: Symbol('Config.Subscribe'),
    Publish: Symbol('Config.Publish'),
    Cache: Symbol('Config.Cache'),
    StorageNodeRegistry: Symbol('Config.StorageNodeRegistry'),
    Encryption: Symbol('Config.Encryption'),
}

export * from './ConfigBase'

export { BrubeckConfigInjection as Config }
