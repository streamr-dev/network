import { Todo } from './types'

type State = 'init'|'subscribing'|'subscribed'

export class Stream<C> {

    id: string
    name: string
    partition: number
    state: State
    connections: C[]

    constructor(id: string, partition: number, name: string) {
        this.id = id
        this.name = name
        this.partition = partition
        this.state = 'init'
        this.connections = []
    }

    addConnection(connection: C): void {
        this.connections.push(connection)
    }

    removeConnection(connection: C): void {
        const index = this.connections.indexOf(connection)
        if (index > -1) {
            this.connections.splice(index, 1)
        }
    }

    forEachConnection(cb: Todo): void {
        this.getConnections().forEach(cb)
    }

    getConnections(): C[] {
        return this.connections
    }

    setSubscribing(): void {
        this.state = 'subscribing'
    }

    setSubscribed(): void {
        this.state = 'subscribed'
    }

    isSubscribing(): boolean {
        return this.state === 'subscribing'
    }

    isSubscribed(): boolean {
        return this.state === 'subscribed'
    }

    toString(): string {
        return `${this.id}::${this.partition}`
    }

    getName(): string {
        return this.name
    }

    getId(): string {
        return this.id
    }

    getPartition(): number {
        return this.partition
    }
}
