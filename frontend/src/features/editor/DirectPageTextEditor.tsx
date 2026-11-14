import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NativeTextSpan } from './editorModel';
import { wrapTextToWidth } from '../../services/textWrapper';

export interface DirectPageTextEditorProps {
  span: NativeTextSpan;
  scale: number;
  initialText: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  textAlign?: 'left' | 'center' | 'right';
  pageWidth: number;
  onCommit: (newText: string) => void;
  onCancel: () => void;
  onChange: (newText: string) => void;
}

export const DirectPageTextEditor: React.FC<DirectPageTextEditorProps> = ({
  span,
  scale,
  initialText,
  fontFamily,
  fontSize,
  color,
  textAlign = 'left',
  pageWidth,
  onCommit,
  onCancel,
  onChange,
}) => {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Exact span dimensions in scaled screen pixels
  const initialWidth = Math.max(20, (span.bbox[2] - span.bbox[0]) * scale);
  const singleLineHeight = Math.max(16, (span.bbox[3] - span.bbox[1]) * scale);

  // Available width to the right margin of the page (keeping at least 36pt or balanced margin)
  const rightMarginPt = Math.max(24, Math.min(54, span.bbox[0]));
  const maxAvailableWidth = Math.max(initialWidth, (pageWidth - rightMarginPt - span.bbox[0]) * scale);

  const [inputWidth, setInputWidth] = useState(initialWidth);
  const [inputHeight, setInputHeight] = useState(singleLineHeight);

  // Automatically focus and place cursor at the end so the user can continue typing immediately
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  // Measure text width and height precisely to expand horizontally until reaching right margin,
  // then automatically word-wrap and expand vertically without empty space.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    let targetWidth = initialWidth;
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontSize * scale}px '${fontFamily}', sans-serif`;
        // Measure the widest single line
        const lines = text.split('\n');
        let maxLineWidth = 0;
        for (const line of lines) {
          const w = ctx.measureText(line || ' ').width;
          if (w > maxLineWidth) maxLineWidth = w;
        }
        const neededWidth = Math.ceil(maxLineWidth) + 20;
        targetWidth = Math.min(Math.max(initialWidth, neededWidth), maxAvailableWidth);
      }
    } catch {
      const approxW = (text.length * fontSize * scale * 0.58) + 20;
      targetWidth = Math.min(Math.max(initialWidth, approxW), maxAvailableWidth);
    }
    setInputWidth(targetWidth);

    // Auto-resize height based on scrollHeight at targetWidth
    if (el) {
      el.style.width = `${targetWidth}px`;
      el.style.height = 'auto';
      const scrollH = el.scrollHeight;
      // If content fits on 1 line, strictly use singleLineHeight to prevent any empty space
      if (scrollH <= singleLineHeight + 4) {
        setInputHeight(singleLineHeight);
      } else {
        // Tightly hug the wrapped lines (scrollHeight includes padding and borders)
        setInputHeight(Math.max(singleLineHeight, scrollH + 2));
      }
    }
  }, [text, fontFamily, fontSize, scale, initialWidth, maxAvailableWidth, singleLineHeight]);

  function handleCommit() {
    // If text was wrapped without explicit newlines, wrap it cleanly at right margin boundary for PDF fidelity
    const maxWidthPt = maxAvailableWidth / scale;
    const wrapped = wrapTextToWidth(text, { maxWidthPt, fontSizePt: fontSize, fontFamily });
    onCommit(wrapped);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }

    // Enter commits (or Shift+Enter creates a new line)
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow Shift+Enter to insert explicit new line
        return;
      }
      e.preventDefault();
      handleCommit();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      handleCommit();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.stopPropagation();
    }
  }

  function handleBlur() {
    handleCommit();
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: span.bbox[0] * scale,
        top: span.bbox[1] * scale,
        zIndex: 60,
      }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        className="direct-page-inline-input direct-page-inline-textarea"
        value={text}
        aria-label="Direct page text editor"
        autoFocus
        spellCheck={false}
        onChange={e => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: inputWidth,
          height: inputHeight,
          backgroundColor: '#FFFFFF',
          border: '1.5px solid var(--forest, #23665a)',
          borderRadius: '2px',
          boxShadow: '0 2px 8px rgba(35, 102, 90, 0.15)',
          outline: 'none',
          boxSizing: 'border-box',
          margin: 0,
          padding: '1px 3px',
          fontFamily: `'${fontFamily}', sans-serif`,
          fontSize: `${fontSize * scale}px`,
          lineHeight: 1.35,
          color: color || '#000000',
          textAlign,
          caretColor: 'var(--forest, #23665a)',
          letterSpacing: 'normal',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          lineBreak: 'anywhere',
          resize: 'none',
          overflow: 'hidden',
          display: 'block',
        }}
      />
    </div>
  );
};
