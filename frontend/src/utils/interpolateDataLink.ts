export interface DataLinkContext {
  value?: number | null;
  time?: string | null;
  seriesName?: string | null;
  variables?: Record<string, string>;
}

function replaceAll(str: string, search: string, replacement: string): string {
  return str.split(search).join(replacement);
}

export function interpolateUrl(template: string, ctx: DataLinkContext): string {
  let result = template;
  if (ctx.value != null) result = replaceAll(result, "${__value}", encodeURIComponent(String(ctx.value)));
  if (ctx.time) result = replaceAll(result, "${__time}", encodeURIComponent(ctx.time));
  if (ctx.seriesName) result = replaceAll(result, "${__series.name}", encodeURIComponent(ctx.seriesName));

  if (ctx.variables) {
    for (const [key, val] of Object.entries(ctx.variables)) {
      result = replaceAll(result, `\${${key}}`, encodeURIComponent(val));
    }
  }

  return result;
}
