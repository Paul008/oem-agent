export async function withFidelityMeasurementTimeout<T>(
  operation: () => T | PromiseLike<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.ceil(timeoutMs / 1000)} seconds`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      timeout,
    ])
  }
  finally {
    if (timeoutId !== undefined)
      clearTimeout(timeoutId)
  }
}

export async function withFidelityMeasurementFallback<T>(
  operation: () => T | PromiseLike<T>,
  timeoutMs: number,
  label: string,
  fallback: T,
): Promise<T> {
  try {
    return await withFidelityMeasurementTimeout(operation, timeoutMs, label)
  }
  catch {
    return fallback
  }
}
