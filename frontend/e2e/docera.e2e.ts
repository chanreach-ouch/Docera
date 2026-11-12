import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function buildSamplePdfBytes(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText('DOCERA E2E SAMPLE DOCUMENT', { x: 72, y: 700, size: 18, font, color: rgb(0.1, 0.2, 0.2) });
  page.drawText('Searchable keyword: CONFIDENTIAL REPORT 2026', { x: 72, y: 660, size: 13, font, color: rgb(0, 0, 0) });
  page.drawText('Page two content for verify workflow.', { x: 72, y: 620, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
  const page2 = doc.addPage([612, 792]);
  page2.drawText('Second Page Content', { x: 72, y: 700, size: 16, font });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

test('full end-to-end PDF lifecycle: upload, view, edit, compress, convert, protect, delete', async ({ page }) => {
  const pdfBuffer = await buildSamplePdfBytes();

  // 1. Dashboard loads
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good work starts here/i })).toBeVisible();

  // 2. Upload PDF
  const fileInput = page.locator('input[aria-label="Choose PDF files"]');
  await fileInput.setInputFiles({
    name: 'docera-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
  });

  await expect(page.getByRole('link', { name: 'docera-e2e.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

  // 3. Open PDF Viewer
  await page.getByRole('link', { name: 'docera-e2e.pdf', exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/[^/]+$/);
  await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

  // Search text in viewer
  await page.getByLabel('Find in document').fill('CONFIDENTIAL');
  await expect(page.locator('.search-results')).toContainText(/Page 1/i, { timeout: 10_000 });

  // 4. Open Editor & Annotate
  await page.getByRole('link', { name: /edit & annotate/i }).click();
  await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
  await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

  // Place a text item
  await page.getByRole('button', { name: 'Insert text' }).click();
  const overlay = page.locator('.editor-overlay').first();
  const box = await overlay.boundingBox();
  if (!box) throw new Error('Editor overlay missing');
  await page.mouse.click(box.x + 120, box.y + 120);

  // Download edited PDF and verify valid PDF header
  const [editDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export pdf/i }).click(),
  ]);
  const editPath = await editDownload.path();
  if (!editPath) throw new Error('Missing edited download');
  const editedBytes = await readFile(editPath);
  expect(editedBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');

  // 5. Compress PDF using workspace session file
  await page.goto('/tools/compress');
  await page.getByRole('button', { name: 'docera-e2e.pdf' }).click();
  await page.getByRole('button', { name: /compress pdf/i }).click();
  await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });

  // 6. Convert PDF -> TXT
  await page.goto('/tools/convert?direction=pdf-to-doc');
  await page.getByRole('button', { name: 'docera-e2e.pdf' }).click();
  await page.getByLabel(/target format/i).selectOption('txt');
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible({ timeout: 15_000 });
  const [txtDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  const txtPath = await txtDownload.path();
  if (!txtPath) throw new Error('Missing TXT download');
  const txtContent = await readFile(txtPath, 'utf8');
  expect(txtContent).toContain('CONFIDENTIAL REPORT 2026');

  // 7. Security Protect (AES-256)
  await page.goto('/tools/security?tab=protect');
  await page.getByRole('button', { name: 'docera-e2e.pdf' }).click();
  await page.getByLabel(/open password/i).fill('E2EPass123!');
  await page.getByRole('button', { name: /encrypt with aes-256/i }).click();
  await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible({ timeout: 15_000 });

  // 8. Delete uploaded file cleanly from dashboard
  await page.goto('/');
  await page.getByRole('button', { name: 'Remove docera-e2e.pdf' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('link', { name: 'docera-e2e.pdf', exact: true })).toHaveCount(0);
});
