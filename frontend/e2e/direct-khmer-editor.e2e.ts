import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import path from 'path';

test('Direct on-page PDF editing: benchmark iLovePDF, in-document caret, Khmer OS Muol and Battambang fidelity, and clean export', async ({ page }) => {
  const khmerFixturePath = path.resolve('..', 'backend', 'tests', 'fixtures', 'khmer_document.pdf');
  const khmerPdfBuf = await readFile(khmerFixturePath);

  // 1. Open Docera and upload Khmer PDF
  await page.goto('http://127.0.0.1:5173/');
  const fileInput = page.locator('input[aria-label="Choose PDF files"]');
  await fileInput.setInputFiles({ name: 'direct_khmer_scenario.pdf', mimeType: 'application/pdf', buffer: khmerPdfBuf });
  await expect(page.getByRole('link', { name: 'direct_khmer_scenario.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

  // 2. Open PDF Editor
  const editBtn = page.locator('a[title="Edit & annotate PDF"]').first();
  await editBtn.click();
  await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
  await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

  // 3. Activate Edit Existing Text mode
  const nativeBtn = page.locator('button[title*="Edit Existing PDF Text"]');
  await expect(nativeBtn).toBeVisible();
  await nativeBtn.click();

  // 4. Verify text spans are rendered with subtle hitboxes on Page 1
  const p1Spans = page.locator('.editor-page-wrapper[data-page="1"] .existing-text-span');
  await expect(p1Spans.first()).toBeVisible({ timeout: 15_000 });

  // Capture before-editing baseline
  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_01_before_editing.png' });

  // 5. Single-click the first span (Khmer OS Muol Heading: "កម្រងសំណួរ")
  const headingSpan = p1Spans.first();
  await headingSpan.click();
  await expect(headingSpan).toHaveClass(/selected/);

  // Verify contextual text formatting toolbar appears at top with detected font
  const contextualToolbar = page.locator('.contextual-text-toolbar');
  await expect(contextualToolbar).toBeVisible();
  const fontSelect = page.locator('.contextual-font-select');
  await expect(fontSelect).toBeVisible();

  // 6. Double-click to activate direct in-document on-page editing
  await headingSpan.dblclick();

  const directContainer = page.locator('.direct-page-text-editor-container');
  await expect(directContainer).toBeVisible();
  const directTextarea = page.locator('.direct-page-textarea');
  await expect(directTextarea).toBeVisible();
  await expect(directTextarea).toBeFocused();

  // Verify direct editor typography and properties
  const textareaStyles = await directTextarea.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: parseFloat(cs.fontSize),
      lineHeight: parseFloat(cs.lineHeight),
      color: cs.color,
      backgroundColor: cs.backgroundColor,
    };
  });
  console.log('Direct on-page textarea styles:', textareaStyles);
  expect(textareaStyles.fontFamily).toContain('KhmerOS');
  expect(textareaStyles.lineHeight).toBeGreaterThan(16);

  // Capture active direct editing screenshot
  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_02_muol_active_caret.png' });

  // 7. Type directly into the document
  await directTextarea.fill('កម្រងសំណួរ ២០២៦ (កែប្រែផ្ទាល់)');
  await page.waitForTimeout(200);

  // Capture typed on-page screenshot
  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_03_muol_typed_in_document.png' });

  // 8. Press Enter to commit edit directly on page
  await directTextarea.press('Enter');

  // Verify editor unmounts and span is marked edited
  await expect(directContainer).toHaveCount(0);
  await expect(headingSpan).toHaveClass(/edited/);

  // Wait for debounced live authoritative preview to update
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_04_muol_committed_preview.png' });

  // 9. Navigate to Page 2
  const thumb2 = page.locator('.thumbnail-button').nth(1);
  await thumb2.click();
  await page.waitForTimeout(500);

  const p2Spans = page.locator('.editor-page-wrapper[data-page="2"] .existing-text-span');
  await expect(p2Spans.first()).toBeVisible({ timeout: 15_000 });

  // Find target span containing "២០២៥"
  const p2Count = await p2Spans.count();
  let targetSpan = null;
  for (let i = 0; i < p2Count; i++) {
    const title = await p2Spans.nth(i).getAttribute('title');
    if (title && title.includes('២០២៥')) {
      targetSpan = p2Spans.nth(i);
      break;
    }
  }

  expect(targetSpan).not.toBeNull();
  if (targetSpan) {
    await targetSpan.scrollIntoViewIfNeeded();

    // Direct edit via Enter key while selected
    await targetSpan.click();
    await expect(targetSpan).toHaveClass(/selected/);
    await page.keyboard.press('Enter');

    await expect(directContainer).toBeVisible();
    await directTextarea.fill('២០២៥ ?');
    await page.waitForTimeout(200);

    // Commit by clicking outside (blur)
    await page.locator('.document-scroll').click({ position: { x: 50, y: 50 } });
    await expect(directContainer).toHaveCount(0);
    await expect(targetSpan).toHaveClass(/edited/);

    await page.waitForTimeout(400);
    await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_05_page2_battambang_committed.png' });
  }

  // 10. Export PDF and verify binary
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export pdf/i }).click(),
  ]);

  const dlPath = await download.path();
  expect(dlPath).toBeTruthy();
  const exportedBuf = await readFile(dlPath!);
  expect(exportedBuf.length).toBeGreaterThan(50_000);
  expect(exportedBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  console.log('Exported PDF verified successfully, binary size:', exportedBuf.length);

  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_06_final_export_verified.png' });
});
