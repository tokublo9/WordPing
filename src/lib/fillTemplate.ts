/**
 * Fills `{name}` placeholders in a translated string.
 *
 * Shared by the AI Voice limit notices and the plan-switch notice so both
 * substitute identically. An unknown placeholder is left intact rather than
 * blanked: a visible `{date}` in a translation is an obvious bug, whereas a
 * silently empty gap in a sentence about billing is not.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) => values[key] ?? match);
}
