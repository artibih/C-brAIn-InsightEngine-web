import type { ApiErrorItem } from './api-error-item.model';

export interface ApiResponse<T> {
  success: boolean;
  message?: string | null;
  errors?: ApiErrorItem[] | any;
  data: T;
}
