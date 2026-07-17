import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * 全局 HTTP 异常过滤器
 * 统一将异常转换为 { success: false, message, data: null } 结构
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      // 支持自定义 message 字符串，也支持 class-validator 返回的 { message: string[] } 结构
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, any>;
        if (Array.isArray(r.message)) {
          message = r.message.join('; ');
        } else if (typeof r.message === 'string') {
          message = r.message;
        }
      }
    } else {
      // 非 HttpException 记录原始错误堆栈，便于排查
      this.logger.error(exception);
    }

    response.status(status).json({
      success: false,
      message,
      data: null,
    });
  }
}
