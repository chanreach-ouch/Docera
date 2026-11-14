import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import path from 'path';

test('Khmer Properties-Panel editor: restored 3-panel UI, no floating toolbar, no duplicate overlay, and clean PDF export', async ({ page }) => {
  const khmerFixturePath = path.resolve('..', 'backend', 'tests', 'fixtures', 'khmer_document.pdf');
  const khmerPdfBuf = await readFile(khmerFixturePath);

  await page.goto('http://127.0.0.1:5173/');
  const fileInput = page.locator('input[aria-label="Choose PDF files"]');
  await fileInput.setInputFiles({ name: 'khmer_editor_restored.pdf', mimeType: 'application/pdf', buffer: khmerPdfBuf });
  await expect(page.getByRole('link', { name: 'khmer_editor_restored.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

  const editBtn = page.locator('a[title="Edit & annotate PDF"]').first();
  await editBtn.click();
  await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
  await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

  // Switch to Native Edit Text tool
  const nativeBtn = page.locator('button[title*="Edit Existing PDF Text"]');
  await expect(nativeBtn).toBeVisible();
  await nativeBtn.click();

  // 1. Verify canvas has hitbox spans and NO floating toolbar
  const p1Spans = page.locator('.editor-page-wrapper[data-page="1"] .existing-text-span');
  await expect(p1Spans.first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.inline-editor-toolbar')).toHaveCount(0);
  await expect(page.locator('.complex-script-textarea')).toHaveCount(0);

  // Click on the first span on Page 1
  await p1Spans.first().click();

  // Verify the Right-side Properties panel displays the edit controls
  await expect(page.locator('.properties-panel')).toBeVisible();
  await expect(page.getByText('Edit PDF Text (Page 1)')).toBeVisible();
  await expect(page.locator('.prop-label:has-text("Original text")')).toBeVisible();
  
  const replacementTextarea = page.locator('textarea[aria-label="Replacement text"]');
  await expect(replacementTextarea).toBeVisible();

  // Verify replacement textarea has proper Khmer font and lineHeight (no distortion)
  const textareaStyles = await replacementTextarea.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: parseFloat(cs.fontSize),
      lineHeight: parseFloat(cs.lineHeight),
    };
  });
  console.log('Properties panel textarea styles:', textareaStyles);
  expect(textareaStyles.lineHeight).toBeGreaterThan(16);

  // Type replacement text in Properties panel
  await replacementTextarea.fill('កម្រងសំណួរ ២០២៥ (កែសម្រួល)');
  await page.waitForTimeout(200);

  // Click "Apply text change"
  const applyBtn = page.getByRole('button', { name: /Apply text change/i });
  await expect(applyBtn).toBeVisible();
  await applyBtn.click();

  // Verify the span is marked edited
  await expect(page.locator('.existing-text-span.edited').first()).toBeVisible();
  // Verify NO duplicate HTML overlay exists on canvas
  await expect(page.locator('.existing-text-replacement')).toHaveCount(0);

  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/properties_p1_applied.png' });

  // 2. Switch to Page 2
  const thumb2 = page.locator('.thumbnail-button').nth(1);
  await thumb2.click();
  await page.waitForTimeout(500);

  const p2Spans = page.locator('.editor-page-wrapper[data-page="2"] .existing-text-span');
  await expect(p2Spans.first()).toBeVisible({ timeout: 15_000 });

  // Test the exact question from user screenshot: target line 5 span '២០២៥ '
  let target2025Span = null;
  const p2SpanCount = await p2Spans.count();
  for (let i = 0; i < p2SpanCount; i++) {
    const title = await p2Spans.nth(i).getAttribute('title');
    if (title && title.includes('២០២៥')) {
      target2025Span = p2Spans.nth(i);
      break;
    }
  }

  if (target2025Span) {
    await target2025Span.scrollIntoViewIfNeeded();
    await target2025Span.click();
    await expect(page.getByText('Edit PDF Text (Page 2)')).toBeVisible();
    await replacementTextarea.fill('២០២៥ ?');
    await applyBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/properties_p2_2025_applied.png' });
  }

  // 3. Test legacy Limon detection & Clean Khmer button in Properties panel
  let legacySpan = null;
  for (let i = 0; i < p2SpanCount; i++) {
    const title = await p2Spans.nth(i).getAttribute('title');
    if (title && title.includes('ដផ្អកគលើ')) {
      legacySpan = p2Spans.nth(i);
      break;
    }
  }

  if (legacySpan) {
    await legacySpan.scrollIntoViewIfNeeded();
    await legacySpan.click();
    const cleanBtn = page.getByRole('button', { name: /Clean Legacy Khmer Unicode/i });
    await expect(cleanBtn).toBeVisible();
    await cleanBtn.click();
    await page.waitForTimeout(200);

    const repairedVal = await replacementTextarea.inputValue();
    expect(repairedVal).toContain('ផ្អែកលើ');
    expect(repairedVal).not.toContain('ដផ្អក');
    await applyBtn.click();
    await page.waitForTimeout(300);
  }

  // 4. Export PDF and verify valid binary download
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export pdf/i }).click(),
  ]);

  const dlPath = await download.path();
  expect(dlPath).toBeTruthy();
  const exportedBuf = await readFile(dlPath!);
  expect(exportedBuf.length).toBeGreaterThan(5000);
  expect(exportedBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  console.log('Successfully exported PDF, size:', exportedBuf.length);

  await page.screenshot({ path: 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/properties_export_verified.png' });
});
