export interface ToolItem {
  label: string;
  to: string;
  execution: 'Local' | 'Server' | 'Local / Server';
}

export interface ToolGroup {
  name: string;
  description: string;
  tools: readonly ToolItem[];
}

export const toolGroups: readonly ToolGroup[] = [
  {
    name: 'Edit PDF',
    description: 'Read, review, edit text & images, and annotate documents.',
    tools: [
      { label: 'PDF viewer', to: '#browse', execution: 'Local' },
      { label: 'Add text & images', to: '/tools/customize', execution: 'Local' },
      { label: 'Annotate PDF', to: '/tools/customize', execution: 'Local' },
      { label: 'Watermarks, page numbers & crop', to: '/tools/customize', execution: 'Local' },
    ],
  },
  {
    name: 'Organize PDF',
    description: 'Merge, split, extract, reorder, duplicate, and rotate pages locally.',
    tools: [
      { label: 'Merge PDF', to: '/tools/organize?mode=merge', execution: 'Local' },
      { label: 'Split PDF', to: '/tools/organize?mode=split', execution: 'Local' },
      { label: 'Reorder & rotate pages', to: '/tools/organize?mode=pages', execution: 'Local' },
    ],
  },
  {
    name: 'Convert PDF',
    description: 'Move between PDF, images, plain text, HTML, and Office formats.',
    tools: [
      { label: 'PDF to image', to: '/tools/convert?direction=pdf-to-image', execution: 'Server' },
      { label: 'Image to PDF', to: '/tools/convert?direction=images-to-pdf', execution: 'Server' },
      { label: 'Office conversion', to: '/tools/convert?direction=office-to-pdf', execution: 'Server' },
    ],
  },
  {
    name: 'Optimize PDF',
    description: 'Reduce file sizes with lossless deduplication or image resampling.',
    tools: [
      { label: 'Compress PDF', to: '/tools/compress', execution: 'Server' },
    ],
  },
  {
    name: 'Sign and Fill',
    description: 'Fill interactive AcroForm fields, place visual signatures, or sign cryptographically.',
    tools: [
      { label: 'Fill PDF forms', to: '/tools/forms-sign?tab=forms', execution: 'Server' },
      { label: 'Add visual signature', to: '/tools/forms-sign?tab=visual-sign', execution: 'Local' },
      { label: 'Cryptographic PAdES signature', to: '/tools/forms-sign?tab=digital-sign', execution: 'Server' },
    ],
  },
  {
    name: 'Protect PDF',
    description: 'Encrypt with AES-256 passwords, inspect/clean metadata, and verify redaction.',
    tools: [
      { label: 'Password protection', to: '/tools/security?tab=protect', execution: 'Server' },
      { label: 'Secure redaction', to: '/tools/security?tab=redact', execution: 'Server' },
      { label: 'Metadata & sanitization', to: '/tools/security?tab=metadata', execution: 'Server' },
    ],
  },
  {
    name: 'OCR and Extract',
    description: 'Detect scanned pages, run OCR when installed, or extract text.',
    tools: [
      { label: 'OCR PDF', to: '/tools/ocr', execution: 'Server' },
      { label: 'Extract text', to: '/tools/convert?direction=pdf-to-doc', execution: 'Server' },
    ],
  },
  {
    name: 'Batch Processing',
    description: 'Apply compression, rotation, headers/footers, or image export across multiple PDFs.',
    tools: [
      { label: 'Batch PDF workflow', to: '/tools/batch', execution: 'Server' },
    ],
  },
];

export function matchingGroups(search: string): ToolGroup[] {
  const term = search.toLowerCase().trim();
  if (!term) return [...toolGroups];
  return toolGroups
    .map(group => {
      const groupMatches = `${group.name} ${group.description}`.toLowerCase().includes(term);
      const matchingTools = groupMatches
        ? group.tools
        : group.tools.filter(t => t.label.toLowerCase().includes(term));
      return matchingTools.length ? { ...group, tools: matchingTools } : null;
    })
    .filter((group): group is ToolGroup => group !== null);
}
