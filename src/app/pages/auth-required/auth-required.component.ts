import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../../services/theme.service';

@Component({
    standalone: true,
    selector: 'app-auth-required',
    imports: [],
    templateUrl: './auth-required.component.html',
    styleUrls: ['./auth-required.component.scss']
})
export class AuthRequiredComponent {
  private router = inject(Router);
  readonly theme = inject(ThemeService);

  onSignIn(): void {
    this.router.navigate(['/auth/login']);
  }

  onRegister(): void {
    this.router.navigate(['/auth/register']);
  }
}
