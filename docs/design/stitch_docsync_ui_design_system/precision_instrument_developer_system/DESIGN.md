---
name: Precision Instrument Developer System
colors:
  surface: '#111417'
  surface-dim: '#111417'
  surface-bright: '#37393d'
  surface-container-lowest: '#0b0e11'
  surface-container-low: '#191c1f'
  surface-container: '#1d2023'
  surface-container-high: '#272a2e'
  surface-container-highest: '#323538'
  on-surface: '#e1e2e7'
  on-surface-variant: '#bdc9c3'
  inverse-surface: '#e1e2e7'
  inverse-on-surface: '#2e3134'
  outline: '#87938e'
  outline-variant: '#3e4945'
  surface-tint: '#76d8bc'
  primary: '#9afddf'
  on-primary: '#00382c'
  primary-container: '#7ee0c3'
  on-primary-container: '#006450'
  inverse-primary: '#006b56'
  secondary: '#b9c3ff'
  on-secondary: '#1c2a6a'
  secondary-container: '#374485'
  on-secondary-container: '#a7b4fd'
  tertiary: '#ffe7c9'
  on-tertiary: '#442b00'
  tertiary-container: '#f8c67d'
  on-tertiary-container: '#755113'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#93f5d7'
  primary-fixed-dim: '#76d8bc'
  on-primary-fixed: '#002018'
  on-primary-fixed-variant: '#005141'
  secondary-fixed: '#dee1ff'
  secondary-fixed-dim: '#b9c3ff'
  on-secondary-fixed: '#021356'
  on-secondary-fixed-variant: '#354282'
  tertiary-fixed: '#ffddb1'
  tertiary-fixed-dim: '#f0be77'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#614001'
  background: '#111417'
  on-background: '#e1e2e7'
  surface-variant: '#323538'
typography:
  display-hero:
    fontFamily: Geist
    fontSize: 56px
    fontWeight: '300'
    lineHeight: 64px
    letterSpacing: -0.035em
  display-hero-mobile:
    fontFamily: Geist
    fontSize: 36px
    fontWeight: '300'
    lineHeight: 42px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  eyebrow-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.12em
  code-base:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  code-inline:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
  label-badge:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system delivers a calm, high-precision instrument environment tailored for software engineers, systems architects, and technical leaders exploring complex codebases. It rejects flashy software gimmicks, hyper-saturated neon glows, and noisy decoration in favor of scientific clarity, understated density, and tactile digital utility.

Drawing from modern high-density developer tooling, laboratory instruments, and minimalist Scandinavian technical consoles, the interface prioritizes readability, exact spatial relationships, and verifiable evidence. Every visual state serves an informational function: hairline borders distinguish hierarchical scopes, precise monochromatic dot-grids frame visual graphs, and semantic color-blocking categorizes analytical outputs without visual overload.

The aesthetic evokes rigorous craftsmanship, quiet confidence, and trust: deep charcoal canvas depths, crisp monospaced metadata, responsive hairline boundaries, and vibrant yet purposeful focal points anchored by luminous mint, periwinkle, and amber indicators.

## Colors

The palette operates in a calibrated deep-space dark mode engineered to reduce visual fatigue during long analytical sessions while maintaining WCAG AA contrast compliance.

### Foundation & Surfaces
- **Canvas / Base Background:** `#0D1013`
- **Sidebar & Rails:** `#0F1317`
- **Standard Surface (Cards, Modules):** `#151A1F`
- **Raised Surface (Active nodes, Popovers, Modals):** `#1B2127`
- **Hairline Structural Borders:** `#1F262D` (Primary dividers) and `#262E36` (Hover, interactive outlines)

### Typography & Neutrals
- **High-Contrast Text (Primary Headings & Key Data):** `#ECEFF1`
- **Secondary Text (Descriptions, Metadata, Inputs):** `#A3ADB6`
- **Muted / Subdued Text (Captions, Inactive paths, Line counters):** `#8B96A0`

### Product Domains & Modality Accents
- **Documentation Engine (Primary):** `#7EE0C3` (Mint) with high-contrast text `#0B0F12` for actionable targets.
- **Repository Architecture Map:** `#A9B6FF` (Periwinkle).
- **Interactive Guided Tour / Agent Guide:** `#F4C27A` (Amber) accompanied by its signature companion orb with dual vertical pill optics.

### Verification & Analytical Status
- **Source-Checked / Verified:** `#7BD88F` (Forest Emerald)
- **Needs Review / Flagged Inconsistency:** `#F4C27A` (Warm Amber)
- **Contradicted / Broken Reference:** `#FF8A80` (Soft Coral)
- **Not Assessed / Idle Queue:** `#8B96A0` (Graphite Slate)

## Typography

The typographic strategy balances humanistic, low-weight display scale with razor-sharp computational data structures.

- **Primary Display & Headings:** Rendered in Geist at Light 300 to Medium 500 weights. Hero headlines employ Light 300 with negative tracking (`-0.035em`), projecting an architectural, deliberate elegance rather than aggressive marketing punchiness.
- **Body & Instructional Prose:** Set in Geist Regular (`14px` and `16px`) with relaxed line heights for effortless parsing of dense architectural concepts and generated documentation.
- **Eyebrows, Telemetry & Code Surfaces:** JetBrains Mono powers uppercase section eyebrows, commit hashes (`9f2c1e4`), file paths (`server/controllers/habits.js`), and line markers. All uppercase eyebrow headers use wide character tracking (`0.12em`) to guarantee legibility at compact scales.

## Layout & Spacing

The layout embraces a fixed master workstation framing architecture composed of three responsive zones:
1. **Collapsible Activity Bar / Sidebar:** Fixed width (`240px` on desktop, collapsible to `64px` icon rail on tablet, full drawer on mobile).
2. **Main Canvas / Flow Stage:** Fluid work surface designed around a subtle `16px` dot-grid canvas pattern, supporting interactive pan/zoom graphs and structured documentation rows.
3. **Contextual Inspector / Evidence Panel:** Fixed width (`360px` to `420px`) docking panel anchored to the right rail, displaying real-time commit verification, source lines, and finding notes.

### Grid & Breakpoints
- **Desktop Wide (1440px+):** 3-column instrument layout (Navigation Rail + Visual Graph Canvas + Evidence Panel). Gutter: `1.25rem` (20px), Outer Canvas Margin: `2rem` (32px).
- **Desktop Standard (1024px – 1439px):** 2-column layout (Collapsible Rail + Primary Work Area with toggleable inspector panel).
- **Tablet / Mobile (&lt;1023px):** Single vertical stream. Canvas graph switches to scrollable touch surface; evidence panel stacks beneath active inspection targets. Gutter: `1rem` (16px), Canvas Margin: `1rem` (16px).

## Elevation & Depth

This design system avoids traditional heavy blurred drop shadows and glossy skeuomorphic bevels. Instead, elevation is expressed through a strict matrix of **tonal surface stepping** combined with **subtle hairline boundary glows**.

- **Ground Level (Base Canvas `#0D1013`):** Receded base level, frequently layered with a muted dot matrix (`rgba(255, 255, 255, 0.04)` on 16px centers).
- **Surface Level 1 (Structural Containers `#151A1F`):** Enclosed by a 1px solid hairline border (`#1F262D`). Zero box-shadow.
- **Surface Level 2 (Selected Flow Nodes, Tour Overlays, Floating Controls `#1B2127`):** Elevated over canvas elements. Outlined with `#262E36` with a faint directional edge glow (`0px 4px 20px rgba(0, 0, 0, 0.4)`).
- **Active Focus & Guide Instrument Glow:** When an element is in an active execution or selected state (e.g., the Mint active node or the Amber Tour Guide), depth is reinforced via a controlled soft ring aura: `0 0 0 1px #7EE0C3, 0 0 24px rgba(126, 224, 195, 0.15)`.

## Shapes

The geometry follows a calculated radius hierarchy that mirrors precision hardware displays:

- **Micro Entities & Status Badges (Pills):** Fully rounded (`9999px`) for status pills, repository output badges, step counters, and interactive toggles. This distinct continuous radius signals metadata and state indicators at a glance.
- **Interactive Controls (Inputs, Buttons, Dropdowns):** Defined at `10px` to `12px` border radius (`rounded-md`), providing a comfortable tactile target while remaining structurally compact.
- **Panels, Feature Cards & Workstation Blocks:** Engineered at `18px` to `22px` radius (`rounded-lg` / `rounded-xl`). The generous exterior curves soften large dark panels, creating distinctive framing for graphs, code blocks, and feature portals.
- **Hairlines:** Consistently `1px` crisp borders across all rectangular geometries.

## Components

### Buttons & Trigger Controls
- **Primary Action (Mint):** Solid background `#7EE0C3` paired with deep contrast typography `#0B0F12` (weight: 600), `11px` radius, padding `10px 18px`. Hover state applies brightness boost (`#8EECD0`) and micro scale transform.
- **Secondary / Ghost Action:** Transparent background with `1px solid #262E36`, text `#ECEFF1`. Hover introduces `#1B2127` fill and `#7EE0C3` subtle border highlight.
- **Player & Navigation Rounds:** Icon action buttons (such as play, forward, step) maintain a `40px` circular or pill frame with centered iconography and `#151A1F` surface tone.

### Output Badges & Status Chips
- **Domain Output Badges:** Pill-shaped (`rounded-full`), `11px JetBrains Mono`, padding `4px 10px`. 
  - *Docs:* `#7EE0C3` text with `rgba(126, 224, 195, 0.12)` fill.
  - *Repo Map:* `#A9B6FF` text with `rgba(169, 182, 255, 0.12)` fill.
  - *Guided Tour:* `#F4C27A` text with `rgba(244, 194, 122, 0.12)` fill.
- **Evidence Verification Badges:** Micro dot indicators (diameter `6px`) accompanied by uppercase tracking text. Statuses utilize `#7BD88F` (Source-checked), `#F4C27A` (Needs review), and `#FF8A80` (Contradicted).

### Input Fields & URL Capture Bars
- **Codebase Terminal Input:** Multi-segment container framed in `1px solid #262E36` with `#151A1F` fill and `12px` radius. Integrates left-docked monospaced prefix icons, branch selector segmented triggers (`main @ 9f2c1e4`), and direct inline action triggers (`Create docs ->`). Active focus state applies a crisp `#7EE0C3` hairline border with zero layout shift.

### Architecture Cards & Hero Portals
- **Feature Exploration Tiles:** High-radius panels (`20px`) with dedicated domain tint accents (e.g., Mint `#7EE0C3` for Documentation, Periwinkle `#A9B6FF` for Repo Map, Amber `#F4C27A` for Guided Tour). Light tint themes invert typography to solid dark accents for maximum legible impact.
- **Workflow / Flow Graph Nodes:** Diagrammatic blocks with `#151A1F` surface, `10px` radius, and `1px solid #1F262D` boundaries. Connecting paths feature directional animated pulse strokes rendered in `#7EE0C3`.

### The Guide Mascot (Orb Avatar)
- A minimalist spherical guide token (`#F4C27A`) featuring two vertical capsule/pill optical viewports (`#0D1013`) and an ambient, low-frequency outer halo (`rgba(244, 194, 122, 0.2)`). Positioned dynamically alongside architectural tour stops to indicate current location and technical explanations.