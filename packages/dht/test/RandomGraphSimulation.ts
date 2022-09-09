/* eslint-disable no-console */

import KBucket from 'k-bucket'
import { range } from 'lodash'

const compareIds = (id1: Uint8Array, id2: Uint8Array) => {
    const sorted = [id1, id2].sort()
    return KBucket.distance(sorted[0], sorted[1])
}

const generateIDs = (count: number): Uint8Array[] => {
    return range(count).map((i) => new Uint8Array([i, 1, 1]))
}

const count = 9
const ids = generateIDs(count)

const distances = ids.map((id1) => ids.map((id2) => {
    return {
        distance: compareIds(id1, id2),
        id: id2.toString()
    }
}))

const graph: any[] = []
for (let i = 0; i < count; i++) {
    const sorted = distances[i].sort((a, b) => a.distance - b.distance)
    graph.push([sorted[1], sorted[2], sorted[3], sorted[4]])
}
const result = new Map<string, number>()
ids.forEach((key) => {
    result.set(key.toString(), 0)
})

for (let i = 0; i < count; i++) {
    graph[i].forEach((val: any) => {
        result.set(val.id, result.get(val.id)! + 1)
    })
}

const bidirectional = ids.map((id, i) => {
    const stringId = id.toString()
    const allFound = graph[i].some((obj: any) => {
        const neighborId = obj.id
        const neighborIndex = parseInt(neighborId.split(',')[0])
        return graph[neighborIndex].some((obj: any) => obj.id === stringId)
    })
    return allFound
})

console.log(bidirectional)
console.log(graph)
