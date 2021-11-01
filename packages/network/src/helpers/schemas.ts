const streamStatusSchemaLatest = {
    type: "object",
    properties: {
        id: {
            type: "string"
        },
        partition: {
            type: "number"
        },
        neighbors: {
            type: "array"
        },
        counter: {
            type: "number"
        }
    },
    required: ["id", "partition", "neighbors", "counter"]
}

const streamStatusSchemaMultipleStreams = {
    type: "object",
    additionalProperties: true
}

const streamStatusSchemaInboundNodes = {
    type: "object",
    properties: {
        streamKey: {
            type: "string"
        },
        inboundNodes: {
            type: "array"
        },
        counter: {
            type: "number"
        }
    },
    required: ["streamKey", "inboundNodes", "counter"]
}

const streamStatusSchemaNeighbors = {
    type: "object",
    properties: {
        streamKey: {
            type: "string"
        },
        neighbors: {
            type: "array"
        },
        counter: {
            type: "number"
        }
    },
    required: ["streamKey", "neighbors", "counter"]
}

const rttSchema = {
    type: ["object", "null"],
    additionalProperties: true
}

const locationSchema = {
    type: "object",
    properties: {
        latitude: {
            type: ["number", "null"]
        },
        longitude: {
            type: ["number", "null"]
        },
        country: {
            type: ["string", "null"]
        },
        city: {
            type: ["string", "null"]
        }
    },
    additionalProperties: false
}

export const statusSchema = {
    type: "object",
    properties: {
        stream: streamStatusSchemaLatest,
        rtts: rttSchema,
        location: locationSchema,
        started: {
            type: "string"
        },
    },
    required: ["stream"],
    additionalProperties: true
}

export const statusSchemaInboundNodes = {
    type: "object",
    properties: {
        stream: streamStatusSchemaInboundNodes,
        rtts: rttSchema,
        location: locationSchema,
        started: {
            type: "string"
        },
    },
    required: ["stream"],
    additionalProperties: true
}

export const statusSchemaNeighbors = {
    type: "object",
    properties: {
        stream: streamStatusSchemaNeighbors,
        rtts: rttSchema,
        location: locationSchema,
        started: {
            type: "string"
        },
    },
    required: ["stream"],
    additionalProperties: true
}

export const statusSchemaMultipleStreams = {
    type: "object",
    properties: {
        streams: streamStatusSchemaMultipleStreams,
        rtts: rttSchema,
        location: locationSchema,
        started: {
            type: "string"
        },
    },
    required: ["streams"],
    additionalProperties: true
}