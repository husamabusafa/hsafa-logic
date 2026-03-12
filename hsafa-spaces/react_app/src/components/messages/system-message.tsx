import { type MockMessage } from "@/lib/mock-data";

interface SystemMessageProps {
  message: MockMessage;
}

export function SystemMessage({ message }: SystemMessageProps) {
  return (
    <div className="flex justify-center my-3">
      <span className="text-[11px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
        {message.content}
      </span>
    </div>
  );
}
