import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import path from 'path';

test('Khmer dedicated inline editor: natural sizing, no clipping, and legacy repair', async ({ page }) => {
  const khmerFixturePath = path.resolve('..', 'backend', 'tests', 'fixtures', 'khmer_document.pdf');
  const khmerPdfBuf = await readFile(khmerFixturePath);

  await page.goto('http://127.0.0.1:5173/');
  const fileInput = page.locator('input[aria-label="Choose PDF files"]');
  await fileInput.setInputFiles({ name: 'khmer_inline_verify.pdf', mimeType: 'application/pdf', buffer: khmerPdfBuf });
  await expect(page.getByRole('link', { name: 'khmer_inline_verify.pdf', exact: true })).toBeVisible({ timeout: 15_000 });

  const editBtn = page.locator('a[title="Edit & annotate PDF"]').first();
  await editBtn.click();
  await expect(page).toHaveURL(/\/documents\/[^/]+\/edit$/);
  await expect(page.locator('.pdf-page canvas').first()).toBeVisible({ timeout: 15_000 });

  // Switch to Native Edit Text tool
  const nativeBtn = page.locator('button[title*="Edit Existing PDF Text"]');
  await expect(nativeBtn).toBeVisible();
  await nativeBtn.click();

  // 1. Test Page 1 inline editor
  const p1Spans = page.locator('.editor-page-wrapper[data-page="1"] .existing-text-span');
  await expect(p1Spans.first()).toBeVisible({ timeout: 15_000 });

  // Double-click to open inline complex-script editor
  await p1Spans.first().dblclick();

  const inlineTextarea = page.locator('.complex-script-textarea');
  await expect(inlineTextarea).toBeVisible();
  const inlineToolbar = page.locator('.inline-editor-toolbar');
  await expect(inlineToolbar).toBeVisible();
  await expect(page.locator('.inline-editor-font-pill')).toBeVisible();

  // Verify textarea computed metrics: ample height & padding prevents glyph clipping
  const textareaStyles = await inlineTextarea.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      fontFamily: cs.fontFamily,
      fontSize: parseFloat(cs.fontSize),
      lineHeight: parseFloat(cs.lineHeight),
      height: rect.height,
      paddingTop: parseFloat(cs.paddingTop),
      paddingBottom: parseFloat(cs.paddingBottom),
    };
  });
  console.log('Inline textarea styles:', textareaStyles);
  expect(textareaStyles.height).toBeGreaterThan(28); // Not squished!
  expect(textareaStyles.paddingTop).toBeGreaterThanOrEqual(4);

  // Type complex Khmer text with subscript coengs and upper vowels
  await inlineTextarea.fill('កម្រងសំណួរ ២០២៥ (កែសម្រួល)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'inline_p1_typed.png' });

  // Commit via floating Done button
  await page.locator('.inline-btn-apply').click();
  await expect(inlineTextarea).toHaveCount(0); // Closes cleanly
  await expect(page.locator('.existing-text-span.edited').first()).toBeVisible();

  // 2. Test Page 2 with legacy encoding detection & Clean Khmer action
  const thumb2 = page.locator('.thumbnail-button').nth(1);
  await thumb2.click();
  await page.waitForTimeout(500);

  const p2Spans = page.locator('.editor-page-wrapper[data-page="2"] .existing-text-span');
  await expect(p2Spans.first()).toBeVisible({ timeout: 15_000 });

  // Find question 10 which contains legacy Limon encoding artifacts
  const p2SpanCount = await p2Spans.count();
  let legacySpanIndex = -1;
  for (let i = 0; i < p2SpanCount; i++) {
    const title = await p2Spans.nth(i).getAttribute('title');
    if (title && title.includes('ដផ្អកគលើ')) {
      legacySpanIndex = i;
      break;
    }
  }

  if (legacySpanIndex >= 0) {
    const legacySpan = p2Spans.nth(legacySpanIndex);
    await legacySpan.scrollIntoViewIfNeeded();
    await legacySpan.click();

    // Verify "Clean Legacy Khmer Unicode" button appears in Properties panel
    const cleanBtn = page.getByRole('button', { name: /Clean Legacy Khmer Unicode/i });
    await expect(cleanBtn).toBeVisible();

    // Double-click into inline editor
    await legacySpan.dblclick();
    await expect(inlineTextarea).toBeVisible();

    // Verify floating toolbar also displays "Clean Khmer" button
    const floatCleanBtn = page.locator('.inline-clean-khmer-btn');
    await expect(floatCleanBtn).toBeVisible();

    // Click Clean Khmer to repair Limon visual encoding to standard Unicode
    await floatCleanBtn.click();
    await page.waitForTimeout(200);

    const repairedVal = await inlineTextarea.inputValue();
    console.log('Repaired inline value:', repairedVal);
    expect(repairedVal).toContain('ផ្អែកលើ'); // 'ដផ្អកគលើ' -> 'ផ្អែកលើ'
    expect(repairedVal).not.toContain('ដផ្អក');
    expect(repairedVal).not.toContain('គលើ');

    await page.screenshot({ path: 'inline_p2_repaired.png' });

    // Commit edit
    await page.locator('.inline-btn-apply').click();
    await expect(inlineTextarea).toHaveCount(0);
  }

  // 3. Export PDF and verify binary
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export pdf/i }).click(),
  ]);
  const exportedBytes = await readFile((await dl.path())!);
  expect(exportedBytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
});
