// From: https://gist.github.com/guilhermepontes/17ae0cc71fa2b13ea8c20c94c5c35dc4
const shuffleArray = <T>(arr: Array<T>): Array<T> => arr
    .map((a: T) => [Math.random(), a] as [number, T])
    .sort((a: [number, T], b: [number, T]) => a[0] - b[0])
    .map((a: [number, T]) => a[1])

const pickRandomElement = <T>(arr: Array<T>): T => arr[Math.floor(Math.random() * arr.length)]

export interface TopologyState {
    [key: string]: Array<string>
}

export interface Instructions {
    [key: string]: string[]
}

export interface TopologyNodes {
    [key: string]: Set<string>
}

export class OverlayTopology {
    private readonly maxNeighborsPerNode: number
    private readonly shuffleArray: (arr: Array<string>) => Array<string>
    private readonly pickRandomElement: (arr: Array<string>) => string
    private readonly nodes: TopologyNodes

    constructor(
        maxNeighborsPerNode: number,
        shuffleArrayFunction = shuffleArray,
        pickRandomElementFunction = pickRandomElement
    ) {
        if (!Number.isInteger(maxNeighborsPerNode)) {
            throw new Error('maxNeighborsPerNode is not an integer')
        }
        this.maxNeighborsPerNode = maxNeighborsPerNode
        this.shuffleArray = shuffleArrayFunction
        this.pickRandomElement = pickRandomElementFunction
        this.nodes = {}
    }

    getNeighbors(nodeId: string): Set<string> {
        return this.hasNode(nodeId) ? this.nodes[nodeId] : new Set<string>()
    }

    getNumberOfNodes(): number {
        return Object.keys(this.nodes).length
    }

    hasNode(nodeId: string): boolean {
        return nodeId in this.nodes
    }

    update(nodeId: string, neighbors: string[]): void {
        const knownNeighbors = [...neighbors]
            .filter((n) => n in this.nodes)
            .filter((n) => n !== nodeId) // in case nodeId is reporting itself as neighbor

        this.nodes[nodeId] = new Set(knownNeighbors)
        knownNeighbors.forEach((neighbor) => this.nodes[neighbor].add(nodeId))
        Object.keys(this.nodes)
            .filter((n) => !this.nodes[nodeId].has(n))
            .forEach((n) => {
                this.nodes[n].delete(nodeId)
            })
    }

    leave(nodeId: string): string[] {
        if (this.nodes[nodeId] != null) {
            const neighbors = [...this.nodes[nodeId]]
            this.nodes[nodeId].forEach((neighbor) => {
                this.nodes[neighbor].delete(nodeId)
            })
            delete this.nodes[nodeId]
            return neighbors
        }
        return []
    }

    isEmpty(): boolean {
        return Object.entries(this.nodes).length === 0
    }

    state(): TopologyState {
        const objects = Object.entries(this.nodes).map(([nodeId, neighbors]) => {
            return {
                [nodeId]: [...neighbors].sort()
            }
        })
        return Object.assign({}, ...objects)
    }

    formInstructions(nodeId: string, forceGenerate = false): Instructions {
        if (!this.nodes[nodeId]) {
            return {}
        }
        const updatedNodes: Set<string> = new Set()

        const excessNeighbors = -this.numOfMissingNeighbors(nodeId)
        if (excessNeighbors > 0) {
            const reducedNeighbors = this.shuffleArray([...this.nodes[nodeId]]).slice(0, this.maxNeighborsPerNode)
            this.update(nodeId, reducedNeighbors)
            updatedNodes.add(nodeId)
        }

        if (this.numOfMissingNeighbors(nodeId) > 0) {
            const candidates = Object.entries(this.nodes)
                .filter(([_n, neighbors]) => neighbors.size < this.maxNeighborsPerNode) // nodes with open slots
                .filter(([_n, neighbors]) => !neighbors.has(nodeId)) // nodes that are not yet neighbors
                .filter(([n, _]) => n !== nodeId) // remove self
                .map(([n, _]) => n)

            const neighborsToAdd = this.shuffleArray(candidates).slice(0, this.numOfMissingNeighbors(nodeId))
            if (neighborsToAdd.length > 0) {
                this.update(nodeId, [...this.nodes[nodeId], ...neighborsToAdd])
                updatedNodes.add(nodeId)
                neighborsToAdd.forEach((neighbor) => {
                    updatedNodes.add(neighbor)
                })
            }
        }

        // At this point in code, if numOfMissingNeighbors > 0, we can assume that all nodes that we aren't yet
        // neighbor with are full. Disconnecting any existing link in this set of nodes will open 2 free slots into the
        // network overall. Thus we want to make sure that we have at least 2 free slots ourselves otherwise we will
        // leave one slot free which could lead to a never-ending chain of disconnects and connects, one node at a time.
        if (this.numOfMissingNeighbors(nodeId) > 1) {
            const candidates = Object.entries(this.nodes)
                .filter(([_n, neighbors]) => neighbors.size >= this.maxNeighborsPerNode) // full nodes
                .filter(([_n, neighbors]) => !neighbors.has(nodeId)) // nodes that are not yet neighbors
                .filter(([n, _]) => n !== nodeId) // remove self
                .map(([n, _]) => n)

            let disconnectionTargets = this.shuffleArray(candidates).reverse()
            while (this.numOfMissingNeighbors(nodeId) > 1 && disconnectionTargets.length > 0) {
                const n1 = disconnectionTargets.pop() as string
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

        if (forceGenerate) {
            updatedNodes.add(nodeId)
        }

        // check invariant: no node should be a neighbor of itself
        // TODO: can be removed for performance optimization
        updatedNodes.forEach((n) => {
            if (this.nodes[n].has(n)) {
                throw new Error(`invariant violated: ${n} neighbor of itself`)
            }
        })

        return Object.assign({}, ...[...updatedNodes].map((n) => {
            return {
                [n]: [...this.nodes[n]]
            }
        }))
    }

    private numOfMissingNeighbors(nodeId: string): number {
        return this.maxNeighborsPerNode - this.nodes[nodeId].size
    }
}
