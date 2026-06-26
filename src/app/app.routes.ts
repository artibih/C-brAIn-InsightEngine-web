import { Routes } from '@angular/router';
import { WelcomeScreenComponent } from './pages/welcome-screen/welcome-screen.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { ConversationPageComponent } from './pages/chat/conversation-page/conversation-page.component';
import { AuthGuard } from './core/auth/auth.guard';
import { LoginGuard } from './core/auth/login.guard';
import {AdminGuard} from './core/auth/admin.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [LoginGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/auth-required/auth-required.component').then(
            (m) => m.AuthRequiredComponent
          ),
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./pages/auth-page/auth-page.component').then(
            (m) => m.AuthPageComponent
          ),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./pages/auth-page/auth-page.component').then(m => m.AuthPageComponent),
      },
    ],
  },

  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      { path: '', component: WelcomeScreenComponent },
      { path: 'settings', component: SettingsComponent },
      { path: 'conversation/:id', component: ConversationPageComponent },
      {
        path: 'knowledge-graph',
        loadComponent: () =>
          import('./features/knowledge-graph/knowledge-graph.component').then(
            m => m.KnowledgeGraphComponent
          ),
      },
      {
        path: 'feedback',
        loadComponent: () =>
          import('./pages/feedback/feedback-page.component').then(m => m.FeedbackPageComponent),
      },
      {
        path: 'admin',
        canActivate: [AdminGuard],
        loadComponent: () =>
          import('./pages/admin-page/admin-page.component').then(m => m.AdminPageComponent),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
