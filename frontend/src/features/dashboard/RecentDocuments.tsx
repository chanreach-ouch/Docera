import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, Download, FileText, Pencil, PenLine, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { api, fileUrl } from '../../services/api';
import { expiryLabel, fileSize } from '../../services/format';
import { ErrorNotice } from '../../components/ErrorNotice';

type SortKey = 'recent' | 'name' | 'size';

export function RecentDocuments() {
  const files = useQuery({ queryKey: ['files'], queryFn: api.files });
  const client = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('recent');

  const remove = useMutation({
    mutationFn: api.remove,
    onSuccess: async () => {
      setConfirmId(null);
      await client.invalidateQueries({ queryKey: ['files'] });
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) => api.rename(id, filename),
    onSuccess: async () => {
      setRenameId(null);
      await client.invalidateQueries({ queryKey: ['files'] });
    },
  });

  const visibleFiles = useMemo(() => {
    const items = [...(files.data?.files ?? [])];
    const term = filter.trim().toLowerCase();
    const filtered = term ? items.filter(f => f.filename.toLowerCase().includes(term)) : items;
    if (sortBy === 'name') {
      filtered.sort((a, b) => a.filename.localeCompare(b.filename));
    } else if (sortBy === 'size') {
      filtered.sort((a, b) => b.size_bytes - a.size_bytes);
    } else {
      filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return filtered;
  }, [files.data?.files, filter, sortBy]);

  return <section id="recent" className="recent-section" aria-labelledby="recent-heading">
    <div className="section-heading">
      <h2 id="recent-heading">Recent documents</h2>
      <button className="button quiet small" onClick={() => void files.refetch()} disabled={files.isFetching}>
        <RefreshCw size={14} className={files.isFetching ? 'spin' : ''} aria-hidden="true" />
        Refresh
      </button>
    </div>
    <p className="section-description">Your uploads in this browser session.</p>
    {files.isPending && <p className="empty-state" role="status">Loading your documents…</p>}
    {files.error && <ErrorNotice error={files.error} onRetry={() => void files.refetch()} />}
    {remove.error && <ErrorNotice error={remove.error} />}
    {rename.error && <ErrorNotice error={rename.error} />}
    {files.data?.files.length === 0 && (
      <div className="empty-documents">
        <FileText size={26} strokeWidth={1.4} aria-hidden="true" />
        <div><h3>Your workspace is ready.</h3><p>Open your first PDF and it will appear here.</p></div>
      </div>
    )}
    {!!files.data?.files.length && (
      <>
        <div className="doc-toolbar">
          <label className="tool-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Filter documents…"
              aria-label="Filter recent documents"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </label>
          <label className="session-picker">
            <span>Sort</span>
            <select aria-label="Sort documents" value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}>
              <option value="recent">Most recent</option>
              <option value="name">Filename (A–Z)</option>
              <option value="size">Largest first</option>
            </select>
          </label>
        </div>
        {!visibleFiles.length && <p className="empty-state">No documents match “{filter}”.</p>}
        {!!visibleFiles.length && (
          <ul className="document-list">
            {visibleFiles.map(file => (
              <li key={file.id}>
                <span className="file-symbol"><FileText size={22} strokeWidth={1.5} aria-hidden="true" /></span>
                <div className="document-name">
                  {renameId === file.id ? (
                    <form
                      className="rename-form"
                      onSubmit={e => {
                        e.preventDefault();
                        if (renameValue.trim()) {
                          rename.mutate({ id: file.id, filename: renameValue.trim() });
                        }
                      }}
                    >
                      <input
                        aria-label={`Rename ${file.filename}`}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="icon-button" disabled={rename.isPending} aria-label="Save filename" title="Save filename">
                        <Check size={16} />
                      </button>
                      <button type="button" className="icon-button" onClick={() => setRenameId(null)} aria-label="Cancel rename" title="Cancel">
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <Link to={`/documents/${file.id}`}>{file.filename}</Link>
                  )}
                  <span>
                    {file.page_count} {file.page_count === 1 ? 'page' : 'pages'} <span aria-hidden="true">·</span> {fileSize(file.size_bytes)} <span className="expiry">· Removed {expiryLabel(file.expires_at)}</span>
                  </span>
                </div>
                {confirmId === file.id ? (
                  <div className="confirm-delete" role="group" aria-label={`Remove ${file.filename}?`}>
                    <span>Remove this file?</span>
                    <button className="button danger small" disabled={remove.isPending} onClick={() => remove.mutate(file.id)}>Remove</button>
                    <button className="button quiet small" onClick={() => setConfirmId(null)}>Keep</button>
                  </div>
                ) : (
                  <div className="document-actions">
                    <Link className="button quiet small" to={`/documents/${file.id}/edit`} title="Edit & annotate PDF">
                      <PenLine size={15} aria-hidden="true" />
                      <span>Edit</span>
                    </Link>
                    <button
                      className="icon-button"
                      aria-label={`Rename ${file.filename}`}
                      title="Rename document"
                      onClick={() => { rename.reset(); setRenameId(file.id); setRenameValue(file.filename); }}
                    >
                      <Pencil size={16} />
                    </button>
                    <a className="icon-button" href={fileUrl(file.id)} aria-label={`Download ${file.filename}`} title="Download original">
                      <Download size={17} />
                    </a>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${file.filename}`}
                      title="Remove document"
                      onClick={() => { remove.reset(); setConfirmId(file.id); }}
                    >
                      <Trash2 size={17} />
                    </button>
                    <Link className="icon-button" to={`/documents/${file.id}`} aria-label={`Open ${file.filename}`} title="Open in viewer">
                      <ArrowUpRight size={19} />
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </>
    )}
  </section>;
}
