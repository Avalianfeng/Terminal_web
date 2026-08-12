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

/** 顺序播放（平行前进箭头）。 */
export function BgmSequenceIcon() {
  return (
    <svg
      className="bgm-order-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden
    >
      <path
        d="M2 5.5h8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8.8 3.2 12.2 5.5 8.8 7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 10.5h8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8.8 8.2 12.2 10.5 8.8 12.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 随机顺序（交叉箭头）。 */
export function BgmShuffleIcon() {
  return (
    <svg
      className="bgm-order-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden
    >
      <path
        d="M2 4h2.6c.55 0 1.05.28 1.35.74L10.2 12H14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.2 10.15 14 12l-1.8 1.85"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12h2.6c.55 0 1.05-.28 1.35-.74L8.2 8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 4H14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12.2 5.85 14 4l-1.8-1.85"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
