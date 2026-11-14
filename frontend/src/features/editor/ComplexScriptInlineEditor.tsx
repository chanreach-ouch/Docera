import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Sparkles, X } from 'lucide-react';
import type { NativeTextSpan } from './editorModel';
import {
  detectLegacyKhmerArtifacts,
  repairLegacyKhmerArtifacts,
} from '../../services/khmerNormalizer';
import { ensureFontLoaded } from '../../services/fontResolver';

interface ComplexScriptInlineEditorProps {
  span: NativeTextSpan;
  scale: number;
  initialText: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  pageWidth?: number;
  onCommit: (newText: string) => void;
  onCancel: () => void;
  onTextChange?: (text: string) => void;
}

export function ComplexScriptInlineEditor({
  span,
  scale,
  initialText,
  fontFamily,
  fontSize,
  color,
  pageWidth = 800,
  onCommit,
  onCancel,
  onTextChange,
}: ComplexScriptInlineEditorProps) {
  const [text, setText] = useState(initialText);
  const [isComposing, setIsComposing] = useState(false);
  const [fontReady, setFontReady] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Eagerly ensure font is fully loaded into document.fonts before rendering
  useEffect(() => {
    let active = true;
    void ensureFontLoaded(fontFamily).then(() => {
      if (active) setFontReady(true);
    });
    return () => {
      active = false;
    };
  }, [fontFamily]);

  // Initial focus and cursor positioning
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(text.length, text.length);
    }
  }, []);

  // Notify parent of text changes for live previews
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    onTextChange?.(val);
  };

  // Auto-resize textarea to fit text content without horizontal compression
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, (span.bbox[3] - span.bbox[1]) * scale + 12, 34)}px`;
  }, [text, scale, fontReady]);

  // Calculate coordinates & dimensions
  const origLeft = span.bbox[0] * scale;
  const origTop = span.bbox[1] * scale;
  const origWidth = Math.max(16, (span.bbox[2] - span.bbox[0]) * scale);
  const origHeight = Math.max(14, (span.bbox[3] - span.bbox[1]) * scale);

  // Measure natural text width to allow expanding horizontally
  const charCount = Array.from(text).length;
  const estimatedCharWidth = (fontSize * scale) * 0.65;
  const measuredWidth = Math.max(origWidth, charCount * estimatedCharWidth + 24);
  const maxWidth = Math.max(pageWidth * scale - origLeft - 20, 240);
  const editorWidth = Math.min(measuredWidth + 24, maxWidth);

  // Check if text is overflowing original bounding box significantly
  const isOverflowing = measuredWidth > origWidth * 1.25 && text.trim().length > 0;
  const overflowPx = Math.round(measuredWidth - origWidth);

  // Detect legacy Limon/ABC visual keyboard mapping artifacts
  const hasLegacyArtifacts = detectLegacyKhmerArtifacts(text);

  const handleCleanKhmer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cleaned = repairLegacyKhmerArtifacts(text);
    setText(cleaned);
    onTextChange?.(cleaned);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If composition is ongoing, do NOT intercept Enter or Escape
    if (isComposing) return;

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter inserts newline for multiline text
        return;
      }
      e.preventDefault();
      onCommit(text);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
      // Prevent triggering global document undo while typing
      e.stopPropagation();
    }
  };

  const showToolbarAbove = origTop > 45;

  return (
    <div
      ref={wrapperRef}
      className="complex-script-inline-wrapper"
      style={{
        position: 'absolute',
        left: origLeft - 4,
        top: origTop - 4,
        width: editorWidth,
        zIndex: 50,
      }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Floating Action Toolbar */}
      <div
        className={`inline-editor-toolbar ${showToolbarAbove ? 'above' : 'below'}`}
        onMouseDown={e => e.preventDefault()}
        onPointerDown={e => e.preventDefault()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: showToolbarAbove ? 4 : 0,
          marginTop: showToolbarAbove ? 0 : 4,
        }}
      >
        <span className="inline-editor-font-pill" title={`Active font: ${fontFamily}`}>
          {fontFamily}
        </span>

        {hasLegacyArtifacts && (
          <button
            type="button"
            className="inline-clean-khmer-btn"
            title="Legacy Limon/ABC visual keyboard encoding detected. Click to repair to standard Unicode."
            onClick={handleCleanKhmer}
          >
            <Sparkles size={11} /> Clean Khmer
          </button>
        )}

        {isOverflowing && (
          <span className="inline-overflow-badge" title={`Text is ${overflowPx}px wider than the original PDF text span.`}>
            <AlertTriangle size={11} /> +{overflowPx}px
          </span>
        )}

        <div className="inline-editor-actions">
          <button
            type="button"
            className="inline-btn inline-btn-apply"
            title="Apply edit (Enter)"
            onClick={() => onCommit(text)}
          >
            <Check size={12} /> Done
          </button>
          <button
            type="button"
            className="inline-btn inline-btn-cancel"
            title="Cancel edit (Esc)"
            onClick={onCancel}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Primary Auto-Resizing Complex-Script Editing Surface */}
      <textarea
        ref={textareaRef}
        rows={1}
        className="complex-script-textarea"
        value={text}
        onChange={handleChange}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={handleKeyDown}
        onBlur={e => {
          if (isComposing) return;
          if (e.relatedTarget && wrapperRef.current?.contains(e.relatedTarget as Node)) {
            return;
          }
          onCommit(text);
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        style={{
          fontFamily: `'${fontFamily}', sans-serif`,
          fontSize: `${fontSize * scale}px`,
          lineHeight: 1.6,
          color,
          letterSpacing: 'normal',
          minWidth: origWidth + 8,
          minHeight: Math.max(origHeight + 8, fontSize * scale * 1.6 + 6, 32),
        }}
      />
    </div>
  );
}
