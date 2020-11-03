#!/usr/bin/env node
const program = require('commander')

const DeleteExpiredCmd = require('../src/storage/DeleteExpiredCmd')
const CURRENT_VERSION = require('../package.json').version

program
    .version(CURRENT_VERSION)
    .requiredOption('--cassandra-username <username>')
    .requiredOption('--cassandra-password <password>')
    .requiredOption('--cassandra-hosts <hosts_delimited_by_comma>')
    .requiredOption('--cassandra-datacenter <datacenter>')
    .requiredOption('--cassandra-keyspace <keyspace>')
    .requiredOption('--streamr-base-url <baseUrl>')
    .requiredOption('--bucket-limit <bucketLimit>', 'max number of buckets to fetch')
    .option('--real-run', 'delete data for real', false)
    .description('Delete expired data')
    .parse(process.argv)

const deleteExpiredCommand = new DeleteExpiredCmd({
    cassandraUsername: program.cassandraUsername,
    cassandraPassword: program.cassandraPassword,
    cassandraHosts: program.cassandraHosts.split(','),
    cassandraDatacenter: program.cassandraDatacenter,
    cassandraKeyspace: program.cassandraKeyspace,
    streamrBaseUrl: program.streamrBaseUrl,
    bucketLimit: program.bucketLimit,
    dryRun: !program.realRun
})
deleteExpiredCommand.run()
    .then(() => {})
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
