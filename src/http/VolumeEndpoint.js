const express = require('express')

/**
 * Endpoint for GETing volume metrics
 */
module.exports = (volumeLogger) => {
    if (!volumeLogger) {
        throw new Error('VolumeLogger not given!')
    }

    const router = express.Router()

    router.get('/volume', (req, res) => {
        res.status(200).send(volumeLogger.lastVolumeStatistics)
    })

    return router
}
