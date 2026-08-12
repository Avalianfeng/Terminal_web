/** 折叠指示：收起向左，展开向下。 */
export function BgmFoldArrow({ open }: { open: boolean }) {
  return (
    <svg
      className={`bgm-fold-arrow${open ? " is-open" : ""}`}
      viewBox="0 0 10 10"
      width="11"
      height="11"
      aria-hidden
    >
      <path
        d="M2 3.5 L5 6.5 L8 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
