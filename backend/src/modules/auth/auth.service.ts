import * as crypto from 'crypto';
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestResetDto, ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload, JwtTokenResponse } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<JwtTokenResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      fullName: user.fullName,
    };

    const tokens = await this.generateTokens(payload);

    // Store refresh token hash
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await bcrypt.hash(tokens.refreshToken, 10) },
    });

    this.logger.log(`User ${user.email} logged in`);

    return {
      ...tokens,
      user: payload,
    };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    this.logger.log(`User ${userId} logged out`);
  }

  async refreshTokens(refreshToken: string): Promise<JwtTokenResponse> {
    try {
      const refreshSecret = process.env.JWT_REFRESH_SECRET;
      if (!refreshSecret) throw new UnauthorizedException('Refresh token validation not configured');
      const payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isRefreshValid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isRefreshValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
        fullName: user.fullName,
      };

      const tokens = await this.generateTokens(newPayload);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: await bcrypt.hash(tokens.refreshToken, 10) },
      });

      return { ...tokens, user: newPayload };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        refreshToken: null, // Invalidate all sessions
      },
    });

    this.logger.log(`User ${user.email} changed password`);
  }

  async requestReset(dto: RequestResetDto): Promise<{ message: string; token?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store hashed token in DB (survives server restart, secure against db theft)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hashedToken, resetTokenExpires: expires },
    });

    // Log request safely without plaintext token leak
    this.logger.log(`Password reset requested for user: ${user.email} (token hash: ${hashedToken.substring(0, 10)}...)`);

    // Return the token in response so the client receives it (no mail server configured)
    return { 
      message: 'If the email exists, a reset link has been sent',
      token,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const hashedToken = crypto.createHash('sha256').update(dto.token).digest('hex');

    // Find token hash in DB
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: hashedToken,
        resetTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        refreshToken: null,
        resetToken: null,     // 🛡️ Invalidate token
        resetTokenExpires: null,
      },
    });

    this.logger.log(`Password reset completed for user ${user.email}`);
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  private async generateTokens(payload: JwtPayload) {
    const jwtSecret = process.env.JWT_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!jwtSecret || !refreshSecret) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtSecret,
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      }),
      this.jwtService.signAsync(
        { sub: payload.sub },
        {
          secret: refreshSecret,
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }
}
