import { Injectable, signal, computed } from '@angular/core';

export type AppTheme = 'cbrain' | 'insightengine';

interface ThemeBranding {
  logoPath: string;
  iconPath: string;
  appName: string;
  appTitle: string;
  appSubtitle: string;
  pageTitle: string;
  faviconPath: string;
  faviconType: string;
}


const THEME_CONFIG: Record<AppTheme, ThemeBranding> = {
  cbrain: {
    logoPath: 'assets/c-brain-logo.png',
    iconPath: 'assets/c-brain-logo.png',
    appName: 'C-brAIn AI Workspace',
    appTitle: 'C-brAIn',
    appSubtitle: '',
    pageTitle: 'C-brAIn AI Workspace',
    faviconPath: 'assets/c-brain-logo.png',
    faviconType: 'image/png',
  },
  insightengine: {
    logoPath: 'assets/insightengine-logo.svg',
    iconPath: 'assets/insightengine-favicon.svg',
    appName: 'C-brAIn AI Workspace',
    appTitle: 'C-brAIn',
    appSubtitle: 'Powered by InsightEngine',
    pageTitle: 'C-brAIn AI Workspace – Powered by InsightEngine',
    faviconPath: 'assets/insightengine-favicon.svg',
    faviconType: 'image/svg+xml',
  },
};

const STORAGE_KEY = 'app-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<AppTheme>(this.loadTheme());
  private readonly _config = computed(() => THEME_CONFIG[this._theme()]);

  readonly theme = this._theme.asReadonly();
  readonly isInsightEngine = computed(() => this._theme() === 'insightengine');

  
  readonly logoPath = computed(() => this._config().logoPath);

  
  readonly iconPath = computed(() => this._config().iconPath);

  readonly appName = computed(() => this._config().appName);
  readonly appTitle = computed(() => this._config().appTitle);
  readonly appSubtitle = computed(() => this._config().appSubtitle);

  constructor() {
    this.applyTheme(this._theme());
  }

  toggle(): void {
    const next: AppTheme = this._theme() === 'cbrain' ? 'insightengine' : 'cbrain';
    this.setTheme(next);
  }

  setTheme(theme: AppTheme): void {
    this._theme.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.applyTheme(theme);
  }

  private applyTheme(theme: AppTheme): void {
    const config = THEME_CONFIG[theme];

    
    if (theme === 'insightengine') {
      document.documentElement.setAttribute('data-theme', 'insightengine');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) {
      favicon.href = config.faviconPath;
      favicon.type = config.faviconType;
    }

    
    document.title = config.pageTitle;
  }

  private loadTheme(): AppTheme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'cbrain') return 'cbrain';
    return 'insightengine';
  }
}
