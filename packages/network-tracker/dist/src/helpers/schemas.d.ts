export declare const statusSchema: {
    type: string;
    properties: {
        streamPart: {
            type: string;
            properties: {
                id: {
                    type: string;
                };
                partition: {
                    type: string;
                };
                neighbors: {
                    type: string;
                };
                counter: {
                    type: string;
                };
            };
            required: string[];
        };
        rtts: {
            type: string[];
            additionalProperties: boolean;
        };
        location: {
            type: string;
            properties: {
                latitude: {
                    type: string[];
                };
                longitude: {
                    type: string[];
                };
                country: {
                    type: string[];
                };
                city: {
                    type: string[];
                };
            };
            additionalProperties: boolean;
        };
        started: {
            type: string;
        };
    };
    required: string[];
    additionalProperties: boolean;
};
