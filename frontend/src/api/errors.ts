import { AxiosError } from 'axios'

export interface ValidationErrors {
  [field: string]: string[]
}

interface FastApiDetail {
  loc?: (string | number)[]
  msg?: string
}

interface FastApiError {
  detail?: string | FastApiDetail[]
}

export function extractErrors(error: unknown): {
  message: string
  fields: ValidationErrors
} {
  if (!(error instanceof AxiosError)) {
    return {
      message: error instanceof Error ? error.message : 'Something went wrong',
      fields: {},
    }
  }

  const detail = (error.response?.data as FastApiError | undefined)?.detail

  if (typeof detail === 'string') {
    return { message: detail, fields: {} }
  }

  if (Array.isArray(detail)) {
    const fields: ValidationErrors = {}
    for (const item of detail) {
      const field = item.loc?.[item.loc.length - 1]
      const message = item.msg ?? 'Invalid value'
      if (typeof field === 'string') {
        fields[field] = [...(fields[field] ?? []), message]
      }
    }
    const first = Object.values(fields)[0]?.[0]
    return { message: first ?? 'Please check the highlighted fields.', fields }
  }

  return { message: error.message, fields: {} }
}
