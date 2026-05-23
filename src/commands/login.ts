import kleur from "kleur";
import prompts from "prompts";
import { Api18nClient, ApiError } from "../client.js";
import { BACKEND_URL, DASHBOARD_URL } from "../config.js";
import { writeCredentials } from "../credentials.js";
import { withSpinner } from "../spinner.js";

export interface LoginOptions {
  token?: string;
}

export async function runLogin(options: LoginOptions = {}): Promise<void> {
  console.log(kleur.bold("Sign in to api18n"));
  console.log();
  console.log(
    `Open ${kleur.cyan(`${DASHBOARD_URL}/dashboard/settings/api-keys`)},`,
  );
  console.log("create a new API key, and paste it below.");
  console.log();

  let token = options.token;
  if (!token) {
    const answers = await prompts(
      {
        type: "password",
        name: "token",
        message: "API token (a18n_live_…)",
        validate: (val: string) =>
          val.trim().startsWith("a18n_live_")
            ? true
            : "Token should start with a18n_live_",
      },
      {
        onCancel: () => {
          console.log(kleur.gray("Cancelled."));
          process.exit(0);
        },
      },
    );
    token = (answers.token as string | undefined)?.trim() ?? "";
  }

  if (!token) {
    console.error(kleur.red("No token provided."));
    process.exit(1);
  }

  const client = new Api18nClient({ baseUrl: BACKEND_URL, apiKey: token });
  let me;
  try {
    me = await withSpinner("Verifying token…", () => client.me());
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(
        kleur.red(`Sign-in failed (${err.status}): ${err.message}`),
      );
    } else {
      console.error(
        kleur.red(
          `Sign-in failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
    process.exit(1);
  }

  writeCredentials({
    token,
    user: { id: me.user.id, email: me.user.email },
    company: me.company,
  });

  const name =
    [me.user.firstName, me.user.lastName].filter(Boolean).join(" ") ||
    me.user.email ||
    me.user.id;
  console.log();
  console.log(
    kleur.green("✓"),
    `Signed in as ${kleur.bold(name)} (${me.company.name})`,
  );
}
