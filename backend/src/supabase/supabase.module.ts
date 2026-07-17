import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

/**
 * Supabase 全局模块
 * 提供全局可注入的 SupabaseService
 */
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
