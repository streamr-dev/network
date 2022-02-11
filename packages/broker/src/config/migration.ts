export const CURRENT_CONFIGURATION_VERSION = 1

export const formSchemaUrl = (version: number): string => {
    return `http://schema.streamr.com/config-v${version}.schema.json`
}
