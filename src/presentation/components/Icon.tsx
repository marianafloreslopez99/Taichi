import type { SVGProps } from 'react'

export type IconName =
  | 'arrowRight'
  | 'arrowLeft'
  | 'play'
  | 'pause'
  | 'repeat'
  | 'mic'
  | 'sound'
  | 'check'
  | 'close'
  | 'clock'
  | 'spark'
  | 'leaf'
  | 'menu'

const paths: Record<IconName, React.ReactNode> = {
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: (
    <>
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </>
  ),
  repeat: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M5.4 9A7 7 0 0 1 18 7l2 2" />
      <path d="M18.6 15A7 7 0 0 1 6 17l-2-2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v5" />
      <path d="M8 22h8" />
    </>
  ),
  sound: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15 9a5 5 0 0 1 0 6" />
      <path d="M18 6a9 9 0 0 1 0 12" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  close: (
    <>
      <path d="M5 5 19 19" />
      <path d="M19 5 5 19" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  spark: (
    <>
      <path d="m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z" />
      <path d="m19 18 .5 1.5L21 20l-1.5.5L19 22l-.5-1.5L17 20l1.5-.5L19 18Z" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4C10 4 4 8 4 15a5 5 0 0 0 5 5c7 0 11-6 11-16Z" />
      <path d="M4 20c3-5 7-8 12-11" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
}

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
