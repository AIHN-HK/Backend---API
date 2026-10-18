import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import request = require('supertest');
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { ValidationPipe } from '../../core/pipes/validation.pipe';
import { TransformInterceptor } from '../../core/interceptors/transform.interceptor';
import { RedisService } from '../../core/redis/redis.service';

describe('profile HTTP contract', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: 'profile-test-only' });
  const token = (id: number) => jwt.sign({ userId: id });
  const valid = { fullname: 'Student', phone: '0901234567' };
  beforeAll(async () => {
    const users = new Map(
      [1, 2, 3].map((id) => [
        id,
        {
          id,
          ...valid,
          email: `${id}@example.test`,
          role: 'USER',
          password: 'secret',
          yob: new Date('2009-01-01'),
          gender: id === 3 ? 'Nam' : null,
          class: null,
          address: null,
        },
      ]),
    );
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: () => 'profile-test-only' },
        },
        {
          provide: UsersRepository,
          useValue: {
            findById: async (id: number) => users.get(id),
            update: async (id: number, data: object) => {
              const user = { ...users.get(id)!, ...data };
              users.set(id, user);
              return user;
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            del: async () => {},
            getOrSet: async (_k: string, _t: number, fn: () => unknown) => fn(),
            setEx: async () => {},
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalGuards(new JwtAuthGuard(module.get(Reflector)));
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalInterceptors(new TransformInterceptor(module.get(Reflector)));
    await app.init();
  });
  afterAll(async () => app?.close());
  it('requires a verified token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .send(valid)
      .expect(401);
  });
  it('forbids reading another user and rejects malformed IDs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/2')
      .auth(token(1), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/users/1oops')
      .auth(token(1), { type: 'bearer' })
      .expect(400);
  });
  it('returns the documented gender enum for a legacy stored profile', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .auth(token(3), { type: 'bearer' })
      .expect(200);

    expect(response.body.data.gender).toBe('MALE');
  });
  it('updates only JWT owner, trims, clears optional values and reloads', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .auth(token(1), { type: 'bearer' })
      .send({
        ...valid,
        fullname: '  Changed  ',
        address: ' ',
        gender: null,
        class: null,
      })
      .expect(200);
    expect(res.body.data.fullname).toBe('Changed');
    expect(res.body.data.address).toBeNull();
    expect(res.body.data).not.toHaveProperty('password');
    const own = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .auth(token(1), { type: 'bearer' })
      .expect(200);
    expect(own.body.data.fullname).toBe('Changed');
    const other = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .auth(token(2), { type: 'bearer' })
      .expect(200);
    expect(other.body.data.fullname).toBe('Student');
    await request(app.getHttpServer())
      .patch('/api/v1/users/2')
      .auth(token(1), { type: 'bearer' })
      .send(valid)
      .expect(404);
  });
  it.each([
    { fullname: ' ' },
    { fullname: null },
    { phone: 'abc' },
    { phone: null },
    { class: 1.5 },
    { class: 13 },
    { class: '10' },
    { gender: 'invalid' },
    { address: 12 },
    { fullname: 'a'.repeat(121) },
    { address: 'a'.repeat(501) },
    { id: 2 },
    { role: 'ADMIN' },
    { email: 'other@example.test' },
    { password: 'new' },
  ])('rejects invalid/forbidden fields %j', async (invalid) => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .auth(token(1), { type: 'bearer' })
      .send({ ...valid, ...invalid })
      .expect(400);
  });
  it('keeps required fields required', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .auth(token(1), { type: 'bearer' })
      .send({})
      .expect(400);
  });
});
