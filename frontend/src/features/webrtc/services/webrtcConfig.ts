const turnUrls = import.meta.env.VITE_TURN_URLS
  ?.split(',')
  .map((url: string) => url.trim())
  .filter(Boolean)

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    ...(turnUrls?.length
      ? [{
          urls: turnUrls,
          username: import.meta.env.VITE_TURN_USERNAME,
          credential: import.meta.env.VITE_TURN_CREDENTIAL,
        }]
      : []),
  ],
}
