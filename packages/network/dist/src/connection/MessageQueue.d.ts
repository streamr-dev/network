type ErrorInfo = Record<string, unknown>;
export declare class QueueItem<M> {
    private static nextNumber;
    private readonly message;
    private readonly onSuccess;
    private readonly onError;
    private readonly errorInfos;
    readonly no: number;
    private tries;
    private failed;
    constructor(message: M, onSuccess: () => void, onError: (err: Error) => void);
    getMessage(): M;
    getErrorInfos(): ReadonlyArray<ErrorInfo>;
    isFailed(): boolean;
    delivered(): void;
    incrementTries(info: ErrorInfo): void | never;
    immediateFail(errMsg: string): void;
}
export declare class MessageQueue<M> {
    static readonly MAX_TRIES = 10;
    private readonly heap;
    private readonly logger;
    private readonly maxSize;
    constructor(maxSize: number);
    add(message: M): Promise<void>;
    peek(): QueueItem<M>;
    pop(): QueueItem<M>;
    size(): number;
    empty(): boolean;
    clear(): boolean;
}
export {};
