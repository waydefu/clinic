// Match the existing Google HTTP request bound; this is not a retry policy.
export const REQUEST_TIMEOUT_MS = 30_000;

export async function withRequestDeadline(operation) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Request timed out.');
      controller.abort(error);
      reject(error);
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      deadline
    ]);
  } finally {
    clearTimeout(timer);
  }
}
