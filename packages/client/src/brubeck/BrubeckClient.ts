import { NetworkNode, startNetworkNode } from 'streamr-network'
import { StreamrClientOptions } from '../Config'
import { pOnce, uuid, counterId } from '../utils'
import { StreamrClient } from '../StreamrClient'
import Publisher from './Publisher'
import Debug from 'debug'

const uid = process.pid != null ? process.pid : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

export class BrubeckClient {
    publisher: Publisher
    client: StreamrClient
    private node?: NetworkNode
    id
    debug

    constructor(options: StreamrClientOptions) {
        this.client = new StreamrClient(options)
        this.id = counterId(`${this.constructor.name}:${uid}${options.id || ''}`)
        this.debug = Debug(this.id)
        this.connect()
        this.publisher = new Publisher(this)
    }

    connect = pOnce(async () => {
        this.node = await startNetworkNode({
            host: '127.0.0.1',
            port: 33312,
            id: uuid('BrubeckClient'),
            trackers: [
                'ws://127.0.0.1:30301',
                'ws://127.0.0.1:30302',
                'ws://127.0.0.1:30303'
            ],
            disconnectionWaitTime: 200
        })
        return this.node
    })

    async getUserId() {
        return this.client.getUserId()
    }

    async getSessionToken() {
        return this.client.session.getSessionToken()
    }

    async disconnect() {
        const node = await this.getNode()
        return node.stop()
    }

    async getNode() {
        return this.connect()
    }

    async publish(...args: Parameters<Publisher['publish']>): ReturnType<Publisher['publish']> {
        return this.publisher.publish(...args)
    }
}
