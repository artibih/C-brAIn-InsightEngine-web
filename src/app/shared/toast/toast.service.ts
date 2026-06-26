import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Toast, ToastVariant } from './toast.model';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = new BehaviorSubject<Toast[]>([]);
  readonly toasts$ = this._toasts.asObservable();

  show(input: Omit<Toast, 'id'>): string {
    const id = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
    const toast: Toast = {
      id,
      durationMs: 4000,
      ...input,
    };

    this._toasts.next([...this._toasts.value, toast]);

    const duration = toast.durationMs ?? 4000;
    window.setTimeout(() => this.dismiss(id), duration);

    return id;
  }

  info(title: string, description?: string, durationMs?: number) {
    return this.show({ title, description, variant: 'info', durationMs });
  }

  success(title: string, description?: string, durationMs?: number) {
    return this.show({ title, description, variant: 'success', durationMs });
  }

  error(title: string, description?: string, durationMs?: number) {
    return this.show({ title, description, variant: 'error', durationMs });
  }

  dismiss(id: string) {
    this._toasts.next(this._toasts.value.filter(t => t.id !== id));
  }

  clearAll() {
    this._toasts.next([]);
  }
}
