import Ajv from 'ajv'
import { statusSchema, statusSchemaMultipleStreams, statusSchemaInboundNodes, statusSchemaNeighbors } from "./schemas"

const LATEST_STATUS_VERSION = "brubeck-1.0"

export class StatusValidator {
    private readonly versions: Record<string, any>
    private readonly fallbackVersions: Record<string, any>
    constructor() {
        const ajv = new Ajv()

        this.versions = {
            "brubeck-1.0": ajv.compile(statusSchema),
        }

        this.fallbackVersions = {
            "neighbors": ajv.compile(statusSchemaNeighbors),
            "inboundNodes": ajv.compile(statusSchemaInboundNodes),
            "multipleStreams": ajv.compile(statusSchemaMultipleStreams),
        }
    }
    validate(status: Record<string, any>, version?: string): boolean {
        if (version && version in this.versions) {
            return this.versions[version](status)
        }

        // Check latest version first as backup (mostly for easier test maintainability)
        return this.versions[LATEST_STATUS_VERSION](status) || Object.values(this.fallbackVersions).some((validator) => {
            return validator(status)
        })
    }
}
