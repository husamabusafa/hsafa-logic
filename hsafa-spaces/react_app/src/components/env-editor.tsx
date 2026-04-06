export { CodeTerminal, type CodeTerminalHandle, type CodeTerminalProps, type HighlightFn } from "@/components/code-terminal";
import { CodeTerminal } from "@/components/code-terminal";

export function EnvEditor(props: {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  minRows?: number;
  maxRows?: number;
  className?: string;
}) {
  return <CodeTerminal {...props} highlight="env" />;
}
