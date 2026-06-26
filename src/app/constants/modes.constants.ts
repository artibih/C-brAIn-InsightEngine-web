import type { QuickMode } from '../services/conversation-context.service';


export const MODE_DISPLAY_NAMES: Record<QuickMode, string> = {
  default: 'AI Assistant',
  data_analysis: 'Dark Data Analyzer (MVP2)',
  creative_media: 'Data Synthesis and Literature Analyzer (MVP1)',
  super_consultant: 'Reviewer Three (MVP3)',
};

export const MODE_ICONS: Record<QuickMode, string> = {
  default: 'bi-stars',
  data_analysis: 'bi-graph-down',
  creative_media: 'bi-journal-text',
  super_consultant: 'bi-person-check',
};

export const MODE_PLACEHOLDERS: Record<QuickMode, string> = {
  default: 'Message AI Workspace...',
  data_analysis: 'Analyze your dark/unpublished research data...',
  creative_media: 'Synthesize data or analyze literature...',
  super_consultant: 'Get critical feedback on your manuscript...',
};

export const MODE_OPTIONS: { id: QuickMode; name: string; icon: string; disabled?: boolean }[] = [
  { id: 'creative_media', name: MODE_DISPLAY_NAMES.creative_media, icon: MODE_ICONS.creative_media },
  { id: 'data_analysis', name: MODE_DISPLAY_NAMES.data_analysis, icon: MODE_ICONS.data_analysis },
  { id: 'super_consultant', name: MODE_DISPLAY_NAMES.super_consultant, icon: MODE_ICONS.super_consultant },
];

export const MVP3_UPLOAD_EXTENSIONS = ['.pdf', '.zip', '.tex', '.docx'] as const;

export const MVP3_UPLOAD_ACCEPT = MVP3_UPLOAD_EXTENSIONS.join(',');

export function isMvp3UploadAllowed(fileName: string): boolean {
  const name = (fileName ?? '').toLowerCase();
  return MVP3_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export type MvpMode = 'literature' | 'analyzer' | 'reviewer';

export const QUICK_TO_MVP: Record<QuickMode, MvpMode> = {
  creative_media: 'literature',
  data_analysis: 'analyzer',
  super_consultant: 'reviewer',
  default: 'literature',
};
