#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'
import { DeleteExpiredCmd } from '../src/plugins/storage/DeleteExpiredCmd'

program
    .version(pkg.version)
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
    cassandraUsername: program.opts().cassandraUsername,
    cassandraPassword: program.opts().cassandraPassword,
    cassandraHosts: program.opts().cassandraHosts.split(','),
    cassandraDatacenter: program.opts().cassandraDatacenter,
    cassandraKeyspace: program.opts().cassandraKeyspace,
    streamrBaseUrl: program.opts().streamrBaseUrl,
    bucketLimit: program.opts().bucketLimit,
    dryRun: !program.opts().realRun
})

async function run() {
    try {
        // @ts-expect-error TODO fix
        await deleteExpiredCommand.run()
        return {}
    } catch (err) {
        console.error(err)
        process.exit(1)
    }
}

run()
