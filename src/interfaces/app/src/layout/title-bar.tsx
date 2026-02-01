import React from "react";

export function TitleBar() {
  return (
    <div 
      className="bg-background flex items-center justify-center text-[13px] text-foreground select-none relative z-50 shrink-0 font-semibold border-b border-border px-4"
      style={{
        height: "36px",
        minHeight: "36px",
        maxHeight: "36px",
        letterSpacing: "0.01em",
        backgroundColor: 'hsl(var(--background))',
        ...({ WebkitAppRegion: "drag" } as React.CSSProperties),
      }}
    >
      <div className="absolute left-[85px] flex items-center h-full">
        {/* Space for traffic lights is handled by padding-left on parent or absolute positioning */}
      </div>
      Zuckerman
    </div>
  );
}
