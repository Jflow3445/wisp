const TAWK_WIDGET_PATH_PATTERN = /^([A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)$/;
const TAWK_EMBED_URL_PATTERN = /embed\.tawk\.to\/([A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)/i;

export function extractTawkWidgetPath(input: string | null | undefined) {
  const raw = input?.trim() || "";
  if (!raw) {
    return null;
  }

  const direct = raw.match(TAWK_WIDGET_PATH_PATTERN);
  if (direct) {
    return direct[1];
  }

  const fromUrl = raw.match(TAWK_EMBED_URL_PATTERN);
  if (fromUrl) {
    return fromUrl[1];
  }

  return null;
}

export function buildTawkLiveChatScript(widgetPathInput: string | null | undefined) {
  const widgetPath = extractTawkWidgetPath(widgetPathInput);
  if (!widgetPath) {
    return "";
  }
  const source = `https://embed.tawk.to/${widgetPath}`;
  return `var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;
s1.src=${JSON.stringify(source)};
s1.charset="UTF-8";
s0.parentNode.insertBefore(s1,s0);
})();`;
}

export function buildTawkAdminSnippet(widgetPathInput: string | null | undefined) {
  const script = buildTawkLiveChatScript(widgetPathInput);
  if (!script) {
    return "";
  }
  return `<!--Start of Tawk.to Script-->
<script type="text/javascript">
${script}
</script>
<!--End of Tawk.to Script-->`;
}
