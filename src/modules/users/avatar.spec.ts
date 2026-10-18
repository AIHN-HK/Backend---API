import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp = require('sharp');
import request = require('supertest');
import { AvatarController } from './avatar.controller';
import {
  AVATAR_DIRECTORY,
  AvatarService,
  MAX_AVATAR_BYTES,
} from './avatar.service';
import { UsersRepository } from './users.repository';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TransformInterceptor } from '../../core/interceptors/transform.interceptor';

describe('owned avatar HTTP and storage', () => {
  let app: INestApplication;
  let directory: string;
  let png: Buffer;
  const jwt = new JwtService({ secret: 'avatar-test-only' });
  const token = (userId: number) => jwt.sign({ userId });
  const path = '/api/v1/users/me/avatar';

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aihn-avatar-'));
    png = await sharp({
      create: { width: 80, height: 40, channels: 3, background: '#028f94' },
    })
      .png()
      .toBuffer();
    const module = await Test.createTestingModule({
      controllers: [AvatarController],
      providers: [
        AvatarService,
        JwtStrategy,
        { provide: AVATAR_DIRECTORY, useValue: directory },
        { provide: ConfigService, useValue: { get: () => 'avatar-test-only' } },
        {
          provide: UsersRepository,
          useValue: {
            findById: async (id: number) =>
              [1, 2].includes(id) ? { id, role: 'USER' } : null,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalGuards(new JwtAuthGuard(module.get(Reflector)));
    app.useGlobalInterceptors(new TransformInterceptor(module.get(Reflector)));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('requires a verified existing owner and has a normal missing-avatar state', async () => {
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer())
      .put(path)
      .attach('avatar', png, 'avatar.png')
      .expect(401);
    await request(app.getHttpServer())
      .get(path)
      .auth(token(99), { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .get(path)
      .auth(token(1), { type: 'bearer' })
      .expect(404);
    expect(await readdir(directory)).toEqual([]);
  });

  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodes %s, persists one normalized image and serves binary through global interceptors',
    async (format) => {
      const image = await sharp(png).toFormat(format).toBuffer();
      const uploaded = await request(app.getHttpServer())
        .put(path)
        .auth(token(1), { type: 'bearer' })
        .attach('avatar', image, {
          filename: `../../untrusted.${format}`,
          contentType: `image/${format}`,
        })
        .expect(200);
      expect(uploaded.body.data).toEqual({ saved: true });
      const response = await request(app.getHttpServer())
        .get(path)
        .auth(token(1), { type: 'bearer' })
        .expect(200);
      expect(response.headers['content-type']).toMatch(/^image\/webp/);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const metadata = await sharp(response.body).metadata();
      expect(metadata).toMatchObject({
        format: 'webp',
        width: 512,
        height: 512,
      });
      expect(metadata.exif).toBeUndefined();
      expect(await readdir(directory)).toEqual(['1.webp']);
      expect(await new AvatarService(directory).read(1)).toEqual(response.body);
    },
  );

  it('isolates accounts and never accepts a client-selected owner or arbitrary path', async () => {
    const original = await new AvatarService(directory).read(1);
    await request(app.getHttpServer())
      .get(path)
      .auth(token(2), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/users/1/avatar')
      .auth(token(2), { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .put(path)
      .auth(token(2), { type: 'bearer' })
      .field('userId', '1')
      .attach('avatar', png, 'avatar.png')
      .expect(400);
    expect(await new AvatarService(directory).read(1)).toEqual(original);
    await request(app.getHttpServer())
      .put(path)
      .auth(token(2), { type: 'bearer' })
      .attach('avatar', png, 'avatar.png')
      .expect(200);
    expect((await readdir(directory)).sort()).toEqual(['1.webp', '2.webp']);
  });

  it('rejects spoofed MIME, corrupt images, SVG, missing/extra files and oversized input without replacing the saved image', async () => {
    const original = await new AvatarService(directory).read(1);
    for (const buffer of [
      Buffer.from('not an image'),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ]) {
      await request(app.getHttpServer())
        .put(path)
        .auth(token(1), { type: 'bearer' })
        .attach('avatar', buffer, {
          filename: 'fake.png',
          contentType: 'image/png',
        })
        .expect(400);
    }
    await request(app.getHttpServer())
      .put(path)
      .auth(token(1), { type: 'bearer' })
      .attach('avatar', png, {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
    await request(app.getHttpServer())
      .put(path)
      .auth(token(1), { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .put(path)
      .auth(token(1), { type: 'bearer' })
      .attach('avatar', png, 'one.png')
      .attach('avatar', png, 'two.png')
      .expect(400);
    await request(app.getHttpServer())
      .put(path)
      .auth(token(1), { type: 'bearer' })
      .attach('avatar', Buffer.alloc(MAX_AVATAR_BYTES + 1), 'large.png')
      .expect(413);
    expect(await new AvatarService(directory).read(1)).toEqual(original);
    expect((await readdir(directory)).sort()).toEqual(['1.webp', '2.webp']);
  });

  it('rejects decompression-heavy and animated images before writing', async () => {
    const tooManyPixels = await sharp({
      create: { width: 4100, height: 4100, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await request(app.getHttpServer())
      .put(path)
      .auth(token(1), { type: 'bearer' })
      .attach('avatar', tooManyPixels, 'large-dimensions.png')
      .expect(400);
    const frames = Buffer.alloc(4 * 8 * 3);
    frames.fill(255, 0, 4 * 4 * 3);
    const animated = await sharp(frames, {
      raw: { width: 4, height: 8, pageHeight: 4, channels: 3 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    await request(app.getHttpServer())
      .put(path)
      .auth(token(1), { type: 'bearer' })
      .attach('avatar', animated, 'animated.webp')
      .expect(400);
  });
});
