import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function AwsIcon({ size = 24, className, style }: IconProps) {
  return (
    <img
      src="/aws-logo.svg"
      alt="AWS"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", ...style }}
    />
  );
}

export function AzureIcon({ size = 24, className, style }: IconProps) {
  return (
    <img
      src="/azure-logo.svg"
      alt="Azure"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", ...style }}
    />
  );
}
