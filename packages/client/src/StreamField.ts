export const VALID_FIELD_TYPES = ['number', 'string', 'boolean', 'list', 'map'] as const

export interface Field { // TODO we could rename this to StreamField (and VALID_FIELD_TYPES to VALID_STREAM_FIELD_TYPES) as the Field term is very generic?
    name: string
    type: typeof VALID_FIELD_TYPES[number]
}

function getFieldType(value: any): (Field['type'] | undefined) {
    const type = typeof value
    switch (true) {
        case Array.isArray(value): {
            return 'list'
        }
        case type === 'object': {
            return 'map'
        }
        case (VALID_FIELD_TYPES as ReadonlyArray<string>).includes(type): {
            // see https://github.com/microsoft/TypeScript/issues/36275
            return type as Field['type']
        }
        default: {
            return undefined
        }
    }
}

export const detectFields = (messageContent: any): Field[] => {
    return Object.entries(messageContent).map(([name, value]) => {
        const type = getFieldType(value)
        return !!type && {
            name,
            type,
        }
    }).filter(Boolean) as Field[] // see https://github.com/microsoft/TypeScript/issues/30621
}
