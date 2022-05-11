import { BucketStatsCollector } from './BucketStatsCollector'
import { scheduleAtInterval } from '../../helpers/scheduler'
import { NodeId } from '../../identifiers'
import { Logger } from '../../helpers/Logger'

export type GetCurrentNodesFn = () => ReadonlyArray<NodeId>

const logger = new Logger(module)

export class BucketStatsAnalyzer {
    private readonly getCurrentNodes: GetCurrentNodesFn
    private readonly bucketStatsCollector: BucketStatsCollector
    private readonly analyzeIntervalInMs: number
    private scheduledAnalyzeTask: { stop: () => void } | undefined

    constructor(
        getCurrentNeighbors: GetCurrentNodesFn,
        bucketStatsCollector: BucketStatsCollector,
        analyzeIntervalInMs: number
    ) {
        this.getCurrentNodes = getCurrentNeighbors
        this.bucketStatsCollector = bucketStatsCollector
        this.analyzeIntervalInMs = analyzeIntervalInMs
    }

    async start(): Promise<void> {
        this.scheduledAnalyzeTask = await scheduleAtInterval(
            async () => this.analyze(), // TODO: rm async?
            this.analyzeIntervalInMs,
            false
        )
    }

    stop(): void {
        this.scheduledAnalyzeTask?.stop()
    }

    private analyze(): void {
        const nodes = this.getCurrentNodes()
        logger.debug('analyzing buckets of %d nodes', nodes.length)
        for (const neighbor of nodes) {
            const buckets = this.bucketStatsCollector.getBuckets(neighbor)
            logger.info('node %s, buckets %j', neighbor, buckets)
        }
    }
}
