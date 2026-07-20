import { PageHeader } from '@/components/page-header'
import { SummaryCards } from '@/components/dashboard/summary-cards'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { DetectionsChart } from '@/components/dashboard/detections-chart'

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your store's security system and recent activity."
      />
      <div className="space-y-4">
        <SummaryCards />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <DetectionsChart />
          </div>
          <div className="lg:col-span-2">
            <ActivityFeed />
          </div>
        </div>
      </div>
    </div>
  )
}
