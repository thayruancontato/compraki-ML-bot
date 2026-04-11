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

    private async pruneSession(sessionPath: string) {
        const foldersToExclude = [
            'Cache',
            'Code Cache',
            'Service Worker',
            'Media Cache',
            'GPUCache',
            'blob_storage',
            'Session Storage'
        ];

        const defaultPath = path.join(sessionPath, 'Default');
        if (fs.existsSync(defaultPath)) {
            foldersToExclude.forEach(folder => {
                const folderPath = path.join(defaultPath, folder);
                if (fs.existsSync(folderPath)) {
                    try {
                        fs.rmSync(folderPath, { recursive: true, force: true });
                        console.log(`[UpstashStore] Limpeza: Removido ${folder}`);
                    } catch (e) {
                        console.warn(`[UpstashStore] Falha ao remover ${folder}:`, e);
                    }
                }
            });
        }
    }

    async save(options: { clientId: string }): Promise<void> {
        const key = `${this.sessionKey}:${options.clientId}`;
        const sessionPath = path.join(process.cwd(), `.wwebjs_auth/session-${options.clientId}`);
        
        if (!fs.existsSync(sessionPath)) {
            console.log(`[UpstashStore] Pasta de sessão não encontrada em ${sessionPath}`);
            return;
        }

        // Otimização crucial para Redis REST (Limite 100MB)
        await this.pruneSession(sessionPath);

        const zip = new AdmZip();
        zip.addLocalFolder(sessionPath);
        const buffer = zip.toBuffer();
        
        const sizeMB = buffer.length / 1024 / 1024;
        console.log(`[UpstashStore] Tamanho da sessão zipada: ${sizeMB.toFixed(2)}MB`);

        if (sizeMB > 100) {
            console.error(`[UpstashStore] ERRO: Sessão ainda muito grande (${sizeMB.toFixed(2)}MB). Reduzindo arquivos...`);
            // Se ainda for grande, podemos ser mais agressivos no prune se necessário.
        }

        const base64 = buffer.toString('base64');
        await redis.set(key, base64);
        console.log(`[UpstashStore] Sessão ${options.clientId} salva no Redis com sucesso.`);
    }

    async extract(options: { clientId: string }): Promise<void> {
        const key = `${this.sessionKey}:${options.clientId}`;
        const base64 = await redis.get<string>(key);
        
        if (!base64) {
            console.log(`[UpstashStore] Nenhuma sessão encontrada no Redis para ${options.clientId}`);
            return;
        }

        const buffer = Buffer.from(base64, 'base64');
        const zip = new AdmZip(buffer);
        const sessionPath = path.join(process.cwd(), `.wwebjs_auth/session-${options.clientId}`);

        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        zip.extractAllTo(sessionPath, true);
        console.log(`[UpstashStore] Sessão ${options.clientId} extraída do Redis e pronta para uso.`);
    }

    async delete(options: { clientId: string }): Promise<void> {
        const key = `${this.sessionKey}:${options.clientId}`;
        await redis.del(key);
        console.log(`[UpstashStore] Sessão ${options.clientId} deletada do Redis.`);
    }
}
