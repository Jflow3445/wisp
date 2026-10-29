import Script from "next/script";

type ThirdPartyIntegrationsProps = {
  nonce?: string;
};

function trimEnv(name: string) {
  return process.env[name]?.trim() || "";
}

export function ThirdPartyIntegrations({ nonce }: ThirdPartyIntegrationsProps) {
  const analyticsProvider = trimEnv("NEXT_PUBLIC_ANALYTICS_PROVIDER").toLowerCase();
  const analyticsSiteKey = trimEnv("NEXT_PUBLIC_ANALYTICS_SITE_KEY");
  const liveChatProvider = trimEnv("NEXT_PUBLIC_LIVE_CHAT_PROVIDER").toLowerCase();
  const liveChatAppId = trimEnv("NEXT_PUBLIC_LIVE_CHAT_APP_ID");
  const analyticsEnabled = trimEnv("NEXT_PUBLIC_ANALYTICS_ENABLED") === "true";
  const liveChatEnabled = trimEnv("NEXT_PUBLIC_LIVE_CHAT_ENABLED") === "true";

  return (
    <>
      {analyticsEnabled && analyticsProvider === "clarity" && analyticsSiteKey ? (
        <Script
          id="nister-clarity"
          strategy="lazyOnload"
          src={`https://www.clarity.ms/tag/${encodeURIComponent(analyticsSiteKey)}`}
        />
      ) : null}

      {nonce && liveChatEnabled && liveChatProvider === "crisp" && liveChatAppId ? (
        <Script id="nister-crisp" strategy="lazyOnload" nonce={nonce}>
          {`window.$crisp=[];window.CRISP_WEBSITE_ID=${JSON.stringify(liveChatAppId)};(function(){var d=document;var s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`}
        </Script>
      ) : null}

      {nonce && liveChatEnabled && liveChatProvider === "intercom" && liveChatAppId ? (
        <Script id="nister-intercom" strategy="lazyOnload" nonce={nonce}>
          {`window.intercomSettings={app_id:${JSON.stringify(liveChatAppId)}};(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic("reattach_activator");ic("update",w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement("script");s.type="text/javascript";s.async=true;s.src="https://widget.intercom.io/widget/"+${JSON.stringify(liveChatAppId)};var x=d.getElementsByTagName("script")[0];x.parentNode.insertBefore(s,x);};if(document.readyState==="complete"){l();}else if(w.attachEvent){w.attachEvent("onload",l);}else{w.addEventListener("load",l,false);}}})();`}
        </Script>
      ) : null}
    </>
  );
}
