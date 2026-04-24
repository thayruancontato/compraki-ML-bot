import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as path from 'path';

function appDataPath() {
  return process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
}

// Cria banco de dados na pasta do app
const dbPath = path.join(appDataPath(), 'compraki.db');
const sqlite = new Database(dbPath);

export const db = drizzle(sqlite, { schema });
