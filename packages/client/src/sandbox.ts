import { StreamrClient } from './StreamrClient'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

;(async () => {
    const client = new StreamrClient({ contracts: { enableExperimentalGsn: true } })
    try {
        logger.info("client address: %s", await client.getAddress())
        const stream = await client.createStream({
            id: '/foobar/' + Math.floor(Date.now() / 1000),
            partitions: 11
        })
        logger.info("stream created (thru GSN): %s", stream.id)
    } finally {
        await client.destroy()
    }
})()
