export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  fileId?: string;
  blobUrl: string | null;
}
