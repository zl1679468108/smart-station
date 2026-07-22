import { get, post, patch } from './api';
import type {
  ExceptionItem,
  ExceptionListResult,
  ExceptionType,
  ExceptionStatus,
  ExceptionResolution,
} from '@/types/exception';

export function fetchExceptionList(params: {
  status?: ExceptionStatus | '';
  type?: ExceptionType | '';
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<ExceptionListResult> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.type) q.set('type', params.type);
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const s = q.toString();
  return get<ExceptionListResult>(`/api/exception${s ? `?${s}` : ''}`);
}

export function fetchExceptionDetail(id: string): Promise<ExceptionItem> {
  return get<ExceptionItem>(`/api/exception/${id}`);
}

export function createException(body: {
  parcelId: string;
  type: ExceptionType;
  description: string;
  responsibleUserId?: string;
  attachments?: string[];
}): Promise<ExceptionItem> {
  return post<ExceptionItem>('/api/exception', body, { successMessage: '异常已登记' });
}

export function updateException(
  id: string,
  body: {
    status?: ExceptionStatus;
    resolution?: ExceptionResolution;
    resolutionNote?: string;
  },
): Promise<ExceptionItem> {
  return patch<ExceptionItem>(`/api/exception/${id}`, body, { successMessage: '已更新处理状态' });
}
