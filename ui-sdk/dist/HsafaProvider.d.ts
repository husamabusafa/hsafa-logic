import { type ReactNode } from "react";
import { type HsafaClient, type SmartSpace } from "@hsafa/react-sdk";
import { type ToolExecutor } from "./useHsafaRuntime";
export interface HsafaProviderProps {
    children: ReactNode;
    gatewayUrl: string;
    entityId: string;
    smartSpaceId: string | null;
    smartSpaces?: SmartSpace[];
    onSwitchThread?: (smartSpaceId: string) => void;
    onNewThread?: () => void;
    toolExecutor?: ToolExecutor;
    client?: HsafaClient;
}
export declare function HsafaProvider({ children, gatewayUrl, entityId, smartSpaceId, smartSpaces, onSwitchThread, onNewThread, toolExecutor, client: externalClient, }: HsafaProviderProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=HsafaProvider.d.ts.map