import { createContext, useContext } from "react";
import type { useMigrationWizard } from "./useMigrationWizard";

type WizardCtx = ReturnType<typeof useMigrationWizard>;

const MigrationContext = createContext<WizardCtx | null>(null);

export const MigrationProvider = MigrationContext.Provider;

export const useMigrationContext = () => {
  const ctx = useContext(MigrationContext);
  if (!ctx) throw new Error("useMigrationContext must be used inside MigrationProvider");
  return ctx;
};
