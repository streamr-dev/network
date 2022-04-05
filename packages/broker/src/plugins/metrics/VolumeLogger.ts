import { MetricsContext } from 'streamr-network'
import { ConsoleMetrics } from './ConsoleMetrics'

// TODO remove this class and use ConsoleMetrics directly from MetricsPlugin
export class VolumeLogger {

    metricsContext: MetricsContext
    legacyMetrics?: ConsoleMetrics

    constructor(
        consoleIntervalInSeconds: number,
        metricsContext: MetricsContext,
    ) {
        this.metricsContext = metricsContext
        if (consoleIntervalInSeconds > 0) {
            this.legacyMetrics = new ConsoleMetrics(consoleIntervalInSeconds, metricsContext)
        }
    }
    
    async start(): Promise<void> {
        if (this.legacyMetrics !== undefined) {
            this.legacyMetrics.start()
        }
    }

    stop(): void {
        if (this.legacyMetrics !== undefined) {
            this.legacyMetrics.stop()
        }
    }
}
