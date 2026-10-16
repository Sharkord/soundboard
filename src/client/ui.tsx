import type { CSSProperties, ReactNode } from "react";

// layout only: @sharkord/ui has the controls, and Tailwind classes the host
// never uses are missing from its stylesheet, so plain layout lives here

type TStackProps = {
  gap?: number;
  style?: CSSProperties;
  children: ReactNode;
};

const Stack = ({ gap = 12, style, children }: TStackProps) => (
  <div style={{ display: "grid", gap, ...style }}>{children}</div>
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

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <Stack>
    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h3>
    {children}
  </Stack>
);

export { ErrorText, MutedText, Row, Section, Stack };
