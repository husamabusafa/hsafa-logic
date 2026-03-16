import { createContext, useContext } from "react";
import { spacesApi } from "./api";

export interface InteractiveMessageActions {
  respondToMessage: (messageId: string, value: unknown) => Promise<void>;
  currentEntityId: string | null;
  spaceId: string | null;
}

const InteractiveContext = createContext<InteractiveMessageActions>({
  respondToMessage: async () => {},
  currentEntityId: null,
  spaceId: null,
});

export function InteractiveProvider({
  spaceId,
  currentEntityId,
  children,
}: {
  spaceId: string | null;
  currentEntityId: string | null;
  children: React.ReactNode;
}) {
  const respondToMessage = async (messageId: string, value: unknown) => {
    if (!spaceId) throw new Error("No space selected");
    await spacesApi.respondToMessage(spaceId, messageId, value);
  };

  return (
    <InteractiveContext.Provider value={{ respondToMessage, currentEntityId, spaceId }}>
      {children}
    </InteractiveContext.Provider>
  );
}

export function useInteractive() {
  return useContext(InteractiveContext);
}
