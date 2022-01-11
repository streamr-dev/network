import { Protocol } from 'streamr-network'
import { StreamID, toStreamID } from 'streamr-client-protocol'

type State = 'init'|'subscribing'|'subscribed'

export class Stream<C> {

    readonly id: StreamID
    readonly name: string
    readonly partition: number
    state: State
    readonly connections: C[]

    constructor(id: string, partition: number, name: string) {
        this.id = toStreamID(id)
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

    getConnections(): C[] {
        return this.connections
    }

    setSubscribing(): void {
        this.state = 'subscribing'
    }

    setSubscribed(): void {
        this.state = 'subscribed'
    }

    isSubscribed(): boolean {
        return this.state === 'subscribed'
    }

    getSPIDKey(): Protocol.SPIDKey {
        return Protocol.SPID.toKey(this.id, this.partition)
    }

    getName(): string {
        return this.name
    }

    getId(): string {
        return this.id
    }
}
