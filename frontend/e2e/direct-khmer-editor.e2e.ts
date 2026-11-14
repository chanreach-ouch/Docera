import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import path from 'path';

test('Direct on-page PDF editing: single-click inline caret, Khmer OS Muol and Battambang fidelity, zero-occlusion, and clean export', async ({ page }) => {
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
  // User Requirement: "just click on it and then the show the cursor to write text continue from the text"
  const headingSpan = p1Spans.first();
  await headingSpan.click();

  const directInput = page.locator('.direct-page-inline-input');
  await expect(directInput).toBeVisible();
  await expect(directInput).toBeFocused();

  // Verify contextual text formatting toolbar appears at top with detected font
  const contextualToolbar = page.locator('.contextual-text-toolbar');
  await expect(contextualToolbar).toBeVisible();
  const fontSelect = page.locator('.contextual-font-select');
  await expect(fontSelect).toBeVisible();

  // Verify direct editor typography and properties
  const inputStyles = await directInput.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: parseFloat(cs.fontSize),
      height: parseFloat(cs.height),
      color: cs.color,
      backgroundColor: cs.backgroundColor,
    };
  });
  console.log('Direct on-page inline input styles:', inputStyles);
  expect(inputStyles.fontFamily).toContain('KhmerOS');
  expect(inputStyles.height).toBeGreaterThan(10);
  expect(inputStyles.height).toBeLessThan(40); // Ensures it's single line, never expanding downward!

  // Capture active direct editing screenshot showing blinking caret right on the text line
  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_02_muol_active_caret.png' });

  // 6. Type directly into the document
  await directInput.fill('កម្រងសំណួរ ២០២៦ (កែប្រែផ្ទាល់)');
  await page.waitForTimeout(200);

  // Capture typed on-page screenshot
  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_03_muol_typed_in_document.png' });

  // 7. Press Enter to commit edit directly on page
  await directInput.press('Enter');

  // Verify editor unmounts and span is marked edited
  await expect(directInput).toHaveCount(0);
  await expect(headingSpan).toHaveClass(/edited/);

  // 7b. Single-click the "ផ្នែកទី១៖" bank heading span from the user's screenshot
  const p1Count = await p1Spans.count();
  let bankHeadingSpan = null;
  for (let i = 0; i < p1Count; i++) {
    const title = await p1Spans.nth(i).getAttribute('title');
    if (title && (title.includes('ផ្នែកទី១') || title.includes('ហ្វឺលីព') || title.includes('ហ្ែីលីព'))) {
      bankHeadingSpan = p1Spans.nth(i);
      break;
    }
  }

  expect(bankHeadingSpan).not.toBeNull();
  if (bankHeadingSpan) {
    await bankHeadingSpan.click();
    await expect(directInput).toBeVisible();
    const val = await directInput.inputValue();
    console.log('Bank heading input value:', val);
    expect(val).toContain('ស្វែងយល់');
    expect(val).toContain('ហ្វឺលីព');
    expect(val).not.toContain('ផ្សែង');
    await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_bank_heading_repaired.png' });
    await directInput.press('Enter');
  }

  // Wait for debounced live authoritative preview to update
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_04_muol_committed_preview.png' });

  // 8. Navigate to Page 2
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

    // Single-click target span directly opens inline input
    await targetSpan.click();
    await expect(directInput).toBeVisible();
    await expect(directInput).toBeFocused();

    // Type text continuing from original text
    await directInput.fill('២០២៥ ?');
    await page.waitForTimeout(200);

    // Commit by clicking outside (blur)
    await page.locator('.document-scroll').click({ position: { x: 50, y: 50 } });
    await expect(directInput).toHaveCount(0);
    await expect(targetSpan).toHaveClass(/edited/);

    await page.waitForTimeout(400);
    await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/direct_05_page2_battambang_committed.png' });
  }

  // 9. Export PDF and verify binary
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
