import { BucketCollector } from './BucketCollector'
import { scheduleAtInterval } from '../../helpers/scheduler'
import { NodeId } from '../../identifiers'
import { Logger } from '../../helpers/Logger'
import { Bucket, getWindowStartTime, WINDOW_LENGTH } from './Bucket'

const WINDOW_TIMEOUT = WINDOW_LENGTH * 2
const UPDATE_TIMEOUT = WINDOW_LENGTH * 2

function isClosed(bucket: Bucket, now: number): boolean {
    const timeElapsedSinceStartOfNextWindow = now - getWindowStartTime(bucket.getWindowNumber() + 1)
    const timeElapsedSinceLastUpdate = now - bucket.getLastUpdate()
    return timeElapsedSinceStartOfNextWindow > WINDOW_TIMEOUT
        && timeElapsedSinceLastUpdate > UPDATE_TIMEOUT
}

const logger = new Logger(module)

export type GetCurrentNodesFn = () => ReadonlyArray<NodeId>
export type OnBucketClosedFn = (nodeId: NodeId, bucket: Bucket) => void

export class BucketAnalyzer {
    private readonly getCurrentNodes: GetCurrentNodesFn
    private readonly bucketCollector: BucketCollector
    private readonly analyzeIntervalInMs: number
    private readonly onBucketClosed: OnBucketClosedFn
    private readonly timeProvider: () => number
    private scheduledAnalyzeTask: { stop: () => void } | undefined

    constructor(
        getCurrentNeighbors: GetCurrentNodesFn,
        bucketCollector: BucketCollector,
        analyzeIntervalInMs: number,
        onBucketClosed: OnBucketClosedFn,
        timeProvider: () => number = Date.now
    ) {
        this.getCurrentNodes = getCurrentNeighbors
        this.bucketCollector = bucketCollector
        this.analyzeIntervalInMs = analyzeIntervalInMs
        this.onBucketClosed = onBucketClosed
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
        for (const node of nodes) {
            const buckets = this.bucketCollector.getBuckets(node)
            const closedBuckets = buckets.filter((b) => isClosed(b, now))
            closedBuckets.forEach((b) => this.onBucketClosed(node, b)) // TODO: // async generator instead of callback fn?
            this.bucketCollector.removeBuckets(node, closedBuckets)
            logger.debug('closed %d out of % buckets for %s', closedBuckets.length, buckets.length, node)
        }
    }
}
