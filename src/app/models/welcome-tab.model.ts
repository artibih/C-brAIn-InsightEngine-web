export type WelcomeTab = 'quick' | 'specialized';

export const isWelcomeTab = (v: any): v is WelcomeTab =>
  v === 'quick' || v === 'specialized';
