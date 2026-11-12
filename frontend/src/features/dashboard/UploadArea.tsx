import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ArrowUpRight, Check, FileUp, LoaderCircle, Upload, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { uploadPdf } from '../../services/api';
import { fileSize } from '../../services/format';
import type { SessionInfo } from '../../types/files';

interface UploadRow { name: string; state: 'uploading' | 'checking' | 'done' | 'error'; progress?: number | null; message?: string; id?: string }

export function UploadArea({ session }: { session: SessionInfo }) {
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const dragCount = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [running, setRunning] = useState(false);
  const client = useQueryClient();

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);

  async function upload(files: FileList | File[]) {
    if (busy.current || !files.length) return;
    const selected = Array.from(files);
    busy.current = true;
    setRunning(true);
    const abort = new AbortController();
    controller.current = abort;
    const result: UploadRow[] = [];
    // Sequential requests keep inspection and browser memory bounded.
    for (const file of selected.slice(0, 10)) {
      if (abort.signal.aborted) break;
      const index = result.length;
      const update = (row: UploadRow) => {
        result[index] = row;
        if (mounted.current) setRows([...result]);
      };
      if (file.size > session.max_upload_bytes || !file.size) {
        update({ name: file.name, state: 'error', message: file.size ? `File exceeds ${fileSize(session.max_upload_bytes)}.` : 'This file is empty.' });
        continue;
      }
      update({ name: file.name, state: 'uploading', progress: 0 });
      try {
        const document = await uploadPdf(file, percent => update({ name: file.name, state: percent === 100 ? 'checking' : 'uploading', progress: percent }), abort.signal);
        update({ name: document.filename, state: 'done', id: document.id });
        await client.invalidateQueries({ queryKey: ['files'] });
      } catch (error) {
        update({ name: file.name, state: 'error', message: abort.signal.aborted ? 'Upload cancelled. Refresh recent documents to check whether it had already completed.' : error instanceof Error ? error.message : 'Upload failed. Please try again.' });
      }
    }
    if (selected.length > 10) result.push({ name: 'Additional files', state: 'error', message: 'Select up to 10 PDFs per batch. Add the remaining files in another batch.' });
    busy.current = false;
    if (mounted.current) { setRows([...result]); setRunning(false); }
  }

  function drop(event: DragEvent) {
    event.preventDefault(); dragCount.current = 0; setDragging(false);
    void upload(event.dataTransfer.files);
  }

  return <section className="upload-section" aria-label="Open PDF documents">
    <div className={`upload-area ${dragging ? 'dragging' : ''}`} onDragEnter={event => { event.preventDefault(); dragCount.current++; setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={event => { event.preventDefault(); if (--dragCount.current <= 0) setDragging(false); }} onDrop={drop}>
      <div className="upload-symbol"><FileUp size={32} strokeWidth={1.4} aria-hidden="true" /></div>
      <h2>A fresh start for your next document.</h2>
      <p>Drop PDFs here to open them in your workspace.</p>
      <button id="browse-files" className="button primary" disabled={running} onClick={() => input.current?.click()}><Upload size={17} aria-hidden="true" />{running ? 'Uploading documents…' : 'Browse files'}</button>
      <input ref={input} className="visually-hidden" type="file" accept="application/pdf,.pdf" multiple aria-label="Choose PDF files" onChange={event => { if (event.target.files) void upload(event.target.files); event.target.value = ''; }} />
      <span className="upload-limit">PDF only · Up to {fileSize(session.max_upload_bytes)} per file · {session.max_pages} pages</span>
    </div>
    {rows.length > 0 && <div className="upload-results" aria-label="Upload results" aria-live="polite">
      {rows.map((row, index) => <div className={`upload-result ${row.state}`} key={`${index}-${row.name}`}>
        {row.state === 'done' ? <Check size={18} aria-hidden="true" /> : row.state === 'error' ? <X size={18} aria-hidden="true" /> : <LoaderCircle className="spin" size={18} aria-hidden="true" />}
        <div><strong>{row.name}</strong><span>{row.message ?? (row.state === 'done' ? 'Checked and ready to view' : row.state === 'checking' ? 'Inspecting PDF structure…' : row.progress == null ? 'Uploading…' : `Uploading ${row.progress}%`)}</span></div>
        {row.state === 'uploading' && row.progress != null && <progress value={row.progress} max={100} aria-label={`Uploading ${row.name}`} />}
        {row.id && <Link className="text-link" to={`/documents/${row.id}`}>Open <ArrowUpRight size={16} aria-hidden="true" /></Link>}
      </div>)}
      {running && <button className="button quiet" onClick={() => controller.current?.abort()}>Cancel remaining uploads</button>}
    </div>}
    <div className="storage-note"><span className="status-dot" />Originals stay intact. Files are removed after {Math.round(session.retention_seconds / 3600 * 10) / 10} hours.</div>
  </section>;
}
