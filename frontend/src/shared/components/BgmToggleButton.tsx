import './BgmToggleButton.css'

type BgmToggleButtonProps = {
  isBgmOn: boolean
  onToggle: () => void
  className?: string
}

export function BgmToggleButton({ isBgmOn, onToggle, className = '' }: BgmToggleButtonProps) {
  return (
    <button
      type="button"
      className={`bgm-toggle-btn ${isBgmOn ? 'is-on' : 'is-off'} ${className}`.trim()}
      onClick={onToggle}
      title={isBgmOn ? 'BGM 끄기' : 'BGM 켜기'}
      aria-label={isBgmOn ? 'BGM 끄기' : 'BGM 켜기'}
    >
      {isBgmOn ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      )}
    </button>
  )
}
