import { ConnectionManager, DhtNode } from '@streamr/dht'
import { StreamrNode } from '../src/logic/StreamrNode'

const program = require('commander')
const { version: CURRENT_VERSION } = require('../package.json')

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / node id', 'bootstrap')
    .option('--streamIds <streamIds>', 'streamId to publish',  (value) => value.split(','), ['stream-0'])
    .description('Run bootstrap node')
    .parse(process.argv)

async function run(): Promise<void> {
    const connectionManager = new ConnectionManager()
    const layer0 = new DhtNode({})
    const streamrNode = new StreamrNode()
}
run()