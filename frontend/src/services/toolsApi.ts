import { ApiError } from './api';

export interface ToolBinaryResult<T = Record<string, unknown>> {
  blob: Blob;
  filename: string;
  report: T;
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  return match?.[1] || fallback;
}

async function postToolForm(path: string, form: FormData): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/tools${path}`, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Cannot reach Docera. Check that the local API is running, then retry.', 'network_error');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; code?: string; request_id?: string }; detail?: string | { msg?: string }[] } | null;
    if (body?.error) {
      throw new ApiError(body.error.message || 'Tool operation failed.', body.error.code || 'tool_error', body.error.request_id);
    }
    if (body?.detail) {
      const msg = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map(d => d.msg || '').filter(Boolean).join(', ') : 'Validation error';
      throw new ApiError(msg, 'validation_error');
    }
    if (response.status === 502) {
      throw new ApiError('Bad Gateway (502): The server encountered an upstream communication error.', 'bad_gateway');
    }
    if (response.status === 504) {
      throw new ApiError('Gateway Timeout (504): The operation took longer than the server timeout limit.', 'gateway_timeout');
    }
    throw new ApiError(`Docera operation failed (HTTP ${response.status}).`, 'tool_error');
  }
  return response;
}

async function postBinary<T = Record<string, unknown>>(path: string, form: FormData, fallbackFilename: string): Promise<ToolBinaryResult<T>> {
  const response = await postToolForm(path, form);
  const blob = await response.blob();
  const filename = parseFilename(response.headers.get('content-disposition'), fallbackFilename);
  const reportHeader = response.headers.get('x-docera-report');
  let report = {} as T;
  if (reportHeader) {
    try {
      report = JSON.parse(reportHeader) as T;
    } catch {
      report = {} as T;
    }
  }
  return { blob, filename, report };
}

async function postJson<T>(path: string, form: FormData): Promise<T> {
  const response = await postToolForm(path, form);
  return response.json() as Promise<T>;
}

export function attachSource(form: FormData, source: { file?: File; fileId?: string }) {
  if (source.file) form.append('file', source.file);
  else if (source.fileId) form.append('file_id', source.fileId);
}

export const toolsApi = {
  compress: (source: { file?: File; fileId?: string }, preset: 'lossless' | 'balanced' | 'compact', stripMetadata?: boolean) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('preset', preset);
    if (stripMetadata !== undefined) f.append('strip_metadata', String(stripMetadata));
    return postBinary<{
      original_bytes: number;
      compressed_bytes: number;
      saved_bytes: number;
      percent_change: number;
      was_reduced: boolean;
      recompressed_images: number;
      deduped_images: number;
      warning?: string | null;
    }>('/compress', f, 'compressed.pdf');
  },

  pdfToImages: (source: { file?: File; fileId?: string }, fmt: 'png' | 'jpeg', dpi: number, quality: number, pagesCsv: string) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('fmt', fmt);
    f.append('dpi', String(dpi));
    f.append('quality', String(quality));
    f.append('pages_csv', pagesCsv);
    return postBinary<{ page_count: number; format: string; dpi: number }>('/convert/pdf-to-images', f, 'images.zip');
  },

  imagesToPdf: (files: File[], pageSize: 'auto' | 'a4' | 'letter', marginPt: number) => {
    const f = new FormData();
    for (const file of files) f.append('files', file);
    f.append('page_size', pageSize);
    f.append('margin_pt', String(marginPt));
    return postBinary<{ image_count: number; page_size: string }>('/convert/images-to-pdf', f, 'images-converted.pdf');
  },

  pdfToDocument: (source: { file?: File; fileId?: string }, target: 'txt' | 'html' | 'docx' | 'xlsx' | 'pptx', mode = 'default') => {
    const f = new FormData();
    attachSource(f, source);
    f.append('target', target);
    f.append('mode', mode);
    return postBinary<{ limitations?: string; table_count?: number; total_chars?: number; slide_count?: number }>(
      '/convert/pdf-to-document',
      f,
      `export.${target}`,
    );
  },

  officeToPdf: (file: File) => {
    const f = new FormData();
    f.append('file', file);
    return postBinary<{ engine: string; limitations?: string | null }>('/convert/office-to-pdf', f, 'converted.pdf');
  },

  htmlToPdf: (htmlContent: string) => {
    const f = new FormData();
    f.append('html_content', htmlContent);
    return postBinary<{ engine: string }>('/convert/html-to-pdf', f, 'html-converted.pdf');
  },

  nativeInspect: (source: { file?: File; fileId?: string }, page: number) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('page', String(page));
    return postJson<{
      page: number;
      text_runs: { op_index: number; operator: string; text: string; font: string | null; font_size: number; editable: boolean; reason: string | null }[];
      images: { op_index: number; name: string; width: number; height: number; removable: boolean }[];
    }>('/native/inspect', f);
  },

  nativeReplaceText: (source: { file?: File; fileId?: string }, page: number, opIndex: number, newText: string) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('page', String(page));
    f.append('op_index', String(opIndex));
    f.append('new_text', newText);
    return postBinary('/native/replace-text', f, 'edited.pdf');
  },

  nativeDeleteImage: (source: { file?: File; fileId?: string }, page: number, opIndex: number) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('page', String(page));
    f.append('op_index', String(opIndex));
    return postBinary('/native/delete-image', f, 'edited.pdf');
  },

  nativeTextSpans: (source: { file?: File; fileId?: string }, page: number) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('page', String(page));
    return postJson<{
      page: number;
      width: number;
      height: number;
      spans: {
        id: string;
        bbox: [number, number, number, number];
        origin: [number, number];
        text: string;
        font: string;
        standard_font: string;
        font_size: number;
        color: string;
        flags: number;
        ascender: number;
        descender: number;
        is_subset: boolean;
        page: number;
      }[];
      total_spans: number;
    }>('/native/text-spans', f);
  },

  nativeApplyEdits: (
    source: { file?: File; fileId?: string },
    edits: {
      page: number;
      bbox: [number, number, number, number];
      origin: [number, number];
      original_text: string;
      new_text: string;
      font_name?: string;
      font_size?: number;
      color?: string;
      flags?: number;
    }[],
  ) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('edits_json', JSON.stringify(edits));
    return postBinary<{ edits_applied: number }>('/native/apply-edits', f, 'edited.pdf');
  },

  ocrCapabilities: async () => {
    const res = await fetch('/api/v1/tools/ocr/capabilities', { credentials: 'same-origin' });
    if (!res.ok) throw new ApiError('Could not load OCR capabilities.', 'ocr_error');
    return res.json() as Promise<{
      available: boolean;
      engines: { id: string; name: string; available: boolean; languages: { code: string; label: string }[]; note?: string }[];
    }>;
  },

  ocrDetectScans: (source: { file?: File; fileId?: string }) => {
    const f = new FormData();
    attachSource(f, source);
    return postJson<{
      page_count: number;
      scanned_pages: number[];
      pages: { page: number; char_count: number; image_count: number; needs_ocr: boolean }[];
    }>('/ocr/detect-scans', f);
  },

  ocrProcess: (source: { file?: File; fileId?: string }, lang: string, dpi: number, pagesCsv: string) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('lang', lang);
    f.append('dpi', String(dpi));
    f.append('pages_csv', pagesCsv);
    return postBinary<{
      engine: string;
      language: string;
      average_confidence: number | null;
      text: string;
      pages_processed: number[];
    }>('/ocr/process', f, 'searchable.pdf');
  },

  formsInspect: (source: { file?: File; fileId?: string }) => {
    const f = new FormData();
    attachSource(f, source);
    return postJson<{
      field_count: number;
      fields: { name: string; type: string; value: string | null; options: string[]; page: number | null; rect: number[] | null }[];
    }>('/forms/inspect', f);
  },

  formsCreate: (source: { file?: File; fileId?: string }, fieldsSpec: unknown[]) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('fields_json', JSON.stringify(fieldsSpec));
    return postBinary('/forms/create', f, 'form.pdf');
  },

  formsFill: (source: { file?: File; fileId?: string }, values: Record<string, string | boolean>, flatten: boolean) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('values_json', JSON.stringify(values));
    f.append('flatten', String(flatten));
    return postBinary('/forms/fill', f, 'filled.pdf');
  },

  signCryptographic: (
    source: { file?: File; fileId?: string },
    opts: { signerName: string; reason: string; location: string; certificate?: File; password?: string },
  ) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('signer_name', opts.signerName);
    f.append('reason', opts.reason);
    f.append('location', opts.location);
    if (opts.certificate) f.append('certificate', opts.certificate);
    if (opts.password) f.append('pkcs12_password', opts.password);
    return postBinary<{ field_name: string; self_signed: boolean; certificate_subject: string }>('/sign/cryptographic', f, 'signed.pdf');
  },

  verifySignatures: (source: { file?: File; fileId?: string }) => {
    const f = new FormData();
    attachSource(f, source);
    return postJson<{
      signature_count: number;
      signatures: { field_name: string; intact: boolean; valid: boolean; trusted: boolean; coverage: string; signer: string; self_signed: boolean }[];
    }>('/sign/verify', f);
  },

  securityEncrypt: (
    source: { file?: File; fileId?: string },
    opts: { userPassword: string; ownerPassword: string; allowPrint: boolean; allowCopy: boolean; allowModify: boolean; allowAnnotate: boolean },
  ) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('user_password', opts.userPassword);
    f.append('owner_password', opts.ownerPassword);
    f.append('allow_print', String(opts.allowPrint));
    f.append('allow_copy', String(opts.allowCopy));
    f.append('allow_modify', String(opts.allowModify));
    f.append('allow_annotate', String(opts.allowAnnotate));
    return postBinary('/security/encrypt', f, 'protected.pdf');
  },

  securityUnlock: (file: File, password: string) => {
    const f = new FormData();
    f.append('file', file);
    f.append('password', password);
    return postBinary('/security/unlock', f, 'unlocked.pdf');
  },

  securityInspectMetadata: (source: { file?: File; fileId?: string }) => {
    const f = new FormData();
    attachSource(f, source);
    return postJson<{ docinfo: Record<string, string>; has_xmp: boolean; active_content: string[]; is_encrypted: boolean; page_count: number }>(
      '/security/inspect-metadata',
      f,
    );
  },

  securityClean: (source: { file?: File; fileId?: string }, removeAllMetadata: boolean, sanitizeActive: boolean, removeKeysCsv = '') => {
    const f = new FormData();
    attachSource(f, source);
    f.append('remove_all_metadata', String(removeAllMetadata));
    f.append('sanitize_active', String(sanitizeActive));
    f.append('remove_keys_csv', removeKeysCsv);
    return postBinary<{ removed_metadata_keys: string[]; removed_active_items: string[] }>('/security/clean', f, 'cleaned.pdf');
  },

  securityRedact: (source: { file?: File; fileId?: string }, boxes: { page: number; x: number; y: number; width: number; height: number }[]) => {
    const f = new FormData();
    attachSource(f, source);
    f.append('boxes_json', JSON.stringify(boxes));
    return postBinary<{
      redacted_pages: number[];
      removed_snippets_count: number;
      verified_removed: boolean;
      remaining_chars_in_boxes: number;
    }>('/security/redact', f, 'redacted.pdf');
  },

  batch: (files: File[], operation: 'compress' | 'to_png' | 'to_jpeg' | 'strip_metadata' | 'rotate_90') => {
    const f = new FormData();
    f.append('operation', operation);
    for (const file of files) f.append('files', file);
    return postBinary<{
      operation: string;
      total: number;
      succeeded: number;
      failed: number;
      items: { file: string; status: string; error?: string; saved_bytes?: number; pages?: number }[];
    }>('/batch', f, `docera-batch-${operation}.zip`);
  },
};
