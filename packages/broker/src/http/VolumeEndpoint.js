const express = require('express')

/**
 * Endpoint for GETing volume metrics
 */
module.exports = (metricsContext) => {
    if (!metricsContext) {
        throw new Error('metricsContext not given!')
    }

    const router = express.Router()

    router.get('/volume', async (req, res) => {
        const report = await metricsContext.report()
        res.status(200).send(report)
    })

    return router
}
