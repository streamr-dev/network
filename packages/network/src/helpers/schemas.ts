const streamStatusSchema = {
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
        stream: streamStatusSchema,
        rtts: rttSchema,
        location: locationSchema,
        started: {
            type: "string"
        },
    },
    required: ["stream"],
    additionalProperties: true
}