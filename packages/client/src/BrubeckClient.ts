import 'reflect-metadata'
import { container, DependencyContainer, inject } from 'tsyringe'
import Debug from 'debug'

import { uuid, counterId } from './utils'
import { Context } from './utils/Context'
import BrubeckConfig, { Config, StrictBrubeckClientConfig, BrubeckClientConfig } from './Config'
import { BrubeckContainer } from './Container'

import Publisher from './Publisher'
import Subscriber from './Subscriber'
import Resends from './Resends'
import BrubeckNode from './BrubeckNode'
import Ethereum from './Ethereum'
import Session from './Session'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import { LoginEndpoints } from './LoginEndpoints'
import GroupKeyStoreFactory from './encryption/GroupKeyStoreFactory'
import NodeRegistry from './NodeRegistry'
import { StreamRegistry } from './StreamRegistry'

const uid = process.pid != null ? process.pid : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

/**
 * Take prototype functions from srcInstance and attach them to targetInstance while keeping them bound to srcInstance.
 */
function Plugin(targetInstance: any, srcInstance: any) {
    const descriptors = Object.entries({
        ...Object.getOwnPropertyDescriptors(srcInstance.constructor.prototype),
        ...Object.getOwnPropertyDescriptors(srcInstance)
    })
    descriptors.forEach(([name, { value }]) => {
        if (typeof value !== 'function') { return }

        if (name in targetInstance) {
            return // do nothing if already has property
        }

        // eslint-disable-next-line no-param-reassign
        targetInstance[name] = (...args: any) => {
            return srcInstance[name].call(srcInstance, ...args)
        }
    })
    return srcInstance
}

// Get property names which have a Function-typed value i.e. a method
type MethodNames<T> = {
    // undefined extends T[K] to handle optional properties
    [K in keyof T]: (
        (undefined extends T[K] ? never : T[K]) extends Function ? K : never
    )
}[keyof T]

// Pick only methods of T
type Methods<T> = Pick<T, MethodNames<T>>

// these are mixed in via Plugin function above
// use MethodNames to only grab methods
export interface BrubeckClient extends Ethereum,
    Methods<StreamEndpoints>,
    Methods<Subscriber>,
    // {dis}connect in BrubeckNode are pOnce
    Methods<Omit<BrubeckNode, 'disconnect' | 'connect'>>,
    Methods<LoginEndpoints>,
    Methods<Publisher>,
    Methods<GroupKeyStoreFactory>,
    // Omit sessionTokenPromise because TS complains:
    // Type 'undefined' is not assignable to type 'keyof Session'
    // MethodNames's [K in keyof T] doesn't work if K is optional?
    Methods<Omit<Session, 'sessionTokenPromise'>>,
    Methods<Resends> {
}

class BrubeckClientBase implements Context {
    static generateEthereumAccount = Ethereum.generateEthereumAccount.bind(Ethereum)

    id
    debug
    container: DependencyContainer
    options: StrictBrubeckClientConfig
    loginEndpoints: LoginEndpoints
    streamEndpoints: StreamEndpoints
    cached: StreamEndpointsCached
    ethereum: Ethereum
    publisher: Publisher
    subscriber: Subscriber
    resends: Resends
    session: Session
    node: BrubeckNode
    groupKeyStore: GroupKeyStoreFactory
    streamRegistry: StreamRegistry
    nodeRegistry: NodeRegistry

    constructor(
        rootContainer: DependencyContainer,
        context: Context,
        @inject(Config.Root) options: StrictBrubeckClientConfig,
        node: BrubeckNode,
        ethereum: Ethereum,
        session: Session,
        loginEndpoints: LoginEndpoints,
        streamEndpoints: StreamEndpoints,
        cached: StreamEndpointsCached,
        resends: Resends,
        publisher: Publisher,
        subscriber: Subscriber,
        groupKeyStore: GroupKeyStoreFactory,
        streamRegistry: StreamRegistry,
        nodeRegistry: NodeRegistry
    ) { // eslint-disable-line function-paren-newline
        this.options = options!
        this.id = context.id
        this.debug = context.debug
        this.container = rootContainer
        this.loginEndpoints = loginEndpoints!
        this.streamEndpoints = streamEndpoints!
        this.ethereum = ethereum!
        this.publisher = publisher!
        this.cached = cached
        this.subscriber = subscriber!
        this.resends = resends!
        this.session = session!
        this.node = node!
        this.groupKeyStore = groupKeyStore
        this.streamRegistry = streamRegistry
        this.nodeRegistry = nodeRegistry
        Plugin(this, this.loginEndpoints)
        Plugin(this, this.streamEndpoints)
        Plugin(this, this.ethereum)
        Plugin(this, this.publisher)
        Plugin(this, this.subscriber)
        Plugin(this, this.resends)
        Plugin(this, this.session)
        Plugin(this, this.node)
        Plugin(this, this.groupKeyStore)
        Plugin(this, this.streamRegistry)
        Plugin(this, this.nodeRegistry)
    }

    async connect(): Promise<void> {
        const tasks = [
            this.publisher.start(),
            this.node.connect(),
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    }

    async disconnect(): Promise<void> {
        const tasks = [
            this.node.disconnect(),
            this.resends.stop(),
            this.publisher.stop(),
            this.subscriber.stop(),
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    }
}

export class BrubeckClient extends BrubeckClientBase {
    container
    constructor(options: BrubeckClientConfig, parentContainer = container) {
        const c = parentContainer.createChildContainer()
        const config = BrubeckConfig(options)
        const id = counterId(`BrubeckClient:${uid}${config.id ? `:${config.id}` : ''}`)
        const debug = Debug(`Streamr::${id}`)
        debug('create')

        const rootContext = {
            id,
            debug
        }

        c.register(Context as any, {
            useValue: rootContext
        })
        c.register(BrubeckContainer, {
            useValue: c
        })
        c.register(Config.Root, {
            useValue: config
        })
        c.register(Config.Auth, {
            useValue: config.auth
        })
        c.register(Config.Ethereum, {
            useValue: config
        })
        c.register(Config.NodeRegistry, {
            useValue: config.nodeRegistry
        })
        c.register(Config.Network, {
            useValue: config.network
        })
        c.register(Config.Connection, {
            useValue: config
        })
        c.register(Config.Subscribe, {
            useValue: config
        })
        c.register(Config.Publish, {
            useValue: config
        })
        c.register(Config.Encryption, {
            useValue: config
        })
        c.register(Config.Cache, {
            useValue: config.cache
        })

        super(
            c,
            c.resolve<Context>(Context as any),
            config,
            c.resolve<BrubeckNode>(BrubeckNode),
            c.resolve<Ethereum>(Ethereum),
            c.resolve<Session>(Session),
            c.resolve<LoginEndpoints>(LoginEndpoints),
            c.resolve<StreamEndpoints>(StreamEndpoints),
            c.resolve<StreamEndpointsCached>(StreamEndpointsCached),
            c.resolve<Resends>(Resends),
            c.resolve<Publisher>(Publisher),
            c.resolve<Subscriber>(Subscriber),
            c.resolve<GroupKeyStoreFactory>(GroupKeyStoreFactory),
            c.resolve<StreamRegistry>(StreamRegistry),
            c.resolve<NodeRegistry>(NodeRegistry)
        )
        this.container = c
    }
}

export { BrubeckClient as StreamrClient }
export { ResendOptions } from './Resends'
export { BrubeckClientConfig as StreamrClientOptions } from './Config'
