const StreamrClient = require('streamr-client')

module.exports = class VolumeLogger {
    constructor(reportingIntervalSeconds = 60, networkNode = undefined, storages = [], client = undefined, streamId = undefined) {
        this.reportingIntervalSeconds = reportingIntervalSeconds
        this.connectionCountMQTT = 0
        this.connectionCountWS = 0
        this.inCount = 0
        this.inBytes = 0
        this.outCount = 0
        this.outBytes = 0
        this.totalBufferSize = 0
        this.storageReadCount = 0
        this.storageReadBytes = 0
        this.storageWriteCount = 0
        this.storageWriteBytes = 0
        this.lastVolumeStatistics = {}
        this.client = client
        this.streamId = streamId
        this.networkNode = networkNode
        this.storages = storages

        if (this.reportingIntervalSeconds > 0) {
            this.interval = setInterval(async () => {
                await this.reportAndReset()
            }, this.reportingIntervalSeconds * 1000)
        }

        this.storages.forEach((storage) => {
            storage.on('read', (streamMessage) => {
                this.storageReadCount += 1
                this.storageReadBytes += streamMessage.getContent().length
            })
            storage.on('write', (streamMessage) => {
                this.storageWriteCount += 1
                this.storageWriteBytes += streamMessage.getContent().length
            })
        })
    }

    logInput(bytes) {
        this.inCount += 1
        this.inBytes += bytes
    }

    logOutput(bytes) {
        this.outCount += 1
        this.outBytes += bytes
    }

    async reportAndReset() {
        const inPerSecond = this.inCount / this.reportingIntervalSeconds
        const outPerSecond = this.outCount / this.reportingIntervalSeconds
        const kbInPerSecond = (this.inBytes / this.reportingIntervalSeconds) / 1000
        const kbOutPerSecond = (this.outBytes / this.reportingIntervalSeconds) / 1000

        const storageReadCountPerSecond = this.storageReadCount / this.reportingIntervalSeconds
        const storageWriteCountPerSecond = this.storageWriteCount / this.reportingIntervalSeconds
        const storageReadKbPerSecond = (this.storageReadBytes / this.reportingIntervalSeconds) / 1000
        const storageWriteKbPerSecond = (this.storageWriteBytes / this.reportingIntervalSeconds) / 1000

        const connectionCount = this.connectionCountWS + this.connectionCountMQTT

        const networkMetrics = await this.networkNode.getMetrics()
        const networkInPerSecond = networkMetrics.mainMetrics.msgInSpeed
        const networkOutPerSecond = networkMetrics.mainMetrics.msgOutSpeed
        const networkKbInPerSecond = networkMetrics.mainMetrics.inSpeed / 1000
        const networkKbOutPerSecond = networkMetrics.mainMetrics.outSpeed / 1000

        const storageMisc = this.storages.length === 0 ? {} : Object.assign({}, ...this.storages.map((storage) => ({
            [storage.constructor.name]: storage.metrics()
        })))

        this.lastVolumeStatistics = {
            id: this.networkNode.opts.id,
            timestamp: Date.now(),
            network: {
                input: {
                    eventsPerSecond: Math.round(networkInPerSecond),
                    kbPerSecond: Math.round(networkKbInPerSecond),
                },
                output: {
                    eventsPerSecond: Math.round(networkOutPerSecond),
                    kbInPerSecond: Math.round(networkKbOutPerSecond)
                }
            },
            broker: {
                totalBufferSize: this.totalBufferSize,
                connectionCount,
                connectionCountMQTT: this.connectionCountMQTT,
                connectionCountWS: this.connectionCountWS,
                input: {
                    eventsPerSecond: Math.round(inPerSecond),
                    kbPerSecond: Math.round(kbInPerSecond),
                },
                output: {
                    eventsPerSecond: Math.round(outPerSecond),
                    kbPerSecond: Math.round(kbOutPerSecond),
                },
            },
            storage: {
                read: {
                    eventsPerSecond: Math.round(storageReadCountPerSecond),
                    kbPerSecond: Math.round(storageReadKbPerSecond)
                },
                write: {
                    eventsPerSecond: Math.round(storageWriteCountPerSecond),
                    kbPerSecond: Math.round(storageWriteKbPerSecond)
                },
                misc: storageMisc
            }
        }

        function formatNumber(n) {
            return n < 10 ? n.toFixed(1) : Math.round(n)
        }

        console.log(
            'Report\n'
            + '\tBroker connections: %d\n'
            + '\tBroker in: %d events/s, %d kb/s\n'
            + '\tBroker out: %d events/s, %d kb/s\n'
            + '\tNetwork in: %d events/s, %d kb/s\n'
            + '\tNetwork out: %d events/s, %d kb/s\n'
            + '\tStorage read: %d events/s, %d kb/s\n'
            + '\tStorage write: %d events/s, %d kb/s\n'
            + '\tTotal ongoing resends: %d (mean age %d ms)\n'
            + '\tTotal batches: %d (mean age %d ms)\n',
            connectionCount,
            formatNumber(inPerSecond),
            formatNumber(kbInPerSecond),
            formatNumber(outPerSecond),
            formatNumber(kbOutPerSecond),
            formatNumber(networkInPerSecond),
            formatNumber(networkKbInPerSecond),
            formatNumber(networkOutPerSecond),
            formatNumber(networkKbOutPerSecond),
            formatNumber(storageReadCountPerSecond),
            formatNumber(storageReadKbPerSecond),
            formatNumber(storageWriteCountPerSecond),
            formatNumber(storageWriteKbPerSecond),
            networkMetrics.resendMetrics.numOfOngoingResends,
            networkMetrics.resendMetrics.meanAge,
            storageMisc.Storage && storageMisc.Storage.storeStrategy ? storageMisc.Storage.storeStrategy.totalBatches : 0,
            storageMisc.Storage && storageMisc.Storage.storeStrategy ? storageMisc.Storage.storeStrategy.meanBatchAge : 0
        )

        this.inCount = 0
        this.outCount = 0
        this.inBytes = 0
        this.outBytes = 0
        this.storageReadCount = 0
        this.storageReadBytes = 0
        this.storageWriteCount = 0
        this.storageWriteBytes = 0

        this._sendReport({
            broker: this.lastVolumeStatistics,
            network: networkMetrics
        })
    }

    _sendReport(data) {
        if (this.client instanceof StreamrClient && this.streamId !== undefined) {
            this.client.publishHttp(this.streamId, data)
        }
    }

    close() {
        console.log('VolumeLogger closing.')
        clearInterval(this.interval)
    }
}
