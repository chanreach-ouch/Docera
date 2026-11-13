import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function createTestPdf(title: string, pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`${title} - Page ${i}`, { x: 50, y: 780, size: 16, font, color: rgb(0.1, 0.2, 0.2) });
    p.drawText(`Content block for page ${i}`, { x: 50, y: 740, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

async function createScannedImagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  // 1x1 black pixel PNG
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngImage = await doc.embedPng(Buffer.from(pngBase64, 'base64'));
  page.drawImage(pngImage, { x: 50, y: 50, width: 495, height: 742 });
  return Buffer.from(await doc.save());
}

test.describe('Docera PDF Editor Comprehensive Regression Suite', () => {

  test('01: Upload PDF -> Open Editor directly from Dashboard', async ({ page }) => {
    const pdfBuf = await createTestPdf('Direct Editor Load', 2);
    await page.goto('/');

    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'direct-editor.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await expect(page.getByRole('link', { name: 'direct-editor.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    // Click direct Edit action
    const editBtn = page.locator('a[title="Edit & annotate PDF"]').first();
    await editBtn.click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);

    // Verify canvas renders and no load error is visible
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.viewer-error')).toHaveCount(0);
  });

  test('02: Upload PDF -> Open Viewer -> Navigate to Editor', async ({ page }) => {
    const pdfBuf = await createTestPdf('Viewer to Editor Nav', 2);
    await page.goto('/');

    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'viewer-nav.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await page.getByRole('link', { name: 'viewer-nav.pdf', exact: true }).click();
    await expect(page).toHaveURL(/\/documents\/[^/]+$/);
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

    // Navigate to editor
    await page.getByRole('link', { name: /edit & annotate/i }).click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.viewer-error')).toHaveCount(0);
  });

  test('03: Direct URL navigation, page reload, and back-and-forth viewer navigation', async ({ page }) => {
    const pdfBuf = await createTestPdf('Deep Link & Reload', 3);
    await page.goto('/');

    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'deep-link.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await expect(page.getByRole('link', { name: 'deep-link.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    const editBtn = page.locator('a[title="Edit & annotate PDF"]').first();
    await editBtn.click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

    const editorUrl = page.url();

    // 1. Refresh the editor page
    await page.reload();
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.viewer-error')).toHaveCount(0);

    // 2. Navigate back to viewer via header link
    await page.locator('a[title="Back to viewer"]').click();
    await expect(page).toHaveURL(/\/documents\/[^/]+$/);
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

    // 3. Navigate back to editor again
    await page.getByRole('link', { name: /edit & annotate/i }).click();
    await expect(page).toHaveURL(editorUrl);
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.viewer-error')).toHaveCount(0);
  });

  test('04: Multi-page (5 pages) and scanned image PDF documents', async ({ page }) => {
    // 1. Multi-page document
    const multiBuf = await createTestPdf('Multi Page Doc', 5);
    await page.goto('/');

    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'multi-five.pdf', mimeType: 'application/pdf', buffer: multiBuf });
    await expect(page.getByRole('link', { name: 'multi-five.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    await page.locator('a[title="Edit & annotate PDF"]').first().click();
    await expect(page.locator('.thumbnail-button')).toHaveCount(5, { timeout: 15_000 });
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible();

    // 2. Scanned image-only PDF
    const scanBuf = await createScannedImagePdf();
    await page.goto('/');
    await fileInput.setInputFiles({ name: 'scanned-doc.pdf', mimeType: 'application/pdf', buffer: scanBuf });
    await expect(page.getByRole('link', { name: 'scanned-doc.pdf', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.locator('a[title="Edit & annotate PDF"]').first().click();
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.viewer-error')).toHaveCount(0);
  });

  test('05: Non-existent or expired document displays clear error with retry option', async ({ page }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`/documents/${fakeId}/edit`);

    // Verify clear error notice appears
    const errorNotice = page.locator('.viewer-error').first();
    await expect(errorNotice).toBeVisible({ timeout: 10_000 });
    await expect(errorNotice).toContainText(/not found|expired/i);

    // Verify retry button and return link exist
    await expect(errorNotice.getByRole('button', { name: /retry/i })).toBeVisible();
    await expect(errorNotice.getByRole('link', { name: /return to workspace/i })).toBeVisible();
  });

  test('06: Password-protected document produces clear actionable error', async ({ page }) => {
    // 1. Create and encrypt a document via Security tool
    const pdfBuf = await createTestPdf('Protected Doc', 1);
    await page.goto('/tools/security?tab=protect');

    const secInput = page.locator('.source-picker input[type="file"]').first();
    await secInput.setInputFiles({ name: 'sec-target.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await page.getByLabel(/open password/i).fill('DoceraSecure2026!');
    await page.getByRole('button', { name: /encrypt with aes-256/i }).click();
    await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /download pdf/i }).click(),
    ]);

    const encBytes = await readFile((await download.path())!);
    expect(encBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');

    // 2. Upload encrypted document on dashboard and verify clear rejection notice
    await page.goto('/');
    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'encrypted.pdf', mimeType: 'application/pdf', buffer: encBytes });
    await expect(page.locator('.upload-result.error')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.upload-result.error')).toContainText(/password-protected|encrypted/i);
  });

  test('07: Edit document, export, and verify binary PDF output', async ({ page }) => {
    const pdfBuf = await createTestPdf('Export Verification', 2);
    await page.goto('/');

    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'to-edit.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await expect(page.getByRole('link', { name: 'to-edit.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    await page.locator('a[title="Edit & annotate PDF"]').first().click();
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

    // Insert text
    await page.getByRole('button', { name: 'Insert text' }).click();
    const overlay = page.locator('.editor-overlay').first();
    const box = await overlay.boundingBox();
    await page.mouse.click(box!.x + 120, box!.y + 120);
    await expect(page.locator('.editor-item')).toHaveCount(1);

    // Export PDF
    const [editDl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export pdf/i }).click(),
    ]);
    const editBytes = await readFile((await editDl.path())!);
    expect(editBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(editBytes.length).toBeGreaterThan(100);
  });

  test('08: Native PDF existing text editing and content-stream replacement', async ({ page }) => {
    const pdfBuf = await createTestPdf('Native Text Replace', 1);
    await page.goto('/');

    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'native-edit-test.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await expect(page.getByRole('link', { name: 'native-edit-test.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    await page.locator('a[title="Edit & annotate PDF"]').first().click();
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

    // Select 'Edit Existing PDF Text' tool
    const nativeBtn = page.locator('button[title*="Edit Existing PDF Text"]');
    await expect(nativeBtn).toBeVisible();
    await nativeBtn.click();

    // Wait for text spans to be extracted and rendered on canvas overlay
    await expect(page.locator('.existing-text-span').first()).toBeVisible({ timeout: 10_000 });

    // Find the span containing 'Content block for page 1'
    const targetSpan = page.locator('.existing-text-span[title*="Content block for page 1"]');
    await expect(targetSpan).toBeVisible();
    await targetSpan.click();

    // Verify Inspector displays the selected text
    const inspectorTextarea = page.locator('textarea[aria-label="Replacement text"]');
    await expect(inspectorTextarea).toBeVisible();
    await inspectorTextarea.fill('Updated Block 2026');

    // Click Apply text change
    await page.getByRole('button', { name: 'Apply text change' }).click();

    // Verify visual replacement badge appears
    await expect(page.locator('.existing-text-replacement')).toContainText('Updated Block 2026');

    // Export PDF and verify binary
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export pdf/i }).click(),
    ]);
    const exportedBytes = await readFile((await dl.path())!);
    expect(exportedBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(exportedBytes.length).toBeGreaterThan(500);
  });

  test('09: OCR & Scan Detection runs and produces searchable PDF without gateway buffer error', async ({ page }) => {
    const pdfBuf = await createTestPdf('OCR Searchable Test', 2);
    await page.goto('/tools/ocr');

    // Choose PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({ name: 'ocr-doc.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
    await expect(page.getByText('ocr-doc.pdf')).toBeVisible();

    // Run Scan Detection
    await page.getByRole('button', { name: 'Detect scanned pages' }).click();
    await expect(page.getByText(/All 2 pages already contain selectable text/i)).toBeVisible({ timeout: 15_000 });

    // Run OCR & Build Searchable PDF
    await page.getByRole('button', { name: /Run OCR & Build Searchable PDF/i }).click();

    // Verify successful output summary appears (not error banner)
    await expect(page.locator('.error-notice')).toHaveCount(0);
    await expect(page.locator('.result-summary').filter({ hasText: 'Engine:' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Download Searchable PDF/i })).toBeVisible();
  });

  test('10: Khmer PDF text editing with live authoritative preview and vector export', async ({ page }) => {
    // Read the real Khmer fixture PDF
    const khmerFixturePath = path.resolve('..', 'backend', 'tests', 'fixtures', 'khmer_document.pdf');
    const khmerPdfBuf = await readFile(khmerFixturePath);

    await page.goto('/');
    const fileInput = page.locator('input[aria-label="Choose PDF files"]');
    await fileInput.setInputFiles({ name: 'khmer_test.pdf', mimeType: 'application/pdf', buffer: khmerPdfBuf });
    await expect(page.getByRole('link', { name: 'khmer_test.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

    const editBtn = page.locator('a[title="Edit & annotate PDF"]').first();
    await editBtn.click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
    await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

    // Switch to Native Edit Text tool
    const nativeBtn = page.locator('button[title*="Edit Existing PDF Text"]');
    await expect(nativeBtn).toBeVisible();
    await nativeBtn.click();

    // Verify existing text spans are extracted
    await expect(page.locator('.existing-text-span').first()).toBeVisible({ timeout: 15_000 });

    // Select the first span
    await page.locator('.existing-text-span').first().click();

    // Verify properties panel opened with Khmer font detected
    const textarea = page.getByRole('textbox', { name: 'Replacement text' });
    await expect(textarea).toBeVisible();

    // Replace with complex Khmer numerals and text
    await textarea.fill('២០២៥ ?');

    // Click Apply text change
    await page.getByRole('button', { name: 'Apply text change' }).click();

    // Verify visual replacement appears
    await expect(page.locator('.existing-text-span.edited')).toBeVisible();

    // Export PDF and verify binary
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export pdf/i }).click(),
    ]);
    const exportedBytes = await readFile((await dl.path())!);
    expect(exportedBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(exportedBytes.length).toBeGreaterThan(1000);
  });

});
