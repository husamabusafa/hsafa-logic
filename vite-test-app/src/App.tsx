import { HsafaChat, HsafaProvider } from '@hsafa/react-sdk';

const GATEWAY_URL = 'http://localhost:3001';
const AGENT_ID = 'de1b221c-8549-43be-a6e3-b1e416405874'; // demo-agent

export default function App() {
  return (
    <HsafaProvider>
      <HsafaChat
        agentName="demo-agent"
        gatewayUrl={GATEWAY_URL}
        agentId={AGENT_ID}
        senderId="test-user-1"
        senderName="Test User"
        fullPageChat={true}
        theme="dark"
        title="Hsafa Chat"
      />
    </HsafaProvider>
  );
}
