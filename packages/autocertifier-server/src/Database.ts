/* eslint-disable quotes */

import sqlite3 from 'sqlite3'
import { open, Statement, Database as SqliteDatabase } from 'sqlite'
import { Logger, filePathToNodeFormat } from '@streamr/utils'
import { DatabaseError, InvalidSubdomainOrToken } from '@streamr/autocertifier-client'

const logger = new Logger('Database')

export class Database {

    private db?: SqliteDatabase
    // TODO: create statements on demand when needed, no need to hold these as fields
    private createSubdomainStatement?: Statement
    private getSubdomainStatement?: Statement
    private getAllSubdomainsStatement?: Statement
    private getSubdomainWithTokenStatement?: Statement
    private updateSubdomainIpStatement?: Statement
    private getSubdomainAcmeChallengeStatement?: Statement
    private updateSubdomainAcmeChallengeStatement?: Statement
    private getSubdomainsByIpAndPortStatement?: Statement
    private databaseFilePath: string

    constructor(filePath: string) {
        this.databaseFilePath = filePathToNodeFormat(filePath)
    }

    public async createSubdomain(subdomain: string, ip: string, port: string, token: string): Promise<void> {
        try {
            const now = new Date().toISOString()
            await this.createSubdomainStatement!.run(subdomain, ip, port, token, now, now)
        } catch (e) {
            throw new DatabaseError('Failed to create subdomain ' + subdomain, e)
        }
        logger.info('Subdomain created: ' + subdomain)
    }

    public async getSubdomain(subdomain: string): Promise<Subdomain | undefined> {
        let ret: Subdomain | undefined
        try {
            ret = await this.getSubdomainStatement!.get(subdomain)
        } catch (e) {
            throw new DatabaseError('Failed to get subdomain ' + subdomain, e)
        }
        if (!ret) {
            throw new DatabaseError('Subdomain not found ' + subdomain)
        }
        return ret
    }

    public async getAllSubdomains(): Promise<Subdomain[] | undefined> {
        let ret: Subdomain[] | undefined
        try {
            ret = await this.getAllSubdomainsStatement!.all()
        } catch (e) {
            throw new DatabaseError('Failed to get all subdomains ', e)
        }
        if (!ret) {
            throw new DatabaseError('Subdomain not found ')
        }
        return ret
    }

    public async getSubdomainsByIpAndPort(ip: string, port: string): Promise<Subdomain[]> {
        let ret: Subdomain[]
        try {
            ret = await this.getSubdomainsByIpAndPortStatement!.all(ip, port)
        } catch (e) {
            throw new DatabaseError(`Failed to get subdomains for IP ${ip} and port ${port}`, e)
        }
        return ret || []
    }

    private async getSubdomainWithToken(subdomain: string, token: string): Promise<Subdomain | undefined> {
        let ret: Subdomain | undefined
        try {
            ret = await this.getSubdomainWithTokenStatement!.get(subdomain, token)
        } catch (e) {
            throw new DatabaseError('Failed to get subdomain ' + subdomain, e)
        }
        if (!ret) {
            throw new DatabaseError('Subdomain not found ' + subdomain)
        }
        return ret
    }

    public async updateSubdomainIp(subdomain: string, ip: string, port: string, token: string): Promise<void> {
        try {
            await this.getSubdomainWithToken(subdomain, token)
        } catch (e) {
            throw new InvalidSubdomainOrToken('Invalid subdomain or token ' + subdomain, e)
        }
        try {
            const now = new Date().toISOString()
            await this.updateSubdomainIpStatement!.run(ip, port, now, subdomain, token)
        } catch (e) {
            throw new DatabaseError('Failed to update subdomain ' + subdomain, e)
        }
        logger.info('Subdomain ip and port updated')
    }

    public async updateSubdomainAcmeChallenge(subdomain: string, acmeChallenge: string): Promise<void> {
        logger.info('Updating subdomain acme challenge' + acmeChallenge + '  for ' + subdomain)
        try {
            await this.updateSubdomainAcmeChallengeStatement!.run(acmeChallenge, subdomain)
        } catch (e) {
            throw new DatabaseError('Failed to update subdomain Acme challenge' + subdomain, e)
        }
        logger.info('Subdomain acme challenge updated')
    }

    public async start(): Promise<void> {
        this.db = await open({
            filename: this.databaseFilePath,
            driver: sqlite3.Database
        })

        const result = await this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", "subdomains")

        if (!result) {
            await this.createTables()
        }
        // eslint-disable-next-line max-len
        this.createSubdomainStatement = await this.db.prepare("INSERT INTO subdomains (subdomainName, ip, port, token, createdAt, modifiedAt) VALUES (?, ?, ?, ?, ?, ?)")
        this.getSubdomainStatement = await this.db.prepare("SELECT * FROM subdomains WHERE subdomainName = ?")
        this.getAllSubdomainsStatement = await this.db.prepare("SELECT * FROM subdomains")
        this.getSubdomainWithTokenStatement = await this.db.prepare("SELECT * FROM subdomains WHERE subdomainName = ? AND token = ?")
        // eslint-disable-next-line max-len
        this.updateSubdomainIpStatement = await this.db.prepare("UPDATE subdomains SET ip = ?, port = ?, modifiedAt = ? WHERE subdomainName = ? AND token = ?")
        this.getSubdomainAcmeChallengeStatement = await this.db.prepare("SELECT acmeChallenge FROM subdomains WHERE subdomainName = ?")
        this.updateSubdomainAcmeChallengeStatement = await this.db.prepare("UPDATE subdomains SET acmeChallenge = ? WHERE subdomainName = ?")
        this.getSubdomainsByIpAndPortStatement = await this.db.prepare("SELECT * FROM subdomains WHERE ip = ? AND port = ?")

        logger.info('Database is running')
    }

    public async stop(): Promise<void> {
        if (this.createSubdomainStatement) {
            await this.createSubdomainStatement.finalize()
        }
        if (this.getSubdomainStatement) {
            await this.getSubdomainStatement.finalize()
        }
        if (this.getAllSubdomainsStatement) {
            await this.getAllSubdomainsStatement.finalize()
        }
        if (this.getSubdomainWithTokenStatement) {
            await this.getSubdomainWithTokenStatement.finalize()
        }
        if (this.updateSubdomainIpStatement) {
            await this.updateSubdomainIpStatement.finalize()
        }
        if (this.getSubdomainAcmeChallengeStatement) {
            await this.getSubdomainAcmeChallengeStatement.finalize()
        }
        if (this.updateSubdomainAcmeChallengeStatement) {
            await this.updateSubdomainAcmeChallengeStatement.finalize()
        }
        if (this.getSubdomainsByIpAndPortStatement) {
            await this.getSubdomainsByIpAndPortStatement.finalize()
        }
        if (this.db) {
            await this.db.close()
        }
    }

    private async createTables(): Promise<void> {
        const query = `
            BEGIN TRANSACTION;
            CREATE TABLE subdomains (
                id INTEGER PRIMARY KEY,
                subdomainName TEXT NOT NULL,
                ip TEXT NOT NULL,
                port TEXT NOT NULL,
                token TEXT NOT NULL,
                acmeChallenge TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                modifiedAt DATETIME
            );
            CREATE INDEX subdomain_index on subdomains(subdomainName);
            CREATE INDEX ip_port_index on subdomains(ip, port);
            CREATE INDEX subdomain_token_index on subdomains(subdomainName, token);
            COMMIT;
        `
        await this.db!.exec(query)
    }
}

// TODO: name could imply database record
export interface Subdomain {
    // TODO: could be called just name / label? or a precise name
    subdomainName: string
    ip: string
    // TODO: the port should not be stored
    port: string
    token: string
    acmeChallenge?: string
    createdAt?: string // ISO format
    modifiedAt?: string // ISO format
    id?: number
}
