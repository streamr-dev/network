const { StreamIdAndPartition } = require('../identifiers')

const getTopology = (overlayPerStream, streamId = null, partition = null) => {
    const topology = {}

    let streamKeys = []

    if (streamId && partition === null) {
        streamKeys = Object.keys(overlayPerStream).filter((streamKey) => streamKey.includes(streamId))
    } else {
        let askedStreamKey = null
        if (streamId && Number.isSafeInteger(partition) && partition >= 0) {
            askedStreamKey = new StreamIdAndPartition(streamId, Number.parseInt(partition, 10))
        }

        streamKeys = askedStreamKey
            ? Object.keys(overlayPerStream).filter((streamKey) => streamKey === askedStreamKey.toString())
            : Object.keys(overlayPerStream)
    }

    streamKeys.forEach((streamKey) => {
        topology[streamKey] = overlayPerStream[streamKey].state()
    })

    return topology
}

const getTopologyUnion = (overlayPerStream) => {
    const mergeSetMapInto = (target, source) => { // merges each source value (a Set object) into the target value with the same key
        Object.keys(source).forEach((key) => {
            const sourceSet = source[key]
            const targetSet = target[key]
            const mergedSet = (targetSet !== undefined) ? new Set([...targetSet, ...sourceSet]) : sourceSet
            target[key] = mergedSet // eslint-disable-line no-param-reassign
        })
        return target
    }
    const nodeMaps = Object.values(overlayPerStream).map((topology) => topology.getNodes())
    return nodeMaps.reduce((accumulator, current) => mergeSetMapInto(accumulator, current), {})
}

module.exports = {
    getTopology,
    getTopologyUnion
}
