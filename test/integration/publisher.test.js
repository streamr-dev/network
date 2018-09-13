const assert = require('assert')
const { createConnection } = require('../../src/connection/Connection')
const Node = require('../../src/logic/Node')
const Publisher = require('../../src/logic/Publisher')
const { version } = require('../../package.json')

jest.setTimeout(30000)

describe('publisher and node connection', () => {
    it('should be able to start publisher and node, send message, receive and then stop successfully', (done) => {
        let conn1
        let conn2
        let node
        let publisher

        createConnection('127.0.0.1', 30350, '', true).then((connection) => {
            conn1 = connection
            node = new Node(connection)
        }).then(() => createConnection('127.0.0.1', 30351, '', true).then((connection2) => {
            conn2 = connection2

            connection2.connect(conn1.node.peerInfo)

            publisher = new Publisher(connection2, conn1.node.peerInfo)
            publisher.publish(node.status.streams[0], 'Hello world, from Publisher ' + conn2.node.peerInfo.id.toB58String(), () => {})

            conn1.on('streamr:message-received', ({ sender, message }) => {
                assert.equal(message, `{"version":"${version}","code":2,"data":["${node.status.streams[0]}","Hello world, from Publisher ${connection2.node.peerInfo.id.toB58String()}"]}`)
                conn1.node.stop(() => {
                    conn2.node.stop(() => done())
                })
            })
        }))
    })
})
