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

const config = JSON.parse(fs.readFileSync(program.args[0]))
// TODO: nicer way to override config with program arguments (could take inspiration from data-api repo)
/* eslint-disable prefer-destructuring */
if (program.args[1]) {
    config.streamrUrl = program.args[1]
}
/* eslint-enable prefer-destructuring */
startBroker(config).catch((err) => {
    console.error(err)
    process.exit(1)
})
