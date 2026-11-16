// The text of the <script id="__NEXT_DATA__"> that SensCritique's Next.js pages embed: read by the season
// page parser and by the session reader.

const ID_MARKER = 'id="__NEXT_DATA__"';
const WHITESPACE = /\s/;

// Linear on any input (no backtracking): the first `id="__NEXT_DATA__"` that follows whitespace, the
// `<script` that opens its tag, the `>` that closes the tag, then the next `</script>`.
export function nextDataText(html: string): string | undefined {
  let at = html.indexOf(ID_MARKER);
  while (at > 0 && !WHITESPACE.test(html.charAt(at - 1))) {
    at = html.indexOf(ID_MARKER, at + 1);
  }
  if (at < 0) return undefined;
  const open = html.lastIndexOf("<script", at);
  if (open < 0) return undefined;
  const end = html.indexOf(">", open);
  if (end < at) return undefined;
  const close = html.indexOf("</script>", end);
  return close < 0 ? undefined : html.slice(end + 1, close);
}
