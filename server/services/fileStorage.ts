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

/**
 * Resolve a public `/uploads/…` URL to an absolute path inside UPLOAD_DIR, or
 * null when it does not address this store.
 *
 * Every rule below is a rejection rule. Account deletion now feeds this
 * function values read straight out of customer-controlled columns
 * (`clients.logo_url`, photo URLs inside `leads.answers`), so a value such as
 * `/uploads/../../etc/passwd` has to resolve to nothing rather than to a file
 * outside the upload directory. Returning null is also how a pasted external
 * logo URL (`https://…`) is recognised as "not ours to delete".
 */
export function resolveUploadPath(publicUrl: unknown): string | null {
  if (typeof publicUrl !== 'string') return null;
  if (!publicUrl.startsWith('/uploads/')) return null;

  const relative = publicUrl.slice('/uploads/'.length);
  if (relative === '' || relative.includes('\0')) return null;
  // Split on both separators: on Windows `path.resolve` treats `\` as one too,
  // so `..\..` has to be caught here as well as `../..`.
  const segments = relative.split(/[\\/]/);
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;

  // The property that actually matters, independent of the rules above.
  const root = path.resolve(UPLOAD_DIR) + path.sep;
  const resolved = path.resolve(UPLOAD_DIR, relative);
  return resolved.startsWith(root) ? resolved : null;
}

/**
 * Delete one uploaded file. Returns true when the file is gone (deleted now, or
 * already absent), false when it could not be removed or the URL does not
 * address this store — callers that promise erasure must treat false as a
 * failure rather than assuming the bytes went away.
 */
export async function deleteUploadedFile(publicUrl: string): Promise<boolean> {
  const filePath = resolveUploadPath(publicUrl);
  if (!filePath) {
    log.warn('Refused to delete a path outside the upload store', { publicUrl });
    return false;
  }
  try {
    await fs.unlink(filePath);
    log.info('File deleted', { publicUrl });
    return true;
  } catch (err) {
    // Already gone is the outcome the caller asked for.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true;
    log.error('File delete failed', { publicUrl, err: (err as Error).message });
    return false;
  }
}

export async function deleteFile(publicUrl: string): Promise<void> {
  await deleteUploadedFile(publicUrl);
}
