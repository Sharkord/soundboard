import type { CSSProperties, ReactNode } from "react";

// layout only: @sharkord/ui has the controls, and Tailwind classes the host
// never uses are missing from its stylesheet, so plain layout lives here

type TStackProps = {
  gap?: number;
  style?: CSSProperties;
  children: ReactNode;
};

// a grid sizes to its widest child by default, so one wide child (a long
// stepper, a long name) would push the whole stack, dialog and all, past its
// container. Both zero minimums keep it to the width it is given instead.
const Stack = ({ gap = 12, style, children }: TStackProps) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
      minWidth: 0,
      gap,
      ...style,
    }}
  >
    {children}
  </div>
);

const Row = ({ gap = 8, style, children }: TStackProps) => (
  <div style={{ display: "flex", gap, alignItems: "center", ...style }}>
    {children}
  </div>
);

const MutedText = ({ children }: { children: ReactNode }) => (
  <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
    {children}
  </span>
);

const ErrorText = ({ error }: { error: string }) =>
  error ? (
    <span style={{ color: "var(--destructive)", fontSize: 13 }}>{error}</span>
  ) : null;

export { ErrorText, MutedText, Row, Stack };
