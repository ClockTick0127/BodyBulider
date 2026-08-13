export const mockUserUuid = (userId: number) =>
  `00000000-0000-4000-8000-${String(userId).padStart(12, '0')}`

export const createRoomUuid = () => crypto.randomUUID()

export const createRoomCode = () =>
  Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
