import { useState } from "react";
import { ReferenceArea, ReferenceLine } from "recharts";
import type { Annotation } from "../../types";

interface Props {
  annotations: Annotation[];
}

const TAG_COLORS: Record<string, string> = {
  deploy: "#635bff",
  incident: "#ef4444",
  maintenance: "#f59e0b",
  rollback: "#ef4444",
  release: "#10b981",
  alert: "#f97316",
};

function getAnnotationColor(ann: Annotation): string {
  for (const tag of ann.tags) {
    const color = TAG_COLORS[tag.toLowerCase()];
    if (color) return color;
  }
  return "#635bff";
}

export function AnnotationMarkers({ annotations }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <>
      {annotations.map((ann) => {
        const color = getAnnotationColor(ann);
        const isHovered = hoveredId === ann.id;

        if (ann.ends_at) {
          return (
            <ReferenceArea
              key={`ann-area-${ann.id}`}
              x1={ann.starts_at}
              x2={ann.ends_at}
              fill={color}
              fillOpacity={isHovered ? 0.18 : 0.08}
              stroke={color}
              strokeOpacity={0.4}
              strokeWidth={1}
              ifOverflow="extendDomain"
              onMouseEnter={() => setHoveredId(ann.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          );
        }

        return (
          <ReferenceLine
            key={`ann-line-${ann.id}`}
            x={ann.starts_at}
            stroke={color}
            strokeDasharray="4 3"
            strokeWidth={isHovered ? 2 : 1.5}
            ifOverflow="extendDomain"
            onMouseEnter={() => setHoveredId(ann.id)}
            onMouseLeave={() => setHoveredId(null)}
          />
        );
      })}
    </>
  );
}

