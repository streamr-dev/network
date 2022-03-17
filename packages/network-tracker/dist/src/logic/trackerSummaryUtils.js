"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findStreamsPartsForNode = exports.getNodesWithLocationData = exports.addRttsToNodeConnections = exports.getNodeConnections = exports.getStreamPartSizes = exports.getTopology = void 0;
const streamr_client_protocol_1 = require("streamr-client-protocol");
function getTopology(overlayPerStreamPart, connectionRtts, streamId = null, partition = null) {
    const topology = {};
    const streamParts = findStreamParts(overlayPerStreamPart, streamId, partition);
    streamParts.forEach((streamPartId) => {
        const overlay = overlayPerStreamPart[streamPartId].state();
        topology[streamPartId] = Object.assign({}, ...Object.entries(overlay).map(([nodeId, neighbors]) => {
            return addRttsToNodeConnections(nodeId, neighbors, connectionRtts);
        }));
    });
    return topology;
}
exports.getTopology = getTopology;
function getStreamPartSizes(overlayPerStreamPart, streamId = null, partition = null) {
    const streamParts = findStreamParts(overlayPerStreamPart, streamId, partition);
    const sizes = streamParts.map((streamPartId) => {
        const [streamId, partition] = streamr_client_protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        return {
            streamId,
            partition,
            nodeCount: overlayPerStreamPart[streamPartId].getNumberOfNodes()
        };
    });
    return sizes;
}
exports.getStreamPartSizes = getStreamPartSizes;
function getNodeConnections(nodes, overlayPerStreamPart) {
    const result = {};
    nodes.forEach((node) => {
        result[node] = new Set();
    });
    Object.values(overlayPerStreamPart).forEach((overlayTopology) => {
        Object.entries(overlayTopology.getNodes()).forEach(([nodeId, neighbors]) => {
            neighbors.forEach((neighborNode) => {
                if (!(nodeId in result)) {
                    result[nodeId] = new Set();
                }
                result[nodeId].add(neighborNode);
            });
        });
    });
    return result;
}
exports.getNodeConnections = getNodeConnections;
function addRttsToNodeConnections(nodeId, neighbors, connectionRtts) {
    return {
        [nodeId]: neighbors.map((neighborId) => {
            return {
                neighborId,
                rtt: getNodeToNodeConnectionRtts(nodeId, neighborId, connectionRtts[nodeId], connectionRtts[neighborId])
            };
        })
    };
}
exports.addRttsToNodeConnections = addRttsToNodeConnections;
function getNodesWithLocationData(nodes, locations) {
    return Object.assign({}, ...nodes.map((nodeId) => {
        return {
            [nodeId]: locations[nodeId] || {
                latitude: null,
                longitude: null,
                country: null,
                city: null,
            }
        };
    }));
}
exports.getNodesWithLocationData = getNodesWithLocationData;
function findStreamsPartsForNode(overlayPerStreamPart, nodeId) {
    return Object.entries(overlayPerStreamPart)
        .filter(([_, overlayTopology]) => overlayTopology.hasNode(nodeId))
        .map(([streamPartId, overlayTopology]) => {
        const [streamId, partition] = streamr_client_protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        return {
            streamId,
            partition,
            topologySize: overlayTopology.getNumberOfNodes()
        };
    });
}
exports.findStreamsPartsForNode = findStreamsPartsForNode;
function getNodeToNodeConnectionRtts(nodeOne, nodeTwo, nodeOneRtts, nodeTwoRtts) {
    try {
        return nodeOneRtts[nodeTwo] || nodeTwoRtts[nodeOne] || null;
    }
    catch (err) {
        return null;
    }
}
function findStreamParts(overlayPerStreamPart, streamId = null, partition = null) {
    if (streamId === null) {
        return Object.keys(overlayPerStreamPart);
    }
    else if (partition === null) {
        return Object.keys(overlayPerStreamPart)
            .filter((streamPartId) => streamPartId.includes(streamId));
    }
    else {
        const targetStreamPartId = (0, streamr_client_protocol_1.toStreamPartID)(streamId, partition);
        return Object.keys(overlayPerStreamPart)
            .filter((candidateStreamPartId) => targetStreamPartId === candidateStreamPartId);
    }
}
//# sourceMappingURL=trackerSummaryUtils.js.map