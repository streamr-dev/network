import { getLogger } from './helpers/logger'
import { Todo } from './types'

const logger = getLogger('streamr:Stream')

export class Stream {

    id: Todo
    name: Todo
    partition: Todo
    state: Todo
    connections: Todo

    constructor(id: string, partition: number, name: string) {
        this.id = id
        this.name = name
        this.partition = partition
        this.state = 'init'
        this.connections = []
    }

    addConnection(connection: Todo) {
        this.connections.push(connection)
    }

    removeConnection(connection: Todo) {
        const index = this.connections.indexOf(connection)
        if (index > -1) {
            this.connections.splice(index, 1)
        }
    }

    forEachConnection(cb: Todo) {
        this.getConnections().forEach(cb)
    }

    getConnections() {
        return this.connections
    }

    setSubscribing() {
        this.state = 'subscribing'
    }

    setSubscribed() {
        this.state = 'subscribed'
    }

    isSubscribing() {
        return this.state === 'subscribing'
    }

    isSubscribed() {
        return this.state === 'subscribed'
    }

    toString() {
        return `${this.id}::${this.partition}`
    }

    getName() {
        return this.name
    }

    getId() {
        return this.id
    }

    getPartition() {
        return this.partition
    }
}
