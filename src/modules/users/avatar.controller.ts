import {
  Controller,
  Get,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { AvatarService, MAX_AVATAR_BYTES } from './avatar.service';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('users/me/avatar')
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Get()
  async read(@CurrentUser('id') userId: number, @Res() response: Response) {
    const image = await this.avatars.read(userId);
    response
      .set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image);
  }

  @Put()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0 },
    }),
  )
  save(
    @CurrentUser('id') userId: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.avatars.save(userId, file);
  }
}
