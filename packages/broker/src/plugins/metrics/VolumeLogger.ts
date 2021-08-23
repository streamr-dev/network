import { MetricsContext } from 'streamr-network'
import io from '@pm2/io'
import { ConsoleAndPM2Metrics } from './ConsoleAndPM2Metrics'

// TODO remove this class and use ConsoleAndPM2Metrics directly from MetricsPlugin
export class VolumeLogger {

    metricsContext: MetricsContext
    legacyMetrics?: ConsoleAndPM2Metrics

    constructor(
        consoleAndPM2IntervalInSeconds: number,
        metricsContext: MetricsContext,
    ) {
        this.metricsContext = metricsContext
        if (consoleAndPM2IntervalInSeconds > 0) {
            this.legacyMetrics = new ConsoleAndPM2Metrics(consoleAndPM2IntervalInSeconds, metricsContext)
        }
    }
    
    async start(): Promise<void> {
        if (this.legacyMetrics !== undefined) {
            this.legacyMetrics.start()
        }
    }

    stop(): void {
        io.destroy()
        if (this.legacyMetrics !== undefined) {
            this.legacyMetrics.stop()
        }
    }
}
