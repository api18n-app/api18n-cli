import kleur from "kleur";
import { Api18nClient, ApiError } from "../client.js";
import { BACKEND_URL, findConfigFile, loadConfig } from "../config.js";
import { resolveToken } from "../credentials.js";

export async function runWhoami(): Promise<void> {
  const credentials = resolveToken();
  if (!credentials) {
    console.error(kleur.red("Not signed in. Run `api18n login` first."));
    process.exit(1);
  }

  let baseUrl = BACKEND_URL;
  let companyId: string | undefined;
  if (findConfigFile(process.cwd())) {
    try {
      const config = await loadConfig(process.cwd());
      companyId = config.companyId;
    } catch {
      /* config exists but unreadable — use defaults */
    }
  }

  console.log(
    kleur.bold(
      "baseUrl --- > " +
        baseUrl +
        " companyId --> " +
        companyId +
        " token --> " +
        credentials.token,
    ),
  );

  const client = new Api18nClient({
    baseUrl,
    apiKey: credentials.token,
    companyId,
  });
  try {
    const me = await client.me();
    const name =
      [me.user.firstName, me.user.lastName].filter(Boolean).join(" ") ||
      me.user.email ||
      me.user.id;
    console.log(kleur.bold(name));
    console.log(`  ${kleur.gray("email   ")} ${me.user.email ?? "—"}`);
    console.log(
      `  ${kleur.gray("company ")} ${me.company.name} (${me.company.id})`,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(kleur.red(`${err.status}: ${err.message}`));
    } else {
      console.error(
        kleur.red(err instanceof Error ? err.message : String(err)),
      );
    }
    process.exit(1);
  }
}
