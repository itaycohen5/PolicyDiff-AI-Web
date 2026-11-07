"use client";

export default function WorkspaceError({ retry }: { error: unknown; retry: () => void }) {
  return <main className="panel error-boundary" role="alert">
    <h1>The workspace could not be displayed</h1>
    <p>Your documents and saved comparisons are still stored. Try opening the workspace again.</p>
    <button className="button primary" type="button" onClick={retry}>Try again</button>
  </main>;
}
