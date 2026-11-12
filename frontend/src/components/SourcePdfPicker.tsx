import { useQuery } from '@tanstack/react-query';
import { FileText, Upload } from 'lucide-react';
import { useRef } from 'react';
import { api } from '../services/api';
import { fileSize } from '../services/format';

export type SelectedPdfSource =
  | { kind: 'local'; file: File; name: string; size: number }
  | { kind: 'session'; fileId: string; name: string; size: number };

export function SourcePdfPicker({
  value,
  onChange,
  label = 'Choose PDF',
}: {
  value: SelectedPdfSource | null;
  onChange: (src: SelectedPdfSource) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filesQuery = useQuery({ queryKey: ['files'], queryFn: api.files });

  return (
    <div className="source-picker">
      <div className="tool-panel-actions">
        <button type="button" className="button primary" onClick={() => inputRef.current?.click()}>
          <Upload size={16} /> {label}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onChange({ kind: 'local', file: f, name: f.name, size: f.size });
            e.target.value = '';
          }}
        />
        {value && (
          <span className="badge available">
            <FileText size={13} />&nbsp;{value.name} · {fileSize(value.size)}
          </span>
        )}
      </div>
      {filesQuery.data?.files.length ? (
        <div className="session-picker">
          <span>Or pick from workspace:</span>
          {filesQuery.data.files.slice(0, 5).map(doc => (
            <button
              key={doc.id}
              type="button"
              className="button quiet small"
              onClick={() => onChange({ kind: 'session', fileId: doc.id, name: doc.filename, size: doc.size_bytes })}
            >
              {doc.filename}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
