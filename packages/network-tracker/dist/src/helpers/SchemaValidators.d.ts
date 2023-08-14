export declare class StatusValidator {
    private readonly versions;
    constructor();
    validate(status: Record<string, any>, version?: string): boolean;
}
