import { retry } from '@/helpers/AsyncControl'
import { fetchNewsState } from '@/helpers/News'
import { type GetNewsRequest, type NewsServiceParams, type NewsStateResponse } from '@/types/News'
import { isNullish } from '@/utils/lang'

class NewsStillAnalyzingError extends Error {
  constructor() {
    super('news request is still analyzing')
    this.name = 'NewsStillAnalyzingError'
  }
}

class NewsHasUnknownSentimentError extends Error {
  constructor() {
    super('news response still contains unknown sentiment')
    this.name = 'NewsHasUnknownSentimentError'
  }
}

const NEWS_RETRY_MAX_RETRIES = 10
const NEWS_RETRY_INTERVAL_MS = 30_000

export class NewsService {
  private readonly apiBaseUrl: string

  constructor(params: NewsServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
  }

  async fetchNewsUntilCompleted(params: GetNewsRequest): Promise<NewsStateResponse> {
    let latestResponse: NewsStateResponse | null = null
    try {
      return await retry<NewsStateResponse>({
        fn: async (): Promise<NewsStateResponse> => {
          const response = await fetchNewsState({
            apiBaseUrl: this.apiBaseUrl,
            request: params
          })
          latestResponse = response
          switch (response.state) {
            case 'completed': {
              const hasUnknownSentiment = response.items.some(
                (item) => isNullish(item.sentiment) || item.sentiment === 'unknown'
              )
              if (hasUnknownSentiment) {
                throw new NewsHasUnknownSentimentError()
              }
              return response
            }
            case 'analyzing': {
              throw new NewsStillAnalyzingError()
            }
          }
        },
        maxRetries: NEWS_RETRY_MAX_RETRIES,
        ms: NEWS_RETRY_INTERVAL_MS,
        logError: false,
        shouldRetry: (error: unknown): boolean =>
          error instanceof NewsStillAnalyzingError || error instanceof NewsHasUnknownSentimentError
      })
    } catch (error: unknown) {
      if (error instanceof NewsHasUnknownSentimentError && !isNullish(latestResponse)) {
        return latestResponse
      }
      if (error instanceof NewsStillAnalyzingError) {
        throw new Error(`News request is still analyzing after ${NEWS_RETRY_MAX_RETRIES} retries`)
      }
      throw error
    }
  }
}
