import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

// 加载 .env 环境变量
dotenv.config();

async function bootstrap(): Promise<void> {
  const port = process.env.PORT || 3030;
  console.log(`[smart-station] 服务启动中，监听端口: ${port}`);

  const app = await NestFactory.create(AppModule);

  // 全局 API 前缀
  app.setGlobalPrefix('api');

  // 全局校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 全局响应拦截器（统一包装 + 时间戳转北京时间）
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS
  app.enableCors({ origin: true, credentials: true });

  await app.listen(port);
  console.log(`[smart-station] 服务已启动: http://localhost:${port}/api`);
}

bootstrap();
