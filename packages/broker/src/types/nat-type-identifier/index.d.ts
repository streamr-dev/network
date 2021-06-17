declare module 'nat-type-identifier' {
    export default function getNatType(opts: {
        logsEnabled: boolean, 
        sampleCount: number, 
        stunHost: string
    }): string
}