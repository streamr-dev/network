#!/usr/bin/env node
const es = require('event-stream')
const program = require('commander')
const publishStream = require('../src/publish')
const { envOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

program
    .usage('<streamId> <apiKey>')
    .description('publish to a stream by reading JSON messages from stdin line-by-line')
    .option('-k, --partitionKey <string>', 'key for calculating partition to publish message to')
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 2, 2)

const options = formStreamrOptionsWithEnv(program)
const ps = publishStream(program.args[0], program.args[1], program.partitionKey, options)
process.stdin
    .pipe(es.split())
    .pipe(ps)
    .on('error', (err) => {
        console.error(err)
        process.exit(1)
        // process.stdin.pipe(ps) recover pipe to continue execution
    })

