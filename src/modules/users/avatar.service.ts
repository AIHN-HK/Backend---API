import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp = require('sharp');

export const AVATAR_DIRECTORY = Symbol('AVATAR_DIRECTORY');
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@Injectable()
export class AvatarService {
  constructor(@Inject(AVATAR_DIRECTORY) private readonly directory: string) {}

  private filename(userId: number) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid avatar owner');
    }
    return join(this.directory, `${userId}.webp`);
  }

  async read(userId: number): Promise<Buffer> {
    try {
      return await readFile(this.filename(userId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Chưa có ảnh đại diện.');
      }
      throw error;
    }
  }

  async save(userId: number, file?: { buffer: Buffer; mimetype: string }) {
    const destination = this.filename(userId);
    if (!file?.buffer.length || file.buffer.length > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Chọn ảnh JPG, PNG hoặc WebP tối đa 5 MB.');
    }
    let image: Buffer;
    try {
      const input = sharp(file.buffer, { limitInputPixels: 16_000_000 });
      const metadata = await input.metadata();
      const allowed = {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      if (
        !Object.prototype.hasOwnProperty.call(allowed, metadata.format ?? '') ||
        allowed[metadata.format as keyof typeof allowed] !== file.mimetype ||
        (metadata.pages ?? 1) > 1
      ) {
        throw new Error('Unsupported avatar');
      }
      image = await input
        .rotate()
        .resize(512, 512, { fit: 'cover' })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Ảnh không hợp lệ. Chọn ảnh JPG, PNG hoặc WebP tĩnh.',
      );
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, `.${userId}-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, image, { flag: 'wx', mode: 0o600 });
      // Atomic replacement keeps the previous avatar intact if writing fails.
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return { saved: true };
  }
}
