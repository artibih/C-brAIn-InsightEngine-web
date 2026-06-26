import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-auth-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth-landing.component.html',
  styleUrls: ['./auth-landing.component.scss'],
})
export class AuthLandingComponent {
  private router = inject(Router);
  readonly theme = inject(ThemeService);

  goLogin(): void {
    this.router.navigate(['/auth/login']);
  }

  goRegister(): void {
    this.router.navigate(['/auth/register']);
  }
}
