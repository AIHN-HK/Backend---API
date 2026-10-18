import { User } from '@prisma/client';
import { Gender } from './dto/update-user.dto';
import { mapUserToProfileDto } from './user.mapper';

const user: User = {
  id: 1,
  fullname: 'Profile fixture',
  email: 'profile@example.test',
  password: 'not-a-real-password',
  role: 'USER',
  yob: new Date('2008-01-01'),
  phone: null,
  address: null,
  class: null,
  gender: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('profile response gender compatibility', () => {
  it.each([
    [Gender.MALE, Gender.MALE],
    [Gender.FEMALE, Gender.FEMALE],
    [Gender.OTHER, Gender.OTHER],
    ['Nam', Gender.MALE],
    ['NAM', Gender.MALE],
    [' male ', Gender.MALE],
    ['Nữ', Gender.FEMALE],
    ['Nu\u031b\u0303', Gender.FEMALE],
    ['NU', Gender.FEMALE],
    [' nữ ', Gender.FEMALE],
    ['Khác', Gender.OTHER],
    ['KHAC', Gender.OTHER],
    [null, null],
    ['', null],
    [' ', null],
    ['unrecognized', null],
  ])('returns contract gender for stored value %j', (stored, expected) => {
    const source = { ...user, gender: stored };
    const profile = mapUserToProfileDto(source);

    expect(profile.gender).toBe(expected);
    expect(source.gender).toBe(stored);
    expect(profile).not.toHaveProperty('password');
    expect(profile).not.toHaveProperty('role');
  });
});
