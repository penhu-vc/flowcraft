import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

export default function IntroDetails({ title, children }: Props) {
  return (
    <details className="help-box intro-details">
      <summary>{title}</summary>
      <div className="intro-content">{children}</div>
    </details>
  );
}
