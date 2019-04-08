// From: https://gist.github.com/guilhermepontes/17ae0cc71fa2b13ea8c20c94c5c35dc4
const shuffleArray = (arr) => arr
    .map((a) => [Math.random(), a])
    .sort((a, b) => a[0] - b[0])
    .map((a) => a[1])

const pickRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)]

class OverlayTopology {
    constructor(maxNeighborsPerNode, shuffleArrayFunction, pickRandomElementFunction) {
        if (!Number.isInteger(maxNeighborsPerNode)) {
            throw new Error('maxNeighborsPerNode is not an integer')
        }
        this.maxNeighborsPerNode = maxNeighborsPerNode
        this.nodes = {}
        this.shuffleArray = shuffleArrayFunction || shuffleArray
        this.pickRandomElement = pickRandomElementFunction || pickRandomElement
    }

    hasNode(nodeId) {
        return nodeId in this.nodes
    }

    update(nodeId, neighbors) {
        const knownNeighbors = [...neighbors].filter((n) => n in this.nodes)

        this.nodes[nodeId] = new Set(knownNeighbors)
        knownNeighbors.forEach((neighbor) => this.nodes[neighbor].add(nodeId))
        Object.keys(this.nodes)
            .filter((n) => !this.nodes[nodeId].has(n))
            .forEach((n) => this.nodes[n].delete(nodeId))
    }

    leave(nodeId) {
        if (this.nodes[nodeId] != null) {
            this.nodes[nodeId].forEach((neighbor) => this.nodes[neighbor].delete(nodeId))
            delete this.nodes[nodeId]
        }
    }

    state() {
        return Object.assign(...Object.entries(this.nodes).map(([nodeId, neighbors]) => {
            return {
                [nodeId]: [...neighbors].sort()
            }
        }))
    }

    formInstructions(nodeId) {
        const updatedNodes = new Set()

        const excessNeighbors = -this._numOfMissingNeighbors(nodeId)
        if (excessNeighbors > 0) {
            const reducedNeighbors = this.shuffleArray([...this.nodes[nodeId]]).slice(0, this.maxNeighborsPerNode)
            this.update(nodeId, reducedNeighbors)
            updatedNodes.add(nodeId)
        }

        if (this._numOfMissingNeighbors(nodeId) > 0) {
            const candidates = Object.entries(this.nodes)
                .filter(([n, neighbors]) => neighbors.size < this.maxNeighborsPerNode) // nodes with open slots
                .filter(([n, neighbors]) => !neighbors.has(nodeId)) // nodes that are not yet neighbors
                .filter(([n, _]) => n !== nodeId) // remove self
                .map(([n, _]) => n)

            const neighborsToAdd = this.shuffleArray(candidates).slice(0, this._numOfMissingNeighbors(nodeId))
            if (neighborsToAdd.length > 0) {
                this.update(nodeId, [...this.nodes[nodeId], ...neighborsToAdd])
                updatedNodes.add(nodeId)
            }
        }

        // At this point in code, if numOfMissingNeighbors > 0, we can assume that all nodes that we aren't yet
        // neighbor with are full. Disconnecting any existing link in this set of nodes will open 2 free slots into the
        // network overall. Thus we want to make sure that we have at least 2 free slots ourselves otherwise we will
        // leave one slot free which could lead to a never-ending chain of disconnects and connects, one node at a time.
        if (this._numOfMissingNeighbors(nodeId) > 1) {
            const candidates = Object.entries(this.nodes)
                .filter(([n, neighbors]) => neighbors.size >= this.maxNeighborsPerNode) // full nodes
                .filter(([n, neighbors]) => !neighbors.has(nodeId)) // nodes that are not yet neighbors
                .filter(([n, _]) => n !== nodeId) // remove self
                .map(([n, _]) => n)

            let disconnectionTargets = this.shuffleArray(candidates).reverse()
            while (this._numOfMissingNeighbors(nodeId) > 1 && disconnectionTargets.length > 0) {
                const n1 = disconnectionTargets.pop()
                const n2candidates = [...this.nodes[n1]].filter((n) => !this.nodes[n].has(nodeId))

                if (n2candidates.length > 0) {
                    const n2 = this.pickRandomElement(n2candidates)

                    // Since we link nodeId to n2 as well, make sure to remove n2 from disconnectionTargets if it is
                    // present. If this not done a node may get assigned as its own neighbour in subsequent iterations.
                    disconnectionTargets = disconnectionTargets.filter((t) => t !== n2)

                    this.nodes[n1].delete(n2)
                    this.nodes[n2].delete(n1)
                    this.nodes[n1].add(nodeId)
                    this.nodes[n2].add(nodeId)
                    this.nodes[nodeId].add(n1)
                    this.nodes[nodeId].add(n2)

                    updatedNodes.add(nodeId)
                    updatedNodes.add(n1)
                    updatedNodes.add(n2)
                }
            }
        }

        // check invariant: no node should be a neighbor of itself
        // TODO: can be removed for performance optimization
        updatedNodes.forEach((n) => {
            if (this.nodes[n].has(n)) {
                throw new Error(`invariant violated: ${n} neighbor of itself`)
            }
        })

        return updatedNodes.size === 0 ? {} : Object.assign(...[...updatedNodes].map((n) => {
            return {
                [n]: [...this.nodes[n]]
            }
        }))
    }

    _numOfMissingNeighbors(nodeId) {
        return this.maxNeighborsPerNode - this.nodes[nodeId].size
    }
}

// Enable importing into browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OverlayTopology
}
