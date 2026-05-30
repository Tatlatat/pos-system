import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  branchId?: string | null;
  fullName: string;
}

export interface JwtTokenResponse {
  accessToken: string;
  refreshToken: string;
  user: JwtPayload;
}
