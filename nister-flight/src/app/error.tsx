"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="f-panel f-error-page"><h1>A brief hold.</h1><p>We couldn’t load this view. Accepted transactions stay recorded. Refresh the view to recover their status.</p><button className="f-button" onClick={reset}>Try again ↻</button></div>; }
