const io = require('@pm2/io')
const StreamrClient = require('streamr-client')

const logger = require('./helpers/logger')('streamr:VolumeLogger')

function formatNumber(n) {
    return n < 10 ? n.toFixed(1) : Math.round(n)
}

module.exports = class VolumeLogger {
    constructor(reportingIntervalSeconds = 60, metricsContext, client = undefined, streamIds = undefined) {
        this.metricsContext = metricsContext
        this.client = client
        this.streamIds = streamIds

        this.brokerConnectionCountMetric = io.metric({
            name: 'brokerConnectionCountMetric'
        })
        this.eventsInPerSecondMetric = io.metric({
            name: 'eventsIn/sec'
        })
        this.eventsOutPerSecondMetric = io.metric({
            name: 'eventsOut/sec'
        })
        this.kbInPerSecondMetric = io.metric({
            name: 'kbIn/sec'
        })
        this.kbOutPerSecondMetric = io.metric({
            name: 'kbOut/sec'
        })
        this.storageReadPerSecondMetric = io.metric({
            name: 'storageRead/sec'
        })
        this.storageWritePerSecondMetric = io.metric({
            name: 'storageWrite/sec'
        })
        this.storageReadKbPerSecondMetric = io.metric({
            name: 'storageReadKb/sec'
        })
        this.storageWriteKbPerSecondMetric = io.metric({
            name: 'storageWriteKb/sec'
        })
        this.totalBufferSizeMetric = io.metric({
            name: 'totalBufferSize'
        })
        this.ongoingResendsMetric = io.metric({
            name: 'ongoingResends'
        })
        this.meanResendAgeMetric = io.metric({
            name: 'meanResendAge'
        })
        this.totalBatchesMetric = io.metric({
            name: 'totalBatches'
        })
        this.meanBatchAge = io.metric({
            name: 'meanBatchAge'
        })
        this.messageQueueSizeMetric = io.metric({
            name: 'messageQueueSize'
        })

        if (reportingIntervalSeconds > 0) {
            logger.info('starting legacy metrics reporting interval')
            const reportingIntervalInMs = reportingIntervalSeconds * 1000
            const reportFn = async () => {
                try {
                    await this.reportAndReset()
                } catch (e) {
                    logger.warn(`Error reporting metrics ${e}`)
                }
                this.timeout = setTimeout(reportFn, reportingIntervalInMs)
            }
            this.timeout = setTimeout(reportFn, reportingIntervalInMs)
        }
    }

    async reportAndReset() {
        const report = await this.metricsContext.report(true)

        // Report metrics to Streamr stream
        if (this.client instanceof StreamrClient && this.streamIds !== undefined && this.streamIds.metricsStreamId !== undefined) {
            this.client.publish(this.streamIds.metricsStreamId, report).catch((e) => {
                logger.warn(`failed to publish metrics to ${this.streamIds.metricsStreamId} because ${e}`)
            })
        }

        const inPerSecond = report.metrics['broker/publisher'].messages.rate
        const kbInPerSecond = report.metrics['broker/publisher'].bytes.rate / 1000
        const outPerSecond = (report.metrics['broker/ws'] ? report.metrics['broker/ws'].outMessages.rate : 0)
            + (report.metrics['broker/mqtt'] ? report.metrics['broker/mqtt'].outMessages.rate : 0)
            + (report.metrics['broker/http'] ? report.metrics['broker/http'].outMessages.rate : 0)
        const kbOutPerSecond = ((report.metrics['broker/ws'] ? report.metrics['broker/ws'].outBytes.rate : 0)
            + (report.metrics['broker/mqtt'] ? report.metrics['broker/mqtt'].outBytes.rate : 0)
            + (report.metrics['broker/http'] ? report.metrics['broker/http'].outBytes.rate : 0)) / 1000

        let storageReadCountPerSecond = 0
        let storageWriteCountPerSecond = 0
        let storageReadKbPerSecond = 0
        let storageWriteKbPerSecond = 0
        let totalBatches = 0
        let meanBatchAge = 0
        if (report.metrics['broker/cassandra']) {
            storageReadCountPerSecond = report.metrics['broker/cassandra'].readCount.rate
            storageWriteCountPerSecond = report.metrics['broker/cassandra'].writeCount.rate
            storageReadKbPerSecond = report.metrics['broker/cassandra'].readBytes.rate / 1000
            storageWriteKbPerSecond = report.metrics['broker/cassandra'].writeBytes.rate / 1000
            totalBatches = report.metrics['broker/cassandra'].batchManager.totalBatches
            meanBatchAge = report.metrics['broker/cassandra'].batchManager.meanBatchAge
        }

        const brokerConnectionCount = (report.metrics['broker/ws'] ? report.metrics['broker/ws'].connections : 0)
            + (report.metrics['broker/mqtt'] ? report.metrics['broker/mqtt'].connections : 0)

        const networkConnectionCount = report.metrics.WebRtcEndpoint.connections
        const networkInPerSecond = report.metrics.WebRtcEndpoint.msgInSpeed.rate
        const networkOutPerSecond = report.metrics.WebRtcEndpoint.msgOutSpeed.rate
        const networkKbInPerSecond = report.metrics.WebRtcEndpoint.inSpeed.rate / 1000
        const networkKbOutPerSecond = report.metrics.WebRtcEndpoint.outSpeed.rate / 1000
        const { messageQueueSize } = report.metrics.WebRtcEndpoint

        const ongoingResends = report.metrics.resends.numOfOngoingResends
        const resendMeanAge = report.metrics.resends.meanAge

        const totalBuffer = report.metrics.WebRtcEndpoint.totalWebSocketBuffer
            + (report.metrics['broker/ws'] ? report.metrics['broker/ws'].totalWebSocketBuffer : 0)

        logger.info(
            'Report\n'
            + '\tBroker connections: %d\n'
            + '\tBroker in: %d events/s, %d kb/s\n'
            + '\tBroker out: %d events/s, %d kb/s\n'
            + '\tNetwork connections %d\n'
            + '\tQueued messages: %d\n'
            + '\tNetwork in: %d events/s, %d kb/s\n'
            + '\tNetwork out: %d events/s, %d kb/s\n'
            + '\tStorage read: %d events/s, %d kb/s\n'
            + '\tStorage write: %d events/s, %d kb/s\n'
            + '\tTotal ongoing resends: %d (mean age %d ms)\n'
            + '\tTotal batches: %d (mean age %d ms)\n',
            brokerConnectionCount,
            formatNumber(inPerSecond),
            formatNumber(kbInPerSecond),
            formatNumber(outPerSecond),
            formatNumber(kbOutPerSecond),
            networkConnectionCount,
            messageQueueSize,
            formatNumber(networkInPerSecond),
            formatNumber(networkKbInPerSecond),
            formatNumber(networkOutPerSecond),
            formatNumber(networkKbOutPerSecond),
            formatNumber(storageReadCountPerSecond),
            formatNumber(storageReadKbPerSecond),
            formatNumber(storageWriteCountPerSecond),
            formatNumber(storageWriteKbPerSecond),
            ongoingResends,
            resendMeanAge,
            totalBatches,
            meanBatchAge
        )

        this.eventsInPerSecondMetric.set(inPerSecond)
        this.kbInPerSecondMetric.set(kbInPerSecond)
        this.eventsOutPerSecondMetric.set(outPerSecond)
        this.kbOutPerSecondMetric.set(kbOutPerSecond)
        this.storageReadPerSecondMetric.set(storageReadCountPerSecond)
        this.storageWritePerSecondMetric.set(storageWriteCountPerSecond)
        this.storageReadKbPerSecondMetric.set(storageReadKbPerSecond)
        this.storageWriteKbPerSecondMetric.set(storageWriteKbPerSecond)
        this.brokerConnectionCountMetric.set(brokerConnectionCount)
        this.totalBufferSizeMetric.set(totalBuffer)
        this.ongoingResendsMetric.set(ongoingResends)
        this.meanResendAgeMetric.set(resendMeanAge)
        this.messageQueueSizeMetric.set(messageQueueSize)
        if (report.metrics['broker/cassandra']) {
            this.totalBatchesMetric.set(totalBatches)
            this.meanBatchAge.set(meanBatchAge)
        }
    }

    close() {
        io.destroy()
        clearTimeout(this.timeout)
        if (this.client) {
            this.client.ensureDisconnected()
        }
    }
}
