const Optimist = require('optimist')
const { startNetworkNode } = require('@streamr/streamr-p2p-network')

const StreamFetcher = require('./src/StreamFetcher')
const { startCassandraStorage } = require('./src/Storage')
const Publisher = require('./src/Publisher')
const VolumeLogger = require('./src/VolumeLogger')

const startHttpAdapter = require('./src/http/index')
const startWsAdapter = require('./src/websocket/index')

module.exports = async (config) => {
    // Start network node
    const networkNode = await startNetworkNode(config.networkHostname, config.networkPort)
    networkNode.addBootstrapTracker('ws://127.0.0.1:30300')

    // Start storage
    const storage = await startCassandraStorage(
        config.cassandra.split(','),
        'datacenter1',
        config.keyspace,
        config['cassandra-username'],
        config['cassandra-pwd'],
    )

    // Init utils
    const volumeLogger = new VolumeLogger()
    const streamFetcher = new StreamFetcher(config.streamr)
    const publisher = new Publisher(networkNode, volumeLogger)

    console.info(`Configured with Streamr: ${config.streamr}`)
    console.info(`Network node running on ${config.networkHostname}:${config.networkPort}`)

    const closeAdapterFns = [startHttpAdapter, startWsAdapter].map((startAdapterFn) => startAdapterFn({
        networkNode,
        storage,
        publisher,
        streamFetcher,
        volumeLogger,
        config,
    }))

    return {
        close: () => {
            closeAdapterFns.forEach((close) => close())
        },
    }
}

// Start the server if we're not being required from another module
if (require.main === module) {
    // Check command line args
    let optimist = Optimist.usage(`You must pass the following command line options:
        --cassandra <cassandra_hosts_separated_by_commas>
        --cassandra-username <cassandra_username>
        --cassandra-pwd <cassandra_password>
        --keyspace <cassandra_keyspace>
        --networkHostname <networkHostname>
        --networkPort <networkPort>
        --streamr <streamr>
        --httpPort <httpPort>
        --wsPort <wsPort>`)
    optimist = optimist.demand(['cassandra', 'cassandra-username', 'cassandra-pwd', 'keyspace', 'networkHostname', 'networkPort', 'streamr', 'httpPort', 'wsPort'])

    module.exports(optimist.argv)
        .then(() => {})
        .catch((e) => {
            console.error(e)
            process.exit(1)
        })
}
