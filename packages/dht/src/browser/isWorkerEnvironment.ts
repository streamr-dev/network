// WorkerGlobalScope is only defined inside Web Workers.
// We declare it here so the browser build (which only includes DOM lib) compiles.
declare const WorkerGlobalScope: { prototype: object } | undefined

export const isWorkerEnvironment: boolean =
    typeof WorkerGlobalScope !== 'undefined' && self instanceof (WorkerGlobalScope as unknown as new () => object)
