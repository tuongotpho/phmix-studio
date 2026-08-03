import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let rootDir = path.resolve(__dirname, '..', '..');
if (!fs.existsSync(path.join(rootDir, 'landing'))) {
  rootDir = path.resolve(__dirname, '..', '..', '..');
}
export const ROOT_DIR = rootDir;

export let firebaseConfig: any = null;
try {
  const configPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (err) {
  console.warn('Failed to load firebase-applet-config.json', err);
}

// PHẢI trùng với firebaseConfig.projectId trong gui/index.html — đây là project
// phát hành Firebase ID token, và jwtVerify() đối chiếu issuer/audience theo giá trị này.
// Lệch một ký tự là mọi token verify thất bại và tài khoản PRO bị hạ xuống 'guest'.
// (Hosting nằm ở project khác — phmix-web — nhưng Auth/Firestore/Storage ở phmix-studio.)
const FALLBACK_PROJECT_ID = 'phmix-studio';

const resolvedProjectId: string | undefined = process.env.FIREBASE_PROJECT_ID || firebaseConfig?.projectId;
if (!resolvedProjectId) {
  console.error(
    `[Config] Thiếu FIREBASE_PROJECT_ID — tạm dùng "${FALLBACK_PROJECT_ID}". ` +
    'Giá trị này PHẢI trùng với projectId trong firebaseConfig của gui/index.html; ' +
    'nếu lệch thì mọi Firebase ID token đều verify thất bại và tài khoản PRO bị hạ xuống "guest". ' +
    'Kiểm tra giá trị đang chạy bằng GET /ping.'
  );
}

export const DEFAULT_PROJECT_ID: string = resolvedProjectId || FALLBACK_PROJECT_ID;
export const DEFAULT_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || firebaseConfig?.firestoreDatabaseId || firebaseConfig?.databaseId || '(default)';
