# ADR-0005: Design System — Keep SCSS with Extracted Design Tokens (Defer Tailwind/Shadcn)

**Status**: Accepted  
**Date**: 2026-05-01  
**Author**: ObserveLabs Engineering

---

## Context

ObserveLabs product specs (00-platform-overview.md §5.5) prescribe Shadcn/ui + Tailwind CSS as the design system foundation. However, the current frontend already uses a custom SCSS-based design system integrated across all 7 pages (18 TSX files, 72 frontend tests passing).

Migrating to Tailwind/Shadcn means replacing every component, restyling every page, and re-validating all tests — weeks of rework delivering zero new functionality. The real goal of the spec's design system section is **consistency**, not a specific CSS framework.

We need to decide whether to invest in a framework migration or achieve the same consistency goals within the existing SCSS architecture.

## Decision

**KEEP the current custom SCSS design system. Do NOT migrate to Tailwind/Shadcn.**

**REQUIRED**: Extract design tokens from spec 00 §5.2 into SCSS variables and mixins. All new components MUST use the token system, not hardcoded values. Spec 00 §5.5 language to be updated to reflect "SCSS with tokens" instead of "Shadcn/Tailwind".

The following tokens are canonical:

### Colors (Semantic)

| Token | Value | Purpose |
|-------|-------|---------|
| `bg-base` | `#0A0B0D` | Page background |
| `bg-raised` | `#13151A` | Cards, panels |
| `bg-overlay` | `#1C1F26` | Modals, dropdowns |
| `bg-hover` | `#242830` | Interactive hover state |
| `border-subtle` | `#1F2228` | Dividers, separators |
| `border-default` | `#2A2E36` | Card borders |
| `border-strong` | `#3A3F48` | Focused containers |
| `border-focus` | `#4F8EF7` | Focus ring |
| `text-primary` | `#E8EAED` | Body text |
| `text-secondary` | `#9AA0A6` | Labels, descriptions |
| `text-tertiary` | `#5F6368` | Placeholders, disabled |
| `text-inverse` | `#0A0B0D` | Text on light backgrounds |
| `state-ok` | `#34D399` | Healthy, success |
| `state-warn` | `#F59E0B` | Warning |
| `state-error` | `#EF4444` | Error, critical |
| `state-info` | `#4F8EF7` | Informational |
| `state-neutral` | `#9AA0A6` | Unknown, inactive |
| `admin-accent` | `#DC2626` | Admin-only actions |
| `admin-banner` | `#7F1D1D` | Admin warning banners |

### Chart Series (Colorblind-Safe, 10 Colors)

`#4F8EF7`, `#34D399`, `#F59E0B`, `#EF4444`, `#A78BFA`, `#F472B6`, `#22D3EE`, `#FBBF24`, `#14B8A6`, `#FB7185`

### Typography

| Property | Value |
|----------|-------|
| UI font | Inter |
| Code font | JetBrains Mono |
| Scale | 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32 px |
| Weights | 400 (regular) / 500 (medium) / 600 (semibold) |
| Line-height | 1.5 (body) / 1.2 (headings) |

### Spacing

Base unit: **4px**. Scale: 0 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64 px.

### Layout

| Property | Value |
|----------|-------|
| Page max-width | 1440px |
| Sidebar | 240px (collapsed: 56px) |
| Top bar | 48px |
| Content padding | 24px (desktop) / 16px (mobile) |

### Motion

| Property | Value |
|----------|-------|
| Micro | 150ms |
| Panels | 250ms |
| Page | 400ms |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Accessibility | Respect `prefers-reduced-motion` |

### Density

| Property | Value |
|----------|-------|
| Row height | 32px |
| Compact button | 28px |
| Medium button | 36px |
| Grid | 8px |

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Full Tailwind/Shadcn migration | Weeks of zero-feature rework. Every component replaced, every page restyled, 72 frontend tests to re-validate. Blocks all frontend feature work for the duration of the migration. |
| Hybrid (new pages Shadcn, old pages SCSS) | Two styling systems is worse than one consistent one. Increases bundle size, cognitive load, and maintenance burden. Developers must know both systems. |
| Keep SCSS without tokens | Defeats the consistency goal. Hardcoded hex values across files lead to drift, inconsistent spacing, and no single source of truth for the design language. |

## Consequences

### Positive

- **Zero migration cost.** No rework, no downtime, no test breakage. All 72 frontend tests remain valid.
- **Design consistency achieved through tokens.** SCSS variables and mixins enforce the same visual language the spec intends, regardless of framework.
- **Incremental adoption.** Existing pages can adopt tokens file-by-file without a big-bang rewrite.
- **Clear contract for new components.** Any new component uses tokens from day one; code review enforces this.

### Negative

- **No Shadcn component library.** Must build custom equivalents (modals, selects, data tables, etc.) as needed. This is acceptable while component count is low (<30 primitives).
- **No Tailwind utility classes.** SCSS is more verbose for one-off styling. Developers write more lines of CSS for the same result.
- **Contributor friction.** External contributors who expect Tailwind will face a learning curve. Mitigated by clear token documentation and SCSS conventions.

## Review Trigger

Revisit this decision if any of the following occur:

1. **A dedicated frontend developer joins the team** — a full-time frontend engineer may prefer and justify a Tailwind migration.
2. **A major UI redesign is planned** — if the UI needs a ground-up rework anyway, bundling a framework migration adds marginal cost.
3. **Component count exceeds 30 custom primitives** — at that point, Shadcn's pre-built library saves more time than it costs to migrate.
