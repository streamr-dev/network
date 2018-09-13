const localhost = '127.0.0.1'
const { createConnection } = require('../src/connection/Connection')

exports.getTestConnections = async (numConn, basePort) => {
    const connections = []

    for (let i = 0; i < numConn; i++) {
        // eslint-disable-next-line no-await-in-loop
        const conn = await createConnection(localhost, basePort + i, '', true).catch((err) => { throw err })
        connections.push(conn)
    }

    return connections
}
