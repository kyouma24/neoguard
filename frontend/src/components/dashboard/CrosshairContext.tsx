import { createContext, useContext, useState } from "react";

interface CrosshairState {
  timestamp: string | null;
  setTimestamp: (ts: string | null) => void;
}

const CrosshairCtx = createContext<CrosshairState>({
  timestamp: null,
  setTimestamp: () => {},
});

export function CrosshairProvider({ children }: { children: React.ReactNode }) {
  const [timestamp, setTimestamp] = useState<string | null>(null);
  return (
    <CrosshairCtx.Provider value={{ timestamp, setTimestamp }}>
      {children}
    </CrosshairCtx.Provider>
  );
}

export function useCrosshair() {
  return useContext(CrosshairCtx);
}
