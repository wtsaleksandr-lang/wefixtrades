import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from '../lib/logger';

const log = createLogger('FileStorage');
const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

export async function saveFile(buffer: Buffer, originalName: string, subfolder?: string): Promise<string> {
  const dir = subfolder ? path.join(UPLOAD_DIR, subfolder) : UPLOAD_DIR;
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(originalName);
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, buffer);
  const publicUrl = `/uploads/${subfolder ? subfolder + '/' : ''}${filename}`;
  log.info('File saved', { filename, size: buffer.length });
  return publicUrl;
}

export async function deleteFile(publicUrl: string): Promise<void> {
  const relative = publicUrl.replace(/^\/uploads\//, '');
  const filePath = path.join(UPLOAD_DIR, relative);
  await fs.unlink(filePath).catch(() => {});
  log.info('File deleted', { publicUrl });
}
