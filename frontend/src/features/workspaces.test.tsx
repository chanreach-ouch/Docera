import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard/Dashboard';
import { RecentDocuments } from './dashboard/RecentDocuments';
import { CompressWorkspace } from './compress/CompressWorkspace';
import { SecurityWorkspace } from './security/SecurityWorkspace';
import { api } from '../services/api';
import { toolsApi } from '../services/toolsApi';

vi.mock('../services/api', () => ({
  api: {
    session: vi.fn(),
    files: vi.fn(),
    file: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
  },
  fileUrl: (id: string) => `/api/v1/files/${id}/download`,
  uploadPdf: vi.fn(),
}));

vi.mock('../services/toolsApi', () => ({
  toolsApi: {
    compress: vi.fn(),
    securityEncrypt: vi.fn(),
    securityUnlock: vi.fn(),
    securityInspectMetadata: vi.fn(),
    securityClean: vi.fn(),
    securityRedact: vi.fn(),
  },
}));

const sampleSession = {
  max_upload_bytes: 25 * 1024 * 1024,
  max_pages: 500,
  retention_seconds: 86400,
  max_session_files: 100,
  session_quota_bytes: 250 * 1024 * 1024,
};

function wrap(ui: React.ReactElement, initialEntries = ['/']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Docera Workspaces Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.files).mockResolvedValue({
      files: [
        {
          id: 'doc-1',
          filename: 'alpha.pdf',
          size_bytes: 2048,
          page_count: 2,
          created_at: '2026-11-12T10:00:00Z',
          expires_at: '2026-11-13T10:00:00Z',
        },
        {
          id: 'doc-2',
          filename: 'zeta-report.pdf',
          size_bytes: 10240,
          page_count: 5,
          created_at: '2026-11-12T11:00:00Z',
          expires_at: '2026-11-13T11:00:00Z',
        },
      ],
    });
  });

  it('Dashboard exposes Ready tool routes and deep links', async () => {
    wrap(<Dashboard session={sampleSession} />);
    const readyBadges = await screen.findAllByText('Ready');
    expect(readyBadges.length).toBeGreaterThanOrEqual(7);

    const mergeLink = screen.getAllByText('Merge PDF').find(el => el.closest('li'))?.closest('li')?.querySelector('a');
    expect(mergeLink).toHaveAttribute('href', '/tools/organize?mode=merge');
  });

  it('RecentDocuments filters, sorts, and renames documents', async () => {
    vi.mocked(api.rename).mockResolvedValue({
      id: 'doc-1',
      filename: 'renamed-alpha.pdf',
      size_bytes: 2048,
      page_count: 2,
      created_at: '2026-11-12T10:00:00Z',
      expires_at: '2026-11-13T10:00:00Z',
      pages: [],
    });

    wrap(<RecentDocuments />);
    expect(await screen.findByText('alpha.pdf')).toBeInTheDocument();
    expect(screen.getByText('zeta-report.pdf')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/filter recent documents/i), { target: { value: 'alpha' } });
    expect(screen.getByText('alpha.pdf')).toBeInTheDocument();
    expect(screen.queryByText('zeta-report.pdf')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rename alpha.pdf' }));
    const input = screen.getByRole('textbox', { name: 'Rename alpha.pdf' });
    fireEvent.change(input, { target: { value: 'renamed-alpha.pdf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save filename' }));

    await waitFor(() => {
      expect(api.rename).toHaveBeenCalledWith('doc-1', 'renamed-alpha.pdf');
    });
  });

  it('CompressWorkspace sends selected preset and displays size metrics', async () => {
    vi.mocked(toolsApi.compress).mockResolvedValue({
      blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      filename: 'sample-compressed.pdf',
      report: {
        original_bytes: 10000,
        compressed_bytes: 4000,
        saved_bytes: 6000,
        percent_change: -60,
        was_reduced: true,
        recompressed_images: 1,
        deduped_images: 0,
      },
    });

    const { container } = wrap(<CompressWorkspace />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdfFile = new File(['%PDF-1.4\n'], 'sample.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    fireEvent.click(screen.getByText(/compact \(96 dpi\)/i));
    fireEvent.click(screen.getByRole('button', { name: /compress pdf/i }));

    await waitFor(() => {
      expect(toolsApi.compress).toHaveBeenCalledWith({ file: pdfFile }, 'compact', false);
    });
    expect(await screen.findByText(/-60%/)).toBeInTheDocument();
  });

  it('SecurityWorkspace reads query tab and encrypts with AES-256', async () => {
    vi.mocked(toolsApi.securityEncrypt).mockResolvedValue({
      blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
      filename: 'secret-protected.pdf',
      report: {},
    });

    const { container } = wrap(<SecurityWorkspace />, ['/tools/security?tab=protect']);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdfFile = new File(['%PDF-1.4\n'], 'secret.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    fireEvent.change(screen.getByLabelText(/open password/i), { target: { value: 'StrongPass123' } });
    fireEvent.click(screen.getByRole('button', { name: /encrypt with aes-256/i }));

    await waitFor(() => {
      expect(toolsApi.securityEncrypt).toHaveBeenCalledWith(
        { file: pdfFile },
        expect.objectContaining({
          userPassword: 'StrongPass123',
          allowPrint: true,
          allowCopy: false,
        }),
      );
    });
  });
});
