"use client";

import { useState } from "react";

type Props = {
  value: string;
  label?: string;
};

export default function CopyIdButton({ value, label = "複製 ID" }: Props) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="copy-btn" onClick={() => void onCopy()} title={value}>
      {copied ? "已複製" : label}
    </button>
  );
}
