import express, { Request, Response } from 'express'
import { MetricsContext } from 'streamr-network'

/**
 * Endpoint for GETing volume metrics
 */
export const router = (metricsContext: MetricsContext) => {
    if (!metricsContext) {
        throw new Error('metricsContext not given!')
    }

    const router = express.Router()

    router.get('/volume', async (req: Request, res: Response) => {
        const report = await metricsContext.report()
        res.status(200).send(report)
    })

    return router
}
