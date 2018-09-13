const assert = require('assert')
const { getTestConnections } = require('../util')
const Node = require('../../src/logic/Node')
const Publisher = require('../../src/logic/Publisher')
const { version } = require('../../package.json')

jest.setTimeout(40000)

describe('publisher and node connection', () => {
    it('should be able to start publisher and node, send message, receive and then stop successfully', async (done) => {
        const MAX = 2

        // create MAX connections
        const connections = await getTestConnections(MAX, 30990)
        const conn1 = connections[0]
        const conn2 = connections[1]

        const node = new Node(conn1)
        const publisher = new Publisher(conn2, conn1.node.peerInfo)

        publisher.publish(node.status.streams[0], 'Hello world, from Publisher ' + conn2.node.peerInfo.id.toB58String(), () => {})

        conn1.on('streamr:message-received', ({ sender, message }) => {
            console.log(message)

            assert.equal(message, `{"version":"${version}","code":2,"data":["${node.status.streams[0]}","Hello world, from Publisher ${conn2.node.peerInfo.id.toB58String()}"]}`)

            conn1.node.stop(() => {
                conn2.node.stop(() => done())
            })
        })
    })
})
