export type EditorObjectKind =
  | 'text'
  | 'image'
  | 'signature'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'ink'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'note'
  | 'stamp';

export type FontFamilyOption = 'Helvetica' | 'TimesRoman' | 'Courier';
export type AlignOption = 'left' | 'center' | 'right';
export type ObjectAlignAction = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export interface EditorObject {
  id: string;
  kind: EditorObjectKind;
  pageIndex: number; // 0-based
  // Zoom-independent top-left coordinates in PDF points (72 pt = 1 inch)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  color: string;
  fillColor?: string;
  strokeWidth?: number;
  // Text / Note / Stamp
  text?: string;
  fontFamily?: FontFamilyOption;
  fontSize?: number;
  align?: AlignOption;
  lineHeight?: number;
  // Image / Signature
  imageDataUrl?: string;
  // Ink freehand points (relative to page top-left in PDF points)
  points?: { x: number; y: number }[];
  // Stamp preset
  stampLabel?: string;
}

export interface EditorHistory {
  past: EditorObject[][];
  present: EditorObject[];
  future: EditorObject[][];
}

export function createHistory(initial: EditorObject[] = []): EditorHistory {
  return { past: [], present: initial, future: [] };
}

export function commitHistory(history: EditorHistory, next: EditorObject[]): EditorHistory {
  return {
    past: [...history.past.slice(-49), history.present],
    present: next,
    future: [],
  };
}

export function undoHistory(history: EditorHistory): EditorHistory {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: EditorHistory): EditorHistory {
  if (!history.future.length) return history;
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

export function duplicateEditorObjects(objects: EditorObject[], selectedIds: Set<string>): {
  next: EditorObject[];
  newIds: string[];
} {
  const clones: EditorObject[] = [];
  const newIds: string[] = [];
  for (const obj of objects) {
    if (selectedIds.has(obj.id)) {
      const id = `obj-${crypto.randomUUID()}`;
      newIds.push(id);
      clones.push({
        ...obj,
        id,
        x: obj.x + 14,
        y: obj.y + 14,
        points: obj.points?.map(pt => ({ x: pt.x + 14, y: pt.y + 14 })),
      });
    }
  }
  return { next: [...objects, ...clones], newIds };
}

export function alignEditorObjects(
  objects: EditorObject[],
  selectedIds: Set<string>,
  action: ObjectAlignAction,
  pageWidth = 612,
  pageHeight = 792,
): EditorObject[] {
  const targets = objects.filter(o => selectedIds.has(o.id));
  if (!targets.length) return objects;

  const minX = targets.length === 1 ? 0 : Math.min(...targets.map(t => t.x));
  const maxX = targets.length === 1 ? pageWidth : Math.max(...targets.map(t => t.x + t.width));
  const minY = targets.length === 1 ? 0 : Math.min(...targets.map(t => t.y));
  const maxY = targets.length === 1 ? pageHeight : Math.max(...targets.map(t => t.y + t.height));

  return objects.map(obj => {
    if (!selectedIds.has(obj.id)) return obj;
    switch (action) {
      case 'left':
        return { ...obj, x: minX };
      case 'center':
        return { ...obj, x: (minX + maxX - obj.width) / 2 };
      case 'right':
        return { ...obj, x: maxX - obj.width };
      case 'top':
        return { ...obj, y: minY };
      case 'middle':
        return { ...obj, y: (minY + maxY - obj.height) / 2 };
      case 'bottom':
        return { ...obj, y: maxY - obj.height };
    }
  });
}

export type ZOrderAction = 'bringForward' | 'sendBackward' | 'bringToFront' | 'sendToBack';

export function reorderZIndex(
  objects: EditorObject[],
  selectedIds: Set<string>,
  action: ZOrderAction,
): EditorObject[] {
  if (!selectedIds.size || objects.length <= 1) return objects;
  const result = [...objects];
  if (action === 'bringToFront') {
    const nonSelected = result.filter(o => !selectedIds.has(o.id));
    const selected = result.filter(o => selectedIds.has(o.id));
    return [...nonSelected, ...selected];
  }
  if (action === 'sendToBack') {
    const nonSelected = result.filter(o => !selectedIds.has(o.id));
    const selected = result.filter(o => selectedIds.has(o.id));
    return [...selected, ...nonSelected];
  }
  if (action === 'bringForward') {
    for (let i = result.length - 2; i >= 0; i--) {
      if (selectedIds.has(result[i].id) && !selectedIds.has(result[i + 1].id)) {
        const tmp = result[i];
        result[i] = result[i + 1];
        result[i + 1] = tmp;
      }
    }
    return result;
  }
  if (action === 'sendBackward') {
    for (let i = 1; i < result.length; i++) {
      if (selectedIds.has(result[i].id) && !selectedIds.has(result[i - 1].id)) {
        const tmp = result[i];
        result[i] = result[i - 1];
        result[i - 1] = tmp;
      }
    }
    return result;
  }
  return result;
}
