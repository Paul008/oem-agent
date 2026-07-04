/** Appends the clone runtime as a trusted script to production clone HTML. */
export function injectCloneRuntimeScript(html: string, runtimeJs: string | undefined): string {
  if (!runtimeJs) return html;
  const safe = runtimeJs.replace(/<\/script/gi, '<\\/script');
  return `${html}\n<script data-clone-runtime="true">\n${safe}\n</script>`;
}
