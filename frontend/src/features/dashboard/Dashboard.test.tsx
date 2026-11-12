import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: {
    session: vi.fn(),
    files: vi.fn(),
    file: vi.fn(),
    remove: vi.fn(),
  },
  fileUrl: (id: string) => `/api/v1/files/${id}/download`,
  uploadPdf: vi.fn(),
}));

const sampleSession = {
  max_upload_bytes: 25 * 1024 * 1024,
  max_pages: 500,
  retention_seconds: 86400,
  max_session_files: 100,
  session_quota_bytes: 250 * 1024 * 1024,
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard session={sampleSession} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.mocked(api.files).mockResolvedValue({ files: [] });
  });

  it('renders upload area, empty documents state, and searchable tool directory', async () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: /good work starts here/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse files/i })).toBeInTheDocument();
    expect(await screen.findByText(/your workspace is ready/i)).toBeInTheDocument();

    const search = screen.getByLabelText(/search tools/i);
    fireEvent.change(search, { target: { value: 'merge' } });
    expect(screen.getByText('Merge PDF')).toBeInTheDocument();
    expect(screen.queryByText('Compress PDF')).not.toBeInTheDocument();
  });
});
