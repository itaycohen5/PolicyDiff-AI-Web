import type { SVGProps } from "react";

const paths = {
  compare: "M3 5h7v14H3zM14 5h7v14h-7zM5.5 9h2m9 0h2m-13 4h2m9 0h2",
  document: "M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6",
  history: "M3 12a9 9 0 1 1 2.5 6.3M3 6v6h6m3-5v5l3 2",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  external: "M13 4h7v7m0-7-9 9m7 0v7H4V6h7",
  chevron: "m9 18 6-6-6-6",
  plus: "M12 5v14M5 12h14",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 14v6m-3-3h6",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M18 6 6 18",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3",
  info: "M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  upload: "M12 15V3m-5 5 5-5 5 5M4 15v5h16v-5",
} as const;

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d={paths[name]} />
  </svg>;
}

export function BrandMark() {
  return <svg width="33" height="33" viewBox="0 0 33 33" fill="none" aria-hidden="true">
    <path d="M5 8.5h15.5L26 14v14H5V8.5Z" stroke="#a9dcff" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M9 5h15l5 5v13.5M20.5 8.5V14H26M9.5 18.5h12m-12 4h8" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function ComparisonDiagram() {
  return <svg className="comparison-diagram" width="139" height="77" viewBox="0 0 139 77" fill="none" aria-hidden="true">
    <path d="M12 9h35l12 12v46H12V9Z" fill="white" stroke="#9ba8b4" strokeWidth="1.25" />
    <path d="M47 9v12h12M22 28h26m-26 8h26m-26 18h18" stroke="#9ba8b4" strokeWidth="1.25" />
    <path d="M20 42h29v7H20z" fill="#e9e6df" />
    <path d="M80 9h35l12 12v46H80V9Z" fill="white" stroke="#4b789b" strokeWidth="1.25" />
    <path d="M115 9v12h12M90 28h26m-26 8h26m-26 18h18" stroke="#4b789b" strokeWidth="1.25" />
    <path d="M88 42h29v7H88z" fill="#bce2fa" />
    <path d="M64 39h11m-4-4 4 4-4 4" stroke="#4b789b" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
