import { wait } from '../src/wait'
import { AverageMetric, CountMetric, LevelMetric, MetricsContext, MetricsReport, RateMetric } from '../src/Metric'
import { until } from '../src/until'

const REPORT_INTERVAL = 100
const ONE_SECOND = 1000

describe('metrics', () => {
    describe('producer', () => {
        let context: MetricsContext
        let reports: (MetricsReport & { generationTime: number })[]
        let abortController: AbortController

        const getReport = (timestamp: number) => {
            return reports.find((report) => timestamp <= report.generationTime)
        }

        beforeEach(() => {
            context = new MetricsContext()
            reports = []
            abortController = new AbortController()
            context.createReportProducer(
                (report) => {
                    reports.push({
                        ...report,
                        generationTime: Date.now()
                    })
                },
                REPORT_INTERVAL,
                abortController.signal
            )
        })

        afterEach(() => {
            abortController.abort()
        })

        it('happy path', async () => {
            const metricOne = {
                count: new CountMetric()
            }
            context.addMetrics('metricOne', metricOne)
            context.addMetrics('metricTwo', {})
            const metricThree = {
                average: new AverageMetric(),
                level: new LevelMetric(),
                rate: new RateMetric()
            }
            context.addMetrics('metricThree', metricThree)
            metricThree.level.record(30)

            // wait until the initial values have been seen by the producer
            await wait(REPORT_INTERVAL)
            const inputTime1 = Date.now()
            metricOne.count.record(7)
            metricOne.count.record(2)
            metricThree.average.record(10)
            metricThree.average.record(20)
            metricThree.level.record(34)
            metricThree.level.record(35)
            metricThree.rate.record(2000)
            metricThree.rate.record(4000)

            await until(() => getReport(inputTime1) !== undefined)
            expect(getReport(inputTime1)).toMatchObject({
                metricOne: {
                    count: 7 + 2
                },
                metricThree: {
                    average: (10 + 20) / 2,
                    level: (30 + 34 + 35) / 3,
                    rate: (2000 + 4000) * (ONE_SECOND / REPORT_INTERVAL)
                },
                period: {
                    start: expect.anything(),
                    end: expect.anything()
                }
            })

            const inputTime2 = Date.now()
            metricOne.count.record(3)
            metricThree.level.record(39)
            metricThree.rate.record(1000)

            await until(() => getReport(inputTime2) !== undefined)
            expect(getReport(inputTime2)).toMatchObject({
                metricOne: {
                    count: 3
                },
                metricThree: {
                    level: 37,
                    rate: 1000 * (ONE_SECOND / REPORT_INTERVAL)
                },
                period: {
                    start: expect.anything(),
                    end: expect.anything()
                }
            })
        })

        it('no data', async () => {
            context.addMetrics('foo', {
                bar: new CountMetric()
            })
            await until(() => reports.length > 0)
            expect(reports[0]).toMatchObject({
                foo: {
                    bar: 0
                },
                period: {
                    start: expect.anything(),
                    end: expect.anything()
                }
            })
        })
    })

    describe('samplers', () => {
        describe('count', () => {
            it('happy path', () => {
                const metric = new CountMetric()
                const sampler = metric.createSampler()
                sampler.start(Date.now())
                metric.record(3)
                metric.record(4)
                sampler.stop(Date.now())
                expect(sampler.getAggregatedValue()).toBe(7)
            })
        })

        describe('average', () => {
            it('happy path', () => {
                const metric = new AverageMetric()
                const sampler = metric.createSampler()
                sampler.start(Date.now())
                metric.record(7)
                metric.record(9)
                sampler.stop(Date.now())
                expect(sampler.getAggregatedValue()).toBe(8)
            })

            it('no data', () => {
                const metric = new AverageMetric()
                const sampler = metric.createSampler()
                sampler.start(Date.now())
                sampler.stop(Date.now())
                expect(sampler.getAggregatedValue()).toBeUndefined()
            })
        })

        describe('level', () => {
            it('happy path', () => {
                const metric = new LevelMetric()
                const sampler = metric.createSampler()
                sampler.start(Date.now())
                metric.record(10)
                metric.record(12)
                sampler.stop(Date.now())
                expect(sampler.getAggregatedValue()).toBe(11)
            })

            it('include latest before start', () => {
                const metric = new LevelMetric()
                const sampler = metric.createSampler()
                metric.record(20)
                sampler.start(Date.now())
                metric.record(25)
                metric.record(18)
                sampler.stop(Date.now())
                expect(sampler.getAggregatedValue()).toBe(21)
            })

            it('no data', () => {
                const metric = new LevelMetric()
                const sampler = metric.createSampler()
                sampler.start(Date.now())
                sampler.stop(Date.now())
                expect(sampler.getAggregatedValue()).toBeUndefined()
            })
        })

        describe('rate', () => {
            it('happy path', () => {
                const metric = new RateMetric()
                const sampler = metric.createSampler()
                sampler.start(10000)
                metric.record(88)
                metric.record(12)
                sampler.stop(14000)
                expect(sampler.getAggregatedValue()).toBe(25)
            })

            it('no data', () => {
                const metric = new RateMetric()
                const sampler = metric.createSampler()
                sampler.start(10000)
                sampler.stop(14000)
                expect(sampler.getAggregatedValue()).toBe(0)
            })
        })
    })

    it('same id cannot be created twice', () => {
        const context = new MetricsContext()
        const metric = {
            foo: new CountMetric()
        }
        context.addMetrics('mockNamespace', metric)
        expect(() => {
            context.addMetrics('mockNamespace', metric)
        }).toThrow('Metrics "mockNamespace.foo" already created')
    })
})
