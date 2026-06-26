export interface ProjectDto {
  id: string;
  organizationId: number;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
  isExpanded: boolean;
}

export interface ProjectLocalMeta {
  isExpanded: boolean;
}

export const PROJECT_COLORS = [
  '#da0149', '#1a1844', '#10b981', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'
];

export const PROJECT_ICONS = [
  'bi-folder', 'bi-lightbulb', 'bi-graph-up', 'bi-journal-text',
  'bi-clipboard-data', 'bi-flask', 'bi-cpu', 'bi-mortarboard'
];
