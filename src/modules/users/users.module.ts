import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { AttemptModule } from '../attempt';
import { TopcodeModule } from '../topcode';
import { resolve } from 'node:path';
import { AvatarController } from './avatar.controller';
import { AVATAR_DIRECTORY, AvatarService } from './avatar.service';

@Module({
  controllers: [UsersController, AvatarController],
  providers: [
    UsersService,
    UsersRepository,
    AvatarService,
    {
      provide: AVATAR_DIRECTORY,
      useValue: resolve(process.cwd(), 'storage', 'avatars'),
    },
  ],
  exports: [UsersRepository],
  imports: [AttemptModule, TopcodeModule],
})
export class UsersModule {}
