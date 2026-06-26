import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { Toast } from './toast.model';

@Component({
    selector: 'tp-toast-container',
    imports: [CommonModule],
    templateUrl: './toast-container.component.html',
    styleUrls: ['./toast-container.component.scss']
})
export class ToastContainerComponent {
  private readonly toastService = inject(ToastService);
  readonly toasts$ = this.toastService.toasts$;

  trackById(_: number, t: Toast) {
    return t.id;
  }

  dismiss(id: string) {
    this.toastService.dismiss(id);
  }
}
