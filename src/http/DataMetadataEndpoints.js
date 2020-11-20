const express = require('express')

module.exports = (cassandraStorage) => {
    const router = express.Router()
    let handler
    if (!cassandraStorage) {
        handler = async (req, res) => {
            return res.status(501).send('Not a storage node.')
        }
    } else {
        handler = async (req, res) => {
            const streamId = req.params.id
            const partition = req.params.partition || 0

            const out = {
                totalBytes: await cassandraStorage.getTotalBytesInStream(streamId, partition),
                totalMessages: await cassandraStorage.getNumberOfMessagesInStream(streamId, partition),
                firstMessage: await cassandraStorage.getFirstMessageTimestampInStream(streamId, partition),
                lastMessage: await cassandraStorage.getLastMessageTimestampInStream(streamId, partition)
            }

            res.status(200).send(out)
        }
    }

    router.get(
        '/streams/:id/metadata/partitions/:partition',
        handler
    )

    return router
}
