/* eslint-disable no-console */

import { DhtAddress } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/utils'
import { groupBy, range } from 'lodash'
import { streamPartIdToDataKey } from '../../src/logic/ContentDeliveryManager'

describe('StreamPartIdDataKeyDistribution', () => {
    it('partitions are well distributed', () => {
        const streamId = 'stream'
        const dataKeys = range(100).map((i) => {
            const streamPartId = StreamPartIDUtils.parse(streamId + '#' + i)
            return streamPartIdToDataKey(streamPartId)
        })

        const byInitials = groupBy(dataKeys, (dataKey: DhtAddress) => dataKey[0])
        expect(Object.keys(byInitials).length).toEqual(16)
        console.log(Object.values(byInitials).map((a) => a.length))
    })

    it('streamIds are well distributed', () => {
        const dataKeys = range(10000).map(() => {
            const streamPartId = StreamPartIDUtils.parse(Math.random().toString(32).substr(2, 32) + '#0')
            return streamPartIdToDataKey(streamPartId)
        })
        const byInitials = groupBy(dataKeys, (dataKey: DhtAddress) => dataKey[0])
        expect(Object.keys(byInitials).length).toEqual(16)
        console.log(Object.values(byInitials).map((a) => a.length))
    })

    it('streamPartIds are well distributed', () => {
        const streamIds = range(10000).map(() => Math.random().toString(32).substr(2, 32))
        const dataKeys: DhtAddress[] = []
        streamIds.forEach((streamId) => {
            range(100).forEach((i) => {
                const streamPartId = StreamPartIDUtils.parse(streamId + '#' + i)
                dataKeys.push(streamPartIdToDataKey(streamPartId))
            })
        })

        const byInitials = groupBy(dataKeys, (dataKey: DhtAddress) => dataKey[0])
        expect(Object.keys(byInitials).length).toEqual(16)
        console.log(Object.values(byInitials).map((a) => a.length))

        const byTwoInitials = groupBy(dataKeys, (dataKey: DhtAddress) => dataKey[0] + dataKey[1])
        expect(Object.keys(byTwoInitials).length).toEqual(16 * 16)
        console.log(Object.values(byTwoInitials).map((a) => a.length))

        const byThreeInitials = groupBy(dataKeys, (dataKey: DhtAddress) => dataKey[0] + dataKey[1] + dataKey[2])
        expect(Object.keys(byThreeInitials).length).toEqual(16 * 16 * 16)
        console.log(Object.values(byThreeInitials).map((a) => a.length))

        const byFourInitials = groupBy(
            dataKeys,
            (dataKey: DhtAddress) => dataKey[0] + dataKey[1] + dataKey[2] + dataKey[3]
        )
        expect(Object.keys(byFourInitials).length).toEqual(16 * 16 * 16 * 16)
        console.log(Object.values(byFourInitials).map((a) => a.length))
    })
})
