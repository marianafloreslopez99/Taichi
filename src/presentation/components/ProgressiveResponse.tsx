import { useEffect, useState } from 'react'

interface Props {
  text: string
  speaking: boolean
}

function RevealingText({ text }: { text: string }) {
  const [visibleWords, setVisibleWords] = useState(1)
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  const words = text.match(/\S+\s*/g) ?? []

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference?.matches ?? false)
    preference?.addEventListener('change', update)
    return () => preference?.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (reducedMotion || words.length <= 1) return
    let count = 1
    const timer = window.setInterval(() => {
      count += 1
      setVisibleWords(count)
      if (count >= words.length) window.clearInterval(timer)
    }, 240)
    return () => window.clearInterval(timer)
  }, [words.length, reducedMotion])

  return (
    <span aria-hidden="true">
      {reducedMotion ? text : words.slice(0, visibleWords).join('')}
    </span>
  )
}

export function ProgressiveResponse({ text, speaking }: Props) {
  return (
    <p
      className="voice-response"
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      {speaking ? (
        <RevealingText key={text} text={text} />
      ) : (
        <span aria-hidden="true">{text}</span>
      )}
    </p>
  )
}
