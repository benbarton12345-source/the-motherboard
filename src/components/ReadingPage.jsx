import ReadingPanel from './ReadingPanel'

// Reading sub-page — the existing Reading tracker relocated into its own
// Productivity sub-page (purple removed → emerald). ReadingPanel is the full
// self-contained tracker (current book, Log 10 min, queue, genres, heatmap),
// so the page is a thin wrapper around it.
export default function ReadingPage() {
  return (
    <div className="space-y-4">
      <ReadingPanel />
    </div>
  )
}
