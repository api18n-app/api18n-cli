import ora from "ora";

/**
 * Run a network call with a terminal spinner. Stops the spinner cleanly on
 * success so the surrounding command can render its own output without
 * leftover glyphs; on failure, marks the spinner with ✗ + the original text
 * and rethrows so the command's existing error handler runs unchanged.
 *
 * ora auto-detects non-TTY (CI, piped output) and degrades to a single log
 * line, so wrapping is safe to apply unconditionally.
 */
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = ora(message).start();
  try {
    const result = await fn();
    spinner.stop();
    return result;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}
