#!/usr/bin/env node
const es = require('event-stream')
const program = require('commander')
const publishStream = require('../src/publish')
const { envOptions, authOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

program
    .usage('<streamId>')
    .description('publish to a stream by reading JSON messages from stdin line-by-line')
    .option('-k, --partition-key <string>', 'field name in each message to use for assigning the message to a stream partition')
authOptions(program)
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, 1)

const options = formStreamrOptionsWithEnv(program)
const ps = publishStream(program.args[0], program.partitionKey, options)
process.stdin
    .pipe(es.split())
    .pipe(ps)
    .on('error', (err) => {
        console.error(err)
        process.exit(1)
        // process.stdin.pipe(ps) recover pipe to continue execution
    })

