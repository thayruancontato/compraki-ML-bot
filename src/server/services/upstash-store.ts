import { redis } from './redis';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

export class UpstashRedisStore {
    private sessionKey: string = 'WWEBJS_SESSION';

    async sessionExists(options: { clientId: string }): Promise<boolean> {
        const key = `${this.sessionKey}:${options.clientId}`;
        const exists = await redis.exists(key);
        return exists === 1;
    }

    async save(options: { clientId: string }): Promise<void> {
        const key = `${this.sessionKey}:${options.clientId}`;
        const sessionPath = path.join(process.cwd(), `.wwebjs_auth/session-${options.clientId}`);
        
        if (!fs.existsSync(sessionPath)) return;

        const zip = new AdmZip();
        zip.addLocalFolder(sessionPath);
        const buffer = zip.toBuffer();
        const base64 = buffer.toString('base64');

        await redis.set(key, base64);
        console.log(`[UpstashStore] Sessão ${options.clientId} salva no Redis.`);
    }

    async extract(options: { clientId: string }): Promise<void> {
        const key = `${this.sessionKey}:${options.clientId}`;
        const base64 = await redis.get<string>(key);
        
        if (!base64) return;

        const buffer = Buffer.from(base64, 'base64');
        const zip = new AdmZip(buffer);
        const sessionPath = path.join(process.cwd(), `.wwebjs_auth/session-${options.clientId}`);

        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        zip.extractAllTo(sessionPath, true);
        console.log(`[UpstashStore] Sessão ${options.clientId} extraída do Redis.`);
    }

    async delete(options: { clientId: string }): Promise<void> {
        const key = `${this.sessionKey}:${options.clientId}`;
        await redis.del(key);
        console.log(`[UpstashStore] Sessão ${options.clientId} deletada do Redis.`);
    }
}
