import { useAppStore } from '@/lib/store/app-store'
import { getDebugAuthHeader } from '@/lib/debug-auth'
import { endpoints } from '@/lib/api/endpoints'
import type { AuthTokens } from '@/types'

const COOKIE_SESSION_PREFIX = 'backend-cookie-session'

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export class ApiClient {
  private baseUrl: string
  private withCredentials: boolean
  private apiKey?: string
  private apiKeyHeader: string
  private timeoutMs: number

  constructor(baseUrl = import.meta.env['VITE_API_BASE_URL'] ?? '') {
    this.baseUrl = baseUrl
    this.withCredentials = (import.meta.env['VITE_API_WITH_CREDENTIALS'] ?? 'true') !== 'false'
    this.apiKey = import.meta.env['VITE_API_KEY'] || undefined
    this.apiKeyHeader = import.meta.env['VITE_API_KEY_HEADER'] ?? 'X-API-Key'
    this.timeoutMs = Number(import.meta.env['VITE_API_TIMEOUT_MS'] ?? 30000)
  }

  private async refreshAccessToken(refreshToken: string) {
    const response = await fetch(`${this.baseUrl}${endpoints.auth.refresh}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      throw new ApiError('Failed to refresh token.', response.status)
    }

    const payload = (await response.json()) as AuthTokens
    useAppStore.getState().setAuthSession({
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      currentUser: useAppStore.getState().currentUser!,
    })

    return payload.accessToken
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const { accessToken, refreshToken, clearSession, locale } = useAppStore.getState()
    const headers = new Headers(init.headers)
    const controller = new AbortController()
    const externalSignal = init.signal
    const timeoutId = window.setTimeout(() => controller.abort(), this.timeoutMs)
    const isDebugPath = path.startsWith('/api/debug/')
    const debugAuthHeader = isDebugPath ? getDebugAuthHeader() : null

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }

    if (!headers.has('X-App-Locale')) {
      headers.set('X-App-Locale', locale)
    }

    if (this.apiKey && !headers.has(this.apiKeyHeader)) {
      headers.set(this.apiKeyHeader, this.apiKey)
    }

    if (debugAuthHeader && !headers.has('Authorization')) {
      headers.set('Authorization', debugAuthHeader)
    } else if (accessToken && !accessToken.startsWith(COOKIE_SESSION_PREFIX)) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        credentials: init.credentials ?? (this.withCredentials ? 'include' : 'same-origin'),
        signal: controller.signal,
      })
    } catch (error) {
      window.clearTimeout(timeoutId)

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(`Request timed out for ${path}`, 408)
      }

      throw error
    }

    window.clearTimeout(timeoutId)

    if (
      response.status === 401 &&
      refreshToken &&
      retry &&
      !refreshToken.startsWith(COOKIE_SESSION_PREFIX)
    ) {
      try {
        const renewedToken = await this.refreshAccessToken(refreshToken)
        return this.request<T>(
          path,
          {
            ...init,
            headers: {
              ...Object.fromEntries(headers.entries()),
              Authorization: `Bearer ${renewedToken}`,
            },
          },
          false,
        )
      } catch {
        clearSession()
        throw new ApiError('Session expired.', 401)
      }
    }

    if (!response.ok) {
      let details: unknown

      try {
        details = await response.json()
      } catch {
        details = await response.text()
      }

      throw new ApiError(`Request failed for ${path}`, response.status, details)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }
}

export const apiClient = new ApiClient()
