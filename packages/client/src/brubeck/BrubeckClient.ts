import Debug from 'debug'
import { startNetworkNode } from 'streamr-network'
import { SIDLike, MessageContent } from 'streamr-client-protocol'
import Config, { StrictBrubeckClientConfig, BrubeckClientConfig } from './Config'
import { pOnce, uuid, counterId } from '../utils'
import { Context } from '../utils/Context'
import { StreamrClient } from '../StreamrClient'

import Publisher from './Publisher'
import Subscriber from './Subscriber'
import Resends from './Resends'

const uid = process.pid != null ? process.pid : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

export class BrubeckClient implements Context {
    publisher: Publisher
    subscriber: Subscriber
    resends: Resends
    client: StreamrClient
    options: StrictBrubeckClientConfig
    readonly id
    readonly debug

    constructor(options: BrubeckClientConfig) {
        this.client = new StreamrClient(options)
        this.options = Config(options)
        this.id = counterId(`${this.constructor.name}:${uid}${options.id ? `:${options.id}` : ''}`)
        this.debug = Debug(`Streamr::${this.id}`)
        this.publisher = new Publisher(this)
        this.subscriber = new Subscriber(this)
        this.resends = new Resends(this)
    }

    connect = pOnce(async () => {
        this.disconnect.reset()
        this.debug('connect >>')
        await this.getNode()
        this.debug('connect <<')
    })

    async getAddress() {
        return this.client.getAddress()
    }

    async getSessionToken() {
        return this.client.session.getSessionToken()
    }

    disconnect = pOnce(async () => {
        this.debug('disconnect >>')
        const nodeTask = this.getNode()
        this.connect.reset()
        this.getNode.reset() // allow getting new node again
        const node = await nodeTask
        await Promise.allSettled([
            this.publisher.stop(),
            this.subscriber.stop(),
            node.stop(),
        ])
        this.debug('disconnect <<')
    })

    getNode = pOnce(() => {
        return startNetworkNode({
            disconnectionWaitTime: 200,
            ...this.options.network,
            id: counterId(this.id),
            name: this.id,
        })
    })

    async publish<T extends MessageContent>(
        streamObjectOrId: SIDLike,
        content: T,
        timestamp?: string | number | Date,
        partitionKey?: string | number
    ) {
        return this.publisher.publish<T>(streamObjectOrId, content, timestamp, partitionKey)
    }

    async subscribe<T>(...args: Parameters<Subscriber['subscribe']>) {
        return this.subscriber.subscribe<T>(...args)
    }

    async unsubscribe(...args: Parameters<Subscriber['unsubscribe']>) {
        return this.subscriber.unsubscribe(...args)
    }

    async resend<T>(...args: Parameters<Resends['resend']>) {
        return this.resends.resend<T>(...args)
    }
}
