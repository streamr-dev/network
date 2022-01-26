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
        streamPart: streamStatusSchemaLatest,
        rtts: rttSchema,
        location: locationSchema,
        started: {
            type: "string"
        },
    },
    required: ["streamPart"],
    additionalProperties: true
}
