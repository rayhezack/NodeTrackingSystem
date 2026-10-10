import { axiosForBackend } from '@client/src/api/http';
import type { TrackingSource } from '@shared/api.interface';

export interface UploadFileData {
  id: string;
  filePath: string;
  bucketId: string;
  url: string;
  fileToken?: string;
}

export async function uploadFile(file: File, source: TrackingSource = 'app'): Promise<UploadFileData> {
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('source', source);
  const response = await axiosForBackend.post('/api/files/upload', body, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}
