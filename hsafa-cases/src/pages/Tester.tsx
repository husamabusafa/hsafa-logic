import ConfigBar from '../components/tester/ConfigBar'
import HaseefPicker from '../components/tester/HaseefPicker'
import StatusPanel from '../components/tester/StatusPanel'
import EventPusher from '../components/tester/EventPusher'
import ThinkingStream from '../components/tester/ThinkingStream'
import ActionStream from '../components/tester/ActionStream'
import ToolRegistration from '../components/tester/ToolRegistration'

export default function TesterPage() {
  return (
    <div className="space-y-4">
      <ConfigBar />
      <HaseefPicker />
      <StatusPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <EventPusher />
          <ToolRegistration />
        </div>
        <div className="space-y-4">
          <ThinkingStream />
          <ActionStream />
        </div>
      </div>
    </div>
  )
}
