interface HighlightedTextProps {
  text: string
  query: string
}

export function HighlightedText({ text, query }: HighlightedTextProps) {
  if (!query || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + query.length)
  const after = text.slice(idx + query.length)
  return (
    <>
      {before}
      <mark className="bg-coral-light text-tag-text not-italic">{match}</mark>
      {after}
    </>
  )
}
