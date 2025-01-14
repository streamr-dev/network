import 'reflect-metadata'

import { DhtAddress } from '@streamr/dht'
import { LevelMetric, MetricsContext, wait } from '@streamr/utils'
import { StreamrClientConfig } from '../../src/Config'
import { DestroySignal } from '../../src/DestroySignal'
import { DEFAULTS, MetricsPublisher } from '../../src/MetricsPublisher'
import { NetworkNodeFacade } from '../../src/NetworkNodeFacade'
import { StreamrClientEventEmitter } from '../../src/events'
import { Publisher } from '../../src/publish/Publisher'
import { waitForCalls } from '../test-utils/utils'

const NODE_ID = '12345678' as DhtAddress
const DEFAULT_DURATIONS = DEFAULTS.periods.map((p) => p.duration)

describe('MetricsPublisher', () => {
    let publishReportMessage: jest.Mock
    let metricsContext: MetricsContext
    let destroySignal: DestroySignal

    const startMetricsPublisher = (config: Pick<StreamrClientConfig, 'metrics'>) => {
        const publisher: Pick<Publisher, 'publish'> = {
            publish: publishReportMessage
        }
        const node: Pick<NetworkNodeFacade, 'getMetricsContext' | 'getNodeId'> = {
            getMetricsContext: async () => metricsContext,
            getNodeId: async () => NODE_ID
        }
        const eventEmitter = new StreamrClientEventEmitter()
        new MetricsPublisher(publisher as any, node as any, config, eventEmitter, destroySignal)

        // trigger metric publisher to start
        eventEmitter.emit('streamPartSubscribed', undefined)
    }

    const assertPublisherEnabled = async (
        config: Pick<StreamrClientConfig, 'metrics'>,
        expectedDurations: number[]
    ) => {
        startMetricsPublisher(config)
        const createReportProducer = metricsContext.createReportProducer as jest.Mock
        await waitForCalls(createReportProducer, 1)
        const durations = createReportProducer.mock.calls.map((c) => c[1])
        expect(durations).toEqual(expectedDurations)
    }

    const assertPublisherDisabled = async (config: Pick<StreamrClientConfig, 'metrics' | 'auth'>) => {
        startMetricsPublisher(config)
        await wait(10)
        expect(metricsContext.createReportProducer).not.toHaveBeenCalled()
    }

    beforeEach(() => {
        publishReportMessage = jest.fn()
        metricsContext = new MetricsContext()
        jest.spyOn(metricsContext, 'createReportProducer')
        const metrics = {
            level: new LevelMetric()
        }
        metricsContext.addMetrics('mockNamespace', metrics)
        metrics.level.record(123)
        destroySignal = new DestroySignal()
    })

    afterEach(() => {
        destroySignal.destroy()
    })

    it('happy path', async () => {
        const PERIOD_DURATION = 50
        const config: Pick<StreamrClientConfig, 'metrics' | 'auth'> = {
            metrics: {
                periods: [
                    {
                        streamId: 'mock-stream-id',
                        duration: PERIOD_DURATION
                    }
                ],
                maxPublishDelay: 1
            }
        }
        startMetricsPublisher(config)

        await waitForCalls(publishReportMessage, 1)

        const [streamId, reportContent, publishMetadata] = publishReportMessage.mock.calls[0]
        expect(streamId).toBe('mock-stream-id')
        expect(reportContent).toMatchObject({
            mockNamespace: {
                level: 123
            },
            period: {
                start: expect.toBeNumber(),
                end: expect.toBeNumber()
            }
        })
        expect(publishMetadata).toMatchObject({
            partitionKey: NODE_ID,
            timestamp: expect.toBeNumber()
        })
    })

    describe('config', () => {
        it('default', async () => {
            await assertPublisherEnabled({}, DEFAULT_DURATIONS)
        })

        it('ethereum authentication', async () => {
            await assertPublisherDisabled({
                auth: {
                    ethereum: {} as any
                }
            })
        })

        it('explictly enabled', async () => {
            await assertPublisherEnabled({ metrics: true }, DEFAULT_DURATIONS)
        })

        it('explictly disabled', async () => {
            await assertPublisherDisabled({ metrics: false })
        })

        it('custom periods', async () => {
            await assertPublisherEnabled(
                {
                    metrics: {
                        periods: [
                            { duration: 1234, streamId: '' },
                            { duration: 5678, streamId: '' }
                        ],
                        maxPublishDelay: 1
                    }
                },
                [1234, 5678]
            )
        })

        it('custom maxPublishDelay', async () => {
            await assertPublisherEnabled(
                {
                    metrics: {
                        maxPublishDelay: 1
                    }
                },
                DEFAULT_DURATIONS
            )
        })
    })
})
