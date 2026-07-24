import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotifyModule } from '../notify/notify.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * 系统管理模块
 * 提供 /api/admin/* 接口：驿站信息、员工、货架、快递公司
 * 控制器层用 @UseGuards(TokenAuthGuard, AdminGuard) 限制仅管理员可访问
 * 导入 AuthModule 以复用 TokenService（重置密码时销毁用户会话）
 */
@Module({
  imports: [AuthModule, NotifyModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
