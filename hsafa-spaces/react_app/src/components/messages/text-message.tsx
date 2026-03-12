import { type MockMessage } from "@/lib/mock-data";

interface TextMessageProps {
  message: MockMessage;
}

export function TextMessage({ message }: TextMessageProps) {
  return (
    <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">
      {message.content.split(/(\*\*.*?\*\*)/).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </p>
  );
}
