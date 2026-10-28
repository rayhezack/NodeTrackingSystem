# Pollo Tracking · Meta Light Operations

<!-- impeccable:design-schema 1 -->

## Direction

The interface is a focused operations workspace for data and engineering teams. It carries the latest Meta design language into a work surface: white canvas, soft cloud panels, deep ink typography, cobalt action color, generous pill controls, and compact but readable data density. The shell remains a familiar web application layout; Meta contributes type rhythm, palette, rounded geometry, and the signature move of using cobalt only where a user can act or a state is selected.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| canvas | `#ffffff` | Page and card surface |
| surface-soft | `#f4f6f8` | Search, secondary panels, inactive states |
| hairline | `#e4e7eb` | Borders and dividers |
| ink-deep | `#0a1317` | Headings and primary copy |
| charcoal | `#4b5157` | Body copy |
| steel | `#6f7882` | Supporting copy and metadata |
| stone | `#98a1aa` | Placeholder and disabled copy |
| primary | `#0866ff` | Action, focus, selected state, links |
| primary-deep | `#0143b5` | Pressed and high-emphasis action |
| primary-soft | `#eaf2ff` | Selected and informational surfaces |
| critical | `#c62828` | Destructive action and errors |
| warning | `#b7791f` | Review and attention states |
| success | `#16835b` | Completed and online states |

## Typography

- Headings: Optimistic-style fallback stack, `Inter`, `Montserrat`, system sans; use `ss01, ss02` when supported.
- Body: `Inter`, `Helvetica`, `Arial`, `Noto Sans`, system sans.
- Technical identifiers: `JetBrains Mono`, `SF Mono`, Menlo.
- Body copy remains 14–16px with 1.45–1.5 line height; captions remain 12px.

## Geometry and layout

- Application canvas uses white cards on a soft cloud ground.
- A 64px horizontal global navigation aligns with the Pencil frames. Keep the lifecycle stage rail inside the detail workspace; on mobile it becomes a horizontally scrollable row.
- Supporting copy uses `#626d78` and warning text uses `#8a5a13` for readable contrast on cloud and warning surfaces; the Meta cobalt action hue remains `#0866ff`.
- Cards use 16px radius; controls use 8px radius unless they are action pills.
- Primary and secondary buttons, tabs, badges, and compact filters use full pill radius.
- Keep a 4px spacing base with 8/12/16/24/32px rhythm.
- Use light hairlines and one subtle offset shadow only for sticky or floating interaction layers.

## Interaction signature

- Cobalt marks an actionable or selected state and is paired with text, never used as decoration.
- Search expands inline, filters retain their scope, and destructive actions use hover/focus reveal plus undo snackbar.
- Focus uses a 2px cobalt ring; keyboard users receive the same action affordances as pointer users.

## Coverage

The world applies consistently to the workbench, query library, permissions, every tracking-detail stage, dialogs, tables, date pickers, and responsive states. Content, routes, and Base data remain unchanged.

## Approved Bencho interactions

Use the user-supplied Bencho motion for EyeTracker, ToastStack, UploadDropzone, Checklist and LiquidToggle, with component-local aliases of Meta tokens. Preserve the authored spring reasoning comments. The checklist/reuse surfaces use 20px outer rounding and no table grid; selection does not strike text. Deletion previews may strike the selected names and actual rows leave only after the API succeeds. Neutral delete entry points reserve the critical tone for final confirmation and failure.

LiquidToggle uses a compact 60×32px track, a 24px droplet and symmetric 4px inset. Web is the initial library. No goo filter or imagery is required by the supplied single-droplet implementation. Search uses a quiet filled pill without nested borders or focus halos; keyboard focus is still identifiable. All calendar month/year options use the themed Select popup.
