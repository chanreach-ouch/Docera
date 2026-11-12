import {
  ArrowUpDown, BookOpen, Combine, Eraser, FileCheck2, FileCode2,
  FileOutput, FileSpreadsheet, FileText, FolderKanban, Highlighter,
  Image, Images, Lock, Minimize2, PenTool, Presentation, RotateCw,
  ScanText, ShieldAlert, Signature, Sparkles, Split, Table, Trash2,
  Unlock, Wrench,
} from 'lucide-react';

interface ToolIconProps {
  name: string;
  size?: number;
  className?: string;
}

export function ToolIcon({ name, size = 20, className }: ToolIconProps) {
  switch (name) {
    case 'BookOpen': return <BookOpen size={size} className={className} aria-hidden="true" />;
    case 'PenTool': return <PenTool size={size} className={className} aria-hidden="true" />;
    case 'Highlighter': return <Highlighter size={size} className={className} aria-hidden="true" />;
    case 'FileCheck2': return <FileCheck2 size={size} className={className} aria-hidden="true" />;
    case 'Signature': return <Signature size={size} className={className} aria-hidden="true" />;
    case 'Sparkles': return <Sparkles size={size} className={className} aria-hidden="true" />;
    case 'Combine': return <Combine size={size} className={className} aria-hidden="true" />;
    case 'Split': return <Split size={size} className={className} aria-hidden="true" />;
    case 'RotateCw': return <RotateCw size={size} className={className} aria-hidden="true" />;
    case 'ArrowUpDown': return <ArrowUpDown size={size} className={className} aria-hidden="true" />;
    case 'FileOutput': return <FileOutput size={size} className={className} aria-hidden="true" />;
    case 'Trash2': return <Trash2 size={size} className={className} aria-hidden="true" />;
    case 'FileText': return <FileText size={size} className={className} aria-hidden="true" />;
    case 'Table': return <Table size={size} className={className} aria-hidden="true" />;
    case 'Presentation': return <Presentation size={size} className={className} aria-hidden="true" />;
    case 'FileSpreadsheet': return <FileSpreadsheet size={size} className={className} aria-hidden="true" />;
    case 'Image': return <Image size={size} className={className} aria-hidden="true" />;
    case 'Images': return <Images size={size} className={className} aria-hidden="true" />;
    case 'Minimize2': return <Minimize2 size={size} className={className} aria-hidden="true" />;
    case 'ScanText': return <ScanText size={size} className={className} aria-hidden="true" />;
    case 'FileCode2': return <FileCode2 size={size} className={className} aria-hidden="true" />;
    case 'Lock': return <Lock size={size} className={className} aria-hidden="true" />;
    case 'Unlock': return <Unlock size={size} className={className} aria-hidden="true" />;
    case 'Eraser': return <Eraser size={size} className={className} aria-hidden="true" />;
    case 'ShieldAlert': return <ShieldAlert size={size} className={className} aria-hidden="true" />;
    case 'FolderKanban': return <FolderKanban size={size} className={className} aria-hidden="true" />;
    default: return <Wrench size={size} className={className} aria-hidden="true" />;
  }
}
