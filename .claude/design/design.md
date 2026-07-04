---
version: alpha
name: wyde-design-system
description: Structural design system for WydEInt sales & QC apps — typography, component grammar, and responsive rules adapted from Apple's design language, with color deliberately excluded. Existing app color tokens (--accent, --accent-green/purple/blue/orange, --text-1/2/3, --card-bg, etc. in globals.css) stay as-is; this file only governs scale, shape, weight, and layout rhythm.
source: Distilled from .claude/design/DESIGN-apple.md — see that file for the full Apple.com analysis this was adapted from.
scope: Applies to wyde-sales (CRM) and future QC app. Tokens defined as CSS variables in globals.css (:root block). CSS utility classes generated: .ds-card, .ds-card-sm, .modal-backdrop, .modal-panel, .modal-header, .modal-title, .badge, .badge-*, .btn-util, .page-content, .field-label, .field-input, .btn-green/.btn-blue/.btn-purple, .tab-group/.tab-btn, typography scale classes.

typography:
  page-title:
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  section-title:
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.005em
  card-title:
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  body:
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-strong:
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  caption:
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  label-uppercase:
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.04em
  kpi-number:
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.01em
  micro:
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0

radius:
  none: 0px
  sm: 8px
  md: 11px
  lg: 18px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px

components:
  card:
    rounded: "{radius.lg}"
    padding: "{spacing.lg}"
    border: "1px solid var(--divider)"
    shadow: none
  modal:
    rounded: "{radius.lg}"
    padding: "{spacing.lg}"
    shadow: "one subtle overlay shadow allowed — the only shadow exception"
  button-primary:
    rounded: "{radius.pill}"
    padding: "8px 18px"
    fontWeight: 600
    activeState: "transform: scale(0.95)"
  button-utility:
    rounded: "{radius.sm}"
    padding: "8px 15px"
    fontWeight: 400
  input:
    rounded: "{radius.sm}"
    padding: "8px 12px"
    border: "1px solid var(--divider)"
  chip-badge:
    rounded: "{radius.pill}"
    padding: "4px 10px"
    fontSize: "{typography.caption.fontSize}"
    fontWeight: 600
  nav-item:
    rounded: "{radius.md}"
    padding: "8px 12px"
