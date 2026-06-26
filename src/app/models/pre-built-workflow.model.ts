export interface PreBuiltWorkflow {
  id: string;
  organizationId: number;
  question: string | null;
  fileId: string | null;
  filePath: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}
