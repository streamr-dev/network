import { BucketStats, BucketStatsCollector, getWindowStartTime, WINDOW_LENGTH } from './BucketStatsCollector'
import { scheduleAtInterval } from '../../helpers/scheduler'
import { NodeId } from '../../identifiers'
import { Logger } from '../../helpers/Logger'

export type GetCurrentNodesFn = () => ReadonlyArray<NodeId>

const WINDOW_TIMEOUT = WINDOW_LENGTH * 2
const UPDATE_TIMEOUT = WINDOW_LENGTH * 2

function isClosed(bucket: BucketStats, now: number): boolean {
    const timeElapsedSinceStartOfNextWindow = now - getWindowStartTime(bucket.getWindowNumber() + 1)
    const timeElapsedSinceLastUpdate = now - bucket.getLastUpdate()
    return timeElapsedSinceStartOfNextWindow > WINDOW_TIMEOUT
        && timeElapsedSinceLastUpdate > UPDATE_TIMEOUT
}

const logger = new Logger(module)

export class BucketStatsAnalyzer {
    private readonly getCurrentNodes: GetCurrentNodesFn
    private readonly bucketStatsCollector: BucketStatsCollector
    private readonly analyzeIntervalInMs: number
    private readonly timeProvider: () => number
    private scheduledAnalyzeTask: { stop: () => void } | undefined

    constructor(
        getCurrentNeighbors: GetCurrentNodesFn,
        bucketStatsCollector: BucketStatsCollector,
        analyzeIntervalInMs: number,
        timeProvider: () => number = Date.now
    ) {
        this.getCurrentNodes = getCurrentNeighbors
        this.bucketStatsCollector = bucketStatsCollector
        this.analyzeIntervalInMs = analyzeIntervalInMs
        this.timeProvider = timeProvider
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
        const now = this.timeProvider()
        const nodes = this.getCurrentNodes()
        logger.debug('analyzing buckets of %d nodes', nodes.length)
        for (const node of nodes) {
            const buckets = this.bucketStatsCollector.getBuckets(node)
            const closedBuckets = buckets.filter((b) => isClosed(b, now))
            closedBuckets.forEach((b) => {
                logger.info('CLOSED BUCKET of node %s: %j', node, b)
            })
            this.bucketStatsCollector.removeBuckets(node, closedBuckets)
        }
    }
}
