export default function GroupHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      {label}
    </div>
  )
}
