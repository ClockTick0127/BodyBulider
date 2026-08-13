import { HttpResponse } from 'msw'

export type MockApiError = {
  message: string
  code?: string
  status?: number
}

export type MockApiResponse<T> = T | MockApiError

export const apiError = (code: string, message: string, status: number) =>
  HttpResponse.json<MockApiError>({ code, status, message }, { status })
