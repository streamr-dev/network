const events = require('events')

module.exports = class Stream extends events.EventEmitter {
    constructor(id, partition, state) {
        super()
        this.id = id
        this.partition = partition
        this.state = state
        this.connections = []
    }

    addConnection(connection) {
        this.connections.push(connection)
    }

    removeConnection(connection) {
        const index = this.connections.indexOf(connection)
        if (index > -1) {
            this.connections.splice(index, 1)
        }
    }

    getConnections() {
        return this.connections
    }
}
