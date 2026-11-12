import type { FileDetail, FileSummary, SessionInfo } from '../types/files';

export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly requestId?: string) {
    super(message);
  }
}

function parseError(body: unknown): ApiError {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const value = body.error as { message?: string; code?: string; request_id?: string };
    return new ApiError(value.message || 'The request failed. Please try again.', value.code || 'request_failed', value.request_id);
  }
  return new ApiError('Docera could not complete this request. Please try again.', 'request_failed');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/v1${path}`, { ...init, credentials: 'same-origin' }); }
  catch { throw new ApiError('Cannot reach Docera. Check that the local API is running, then retry.', 'network_error'); }
  if (!response.ok) throw parseError(await response.json().catch(() => null));
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const api = {
  session: () => request<SessionInfo>('/session', { method: 'POST' }),
  files: () => request<{ files: FileSummary[] }>('/files'),
  file: (id: string) => request<FileDetail>(`/files/${encodeURIComponent(id)}`),
  rename: (id: string, filename: string) =>
    request<FileDetail>(`/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    }),
  remove: (id: string) => request<void>(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export function uploadPdf(file: File, onProgress: (percent: number | null) => void, signal: AbortSignal): Promise<FileDetail> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open('POST', '/api/v1/files/upload');
    xhr.responseType = 'json';
    xhr.timeout = 90_000;
    xhr.upload.onprogress = event => onProgress(event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null);
    const cleanup = () => signal.removeEventListener('abort', abort);
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as FileDetail);
      else reject(parseError(xhr.response));
    };
    xhr.onerror = () => { cleanup(); reject(new ApiError('Upload interrupted. Check the local API and try again.', 'network_error')); };
    xhr.ontimeout = () => { cleanup(); reject(new ApiError('Upload timed out. Try a smaller document.', 'upload_timeout')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); return; }
    const data = new FormData();
    data.append('file', file);
    xhr.send(data);
  });
}

export const fileUrl = (id: string) => `/api/v1/files/${encodeURIComponent(id)}/download`;
