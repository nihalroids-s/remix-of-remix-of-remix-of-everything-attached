import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkoutHistoryList } from "@/components/workout-history/WorkoutHistoryList";
import { type AppAccount, fetchAccount, updateCloudClientAssignment } from "@/lib/cloud-accounts";
import { type ProgramSummary, loadPrograms } from "@/lib/coach-programs";

const NO_PROGRAM_VALUE = "__no_program__";

export function ClientManagement({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<AppAccount | null>(null);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAccount(clientId), Promise.resolve(loadPrograms())])
      .then(([nextClient, nextPrograms]) => {
        setClient(nextClient?.role === "client" ? nextClient : null);
        setPrograms(nextPrograms);
      })
      .catch((nextError: unknown) => {
        console.error(nextError);
        setError("Client data could not be loaded from this device.");
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  const assignedProgram = useMemo(
    () => programs.find((program) => program.id === client?.assignedProgramId),
    [client?.assignedProgramId, programs],
  );

  if (loading) return null;

  if (!client) {
    return (
      <section className="space-y-6">
        <BackToDashboard />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Client not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "This client account is not available on this device."}
          </p>
        </div>
      </section>
    );
  }

  const selectedValue = assignedProgram?.id ?? NO_PROGRAM_VALUE;

  const changeAssignment = async (value: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCloudClientAssignment(
        client.id,
        value === NO_PROGRAM_VALUE ? undefined : value,
      );
      setClient(updated);
    } catch (nextError) {
      console.error(nextError);
      setError("The program assignment could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <BackToDashboard />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {client.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">@{client.username}</p>
      </div>

      <section aria-labelledby="program-assignment-heading" className="space-y-3">
        <div>
          <h2 id="program-assignment-heading" className="text-lg font-semibold text-foreground">
            Program assignment
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign, change, or clear this client&apos;s training program.
          </p>
        </div>

        {programs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No programs are available yet.</p>
            <Link
              to="/coach/programs"
              className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Go to Program Manager
            </Link>
          </div>
        ) : (
          <div className="max-w-sm space-y-2">
            <label htmlFor="client-program" className="text-sm font-medium text-foreground">
              Training program
            </label>
            <Select
              value={selectedValue}
              disabled={saving}
              onValueChange={(value) => void changeAssignment(value)}
            >
              <SelectTrigger id="client-program" className="h-10" aria-label="Training program">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROGRAM_VALUE}>No program assigned</SelectItem>
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {saving ? "Saving…" : "Changes save automatically."}
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </section>

      <section aria-labelledby="client-workout-history-heading" className="space-y-3">
        <div>
          <h2 id="client-workout-history-heading" className="text-lg font-semibold text-foreground">
            Workout history
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review completed sessions and notes this client sent to you.
          </p>
        </div>
        <WorkoutHistoryList clientId={client.id} />
      </section>
    </section>
  );
}

function BackToDashboard() {
  return (
    <Link
      to="/coach/dashboard"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to Dashboard
    </Link>
  );
}
