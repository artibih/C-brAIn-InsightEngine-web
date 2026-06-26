export interface UploadingFile {
  id: string;
  name: string;
  size: number;
}
export interface UploadedFileDto {
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  thumbnailDataUrl?: string;
  blobUrl: string;
}
