import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: "C:/Users/DELL/Desktop/PROJETOS IDE/Projeto Provas NAF/online-testing-platform-prd/.env.local" });

(async () => {
  const { main } = await import("./importar-core");
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
})();