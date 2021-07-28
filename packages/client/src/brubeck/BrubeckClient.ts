import 'reflect-metadata'
import { container, inject } from 'tsyringe'
import Debug from 'debug'
import { BrubeckContainer } from './Container'
import BrubeckConfig, { Config, StrictBrubeckClientConfig, BrubeckClientConfig } from './Config'
import { uuid, counterId } from '../utils'
import { Context } from '../utils/Context'

import Publisher from './Publisher'
import Subscriber from './Subscriber'
import Resends from './Resends'
import BrubeckNode from './BrubeckNode'
import Ethereum from './Ethereum'
import Session from './Session'
import { StreamEndpoints } from './StreamEndpoints'
import { LoginEndpoints } from './LoginEndpoints'
import {BrubeckCached} from './Cached'

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

// these are mixed in via Plugin function above
export interface BrubeckClient extends Ethereum,
    Omit<StreamEndpoints, 'options'>,
    Omit<Session, 'options' | 'loginEndpoints'>,
    Omit<Subscriber, 'client'>,
    Omit<BrubeckNode, 'options'>,
    Omit<LoginEndpoints, 'options'>,
    Omit<Publisher, 'client'>,
    Omit<Resends, 'options'> {}

class BrubeckClientBase implements Context {
    id
    debug
    options: StrictBrubeckClientConfig
    loginEndpoints: LoginEndpoints
    streamEndpoints: StreamEndpoints
    ethereum: Ethereum
    publisher: Publisher
    subscriber: Subscriber
    resends: Resends
    session: Session
    node: BrubeckNode

    constructor(
        context: Context,
        @inject(Config.Root) options: StrictBrubeckClientConfig,
        node: BrubeckNode,
        ethereum: Ethereum,
        session: Session,
        loginEndpoints: LoginEndpoints,
        streamEndpoints: StreamEndpoints,
        resends: Resends,
        publisher: Publisher,
        subscriber: Subscriber,
    ) { // eslint-disable-line function-paren-newline
        this.options = options!
        this.id = context.id
        this.debug = context.debug
        this.loginEndpoints = loginEndpoints!
        this.streamEndpoints = streamEndpoints!
        this.ethereum = ethereum!
        this.publisher = publisher!
        this.subscriber = subscriber!
        this.resends = resends!
        this.session = session!
        this.node = node!
        Plugin(this, this.loginEndpoints)
        Plugin(this, this.streamEndpoints)
        Plugin(this, this.ethereum)
        Plugin(this, this.publisher)
        Plugin(this, this.subscriber)
        Plugin(this, this.resends)
        Plugin(this, this.session)
        Plugin(this, this.node)
    }
}

export class BrubeckClient extends BrubeckClientBase {
    container
    constructor(options: BrubeckClientConfig) {
        const c = container.createChildContainer()
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
        c.register(Config.Cache, {
            useValue: config.cache
        })

        super(
            c.resolve<Context>(Context as any),
            config,
            c.resolve<BrubeckNode>(BrubeckNode),
            c.resolve<Ethereum>(Ethereum),
            c.resolve<Session>(Session),
            c.resolve<LoginEndpoints>(LoginEndpoints),
            c.resolve<StreamEndpoints>(StreamEndpoints),
            c.resolve<Resends>(Resends),
            c.resolve<Publisher>(Publisher),
            c.resolve<Subscriber>(Subscriber),
        )
        this.container = c
    }
}
