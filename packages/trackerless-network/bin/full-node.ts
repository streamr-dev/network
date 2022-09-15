const program = require('commander')
const { version: CURRENT_VERSION } = require('../package.json')

program
    .version(CURRENT_VERSION)
    .option('--id <id>', 'Ethereum address / node id', 'full-node')
    .option('--streamIds <streamIds>', 'streamId to publish',  (value) => value.split(','), ['stream-0'])
    .description('Run full node')
    .parse(process.argv)

async function run(): Promise<void> {

}
run()