export const scheduledCommandsStyles = String.raw`
.sc-page {
  --sc-accent: #4f7ff0;
  --sc-accent-strong: #315fc8;
  --sc-danger: #d04f58;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 30px clamp(18px, 3vw, 38px) 56px;
  color: inherit;
  font: inherit;
}
.sc-page *, .sc-page *::before, .sc-page *::after { box-sizing: border-box; }
.sc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.sc-title { margin: 0; font-size: clamp(26px, 3vw, 34px); line-height: 1.15; letter-spacing: -0.035em; }
.sc-subtitle { margin: 8px 0 0; color: color-mix(in srgb, currentColor 62%, transparent); font-size: 14px; line-height: 1.6; }
.sc-server-name { color: inherit; font-weight: 650; }
.sc-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sc-button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, currentColor 5%, transparent);
  color: inherit;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease, transform 80ms ease;
}
.sc-button:hover:not(:disabled) { border-color: color-mix(in srgb, currentColor 30%, transparent); background: color-mix(in srgb, currentColor 9%, transparent); }
.sc-button:active:not(:disabled) { transform: translateY(1px); }
.sc-button:focus-visible, .sc-input:focus-visible, .sc-select:focus-visible, .sc-textarea:focus-visible, .sc-weekday:focus-visible { outline: 2px solid var(--sc-accent); outline-offset: 2px; }
.sc-button:disabled { opacity: .48; cursor: not-allowed; }
.sc-button-primary { border-color: var(--sc-accent); background: var(--sc-accent); color: #fff; }
.sc-button-primary:hover:not(:disabled) { border-color: var(--sc-accent-strong); background: var(--sc-accent-strong); }
.sc-button-danger { color: var(--sc-danger); }
.sc-button-quiet { background: transparent; }
.sc-panel { border: 1px solid color-mix(in srgb, currentColor 13%, transparent); border-radius: 13px; background: color-mix(in srgb, currentColor 2.5%, transparent); overflow: hidden; }
.sc-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 18px; }
.sc-summary-item { padding: 17px 20px; border-right: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
.sc-summary-item:last-child { border-right: 0; }
.sc-summary-label { display: block; margin-bottom: 5px; color: color-mix(in srgb, currentColor 56%, transparent); font-size: 12px; }
.sc-summary-value { display: block; font-size: 15px; font-weight: 680; overflow-wrap: anywhere; }
.sc-form { margin-bottom: 18px; padding: 22px; }
.sc-form-heading { display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 18px; }
.sc-form-title { margin: 0; font-size: 17px; letter-spacing: -.015em; }
.sc-form-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.sc-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.sc-field-wide { grid-column: 1 / -1; }
.sc-label { font-size: 12px; font-weight: 660; color: color-mix(in srgb, currentColor 72%, transparent); }
.sc-help { color: color-mix(in srgb, currentColor 52%, transparent); font-size: 12px; line-height: 1.5; }
.sc-input, .sc-select, .sc-textarea {
  width: 100%;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, currentColor 4%, transparent);
  color: inherit;
  font: inherit;
  font-size: 13px;
}
.sc-input, .sc-select { height: 40px; padding: 0 11px; }
.sc-textarea { min-height: 84px; padding: 10px 11px; resize: vertical; line-height: 1.55; }
.sc-input::placeholder, .sc-textarea::placeholder { color: color-mix(in srgb, currentColor 40%, transparent); }
.sc-inline-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(110px, .45fr); gap: 10px; }
.sc-weekdays { display: flex; gap: 7px; flex-wrap: wrap; }
.sc-weekday { width: 38px; height: 34px; border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: 9px; background: transparent; color: inherit; cursor: pointer; }
.sc-weekday[aria-pressed="true"] { border-color: var(--sc-accent); background: color-mix(in srgb, var(--sc-accent) 16%, transparent); color: color-mix(in srgb, var(--sc-accent) 82%, currentColor); }
.sc-form-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 20px; }
.sc-alert { margin-bottom: 16px; padding: 12px 14px; border-radius: 10px; font-size: 13px; line-height: 1.55; }
.sc-alert-error { border: 1px solid color-mix(in srgb, var(--sc-danger) 45%, transparent); background: color-mix(in srgb, var(--sc-danger) 9%, transparent); color: color-mix(in srgb, var(--sc-danger) 84%, currentColor); }
.sc-alert-success { border: 1px solid color-mix(in srgb, var(--sc-accent) 36%, transparent); background: color-mix(in srgb, var(--sc-accent) 9%, transparent); }
.sc-list { margin: 0; padding: 0; list-style: none; }
.sc-task { padding: 19px 20px; border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
.sc-task:last-child { border-bottom: 0; }
.sc-task-main { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: start; }
.sc-task-heading { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.sc-task-name { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.4; }
.sc-status { display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; border-radius: 7px; font-size: 11px; font-weight: 680; background: color-mix(in srgb, currentColor 8%, transparent); }
.sc-status-enabled { color: color-mix(in srgb, var(--sc-accent) 82%, currentColor); background: color-mix(in srgb, var(--sc-accent) 13%, transparent); }
.sc-command { display: block; width: fit-content; max-width: 100%; margin: 9px 0; padding: 5px 8px; border-radius: 7px; background: color-mix(in srgb, currentColor 7%, transparent); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
.sc-task-meta { display: flex; gap: 8px 18px; flex-wrap: wrap; color: color-mix(in srgb, currentColor 58%, transparent); font-size: 12px; line-height: 1.55; }
.sc-task-error { margin: 10px 0 0; color: var(--sc-danger); font-size: 12px; line-height: 1.5; }
.sc-task-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.sc-empty { padding: 54px 24px; text-align: center; }
.sc-empty-title { margin: 0 0 8px; font-size: 17px; }
.sc-empty-copy { max-width: 480px; margin: 0 auto; color: color-mix(in srgb, currentColor 56%, transparent); font-size: 13px; line-height: 1.65; }
.sc-empty-action { margin-top: 18px; }
.sc-skeleton { display: grid; gap: 12px; padding: 22px; }
.sc-skeleton-line { height: 14px; border-radius: 7px; background: color-mix(in srgb, currentColor 8%, transparent); }
.sc-skeleton-line:nth-child(2) { width: 74%; }
.sc-skeleton-line:nth-child(3) { width: 48%; }
.sc-confirm { display: flex; align-items: center; gap: 8px; padding-top: 12px; justify-content: flex-end; color: var(--sc-danger); font-size: 12px; }
@media (max-width: 760px) {
  .sc-header { flex-direction: column; }
  .sc-form-grid { grid-template-columns: 1fr; }
  .sc-field-wide { grid-column: auto; }
  .sc-summary { grid-template-columns: 1fr; }
  .sc-summary-item { border-right: 0; border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
  .sc-summary-item:last-child { border-bottom: 0; }
  .sc-task-main { grid-template-columns: 1fr; }
  .sc-task-actions { justify-content: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .sc-button { transition: none; }
}
`;
