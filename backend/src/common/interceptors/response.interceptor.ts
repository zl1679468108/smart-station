import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { convertTimesToBeijing } from '../utils/time';

/**
 * 统一响应拦截器
 * 1. 将所有成功响应包装为 { success: true, message: 'success', data: <原返回值> }
 * 2. 自动将响应中的时间戳字段从 ISO 转为北京时间字符串 YYYY-MM-DD HH:mm:ss.SSS
 * 3. 若返回值已为 { success, message, data } 结构则不重复包装
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    return next.handle().pipe(
      map((response: any) => {
        // 先递归转换时间戳字段
        const data = convertTimesToBeijing(response);
        // 若已是标准响应结构则不重复包装
        if (
          data &&
          typeof data === 'object' &&
          !Array.isArray(data) &&
          'success' in data &&
          'message' in data &&
          'data' in data
        ) {
          return data;
        }
        return {
          success: true,
          message: 'success',
          data,
        };
      }),
    );
  }
}
