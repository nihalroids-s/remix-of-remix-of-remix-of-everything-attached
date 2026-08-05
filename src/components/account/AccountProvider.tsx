import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type AppAccount,
  fetchAccounts,
  readActiveAccountId,
  storeActiveAccountId,
} from "@/lib/cloud-accounts";
import { LOCAL_ACCOUNTS_CHANGED_EVENT } from "@/lib/local-events";

type AccountContextValue = {
  account: AppAccount | null;
  accounts: AppAccount[];
  loading: boolean;
  login: (account: AppAccount) => void;
  refresh: () => Promise<void>;
  switchAccount: (account: AppAccount) => void;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AppAccount | null>(null);
  const [accounts, setAccounts] = useState<AppAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const nextAccounts = await fetchAccounts();
    const activeId = readActiveAccountId();
    const active = nextAccounts.find((candidate) => candidate.id === activeId) ?? null;
    if (!active && activeId) storeActiveAccountId(null);
    setAccounts(nextAccounts);
    setAccount(active);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(LOCAL_ACCOUNTS_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(LOCAL_ACCOUNTS_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  const selectAccount = useCallback((next: AppAccount) => {
    storeActiveAccountId(next.id);
    setAccount(next);
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      account,
      accounts,
      loading,
      login: selectAccount,
      refresh,
      switchAccount: selectAccount,
      signOut: async () => {
        storeActiveAccountId(null);
        setAccount(null);
      },
    }),
    [account, accounts, loading, refresh, selectAccount],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

// The provider and hook intentionally share this small module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}
