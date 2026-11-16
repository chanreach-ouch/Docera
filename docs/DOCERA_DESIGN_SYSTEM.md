# Docera — Design System Specification

## Brand Philosophy: Refined Editorial Precision

Docera is an artisanal, high-precision document platform. Its visual language balances editorial calm with software precision:
- **Calm & Trustworthy:** Forest slate tones and warm neutral canvas backgrounds reduce eye fatigue during long document workflows.
- **Document-First:** The user's document is always the hero; application chrome recedes into clean, subtle framing.
- **Flawless Multilingual Typography:** Equal design citizenship for Khmer and English scripts with proportional line heights and zero glyph clipping.

---

## 1. Color Palette & Semantic Tokens

### 1.1 Brand Palette (Forest & Slate)
| Token | Light Theme | Dark Theme | Purpose |
|---|---|---|---|
| `--color-brand-primary` | `#184E44` | `#328A7A` | Primary brand accent, primary CTA background |
| `--color-brand-primary-hover` | `#123C35` | `#3DA895` | Hover state for primary CTAs |
| `--color-brand-secondary` | `#23665A` | `#2B7669` | Interactive links, active tab indicator |
| `--color-brand-soft` | `#EAF3F0` | `#162E29` | Selected span background, chip active background |
| `--color-brand-soft-border` | `#B8D8CF` | `#255247` | Subtle borders for brand-tinted containers |

### 1.2 Surface & Background Tokens
| Token | Light Theme | Dark Theme | Purpose |
|---|---|---|---|
| `--bg-canvas` | `#F8FAFC` | `#0F1716` | Main viewport canvas behind document |
| `--bg-surface` | `#FFFFFF` | `#162220` | Cards, sidebars, modal surfaces, toolbars |
| `--bg-surface-elevated` | `#FFFFFF` | `#1C2B29` | Dropdowns, tooltips, popovers |
| `--bg-surface-subtle` | `#F1F5F9` | `#1F2E2B` | Hover states, inactive chips, table headers |

### 1.3 Border & Divider Tokens
| Token | Light Theme | Dark Theme | Purpose |
|---|---|---|---|
| `--border-subtle` | `#E2E8F0` | `#233532` | Card borders, dividers, subtle outlines |
| `--border-default` | `#CBD5E1` | `#2F4844` | Inputs, interactive control borders |
| `--border-strong` | `#94A3B8` | `#41635D` | Focus outlines, active element borders |

### 1.4 Text & Content Tokens
| Token | Light Theme | Dark Theme | Purpose |
|---|---|---|---|
| `--text-primary` | `#0F172A` | `#F1F5F9` | High-emphasis headings and body text |
| `--text-secondary` | `#475569` | `#94A3B8` | Subheadings, descriptions, helper text |
| `--text-muted` | `#64748B` | `#64748B` | Timestamps, secondary labels, disabled state |
| `--text-inverse` | `#FFFFFF` | `#0F172A` | Text on solid primary CTA buttons |

### 1.5 Feedback & Semantic Status
| Semantic | Light Background | Light Border | Light Text | Dark Background | Dark Text |
|---|---|---|---|---|---|
| **Success** | `#ECFDF5` | `#A7F3D0` | `#065F46` | `#064E3B` | `#6EE7B7` |
| **Warning** | `#FFFBEB` | `#FDE68A` | `#92400E` | `#78350F` | `#FCD34D` |
| **Danger** | `#FEF2F2` | `#FECACA` | `#991B1B` | `#7F1D1D` | `#FCA5A5` |
| **Info** | `#F0FDF4` | `#BBF7D0` | `#166534` | `#14532D` | `#86EFAC` |

---

## 2. Typography Scale & Multilingual Stack

### 2.1 Interface Font Stacks
```css
/* Primary UI Font Stack: Latin + Modern Khmer Fallbacks */
--font-sans: 'DM Sans Variable', 'DM Sans', 'Kantumruy Pro', 'Noto Sans Khmer', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Numeric & Monospace Stack for Coordinates, Dimensions & Time */
--font-mono: 'JetBrains Mono', 'SF Mono', Consolas, Menlo, monospace;
```

### 2.2 Typographic Hierarchy
| Style | Size | Line Height | Weight | Letter Spacing |
|---|---|---|---|---|
| **Hero Display** | `32px` (`2rem`) | `1.2` | 700 | `-0.025em` |
| **Page Title (H1)** | `24px` (`1.5rem`) | `1.25` | 600 | `-0.02em` |
| **Section Title (H2)**| `18px` (`1.125rem`)| `1.3` | 600 | `-0.015em` |
| **Card Title (H3)** | `15px` (`0.9375rem`)| `1.4` | 600 | `-0.01em` |
| **Body (Regular)** | `14px` (`0.875rem`) | `1.5` | 400 | `normal` |
| **Body (Medium)** | `14px` (`0.875rem`) | `1.5` | 500 | `normal` |
| **Caption / Badge** | `12px` (`0.75rem`) | `1.4` | 500 | `+0.01em` |
| **Micro / Tag** | `11px` (`0.6875rem`)| `1.3` | 600 | `+0.02em` |

---

## 3. Spatial System & Elevation

### 3.1 Spacing Scale
- `--space-1`: `4px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-5`: `20px`
- `--space-6`: `24px`
- `--space-8`: `32px`
- `--space-10`: `40px`
- `--space-12`: `48px`

### 3.2 Border Radius Scale
- `--radius-xs`: `4px` (Tags, small indicators)
- `--radius-sm`: `6px` (Buttons, inputs, dropdown items)
- `--radius-md`: `8px` (Tool cards, popovers, property groups)
- `--radius-lg`: `12px` (Upload boxes, modal dialogs, drawer panels)
- `--radius-full`: `9999px` (Filter chips, avatar badges, status pills)

### 3.3 Elevation & Shadows
- `--shadow-sm`: `0 1px 2px 0 rgba(15, 23, 42, 0.05)`
- `--shadow-md`: `0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`
- `--shadow-lg`: `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)`
- `--shadow-paper`: `0 4px 20px -2px rgba(15, 23, 42, 0.12), 0 2px 6px -1px rgba(15, 23, 42, 0.06)`

---

## 4. Interaction, Focus & Motion

1. **Focus Rings (`:focus-visible`):**
   - Visible `2px` offset ring in `--color-brand-primary` with `2px` transparent outline offset.
   - Never disabled for keyboard navigation.
2. **Text Selection (`::selection`):**
   - Background: `rgba(24, 78, 68, 0.2)`
   - Color: Inherit
3. **Scrollbars:**
   - Width: `6px`
   - Thumb: `rgba(15, 23, 42, 0.2)` (dark: `rgba(255, 255, 255, 0.2)`) with rounded caps.
   - Hover: `rgba(24, 78, 68, 0.5)`
4. **Motion & Transitions:**
   - Fast state change: `150ms cubic-bezier(0.4, 0, 0.2, 1)`
   - Panel slide / Drawer: `250ms cubic-bezier(0.16, 1, 0.3, 1)`
   - Respects `@media (prefers-reduced-motion: reduce)`.
