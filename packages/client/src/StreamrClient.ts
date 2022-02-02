import 'reflect-metadata'
import './utils/PatchTsyringe'
import { container as rootContainer, DependencyContainer, inject } from 'tsyringe'

import Ethereum from './Ethereum'
import { uuid, counterId, pOnce } from './utils'
import { Debug } from './utils/log'
import { Context } from './utils/Context'
import BrubeckConfig, { Config, StrictBrubeckClientConfig, BrubeckClientConfig } from './Config'
import { BrubeckContainer } from './Container'

import Publisher from './Publisher'
import Subscriber from './Subscriber'
import Resends from './Resends'
import ResendSubscribe, { ResendSubscription } from './ResendSubscribe'
import BrubeckNode from './BrubeckNode'
import Session from './Session'
import { DestroySignal } from './DestroySignal'
import { StreamEndpoints } from './StreamEndpoints'
import { StreamEndpointsCached } from './StreamEndpointsCached'
import { LoginEndpoints } from './LoginEndpoints'
import DataUnions from './dataunion'
import GroupKeyStoreFactory from './encryption/GroupKeyStoreFactory'
import { NodeRegistry } from './NodeRegistry'
import { StreamRegistry } from './StreamRegistry'
import { Methods, Plugin } from './utils/Plugin'

let uid: string = process.pid != null
    // Use process id in node uid.
    ? `${process.pid}`
    // Fall back to `uuid()` later (see initContainer). Doing it here will break browser projects
    // that utilize server-side rendering (no `window` while build's target is `web`).
    : ''

// these are mixed in via Plugin function above
// use MethodNames to only grab methods
export interface StreamrClient extends Ethereum,
    Methods<StreamEndpoints>,
    Methods<Omit<Subscriber, 'subscribe'>>,
    Methods<ResendSubscribe>,
    Methods<StreamRegistry>,
    // connect/pOnce in BrubeckNode are pOnce, we override them anyway
    Methods<Omit<BrubeckNode, 'destroy' | 'connect'>>,
    Methods<LoginEndpoints>,
    Methods<Publisher>,
    Methods<NodeRegistry>,
    Methods<DataUnions>,
    Methods<GroupKeyStoreFactory>,
    // Omit sessionTokenPromise because TS complains:
    // Type 'undefined' is not assignable to type 'keyof Session'
    // MethodNames's [K in keyof T] doesn't work if K is optional?
    Methods<Omit<Session, 'sessionTokenPromise'>>,
    Methods<Resends> {
}

class StreamrClientBase implements Context {
    static generateEthereumAccount = Ethereum.generateEthereumAccount.bind(Ethereum)

    id
    debug
    subscribe
    onDestroy
    isDestroyed

    constructor(
        public container: DependencyContainer,
        public context: Context,
        @inject(Config.Root) public options: StrictBrubeckClientConfig,
        public node: BrubeckNode,
        public ethereum: Ethereum,
        public session: Session,
        public loginEndpoints: LoginEndpoints,
        public streamEndpoints: StreamEndpoints,
        public cached: StreamEndpointsCached,
        public resends: Resends,
        public publisher: Publisher,
        public subscriber: Subscriber,
        public resendSubscriber: ResendSubscribe,
        public groupKeyStore: GroupKeyStoreFactory,
        protected destroySignal: DestroySignal,
        public dataunions: DataUnions,
        public streamRegistry: StreamRegistry,
        public nodeRegistry: NodeRegistry
    ) { // eslint-disable-line function-paren-newline
        this.id = context.id
        this.debug = context.debug
        Plugin(this, this.loginEndpoints)
        Plugin(this, this.streamEndpoints)
        Plugin(this, this.ethereum)
        Plugin(this, this.publisher)
        Plugin(this, this.subscriber)
        Plugin(this, this.resends)
        Plugin(this, this.resendSubscriber)
        Plugin(this, this.session)
        Plugin(this, this.node)
        Plugin(this, this.groupKeyStore)
        Plugin(this, this.dataunions)
        Plugin(this, this.streamRegistry)
        Plugin(this, this.nodeRegistry)

        // override subscribe with resendSubscriber's subscribe+resend
        this.subscribe = resendSubscriber.subscribe.bind(resendSubscriber)
        this.onDestroy = this.destroySignal.onDestroy.bind(this.destroySignal)
        this.isDestroyed = this.destroySignal.isDestroyed.bind(this.destroySignal)
    }

    connect = pOnce(async () => {
        await this.node.startNode()
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
        this.connect.reset() // reset connect (will error on next call)
        const tasks = [
            this.destroySignal.destroy().then(() => undefined),
            this.resends.stop(),
            this.publisher.stop(),
            this.subscriber.stop(),
        ]

        await Promise.allSettled(tasks)
        await Promise.all(tasks)
    })

    enableDebugLogging(prefix = 'Streamr*') { // eslint-disable-line class-methods-use-this
        Debug.enable(prefix)
    }

    disableDebugLogging() { // eslint-disable-line class-methods-use-this
        Debug.disable()
    }
}

/**
 * @internal
 */
export function initContainer(options: BrubeckClientConfig = {}, parentContainer = rootContainer) {
    const c = parentContainer.createChildContainer()
    const config = BrubeckConfig(options)
    uid = uid || `${uuid().slice(-4)}${uuid().slice(0, 4)}`
    const id = counterId(`StreamrClient:${uid}${config.id ? `:${config.id}` : ''}`)
    const debug = Debug(id)
    // @ts-expect-error not in types
    if (!debug.inspectOpts) {
        // @ts-expect-error not in types
        debug.inspectOpts = {}
    }
    // @ts-expect-error not in types
    Object.assign(debug.inspectOpts, {
        // @ts-expect-error not in types
        ...debug.inspectOpts,
        ...config.debug.inspectOpts
    })
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

    return {
        config,
        childContainer: c,
        rootContext,
    }
}

export class StreamrClient extends StreamrClientBase {
    constructor(options: BrubeckClientConfig = {}, parentContainer = rootContainer) {
        const { childContainer: c, config } = initContainer(options, parentContainer)
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
            c.resolve<ResendSubscribe>(ResendSubscribe),
            c.resolve<GroupKeyStoreFactory>(GroupKeyStoreFactory),
            c.resolve<DestroySignal>(DestroySignal),
            c.resolve<DataUnions>(DataUnions),
            c.resolve<StreamRegistry>(StreamRegistry),
            c.resolve<NodeRegistry>(NodeRegistry),
        )
    }
}

export const Dependencies = {
    Context,
    BrubeckNode,
    NodeRegistry,
    Session,
    LoginEndpoints,
    StreamEndpoints,
    StreamEndpointsCached,
    Resends,
    Publisher,
    Subscriber,
    GroupKeyStoreFactory,
    DestroySignal,
    DataUnions,
}

export { ResendOptionsStrict as ResendOptions } from './Resends'

export { BrubeckClientConfig as StreamrClientOptions } from './Config'

export { ResendSubscription }
