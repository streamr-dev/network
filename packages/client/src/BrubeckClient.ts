import 'reflect-metadata'
import { container, DependencyContainer, inject } from 'tsyringe'
import Debug from 'debug'

import { uuid, counterId, pOnce } from './utils'
import { Context } from './utils/Context'
import BrubeckConfig, { Config, StrictBrubeckClientConfig, BrubeckClientConfig } from './Config'
import { BrubeckContainer } from './Container'

import Publisher from './Publisher'
import Subscriber from './Subscriber'
import Resends from './Resends'
import BrubeckNode from './BrubeckNode'
import Ethereum from './Ethereum'
import { DestroySignal } from './DestroySignal'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import GroupKeyStoreFactory from './encryption/GroupKeyStoreFactory'
import { NodeRegistry } from './NodeRegistry'
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
    Methods<StreamRegistry>,
    Methods<NodeRegistry>,
    // connect/pOnce in BrubeckNode are pOnce, we override them anyway
    Methods<Omit<BrubeckNode, 'destroy' | 'connect'>>,
    Methods<Publisher>,
    Methods<GroupKeyStoreFactory>,
    // Omit sessionTokenPromise because TS complains:
    // Type 'undefined' is not assignable to type 'keyof Session'
    // MethodNames's [K in keyof T] doesn't work if K is optional?
    // Methods<Omit<Session, 'sessionTokenPromise'>>,
    Methods<Resends> {
}

class BrubeckClientBase implements Context {
    static generateEthereumAccount = Ethereum.generateEthereumAccount.bind(Ethereum)

    id
    debug
    container: DependencyContainer
    options: StrictBrubeckClientConfig
    streamEndpoints: StreamEndpoints
    cached: StreamEndpointsCached
    ethereum: Ethereum
    publisher: Publisher
    subscriber: Subscriber
    resends: Resends
    node: BrubeckNode
    groupKeyStore: GroupKeyStoreFactory
    protected destroySignal: DestroySignal
    streamRegistry: StreamRegistry
    nodeRegistry: NodeRegistry

    constructor(
        rootContainer: DependencyContainer,
        context: Context,
        @inject(Config.Root) options: StrictBrubeckClientConfig,
        node: BrubeckNode,
        ethereum: Ethereum,
        streamEndpoints: StreamEndpoints,
        cached: StreamEndpointsCached,
        resends: Resends,
        publisher: Publisher,
        subscriber: Subscriber,
        groupKeyStore: GroupKeyStoreFactory,
        destroySignal: DestroySignal,
        streamRegistry: StreamRegistry,
        nodeRegistry: NodeRegistry
    ) { // eslint-disable-line function-paren-newline
        this.options = options!
        this.id = context.id
        this.debug = context.debug
        this.container = rootContainer
        this.streamEndpoints = streamEndpoints!
        this.ethereum = ethereum!
        this.publisher = publisher!
        this.cached = cached
        this.subscriber = subscriber!
        this.resends = resends!
        this.node = node!
        this.groupKeyStore = groupKeyStore
        this.destroySignal = destroySignal
        this.streamRegistry = streamRegistry
        this.nodeRegistry = nodeRegistry
        Plugin(this, this.streamEndpoints)
        Plugin(this, this.ethereum)
        Plugin(this, this.publisher)
        Plugin(this, this.subscriber)
        Plugin(this, this.resends)
        Plugin(this, this.node)
        Plugin(this, this.groupKeyStore)
        Plugin(this, this.streamRegistry)
        Plugin(this, this.nodeRegistry)
    }

    connect = pOnce(async () => {
        await this.node.connect()
        const tasks = [
            this.publisher.start(),
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    })

    /** @deprecated */
    disconnect() {
        return this.destroy()
    }

    destroy = pOnce(async () => {
        this.connect.reset()
        const tasks = [
            this.destroySignal.destroy().then(() => undefined),
            this.resends.stop(),
            this.publisher.stop(),
            this.subscriber.stop(),
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    })
}

export class BrubeckClient extends BrubeckClientBase {
    container
    constructor(options: BrubeckClientConfig, parentContainer = container) {
        const c = parentContainer.createChildContainer()
        const config = BrubeckConfig(options)
        const id = counterId(`BrubeckClient:${uid}${config.id ? `:${config.id}` : ''}`)
        const debug = Debug(`Streamr::${id}`)
        // @ts-expect-error not in types
        debug.inspectOpts = {
            // @ts-expect-error not in types
            ...debug.inspectOpts,
            ...config.debug.inspectOpts
        }
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

        // associate values to config tokens
        const configTokens: [symbol, object][] = [
            [Config.Root, config],
            [Config.Auth, config.auth],
            [Config.Ethereum, config],
            [Config.NodeRegistry, config.nodeRegistry],
            [Config.Network, config.network],
            [Config.Connection, config],
            [Config.Subscribe, config],
            [Config.Publish, config],
            [Config.Encryption, config],
            [Config.Cache, config.cache],
        ]

        configTokens.forEach(([token, useValue]) => {
            c.register(token, { useValue })
        })

        super(
            c,
            c.resolve<Context>(Context as any),
            config,
            c.resolve<BrubeckNode>(BrubeckNode),
            c.resolve<Ethereum>(Ethereum),
            c.resolve<StreamEndpoints>(StreamEndpoints),
            c.resolve<StreamEndpointsCached>(StreamEndpointsCached),
            c.resolve<Resends>(Resends),
            c.resolve<Publisher>(Publisher),
            c.resolve<Subscriber>(Subscriber),
            c.resolve<GroupKeyStoreFactory>(GroupKeyStoreFactory),
            c.resolve<DestroySignal>(DestroySignal),
            c.resolve<StreamRegistry>(StreamRegistry),
            c.resolve<NodeRegistry>(NodeRegistry)
        )
        this.container = c
    }
}

export { BrubeckClient as StreamrClient }
export { ResendOptions } from './Resends'
export { BrubeckClientConfig as StreamrClientOptions } from './Config'
