import { AlertCircle } from 'lucide-react';
import { ApiError } from '../services/api';

export function ErrorNotice({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return <div className="error-notice" role="alert">
    <AlertCircle size={18} aria-hidden="true" />
    <div><p>{error.message}</p>{error instanceof ApiError && error.requestId && <small>Request {error.requestId}</small>}</div>
    {onRetry && <button className="button secondary" onClick={onRetry}>Retry</button>}
  </div>;
}
