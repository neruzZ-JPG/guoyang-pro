"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyButtonProps = {
  value: string;
  label?: string;
};

export function CopyButton({
  value,
  label = "复制",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function handleCopy() {
    let succeeded = false;

    try {
      await navigator.clipboard.writeText(value);
      succeeded = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      succeeded = document.execCommand("copy");
      textarea.remove();
    }

    if (!succeeded) {
      return;
    }

    setCopied(true);
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className="copy-button"
      onClick={handleCopy}
      type="button"
      aria-label={copied ? "已复制" : label}
    >
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      <span>{copied ? "已复制" : label}</span>
    </button>
  );
}
