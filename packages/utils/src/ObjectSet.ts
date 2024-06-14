export class ObjectSet<T> {
    private readonly map: Map<string, T> = new Map()
    private readonly formKey: (obj: T) => string

    constructor(formKey: (obj: T) => string) {
        this.formKey = formKey
    }

    add(obj: T): void {
        this.map.set(this.formKey(obj), obj)
    }

    has(obj: T): boolean {
        return this.map.has(this.formKey(obj))
    }

    get(obj: T): T | undefined {
        return this.map.get(this.formKey(obj))
    }

    delete(obj: T): boolean {
        return this.map.delete(this.formKey(obj))
    }

    clear(): void {
        this.map.clear()
    }
}
