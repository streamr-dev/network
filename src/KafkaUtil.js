const events = require('events')
const kafka = require('kafka-node')
const debug = require('debug')('KafkaUtil')

module.exports = class KafkaUtil extends events.EventEmitter {
    constructor(dataTopic, partitioner, zookeeper, kafkaClient, kafkaProducer) {
        super()
        this.dataTopic = dataTopic
        this.partitioner = partitioner
        this.kafkaClient = kafkaClient || new kafka.Client(zookeeper, `streamr-kafka-producer-${Date.now()}`)

        this.kafkaClient.on('ready', () => {
            debug('Kafka client is ready. Refreshing metadata for data topic: %s', this.dataTopic)
            this.kafkaClient.refreshMetadata([dataTopic], (err) => {
                if (err) {
                    throw new Error(`Error while getting metadata for data topic ${this.dataTopic}: ${err}`)
                } else if (!this.kafkaClient.topicMetadata[this.dataTopic]) {
                    throw new Error(`Falsey topic metadata for ${this.dataTopic}: ${this.kafkaClient.topicMetadata[this.dataTopic]}`)
                }

                this.dataTopicPartitionCount = Object.keys(this.kafkaClient.topicMetadata[this.dataTopic]).length
                debug('Got metadata for data topic: %o', this.kafkaClient.topicMetadata[this.dataTopic])
                debug('Partition count is: %d', this.dataTopicPartitionCount)
                this.emit('ready')
            })
        })

        this.kafkaProducer = kafkaProducer || new kafka.HighLevelProducer(this.kafkaClient)

        this.kafkaClient.on('error', (err) => {
            throw err
        })

        this.kafkaProducer.on('error', (err) => {
            throw err
        })
    }

    send(streamrBinaryMessage, cb) {
        const produceRequest = {
            topic: this.dataTopic,
            // Directly set the partition using our custom partitioner for consistency with Java (KafkaService.CustomPartitioner)
            partition: this.partitioner.partition(
                this.dataTopicPartitionCount,
                `${streamrBinaryMessage.streamId}-${streamrBinaryMessage.streamPartition}`,
            ),
            messages: streamrBinaryMessage.toBytes(),
        }

        debug('Kafka produce request: %o', produceRequest)

        this.kafkaProducer.send([produceRequest], (err) => {
            debug('Kafka producer send callback err: ', err)

            if (err) {
                console.log('Error producing to Kafka: ', err)
            }
            if (cb) {
                cb(err)
            }
        })
    }
}
