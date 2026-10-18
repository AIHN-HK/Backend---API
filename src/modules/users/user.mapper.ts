import { User } from '@prisma/client';
import { UserProfileResponseDto } from './dto/user-response';
import { Gender } from './dto/update-user.dto';

function profileGender(value: string | null): Gender | null {
  // Older imports and local seed scripts stored labels in this free-text column.
  const normalized = value
    ?.trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  switch (normalized) {
    case 'MALE':
    case 'NAM':
      return Gender.MALE;
    case 'FEMALE':
    case 'NU':
      return Gender.FEMALE;
    case 'OTHER':
    case 'KHAC':
      return Gender.OTHER;
    default:
      return null;
  }
}

export function mapUserToProfileDto(user: User): UserProfileResponseDto {
  const currentYear = new Date().getFullYear();
  const yob = new Date(user.yob).getFullYear();

  return {
    fullname: user.fullname,
    age: currentYear - yob,
    phone: user.phone,
    address: user.address,
    gender: profileGender(user.gender),
    email: user.email,
    class: user.class,
  };
}
