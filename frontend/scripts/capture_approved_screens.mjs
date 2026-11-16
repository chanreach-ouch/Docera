import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = path.resolve('docs/screenshots');
const ARTIFACTS_DIR = 'C:/Users/Chanreach/.gemini/antigravity/brain/c9cb076e-b4d0-4dbd-8aad-1fe0e77fdeaf/verification_screenshots';

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // 1. Dashboard
  console.log('Capturing Dashboard...');
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_dashboard_approved.png') });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '01_dashboard_approved.png') });

  // 2. Compress PDF
  console.log('Capturing Compress PDF...');
  await page.goto('http://localhost:8080/tools/compress', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_compress_approved.png') });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '02_compress_approved.png') });

  // 3. Protect PDF
  console.log('Capturing Protect PDF...');
  await page.goto('http://localhost:8080/tools/security?tab=protect', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_protect_approved.png') });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '03_protect_approved.png') });

  // 4. Dark Theme Preview
  console.log('Capturing Dark Theme...');
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
  const themeToggle = await page.$('.theme-toggle-btn');
  if (themeToggle) {
    await themeToggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_dark_theme_approved.png') });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, '04_dark_theme_approved.png') });
    // Switch back to light theme
    await themeToggle.click();
    await page.waitForTimeout(500);
  }

  // 5. PDF Editor with Khmer Document
  console.log('Capturing PDF Editor with Khmer Document...');
  const khmerFixturePath = path.resolve('backend/tests/fixtures/khmer_document.pdf');
  if (fs.existsSync(khmerFixturePath)) {
    const khmerPdfBuf = fs.readFileSync(khmerFixturePath);
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles({
        name: 'កម្រងសំណួរ_111.pdf',
        mimeType: 'application/pdf',
        buffer: khmerPdfBuf,
      });
      console.log('Waiting for upload to finish...');
      const openLink = await page.waitForSelector('a[href*="/documents/"]', { timeout: 15000 });
      if (openLink) {
        const href = await openLink.getAttribute('href');
        console.log('Navigating to editor at', href + '/edit');
        await page.goto('http://localhost:8080' + href + '/edit', { waitUntil: 'networkidle' });
        await page.waitForTimeout(4000);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_editor_approved.png') });
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, '05_editor_approved.png') });
      }
    }
  }

  await browser.close();
  console.log('All screenshots captured successfully.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
