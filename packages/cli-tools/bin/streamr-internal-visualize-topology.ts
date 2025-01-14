#!/usr/bin/env node
import { createCommand } from '../src/command'
import fs from 'fs'

interface Topology {
    neighbors: Record<string, string[]>
    labels?: Record<string, string>
    route?: string[]
}

const SHORT_ID_LENGTH = 4

const generateGradientColors = (count: number): string[] => {
    const START_COLOR = 'eeee22'
    const END_COLOR = '88ee20'
    const startRGB = parseInt(START_COLOR, 16)
    const endRGB = parseInt(END_COLOR, 16)
    const getComponent = (rgb: number, shift: number) => (rgb >> shift) & 0xff
    const startR = getComponent(startRGB, 16)
    const startG = getComponent(startRGB, 8)
    const startB = getComponent(startRGB, 0)
    const endR = getComponent(endRGB, 16)
    const endG = getComponent(endRGB, 8)
    const endB = getComponent(endRGB, 0)
    const colors: string[] = []
    for (let step = 0; step < count; step++) {
        const getOutput = (start: number, end: number) =>
            Math.round(start + ((end - start) * step) / count)
                .toString(16)
                .padStart(2, '0')
        const stepR = getOutput(startR, endR)
        const stepG = getOutput(startG, endG)
        const stepB = getOutput(startB, endB)
        colors.push(`#${stepR}${stepG}${stepB}`)
    }
    return colors
}

const getNodeIds = (topology: Topology): Set<string> => {
    const result: Set<string> = new Set()
    for (const nodeId of Object.keys(topology.neighbors)) {
        result.add(nodeId)
        for (const neighborId of topology.neighbors[nodeId]) {
            result.add(neighborId)
        }
    }
    return result
}

const createGraph = (topology: Topology) => {
    const lines = ['strict graph {']
    lines.push('    layout="fdp"')
    lines.push('    size="16,9"')
    lines.push('    ratio="fill"')
    lines.push('    overlap=false')
    lines.push('    node [style=filled]')
    lines.push('    graph [splines=curved]')
    for (const nodeId of getNodeIds(topology)) {
        const shortNodeId = nodeId.substring(0, SHORT_ID_LENGTH)
        const explicitLabel = topology.labels !== undefined ? topology.labels[nodeId] : undefined
        const attributes =
            explicitLabel !== undefined
                ? `label="${explicitLabel}: ${shortNodeId}", penwidth=3`
                : `label="${shortNodeId}"`
        lines.push(`    "${nodeId}" [${attributes}]`)
    }
    if (topology.route !== undefined) {
        const colors = generateGradientColors(topology.route.length)
        for (let i = 0; i < topology.route.length; i++) {
            lines.push(`    "${topology.route[i]}" [fillcolor="${colors[i]}"]`)
        }
    }
    for (const nodeId of Object.keys(topology.neighbors)) {
        for (const neighborId of topology.neighbors[nodeId]) {
            lines.push(`    "${nodeId}" -- "${neighborId}"`)
        }
    }
    lines.push('}')
    return lines.join('\n')
}

const readStdin = async (): Promise<string> => {
    let text = ''
    for await (const chunk of process.stdin) {
        text += chunk
    }
    return text
}

const description = `Generates a DOT graph to visualize a network topology.
To render the output you can use e.g.:
- web site https://dreampuf.github.io/GraphvizOnline/
- Graphwiz application (https://formulae.brew.sh/formula/graphviz)
  (dot -Tsvg topology.dot -o topology.svg)

The definition JSON must contain neighbor definitions. It may optionally
contain labels and/or a route definition. Format:
{
   "neighbors": {
      "1111": ["2222", "3333"],
      "2222": ["3333", "4444"],
      "3333": ["2222", "4444", "5555"],
      "4444": ["5555", "8888"],
      "5555": ["6666", "7777", "9999"],
      "6666": ["8888", "9999"],
      "7777": ["1111"],
      "8888": ["9999", "3333"]
   },
   "labels": {
      "1111": "Foo",
      "5555": "Bar"
   },
   "route": ["3333", "4444", "5555", "6666", "8888"]
}`

createCommand()
    .description(description)
    .arguments('[topologyDefinitionFile]')
    .action(async (topologyDefinitionFile?: string) => {
        const topologyDefinition =
            topologyDefinitionFile !== undefined ? fs.readFileSync(topologyDefinitionFile, 'utf-8') : await readStdin()
        // TODO could validate the content
        console.info(createGraph(JSON.parse(topologyDefinition) as Topology))
    })
    .parse()
