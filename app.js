#!/usr/bin/env node
const fs = require('fs')

const program = require('commander')

const CURRENT_VERSION = require('./package.json').version
const startBroker = require('./src/broker')

program
    .version(CURRENT_VERSION)
    .usage('<configFile>')
    .description('Run broker under environment specified by given configuration file.')
    .parse(process.argv)

if (program.args.length !== 1) {
    program.help()
}

const config = JSON.parse(fs.readFileSync(program.args[0]))
startBroker(config).catch((err) => {
    console.error(err)
    process.exit(1)
})
