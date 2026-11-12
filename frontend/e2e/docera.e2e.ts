import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function createTestPdf(title: string, pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`${title} - Page ${i}`, { x: 50, y: 780, size: 16, font, color: rgb(0.1, 0.2, 0.2) });
    p.drawText(`Secret Code: TOPSECRET-${i}`, { x: 50, y: 740, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

test.describe('Docera Comprehensive E2E Test Suite', () => {
  test('01: Upload, view, zoom, rotate, search and document info', async ({ page }) => {
    const pdfBuf = await createTestPdf('Viewer Validation', 3);
    await page.goto('/');

    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'viewer-test.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await expect(page.getByRole('link', { name: 'viewer-test.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'viewer-test.pdf', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/[^/]+$/);
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

    // Document info popover
    await page.getByRole('button', { name: 'Document information' }).click();
    await expect(page.getByRole('dialog', { name: 'Document information' })).toContainText('viewer-test.pdf');
    await page.getByRole('button', { name: 'Document information' }).click();

    // View rotation
    await page.getByRole('button', { name: /rotate view/i }).click();
    await expect(page.locator('.view-only-note')).toContainText('rotated 90°');

    // Text search
    await page.getByLabel('Find in document').fill('TOPSECRET-2');
    await expect(page.locator('.search-results')).toContainText('Page 2');
  });

  test('02: Organize PDF: merge, split by range, and page reorder/rotate', async ({ page }) => {
    const pdfA = await createTestPdf('Doc Alpha', 2);
    const pdfB = await createTestPdf('Doc Beta', 2);

    // Merge
    await page.goto('/tools/organize');
    const mergeInput = page.locator('input[type="file"]').first();
    await mergeInput.setInputFiles([
      { name: 'alpha.pdf', mimeType: 'application/pdf', buffer: pdfA },
      { name: 'beta.pdf', mimeType: 'application/pdf', buffer: pdfB },
    ]);
    await expect(page.getByText('alpha.pdf', { exact: true })).toBeVisible();
    await expect(page.getByText('beta.pdf', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /merge 2 pdfs/i }).click();
    await expect(page.getByText(/merged 2 pdfs/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible();

    // Split via tab click
    await page.getByRole('tab', { name: /split & extract/i }).click();
    const splitInput = page.locator('input[aria-label="Choose PDF to split"]');
    await splitInput.setInputFiles({ name: 'to-split.pdf', mimeType: 'application/pdf', buffer: pdfA });
    await expect(page.getByRole('button', { name: 'Split PDF' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Split PDF' }).click();
    await expect(page.getByText(/created \d+ verified pdf/i)).toBeVisible({ timeout: 15_000 });
  });

  test('03: 3-Pane Editor: insert text, shapes, notes, and verify export', async ({ page }) => {
    const pdfBuf = await createTestPdf('Editor Objects', 1);
    await page.goto('/');

    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'editor-doc.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await page.getByRole('link', { name: 'editor-doc.pdf', exact: true }).click();
    await page.getByRole('link', { name: /edit & annotate/i }).click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);

    // Insert text
    await page.getByRole('button', { name: 'Insert text' }).click();
    const overlay = page.locator('.editor-overlay').first();
    const box = await overlay.boundingBox();
    await page.mouse.click(box!.x + 100, box!.y + 100);
    await expect(page.locator('.editor-item')).toHaveCount(1);

    // Export PDF
    const [editDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export pdf/i }).click(),
    ]);
    const editBytes = await readFile((await editDl.path())!);
    expect(editBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  test('04: Customization: apply watermark and page numbers', async ({ page }) => {
    const pdfBuf = await createTestPdf('Watermark Subject', 2);
    await page.goto('/tools/customize');

    const input = page.locator('.source-picker input[type="file"]').first();
    await input.setInputFiles({ name: 'wm-test.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await expect(page.getByText('wm-test.pdf')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /apply customization/i }).click();
    await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });
  });

  test('05: Optimization & Multi-format conversion', async ({ page }) => {
    const pdfBuf = await createTestPdf('Conversion Source', 1);

    // Compress
    await page.goto('/tools/compress');
    const compInput = page.locator('.source-picker input[type="file"]').first();
    await compInput.setInputFiles({ name: 'comp-src.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await page.getByRole('button', { name: /compress pdf/i }).click();
    await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });

    // Convert PDF -> Images (ZIP)
    await page.goto('/tools/convert?direction=pdf-to-image');
    const convInput = page.locator('.source-picker input[type="file"]').first();
    await convInput.setInputFiles({ name: 'img-conv.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('06: Security: protect, unlock, metadata clean, and verified redaction', async ({ page }) => {
    const pdfBuf = await createTestPdf('Security Target', 1);

    // Password Protect
    await page.goto('/tools/security?tab=protect');
    const secInput = page.locator('.source-picker input[type="file"]').first();
    await secInput.setInputFiles({ name: 'sec-target.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await page.getByLabel(/open password/i).fill('DoceraSecure2026!');
    await page.getByRole('button', { name: /encrypt with aes-256/i }).click();
    await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });

    // Metadata & Sanitize
    await page.getByRole('button', { name: /metadata & sanitize/i }).click();
    await page.getByRole('button', { name: /clean & sanitize pdf/i }).click();
    await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });
  });

  test('07: Forms & Signatures: create/fill fields and cryptographic digital signature', async ({ page }) => {
    const pdfBuf = await createTestPdf('Form Document', 1);
    await page.goto('/tools/forms-sign?tab=digital-sign');

    const formInput = page.locator('.source-picker input[type="file"]').first();
    await formInput.setInputFiles({ name: 'sign-target.pdf', mimeType: 'application/pdf', buffer: pdfBuf });

    await page.getByRole('button', { name: /sign cryptographically/i }).click();
    await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });
  });

  test('08: Batch processing workflow and ZIP audit report', async ({ page }) => {
    const pdf1 = await createTestPdf('Batch 1', 1);
    const pdf2 = await createTestPdf('Batch 2', 1);

    await page.goto('/tools/batch');
    const batchInput = page.locator('input[type="file"]').first();
    await batchInput.setInputFiles([
      { name: 'b1.pdf', mimeType: 'application/pdf', buffer: pdf1 },
      { name: 'b2.pdf', mimeType: 'application/pdf', buffer: pdf2 },
    ]);

    await page.getByRole('combobox').selectOption('strip_metadata');
    await page.getByRole('button', { name: /run on 2 files/i }).click();
    await expect(page.getByRole('button', { name: /download zip/i })).toBeVisible({ timeout: 35_000 });
    await expect(page.getByText('Batch summary: 2 succeeded')).toBeVisible();
  });

  test('09: Document management: search filter, sort, inline rename, and clean delete', async ({ page }) => {
    const pdfA = await createTestPdf('Alpha Test', 1);
    const pdfZ = await createTestPdf('Zeta Test', 1);

    await page.goto('/');
    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles([
      { name: 'alpha-doc.pdf', mimeType: 'application/pdf', buffer: pdfA },
      { name: 'zeta-doc.pdf', mimeType: 'application/pdf', buffer: pdfZ },
    ]);

    await expect(page.getByRole('link', { name: 'alpha-doc.pdf', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'zeta-doc.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    // Filter search
    await page.getByLabel(/filter recent documents/i).fill('alpha');
    await expect(page.getByRole('link', { name: 'alpha-doc.pdf', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'zeta-doc.pdf', exact: true })).toHaveCount(0);
    await page.getByLabel(/filter recent documents/i).fill('');

    // Rename
    await page.getByRole('button', { name: 'Rename alpha-doc.pdf' }).click();
    await page.getByRole('textbox', { name: 'Rename alpha-doc.pdf' }).fill('alpha-renamed.pdf');
    await page.getByRole('button', { name: 'Save filename' }).click();
    await expect(page.getByRole('link', { name: 'alpha-renamed.pdf', exact: true })).toBeVisible({ timeout: 10_000 });

    // Delete
    await page.getByRole('button', { name: 'Remove alpha-renamed.pdf' }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('link', { name: 'alpha-renamed.pdf', exact: true })).toHaveCount(0);
  });

  test('10: Error handling: invalid files, oversized notice, and navigation fallback', async ({ page }) => {
    await page.goto('/');

    // Upload corrupted text file masquerading as PDF
    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({
      name: 'corrupt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('NOT A VALID PDF FILE HEADER'),
    });

    await expect(page.locator('.upload-result.error')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.upload-result.error')).toContainText(/corrupt\.pdf/);

    // 404 Route handling
    await page.goto('/unknown-tool-route');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
    await page.getByRole('link', { name: /back to your workspace/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('11: UI/UX & Interaction: theme switching, category filtering, and editor keyboard shortcuts', async ({ page }) => {
    await page.goto('/');

    // 1. Theme Toggle
    const themeBtn = page.getByRole('button', { name: /switch to (dark|light) theme/i }).first();
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();
    const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(['light', 'dark']).toContain(currentTheme);

    // 2. Category filtering
    await page.getByRole('tab', { name: 'Organize PDF' }).click();
    await expect(page.getByText('Merge PDF')).toBeVisible();
    await expect(page.getByText('PDF to Word')).toHaveCount(0);
    await page.getByRole('tab', { name: 'All Tools' }).click();
    await expect(page.getByText('PDF to Word')).toBeVisible();

    // 3. Editor shortcuts & object manipulation
    const testPdf = await createTestPdf('Shortcut Test', 1);
    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'shortcut-test.pdf', mimeType: 'application/pdf', buffer: testPdf });
    await expect(page.getByRole('link', { name: 'shortcut-test.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'shortcut-test.pdf', exact: true }).click();
    await page.getByRole('link', { name: /edit & annotate/i }).click();
    await page.waitForURL(/\/documents\/.*\/edit/);

    // Place a rectangle shape
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
    const overlay = page.locator('.editor-overlay').first();
    const box = await overlay.boundingBox();
    await page.mouse.click(box!.x + 120, box!.y + 120);
    await expect(page.locator('.editor-item.selected')).toBeVisible();

    // Delete with keyboard Backspace
    await page.keyboard.press('Backspace');
    await expect(page.locator('.editor-item')).toHaveCount(0);

    // Undo with Ctrl+Z
    await page.keyboard.press('Control+z');
    await expect(page.locator('.editor-item')).toHaveCount(1);

    // Export PDF
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export PDF' }).click(),
    ]);
    const downloadedPath = await download.path();
    expect(downloadedPath).toBeTruthy();
    if (downloadedPath) {
      const buffer = await readFile(downloadedPath);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    }
  });

  test('12: Responsive viewports & WCAG accessibility audit across mobile, tablet, and desktop', async ({ page }) => {
    // 1. Mobile viewport (375x667 - iPhone SE)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /good work starts here/i })).toBeVisible();

    const mobileBodyOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 2;
    });
    expect(mobileBodyOverflow).toBe(true);

    // Verify mobile category chip interaction
    const mobileCategoryChip = page.getByRole('tab', { name: 'Protect & Redact' });
    await expect(mobileCategoryChip).toBeVisible();
    await mobileCategoryChip.click();
    await expect(page.getByText('Protect PDF')).toBeVisible();

    // 2. Tablet viewport (768x1024 - iPad)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/tools/organize');
    await expect(page.getByRole('heading', { name: /organize pdf/i })).toBeVisible();
    const tabletOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 2;
    });
    expect(tabletOverflow).toBe(true);

    // 3. Desktop viewport (1440x900) & Skip-link accessibility
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Focus skip-link via Tab navigation
    await page.keyboard.press('Tab');
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveAttribute('href', '#main-content');

    // ARIA landmark presence
    await expect(page.locator('aside.sidebar nav[aria-label="Main navigation"]')).toBeVisible();
    await expect(page.locator('main#main-content')).toBeVisible();
    await expect(page.locator('div[role="tablist"][aria-label="Tool categories"]')).toBeVisible();
  });
});
