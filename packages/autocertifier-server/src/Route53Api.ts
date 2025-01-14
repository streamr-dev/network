import {
    Route53Client,
    ListResourceRecordSetsCommand,
    ListResourceRecordSetsCommandOutput,
    ChangeResourceRecordSetsCommand,
    ChangeAction,
    RRType,
    ChangeResourceRecordSetsCommandOutput
} from '@aws-sdk/client-route-53'

interface Record {
    fqdn: string
    value: string
}
export class Route53Api {
    private hostedZoneId: string
    private client: Route53Client

    constructor(region: string, hostedZoneId: string) {
        this.hostedZoneId = hostedZoneId
        this.client = new Route53Client({ region })
    }

    public async changeRecords(
        action: ChangeAction,
        recordType: RRType,
        records: Record[],
        ttl: number
    ): Promise<ChangeResourceRecordSetsCommandOutput> {
        const input = {
            HostedZoneId: this.hostedZoneId,
            ChangeBatch: {
                Changes: records.map((record) => {
                    return {
                        Action: action,
                        ResourceRecordSet: {
                            Name: record.fqdn,
                            Type: recordType,
                            TTL: ttl,
                            ResourceRecords: [
                                {
                                    Value: record.value
                                }
                            ]
                        }
                    }
                })
            }
        }
        const command = new ChangeResourceRecordSetsCommand(input)
        const response = await this.client.send(command)

        return response
    }

    public async upsertRecord(
        recordType: RRType,
        fqdn: string,
        value: string,
        ttl: number
    ): Promise<ChangeResourceRecordSetsCommandOutput> {
        return this.changeRecords(ChangeAction.UPSERT, recordType, [{ fqdn, value }], ttl)
    }

    public async deleteRecord(
        recordType: RRType,
        fqdn: string,
        value: string,
        ttl: number
    ): Promise<ChangeResourceRecordSetsCommandOutput> {
        return this.changeRecords(ChangeAction.DELETE, recordType, [{ fqdn, value }], ttl)
    }

    // Debugging tool to list all records in a zone
    public async listRecords(): Promise<ListResourceRecordSetsCommandOutput> {
        const input = {
            HostedZoneId: this.hostedZoneId
        }

        const command = new ListResourceRecordSetsCommand(input)
        const response = await this.client.send(command)
        return response
    }
}
