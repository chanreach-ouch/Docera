export interface ToolItem {
  id: string;
  label: string;
  description: string;
  to: string;
  execution: 'Local' | 'Server' | 'Local / Server';
  icon: string;
}

export interface ToolGroup {
  id: string;
  name: string;
  description: string;
  tools: readonly ToolItem[];
}

export const toolGroups: readonly ToolGroup[] = [
  {
    id: 'edit',
    name: 'Edit & Annotate',
    description: 'Read, modify text & images, draw shapes, fill forms, and place signatures.',
    tools: [
      { id: 'viewer', label: 'PDF viewer', description: 'Open, read, search, and navigate any PDF document.', to: '#browse', execution: 'Local', icon: 'BookOpen' },
      { id: 'edit-pdf', label: 'Edit PDF', description: 'Modify text, images, shapes, and freehand drawings.', to: '#browse', execution: 'Local / Server', icon: 'PenTool' },
      { id: 'annotate', label: 'Annotate PDF', description: 'Standard highlights, underlines, notes, and stamps.', to: '/tools/customize?tab=annotate', execution: 'Local', icon: 'Highlighter' },
      { id: 'forms', label: 'Fill forms', description: 'Inspect, fill, and flatten interactive AcroForm fields.', to: '/tools/forms-sign?tab=forms', execution: 'Server', icon: 'FileCheck2' },
      { id: 'sign', label: 'Sign PDF', description: 'Draw, type, or upload visual & cryptographic PAdES signatures.', to: '/tools/forms-sign?tab=visual-sign', execution: 'Local / Server', icon: 'Signature' },
      { id: 'watermark', label: 'Watermarks & numbering', description: 'Diagonal text/image watermarks and dynamic page numbers.', to: '/tools/customize', execution: 'Local', icon: 'Sparkles' },
    ],
  },
  {
    id: 'organize',
    name: 'Organize PDF',
    description: 'Combine, split, reorder, rotate, extract, duplicate, or delete pages locally.',
    tools: [
      { id: 'merge', label: 'Merge PDF', description: 'Combine multiple PDF files into one clean document.', to: '/tools/organize?mode=merge', execution: 'Local', icon: 'Combine' },
      { id: 'split', label: 'Split PDF', description: 'Separate pages by custom ranges, every N pages, or extracts.', to: '/tools/organize?mode=split', execution: 'Local', icon: 'Split' },
      { id: 'rotate', label: 'Rotate pages', description: 'Rotate individual pages or all pages 90° clockwise/counter-clockwise.', to: '/tools/organize?mode=pages', execution: 'Local', icon: 'RotateCw' },
      { id: 'reorder', label: 'Reorder pages', description: 'Drag and drop pages into your preferred visual sequence.', to: '/tools/organize?mode=pages', execution: 'Local', icon: 'ArrowUpDown' },
      { id: 'extract', label: 'Extract pages', description: 'Save selected page subsets as a standalone document or ZIP.', to: '/tools/organize?mode=split', execution: 'Local', icon: 'FileOutput' },
      { id: 'delete-pages', label: 'Delete pages', description: 'Remove unwanted pages permanently from the document.', to: '/tools/organize?mode=pages', execution: 'Local', icon: 'Trash2' },
    ],
  },
  {
    id: 'convert',
    name: 'Convert PDF',
    description: 'Convert between PDF, images, Office formats, HTML, and structured text.',
    tools: [
      { id: 'pdf-to-word', label: 'PDF to Word', description: 'Export PDF documents to editable Microsoft Word (.docx).', to: '/tools/convert?direction=pdf-to-doc&format=docx', execution: 'Server', icon: 'FileText' },
      { id: 'pdf-to-excel', label: 'PDF to Excel', description: 'Extract tables directly into clean Microsoft Excel (.xlsx) spreadsheets.', to: '/tools/convert?direction=pdf-to-doc&format=xlsx', execution: 'Server', icon: 'Table' },
      { id: 'pdf-to-powerpoint', label: 'PDF to PowerPoint', description: 'Convert PDF slides into presentation slides (.pptx).', to: '/tools/convert?direction=pdf-to-doc&format=pptx', execution: 'Server', icon: 'Presentation' },
      { id: 'office-to-pdf', label: 'Office to PDF', description: 'Convert Word, Excel, and PowerPoint files into standard PDFs.', to: '/tools/convert?direction=office-to-pdf', execution: 'Server', icon: 'FileSpreadsheet' },
      { id: 'pdf-to-image', label: 'PDF to images', description: 'Render PDF pages to high-resolution PNG or JPEG archives.', to: '/tools/convert?direction=pdf-to-image', execution: 'Server', icon: 'Image' },
      { id: 'images-to-pdf', label: 'Images to PDF', description: 'Assemble multiple PNG, JPEG, or WebP images into a PDF.', to: '/tools/convert?direction=images-to-pdf', execution: 'Server', icon: 'Images' },
    ],
  },
  {
    id: 'optimize',
    name: 'Optimize & OCR',
    description: 'Reduce file size with intelligent compression or make scanned documents searchable.',
    tools: [
      { id: 'compress', label: 'Compress PDF', description: 'Lossless structural deduplication and balanced image resampling.', to: '/tools/compress', execution: 'Server', icon: 'Minimize2' },
      { id: 'ocr', label: 'OCR PDF', description: 'Detect scanned pages and inject invisible searchable text layers.', to: '/tools/ocr', execution: 'Server', icon: 'ScanText' },
      { id: 'extract-text', label: 'Extract text', description: 'Extract plain text or clean semantic HTML from documents.', to: '/tools/convert?direction=pdf-to-doc', execution: 'Server', icon: 'FileCode2' },
    ],
  },
  {
    id: 'security',
    name: 'Protect & Redact',
    description: 'AES-256 encryption, password unlocking, metadata sanitization, and redaction.',
    tools: [
      { id: 'protect', label: 'Protect PDF', description: 'Encrypt with AES-256 user open and owner permission passwords.', to: '/tools/security?tab=protect', execution: 'Server', icon: 'Lock' },
      { id: 'unlock', label: 'Unlock PDF', description: 'Remove password protection from authorized encrypted documents.', to: '/tools/security?tab=unlock', execution: 'Server', icon: 'Unlock' },
      { id: 'redact', label: 'Redact PDF', description: 'Permanently destroy text and graphics with verified zero-character leakage.', to: '/tools/security?tab=redact', execution: 'Server', icon: 'Eraser' },
      { id: 'metadata', label: 'Remove metadata', description: 'Purge document info, author, title, and tracking XMP tags.', to: '/tools/security?tab=metadata', execution: 'Server', icon: 'ShieldAlert' },
    ],
  },
  {
    id: 'batch',
    name: 'Batch Processing',
    description: 'Process dozens of documents at once with multi-worker pipeline operations.',
    tools: [
      { id: 'batch-workflow', label: 'Batch processing', description: 'Compress, rotate, watermark, or convert multiple PDFs into a ZIP archive.', to: '/tools/batch', execution: 'Server', icon: 'FolderKanban' },
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
        : group.tools.filter(t => `${t.label} ${t.description}`.toLowerCase().includes(term));
      return matchingTools.length ? { ...group, tools: matchingTools } : null;
    })
    .filter((group): group is ToolGroup => group !== null);
}
