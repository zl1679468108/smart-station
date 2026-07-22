import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseModule } from './supabase/supabase.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { InboundModule } from './inbound/inbound.module';
import { InventoryModule } from './inventory/inventory.module';
import { OutboundModule } from './outbound/outbound.module';
import { KioskModule } from './kiosk/kiosk.module';
import { StatsModule } from './stats/stats.module';
import { NotifyModule } from './notify/notify.module';
import { OverdueModule } from './overdue/overdue.module';
import { ExceptionModule } from './exception/exception.module';
import { ShippingModule } from './shipping/shipping.module';
import { FinanceModule } from './finance/finance.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TokenAuthGuard } from './common/guards/token-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

/**
 * 应用根模块
 * 业务模块按 M1-M7 阶段逐步添加
 */
@Module({
  imports: [
    // 全局配置模块，按优先级加载环境变量文件
    // 加载顺序：.env.{NODE_ENV} → .env.local → .env（前者覆盖后者）
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
    }),
    ScheduleModule.forRoot(),
    // 限流模块：Kiosk 等公开接口按需用 @Throttle 覆盖
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 秒
        limit: 10,
      },
    ]),
    // Supabase 客户端全局模块
    SupabaseModule,
    // 健康检查
    HealthModule,
    // 认证模块（M1）
    AuthModule,
    // 系统管理模块（M2）
    AdminModule,
    // 通知模块（M3，stub）
    NotifyModule,
    // 入库模块（M3）
    InboundModule,
    // 库存模块（M4）
    InventoryModule,
    // 出库模块（M5）
    OutboundModule,
    // Kiosk 取件自助查询模块（M6，公开 + 限流）
    KioskModule,
    // 统计模块（M7，工作台 Dashboard）
    StatsModule,
    // 滞留件 / 异常件（M24 / 1.3.0）
    OverdueModule,
    ExceptionModule,
    // 寄件管理 + 地址簿（M25 / 1.4.0）
    ShippingModule,
    // 财务结算模块（M25 / 1.4.0）
    FinanceModule,
  ],
  providers: [
    // 全局守卫：默认所有路由需登录，标记 @Public() 的放行
    { provide: APP_GUARD, useClass: TokenAuthGuard },
    // 全局守卫：在 TokenAuthGuard 之后执行，按 @Roles() 元数据做角色校验
    // 未标记 @Roles() 的接口仅登录校验，标记的接口按角色拦截
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
