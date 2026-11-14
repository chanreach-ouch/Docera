import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NativeTextSpan } from './editorModel';

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
  const inputRef = useRef<HTMLInputElement>(null);

  // Exact span dimensions in scaled screen pixels
  const initialWidth = Math.max(20, (span.bbox[2] - span.bbox[0]) * scale);
  const spanHeight = Math.max(16, (span.bbox[3] - span.bbox[1]) * scale);
  const maxAvailableWidth = Math.max(initialWidth, (pageWidth - span.bbox[0] - 8) * scale);

  const [inputWidth, setInputWidth] = useState(initialWidth);

  // Automatically focus and place cursor at the end so the user can continue typing immediately
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  // Measure text width precisely using 2D canvas to expand horizontally without growing vertically
  useLayoutEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontSize * scale}px '${fontFamily}', sans-serif`;
        const metrics = ctx.measureText(text || ' ');
        // 16px buffer ensures blinking cursor stays visible
        const textW = Math.ceil(metrics.width) + 16;
        setInputWidth(Math.min(Math.max(initialWidth, textW), maxAvailableWidth));
      }
    } catch {
      // Fallback: estimate from character count
      const approxW = (text.length * fontSize * scale * 0.6) + 16;
      setInputWidth(Math.min(Math.max(initialWidth, approxW), maxAvailableWidth));
    }
  }, [text, fontFamily, fontSize, scale, initialWidth, maxAvailableWidth]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      onCommit(text);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.stopPropagation();
    }
  }

  function handleBlur() {
    onCommit(text);
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className="direct-page-inline-input"
      value={text}
      aria-label="Direct page text editor"
      autoFocus
      onChange={e => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: span.bbox[0] * scale,
        top: span.bbox[1] * scale,
        width: inputWidth,
        height: spanHeight,
        zIndex: 60,
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--forest, #23665a)',
        borderRadius: '2px',
        boxShadow: 'none',
        outline: 'none',
        boxSizing: 'border-box',
        margin: 0,
        padding: '0 2px',
        fontFamily: `'${fontFamily}', sans-serif`,
        fontSize: `${fontSize * scale}px`,
        lineHeight: 1,
        color: color || '#000000',
        textAlign,
        caretColor: 'var(--forest, #23665a)',
        letterSpacing: 'normal',
      }}
    />
  );
};
