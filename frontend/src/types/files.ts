export interface FileSummary {
  id: string;
  filename: string;
  size_bytes: number;
  page_count: number;
  created_at: string;
  expires_at: string;
}

export interface PageInfo {
  index: number;
  width: number;
  height: number;
  rotation: number;
  user_unit: number;
  media_box: number[];
  crop_box: number[];
}

export interface FileDetail extends FileSummary { pages: PageInfo[] }

export interface SessionInfo {
  max_upload_bytes: number;
  max_pages: number;
  retention_seconds: number;
  max_session_files: number;
  session_quota_bytes: number;
}
